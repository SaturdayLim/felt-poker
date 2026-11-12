import { publishReport, reportLinkOf } from '../live/reportLink';
import { createPortal } from 'react-dom';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useGame, useStore, usePlayerName } from '../store';
import { back, go } from '../router';
import { Caption, Empty, Header, Help, Icon, toast } from '../components/ui';
import { loadReportFonts } from '../report/canvas';
import { actionsCsv, handsCsv, ledgerCsv, outputName, playersCsv, type PotCoding } from '../report/csv';
import { PNG_SETS, renderPngParts, type PngSet } from '../report/pngSets';
import { canvasToFile, shareFiles, textFile } from '../report/share';
import { MIN_LOG_HANDS, MIN_REPORT_HANDS, logReady, makeHtmlReport, recordedHands, reportReady } from '../report/htmlReport';
import { useResolvedTheme } from '../theme';
import { calm, DRAWER, motionOff } from '../lib/motion';
import type { ID } from '../types';

type Choice = 'html' | 'png' | 'log' | 'csv';
type Snap = 'summary' | 'detailed' | 'playstyle';

/** Choices kept on this phone (not in the game, not in a backup). */
const KEEP = { pot: 'felt-report-potcoding' };
function readKept<T>(key: string, fallback: T): T { try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; } }
function keep(key: string, v: unknown) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private mode: the choice lasts for this visit only */ } }

type ExpKey = 'expDashboard' | 'expActionLogTick' | 'expSnapshot' | 'expSummary' | 'expDetails' | 'expPlaystyle' | 'expLog' | 'expData' | 'expPlayers' | 'expHand' | 'expActions' | 'expLedger';
const Tip = ({ k }: { k: ExpKey }) => <Help k={k} />;

/** Copies inside the press: the clipboard call starts now and the data arrives later, which iOS Safari allows.
    Without a promise-aware ClipboardItem, text still falls back to writeText. */
function copyLater(type: 'text/plain' | 'image/png', data: Promise<Blob>): Promise<void> {
  if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
    try { return navigator.clipboard.write([new ClipboardItem({ [type]: data })]); } catch { /* fall through */ }
  }
  if (type === 'text/plain' && navigator.clipboard?.writeText) return data.then((b) => b.text()).then((t) => navigator.clipboard.writeText(t));
  return Promise.reject(new Error('no clipboard'));
}

/** An icon button. A copy button shows a check for a moment when the copy is done. */
function ActBtn({ icon, label, onAct, disabled }: { icon: string; label: string; onAct: () => Promise<boolean | void> | boolean | void; disabled?: boolean }) {
  const [phase, setPhase] = useState<'idle' | 'wait' | 'done'>('idle');
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const click = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled || phase === 'wait') return;
    const r = onAct();
    if (!r || typeof (r as Promise<unknown>).then !== 'function') return;
    setPhase('wait');
    void (r as Promise<boolean | void>).then((ok) => {
      if (ok === false) { setPhase('idle'); return; }
      setPhase('done');
      timer.current = window.setTimeout(() => setPhase('idle'), 1200);
    });
  };
  return (
    <button type="button" className="sat-btn sat-btn--ghost sat-iconbtn felt-exp-ic" aria-label={label} aria-busy={phase === 'wait'} data-wait={phase === 'wait'} onClick={click}>
      <Icon name={phase === 'done' ? 'check' : icon} size={20} />
    </button>
  );
}

/** A block that opens by growing (the same fold as the Players lists). */
/** A row body that grows open under its head and shrinks shut. The height is set on the element (0 when shut, auto when open)
    and animated from the measured size: iOS Safari did not collapse a 0fr grid row on the first layout, so every shut row
    showed at full height, blank, until a tap laid it out again. Reduced motion: a 150 ms fade. Animation speed Off: no motion. */
function Fold({ open, children }: { open: boolean; children: React.ReactNode }) {
  const el = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  useLayoutEffect(() => {
    const e = el.current;
    if (!e) return;
    if (first.current) { first.current = false; e.style.height = open ? 'auto' : '0px'; return; }
    const from = e.getBoundingClientRect().height;
    e.style.height = open ? 'auto' : '0px';
    const to = open ? e.getBoundingClientRect().height : 0;
    e.getAnimations().forEach((a) => a.cancel());
    if (motionOff() || from === to) return;
    const ms = calm() ? 150 : 260;
    e.animate(calm()
      ? [{ height: `${to}px`, opacity: open ? 0 : 1 }, { height: `${to}px`, opacity: open ? 1 : 0 }]
      : [{ height: `${from}px`, opacity: open ? 0 : 1 }, { height: `${to}px`, opacity: open ? 1 : 0 }], { duration: ms, easing: DRAWER });
  }, [open]);
  return <div ref={el} className="felt-xfold" data-open={open} {...(open ? {} : { inert: '' })}><div className="felt-xfold-inner">{children}</div></div>;
}

type Loaded = { imgs?: string[]; files?: File[]; html?: string };
type Pv = { from: Element; title: string; load: () => Promise<Loaded> };

/** A preview grows out of the element that opened it (a clip, never a stretch), and leaves back into it.
    Exit: the back arrow, a swipe down or Escape. Reduced motion: a 150 ms fade. Animation speed Off: no motion. */
function Preview({ pv, onClosed }: { pv: Pv; onClosed: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  const [c, setC] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);

  useLayoutEffect(() => {
    const el = root.current;
    if (!el || motionOff() || !el.animate) return;
    if (calm()) { el.animate({ opacity: [0, 1] }, { duration: 150, easing: 'linear' }); return; }
    const r = pv.from.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight;
    el.animate({
      clipPath: [`inset(${r.top}px ${vw - r.right}px ${vh - r.bottom}px ${r.left}px round 12px)`, 'inset(0px 0px 0px 0px round 0px)'],
      opacity: [0.4, 1],
    }, { duration: 340, easing: DRAWER });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let dead = false;
    let made: Loaded | null = null;
    pv.load().then((x) => { made = x; if (!dead) setC(x); else x.imgs?.forEach((u) => URL.revokeObjectURL(u)); },
      (e: Error) => { if (!dead) { setFailed(true); toast(`Preview unable to build (${e.message}).`); } });
    return () => { dead = true; made?.imgs?.forEach((u) => URL.revokeObjectURL(u)); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = (way: 'home' | 'down' = 'home') => {
    const el = root.current;
    if (closing.current) return;
    closing.current = true;
    const end = () => { (pv.from as HTMLElement).focus?.({ preventScroll: true }); onClosed(); };
    if (!el || motionOff() || !el.animate) { end(); return; }
    let a: Animation;
    if (calm()) a = el.animate({ opacity: [1, 0] }, { duration: 150, easing: 'linear', fill: 'forwards' });
    else if (way === 'down') a = el.animate({ transform: [el.style.transform || 'none', 'translateY(100%)'], opacity: [1, 0.6] }, { duration: 260, easing: DRAWER, fill: 'forwards' });
    else {
      const r = pv.from.isConnected ? pv.from.getBoundingClientRect() : null, vw = window.innerWidth, vh = window.innerHeight;
      a = r
        ? el.animate({ clipPath: ['inset(0px 0px 0px 0px round 0px)', `inset(${r.top}px ${vw - r.right}px ${vh - r.bottom}px ${r.left}px round 12px)`], opacity: [1, 0.4] }, { duration: 280, easing: DRAWER, fill: 'forwards' })
        : el.animate({ opacity: [1, 0] }, { duration: 200, easing: 'linear', fill: 'forwards' });
    }
    a.onfinish = end;
  };

  useEffect(() => {
    root.current?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // swipe down: the page follows the finger from the top bar, or from the body when it sits at the top
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let y0 = 0, dy = 0, on = false;
    const start = (e: TouchEvent) => { y0 = e.touches[0].clientY; dy = 0; on = (body.current?.scrollTop ?? 0) <= 0 || !!(e.target as Element).closest('.felt-pv-bar'); };
    const move = (e: TouchEvent) => {
      if (!on || closing.current) return;
      dy = e.touches[0].clientY - y0;
      if (dy > 8) { e.preventDefault(); el.style.transform = `translateY(${dy}px)`; } else if (dy < 0) { on = false; el.style.transform = ''; }
    };
    const end = () => {
      if (!on || closing.current) return;
      on = false;
      if (dy > 110) close('down');
      else if (dy > 0) { el.style.transition = 'transform 220ms ' + DRAWER; el.style.transform = ''; window.setTimeout(() => { el.style.transition = ''; }, 240); }
    };
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
    return () => { el.removeEventListener('touchstart', start); el.removeEventListener('touchmove', move); el.removeEventListener('touchend', end); el.removeEventListener('touchcancel', end); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div ref={root} tabIndex={-1} className="felt-pv" role="dialog" aria-modal="true" aria-label={pv.title}>
      <div className="felt-pv-bar">
        <button type="button" className="sat-btn sat-btn--ghost sat-iconbtn" aria-label="Back" onClick={() => close()}><Icon name="back" /></button>
        <b className="felt-ellipsis">{pv.title}</b>
      </div>
      <div ref={body} className="felt-pv-body" data-html={c?.html !== undefined || undefined}>
        {/* a tap on an image copies it (owner, 11 Nov 2026); the file is ready, so the copy runs inside the tap */}
        {c?.imgs?.map((u, i) => {
          const alt = c.imgs!.length > 1 ? `${pv.title}, image ${i + 1} of ${c.imgs!.length}` : pv.title;
          const f = c.files?.[i];
          return (
            <button key={u} type="button" className="felt-pv-img" aria-label={`Copy image: ${alt}`} disabled={!f}
              onClick={() => { if (f) copyLater('image/png', Promise.resolve(f)).then(() => toast('Image copied.'), () => toast('Copy was blocked on this phone.')); }}>
              <img src={u} alt="" draggable={false} />
            </button>
          );
        })}
        {c?.html !== undefined && <iframe title={pv.title} srcDoc={c.html} />}
        {!c && !failed && <div className="felt-skel" style={{ height: 240 }} aria-label="Building the preview" />}
      </div>
    </div>, document.body);
}

function Head({ k, tier, setTier, label, tip, children }: { k: Choice; tier: Choice; setTier: (k: Choice) => void; label: string; tip: ExpKey; children?: React.ReactNode }) {
  return (
    <div className="felt-exp-head" onClick={() => setTier(k)}>
      <button type="button" role="radio" aria-checked={tier === k} aria-label={label} className="felt-exp-radio" onClick={(e) => { e.stopPropagation(); setTier(k); }}>
        <span className="felt-choice-dot" aria-hidden="true" />
        <span>{label}</span>
      </button>
      <Tip k={tip} />
      {children}
    </div>
  );
}

export default function Report({ gameId }: { gameId: string }) {
  const g = useGame(gameId);
  if (!g) return <div className="felt-page"><Header back={() => go('')} title="Export" /><Empty title="Game not found">It may have been deleted.</Empty></div>;
  return <ReportBody g={g} />;
}

/** More images than this ask first: Share and Cancel. */
const WARN_IMAGES = 10;

function ReportBody({ g }: { g: NonNullable<ReturnType<typeof useGame>> }) {
  const gameId = g.id;
  const name = usePlayerName();
  const pref = useStore((s) => s.settings.theme);
  const appTheme = useResolvedTheme(pref);
  const settings = useStore((s) => s.settings);
  const allPlayers = useStore((s) => s.players);
  const [tier, setTier] = useState<Choice>('html');
  const [gameLog, setGameLog] = useState<boolean>(false);
  const [potCoding, setPotCoding] = useState<PotCoding>(() => (readKept<PotCoding>(KEEP.pot, 'street') === 'player' ? 'player' : 'street'));
  const [snap, setSnap] = useState<Record<Snap, boolean>>({ summary: false, detailed: false, playstyle: false });
  const [csv, setCsv] = useState({ players: false, hand: false, actions: false, data: false });
  /** Hands ticked in the Full Action Log; none is ticked by default. */
  const [on, setOn] = useState<Record<string, true>>({});
  const [pv, setPv] = useState<Pv | null>(null);
  const [linkMade, setLinkMade] = useState<string | null>(() => (gameId ? reportLinkOf(gameId)?.link ?? null : null));
  const st = useStore();
  const imgCache = useRef(new Map<string, Promise<File[]>>());
  /** Files already drawn. A press that shares reads from here, so navigator.share runs inside the press. */
  const done = useRef(new Map<string, File[]>());
  const [, bump] = useState(0);
  const [ask, setAsk] = useState<{ tier: Choice; n: number } | null>(null);
  /** The warning row is drawing the rest of the images. A new token cancels the loop. */
  const [drawing, setDrawing] = useState(false);
  const drawRun = useRef(0);
  useEffect(() => { imgCache.current.clear(); done.current.clear(); bump((x) => x + 1); }, [g, appTheme]);

  const ready = reportReady(g);
  const lReady = logReady(g);
  const noCode = allPlayers.filter((p) => g.playerIds.includes(p.id) && !p.codeIssued);
  /** Only recorded hands: a missed hand or a hand with no log is never listed, ticked, previewed or shared. */
  const logHands = g.hands.filter((h) => !h.missed && h.log);
  const handIds = logHands.map((h) => h.id);
  const ticked = handIds.filter((id) => on[id]);
  const tickHand = (id: string) => setOn((o) => { const n = { ...o }; if (n[id]) delete n[id]; else n[id] = true; return n; });
  const toggleLog = () => setGameLog(!gameLog);
  const pickPot = (k: PotCoding) => { setPotCoding(k); keep(KEEP.pot, k); };
  const handLabel = (h: (typeof g.hands)[number]) => {
    const w = [...new Set(h.winners.map((x) => name(x.playerId)))];
    return w.length ? `Hand ${h.n} (${w.join(' and ')})` : `Hand ${h.n}`;
  };

  /** The PNG files of one set (or of the picked hands). One render per choice; a copy or a preview of it reuses it. */
  const render = (k: PngSet, hands?: ID[]): Promise<File[]> => {
    const key = `${k}|${hands?.join(',') ?? ''}`;
    let p = imgCache.current.get(key);
    if (!p) {
      const cache = imgCache.current, fin = done.current;
      p = (async () => {
        await loadReportFonts();
        const parts = await renderPngParts(g, k, { players: allPlayers, settings, name, theme: appTheme, ...(hands ? { hands } : {}) });
        const label = k === 'log' ? 'action log' : (PNG_SETS.find((x) => x.k === k) ?? PNG_SETS[0]).label.toLowerCase();
        const out: File[] = [];
        for (const { canvas: c, part } of parts) {
          out.push(await canvasToFile(c, outputName(g, label, 'png', part)));
          c.width = 0; c.height = 0; // free canvas memory on iOS
        }
        return out;
      })();
      cache.set(key, p);
      p.then((f) => { if (cache === imgCache.current) { fin.set(key, f); bump((x) => x + 1); } }, () => cache.delete(key));
    }
    return p;
  };

  /** The jobs behind the picked images: one per snapshot set (3 parts each), or one per ticked hand. */
  type Job = [PngSet, ID[]?];
  const snapJobs = (): Job[] => (['summary', 'detailed', 'playstyle'] as Snap[]).filter((k) => snap[k]).map((k) => [k]);
  const logJobs = (): Job[] => ticked.map((id) => ['log', [id]] as Job);
  const keyOf = ([k, h]: Job) => `${k}|${h?.join(',') ?? ''}`;
  const readyFiles = (jobs: Job[]): File[] | null => {
    const out: File[] = [];
    for (const j of jobs) { const f = done.current.get(keyOf(j)); if (!f) return null; out.push(...f); }
    return out;
  };
  /** Images in one job: a snapshot set is 3 images, a hand is 1. */
  const imgsOf = (j: Job) => (j[0] === 'log' ? 1 : 3);
  const countImgs = (jobs: Job[]) => jobs.reduce((n, j) => n + imgsOf(j), 0);
  /** The first jobs that fit in WARN_IMAGES: the only ones drawn before a press. */
  const firstJobs = (jobs: Job[]): Job[] => { const out: Job[] = []; let n = 0; for (const j of jobs) { n += imgsOf(j); if (n > WARN_IMAGES) break; out.push(j); } return out; };
  const snapKey = tier === 'png' && ready ? firstJobs(snapJobs()).map(keyOf).join(';') : '';
  const logKey = tier === 'log' && lReady ? firstJobs(logJobs()).map(keyOf).join(';') : '';
  // draw the images before the press: when a part or hand is ticked and when a row opens
  useEffect(() => {
    if (!snapKey && !logKey) return;
    let dead = false;
    const jobs = firstJobs(snapKey ? snapJobs() : logJobs());
    (async () => { for (const j of jobs) { if (dead) return; try { await render(j[0], j[1]); } catch { /* the press says so */ } } })();
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapKey, logKey, g, appTheme]);

  const preview = (from: Element, title: string, load: () => Promise<Loaded>) => setPv({ from, title, load });
  const previewImgs = (e: React.MouseEvent, title: string, k: PngSet, hands?: ID[]) =>
    preview(e.currentTarget, title, async () => { const files = await render(k, hands); return { files, imgs: files.map((f) => URL.createObjectURL(f)) }; });
  const previewHtml = (e: React.MouseEvent) =>
    preview(e.currentTarget, 'Interactive Game Dashboard', async () => ({ html: await (await makeHtmlReport(g, allPlayers, settings, { gameLog })).file.text() }));

  /** Makes the report link (30 days) and copies it. The clipboard call starts inside the press; the link arrives when the publish is done. */
  const copyLink = (): Promise<boolean> => {
    let published = false;
    const made = publishReport(g, allPlayers, st.settings, { gameLog }).then((link) => { published = true; setLinkMade(link); return link; });
    return copyLater('text/plain', made.then((l) => new Blob([l], { type: 'text/plain' }))).then(
      () => { toast('Report link copied. It works for 30 days.'); return true; },
      (e: Error) => {
        toast(published ? 'Report link is ready. Copy was blocked, so select the link and copy it.' : `Report link did not save: ${e.message}`);
        return false;
      },
    );
  };

  /** Draws every job one after the other, for the warning row. */
  const drawAll = async (jobs: Job[]) => {
    const run = ++drawRun.current;
    setDrawing(true);
    for (const j of jobs) {
      if (run !== drawRun.current) return;
      try { await render(j[0], j[1]); } catch { /* the row stays; the next press tries again */ }
    }
    if (run === drawRun.current) setDrawing(false);
  };
  const drawnImgs = (jobs: Job[]) => jobs.reduce((n, j) => n + (done.current.get(keyOf(j))?.length ?? 0), 0);

  /** Shares every image as its own file with the phone share sheet. navigator.share only runs inside a press, with
      files that are drawn already. Above WARN_IMAGES the first press opens the warning row, the row press draws the
      rest, and a second press on Share in the row shares. */
  const sendImages = (jobs: Job[], empty: string, where: Choice, confirmed = false): Promise<boolean> | boolean => {
    if (!jobs.length) { toast(empty); return false; }
    const n = countImgs(jobs);
    if (n > WARN_IMAGES && !confirmed) { setAsk({ tier: where, n }); return false; }
    const files = readyFiles(jobs);
    if (!files) {
      if (confirmed) { if (!drawing) void drawAll(jobs); return false; }
      jobs.forEach((j) => { render(j[0], j[1]).catch(() => {}); });
      toast('The images are still being drawn. Press Share again in a moment.');
      return false;
    }
    setAsk(null);
    return shareFiles(files, g.name).then((r) => {
      if (r === 'downloaded') toast(`${files.length > 1 ? `${files.length} images` : 'Image'} saved to Downloads`);
      return r !== 'cancelled';
    });
  };
  const shareSnaps = () => sendImages(snapJobs(), 'Tick at least 1 image.', 'png');
  const shareLog = () => sendImages(logJobs(), 'Tick at least 1 hand.', 'log');
  const warnRow = (where: Choice, jobs: () => Job[], empty: string) => {
    const list = ask?.tier === where ? jobs() : [];
    const n = countImgs(list), have = drawnImgs(list);
    const isReady = list.length > 0 && readyFiles(list) !== null;
    return (
      <Fold open={ask?.tier === where}>
        <div className="felt-exp-note felt-exp-warn" role="alert">
          <span className="sat-small">{drawing && !isReady ? `Drawing ${have} of ${n}` : isReady ? `${n} images are ready.` : `This shares ${n} images.`}</span>
          <span className="sat-cluster" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)' }}>
            <button type="button" className="sat-btn sat-btn--sm" aria-disabled={drawing && !isReady} onClick={() => { if (drawing && !isReady) return; void sendImages(jobs(), empty, where, true); }}>Share</button>
            <button type="button" className="sat-btn sat-btn--ghost sat-btn--sm" onClick={() => { drawRun.current++; setDrawing(false); setAsk(null); }}>Cancel</button>
          </span>
        </div>
      </Fold>
    );
  };
  const shareCsv = async () => {
    const list = [g];
    const files: File[] = [];
    if (csv.players) files.push(textFile(playersCsv(list, name), outputName(g, 'data', 'csv', 'players')));
    if (csv.hand) files.push(textFile(handsCsv(list, name, potCoding), outputName(g, 'data', 'csv', 'hands')));
    if (csv.actions) files.push(textFile(actionsCsv(list, name), outputName(g, 'data', 'csv', 'action log')));
    if (csv.data) files.push(textFile(ledgerCsv(list, name), outputName(g, 'data', 'csv', 'event ledger')));
    if (!files.length) { toast('Tick at least 1 file.'); return false; }
    const r = await shareFiles(files, `${g.name} data`);
    if (r === 'downloaded') toast(`${files.length > 1 ? `${files.length} files` : 'File'} saved to Downloads`);
    return r !== 'cancelled';
  };

  const note = (what: string, min = MIN_REPORT_HANDS) => <div className="felt-exp-note sat-small">{what} needs a closed game with at least {min} recorded {min === 1 ? 'hand' : 'hands'}. This game has {recordedHands(g)}.</div>;


  return (
    <div className="felt-page">
      <Header back={() => back(`game/${g.id}/close`)} title="Export" />
      <div className="sat-stack">
        <Caption>Share</Caption>
        <div className="sat-glass-2 felt-list felt-exp" role="radiogroup" aria-label="Share">

          <div className="felt-exp-opt">
            <Head tier={tier} setTier={setTier} k="html" label="Interactive Game Dashboard" tip="expDashboard">
              <div className="felt-exp-act" data-on={tier === 'html' && ready} {...(tier === 'html' && ready ? {} : { inert: '' })}>
                <button type="button" className="sat-btn sat-btn--ghost sat-iconbtn felt-exp-ic" aria-label="View dashboard" onClick={(e) => { e.stopPropagation(); previewHtml(e); }}><Icon name="eye" size={20} /></button>
                <ActBtn icon="copy" label="Copy link" onAct={copyLink} />
              </div>
            </Head>
            <Fold open={tier === 'html'}>
              {ready ? (
                <>
                  <div className="felt-exp-sub">
                    <label className="felt-exp-tick"><input type="checkbox" checked={gameLog} aria-label="Include full action log" onChange={toggleLog} /><span>Include full action log</span></label>
                    <Tip k="expActionLogTick" />
                  </div>
                  {linkMade && (
                    <div className="felt-exp-note">
                      <span className="sat-cluster" style={{ ['--sat-gap' as string]: 'var(--sat-space-1)' }}><b>Report link</b><Help k="reportLink" /></span>
                      <p className="sat-small sat-mono felt-selectable" style={{ wordBreak: 'break-all' }}>{linkMade}</p>
                    </div>
                  )}
                  {noCode.length > 0 && <div className="felt-exp-note sat-small">{noCode.map((p) => p.name).join(', ')} {noCode.length === 1 ? 'has' : 'have'} an unseen code. Open Players, tap the player and tap the eye. The report still builds.</div>}
                </>
              ) : note('The game report')}
            </Fold>
          </div>

          <div className="felt-exp-opt">
            <Head tier={tier} setTier={setTier} k="png" label="Game summary snapshot" tip="expSnapshot">
              <div className="felt-exp-act" data-on={tier === 'png' && ready} {...(tier === 'png' && ready ? {} : { inert: '' })}>
                <ActBtn icon="share" label="Share images" onAct={shareSnaps} />
              </div>
            </Head>
            <Fold open={tier === 'png'}>
              {ready ? (
                ([['summary', 'Summary', 'expSummary'], ['detailed', 'Details', 'expDetails'], ['playstyle', 'Playstyle', 'expPlaystyle']] as [Snap, string, ExpKey][]).map(([k, label, tip]) => (
                  <div key={k} className="felt-exp-sub">
                    <label className="felt-exp-tick"><input type="checkbox" checked={snap[k]} aria-label={label} onChange={() => setSnap((s) => ({ ...s, [k]: !s[k] }))} /><span>{label}</span></label>
                    <Tip k={tip} />
                    <button type="button" className="sat-btn sat-btn--ghost sat-iconbtn felt-exp-ic felt-exp-end" aria-label={`Preview ${label}`} onClick={(e) => previewImgs(e, label, k)}><Icon name="eye" size={20} /></button>
                  </div>
                ))
              ) : note('The images')}
              {ready && warnRow('png', snapJobs, 'Tick at least 1 image.')}
            </Fold>
          </div>

          <div className="felt-exp-opt">
            <Head tier={tier} setTier={setTier} k="log" label="Full Action Log" tip="expLog">
              <div className="felt-exp-act" data-on={tier === 'log' && lReady} {...(tier === 'log' && lReady ? {} : { inert: '' })}>
                <ActBtn icon="share" label="Share ticked hands" onAct={shareLog} />
              </div>
              <span className="felt-exp-chev" data-open={tier === 'log'} aria-hidden="true"><Icon name="chevron" size={18} /></span>
            </Head>
            <Fold open={tier === 'log'}>
              {lReady ? (
                <>
                <div className="felt-exp-sub felt-exp-allnone">
                  <span className="sat-small sat-muted">{ticked.length} of {handIds.length} hands</span>
                  <span className="felt-exp-end sat-cluster" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)' }}>
                    <button type="button" className="sat-btn sat-btn--ghost sat-btn--sm" aria-disabled={ticked.length === handIds.length} onClick={() => setOn(Object.fromEntries(handIds.map((id) => [id, true])))}>All</button>
                    <button type="button" className="sat-btn sat-btn--ghost sat-btn--sm" aria-disabled={ticked.length === 0} onClick={() => setOn({})}>None</button>
                  </span>
                </div>
                <div className="felt-exp-hands" role="group" aria-label="Hands to include">
                  {logHands.map((h) => (
                    <div key={h.id} className="felt-exp-sub">
                      <label className="felt-exp-tick"><input type="checkbox" checked={!!on[h.id]} aria-label={handLabel(h)} onChange={() => tickHand(h.id)} /><span>{handLabel(h)}</span></label>
                      <button type="button" className="sat-btn sat-btn--ghost sat-iconbtn felt-exp-ic felt-exp-end" aria-label={`Preview hand ${h.n}`} onClick={(e) => previewImgs(e, `Hand ${h.n}`, 'log', [h.id])}><Icon name="eye" size={20} /></button>
                    </div>
                  ))}
                </div>
                {warnRow('log', logJobs, 'Tick at least 1 hand.')}
                </>
              ) : note('The images', MIN_LOG_HANDS)}
            </Fold>
          </div>

          <div className="felt-exp-opt">
            <Head tier={tier} setTier={setTier} k="csv" label="Full Data" tip="expData">
              <div className="felt-exp-act" data-on={tier === 'csv'} {...(tier === 'csv' ? {} : { inert: '' })}>
                <ActBtn icon="share" label="Share the files" onAct={shareCsv} />
              </div>
            </Head>
            <Fold open={tier === 'csv'}>
              {([['players', 'Players', 'expPlayers'], ['hand', 'Hands', 'expHand'], ['actions', 'Action log', 'expActions'], ['data', 'Event ledger', 'expLedger']] as ['players' | 'hand' | 'actions' | 'data', string, ExpKey][]).map(([k, label, tip]) => (
                <div key={k}>
                  <div className="felt-exp-sub">
                    <label className="felt-exp-tick"><input type="checkbox" checked={csv[k]} aria-label={label} onChange={() => setCsv((s) => ({ ...s, [k]: !s[k] }))} /><span>{label}</span></label>
                    <Tip k={tip} />
                  </div>
                  {k === 'hand' && (
                    <Fold open={csv.hand}>
                      <div className="felt-exp-sub felt-exp-pot" role="radiogroup" aria-label="Pot coding">
                        <button type="button" role="radio" aria-checked={potCoding === 'street'} onClick={() => pickPot('street')}><span className="felt-choice-dot" aria-hidden="true" />Street won</button>
                        <button type="button" role="radio" aria-checked={potCoding === 'player'} onClick={() => pickPot('player')}><span className="felt-choice-dot" aria-hidden="true" />Player won</button>
                      </div>
                    </Fold>
                  )}
                </div>
              ))}
            </Fold>
          </div>
        </div>
      </div>

      {pv && <Preview key={pv.title} pv={pv} onClosed={() => setPv(null)} />}
    </div>
  );
}
