import { publishReport, reportLinkOf } from '../live/reportLink';
import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import { useGame, useStore, usePlayerName } from '../store';
import { back, go } from '../router';
import { Caption, Empty, Header, Help, Icon, toast, TabPill } from '../components/ui';
import { loadReportFonts, type ReportTheme } from '../report/canvas';
import { handsCsv, ledgerCsv, outputName, playersCsv, type PotCoding } from '../report/csv';
import { PNG_SETS, renderPngSetPages, type PngSet } from '../report/pngSets';
import { canvasToFile, shareFiles, textFile } from '../report/share';
import { MIN_REPORT_HANDS, makeHtmlReport, recordedHands, reportReady } from '../report/htmlReport';
import { useResolvedTheme } from '../theme';
import { haptic } from '../lib/haptics';
import { calm, motionOff } from '../lib/motion';

type Choice = 'html' | 'png' | 'csv';

/** Choices kept on this phone (not in the game, not in a backup). */
const KEEP = { gameLog: 'felt-report-gamelog', set: 'felt-report-pngset', pot: 'felt-report-potcoding' };
function readKept<T>(key: string, fallback: T): T { try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; } }
function keep(key: string, v: unknown) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private mode: the choice lasts for this visit only */ } }

/** Each option says what it contains and which files it gives, so nobody has to guess before sharing. */
const TIERS: { k: Choice; label: string; file: string; desc: string }[] = [
  { k: 'html', label: 'HTML', file: '1 HTML file', desc: 'Interactive game report: awards, charts, stats and house rules. Each player opens their own page with a code.' },
  { k: 'png', label: 'PNG', file: 'Image (PNG)', desc: 'One sharp image of the set you pick.' },
  { k: 'csv', label: 'CSV', file: '3 CSV files', desc: 'Full player list, hands and event ledger.' },
];

/** Copies inside the press: the clipboard call starts now and the data arrives later, which iOS Safari allows.
    Without a promise-aware ClipboardItem, text still falls back to writeText. */
function copyLater(type: 'text/plain' | 'image/png', data: Promise<Blob>): Promise<void> {
  if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
    try { return navigator.clipboard.write([new ClipboardItem({ [type]: data })]); } catch { /* fall through */ }
  }
  if (type === 'text/plain' && navigator.clipboard?.writeText) return data.then((b) => b.text()).then((t) => navigator.clipboard.writeText(t));
  return Promise.reject(new Error('no clipboard'));
}

/** The Copy button: no spinner. The word Copied shows when the copy promise is done. */
function CopyButton({ ready, onCopy, className, children }: { ready: boolean; onCopy: () => Promise<boolean>; className?: string; children: React.ReactNode }) {
  const [phase, setPhase] = useState<'idle' | 'wait' | 'done'>('idle');
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const click = () => {
    if (!ready || phase === 'wait') return;
    setPhase('wait');
    void onCopy().then((ok) => {
      if (!ok) { setPhase('idle'); return; }
      setPhase('done');
      timer.current = window.setTimeout(() => setPhase('idle'), 1200);
    });
  };
  return (
    <button type="button" data-press="commit" className={`felt-lb ${className ?? ''}`} aria-disabled={!ready} aria-busy={phase === 'wait'} data-wait={phase === 'wait'} onClick={click}>
      <span className="felt-lb-face" data-on={phase !== 'done'}>{children}</span>
      <span className="felt-lb-face" data-on={phase === 'done'} aria-hidden={phase !== 'done'}><svg width="12" height="12" viewBox="0 0 12 12"><path d="M2.5 6.5 5 9l4.5-5.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>Copied</span>
    </button>
  );
}

/** Like Fold, but the last content stays while the block closes, so what leaves shrinks and fades instead of cutting. */
function FoldKeep({ open, children }: { open: boolean; children: React.ReactNode }) {
  const last = useRef<React.ReactNode>(null);
  if (open) last.current = children;
  return <Fold open={open}>{open ? children : last.current}</Fold>;
}

const PAD = { paddingTop: 'var(--sat-space-3)' };

/** A block that opens by growing (the same fold as the Players lists). */
function Fold({ open, children }: { open: boolean; children: React.ReactNode }) {
  return <div className="felt-fold-wrap" data-open={open} {...(open ? {} : { inert: '' })}><div className="felt-fold-inner">{children}</div></div>;
}

export default function Report({ gameId }: { gameId: string }) {
  const g = useGame(gameId);
  const name = usePlayerName();
  const pref = useStore((s) => s.settings.theme);
  const appTheme = useResolvedTheme(pref);
  const settings = useStore((s) => s.settings);
  const allPlayers = useStore((s) => s.players);
  const [tier, setTier] = useState<Choice>('html');
  const [look, setLook] = useState<ReportTheme>(appTheme);
  const [files, setFiles] = useState<File[]>([]);
  const [urls, setUrls] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [gameLog, setGameLog] = useState<boolean>(() => readKept(KEEP.gameLog, false));
  const [setKey, setSetKey] = useState<PngSet>(() => { const v = readKept<PngSet>(KEEP.set, 'summary'); return PNG_SETS.some((x) => x.k === v) ? v : 'summary'; });
  const [potCoding, setPotCoding] = useState<PotCoding>(() => (readKept<PotCoding>(KEEP.pot, 'street') === 'player' ? 'player' : 'street'));
  const [setOpen, setSetOpen] = useState(false);
  /** Hands left unticked in the Full Action Log; all are ticked by default. */
  const [off, setOff] = useState<Record<string, true>>({});
  const handIds = g ? g.hands.map((h) => h.id) : [];
  const ticked = handIds.filter((id) => !off[id]);
  const tickKey = ticked.join(',');
  const set = PNG_SETS.find((x) => x.k === setKey) ?? PNG_SETS[0];

  useEffect(() => {
    if (!g) return;
    let cancelled = false;
    setBusy(true);
    const t = window.setTimeout(async () => {
      try {
        let out: File[];
        if (tier === 'html') {
          // a game too short for the report gets the card below that says why, not an error
          const made = reportReady(g) ? await makeHtmlReport(g, allPlayers, settings, { gameLog }) : undefined;
          out = made ? [made.file] : [];
        } else if (tier === 'csv') {
          const list = [g];
          out = [
            textFile(playersCsv(list, name), outputName(g, 'data (3 csv)', 'csv', 'players')),
            textFile(handsCsv(list, name, potCoding), outputName(g, 'data (3 csv)', 'csv', 'hands')),
            textFile(ledgerCsv(list, name), outputName(g, 'data (3 csv)', 'csv', 'ledger')),
          ];
        } else if (!reportReady(g) || (setKey === 'log' && !ticked.length)) {
          // a game too short for the report (or no hand ticked) is not rendered: the card below says why
          out = [];
        } else {
          await loadReportFonts();
          const pages = await renderPngSetPages(g, setKey, { players: allPlayers, settings, name, theme: look, ...(setKey === 'log' ? { hands: ticked } : {}) });
          out = [];
          for (let i = 0; i < pages.length; i++) {
            const c = pages[i];
            out.push(await canvasToFile(c, outputName(g, set.label.toLowerCase(), 'png', pages.length > 1 ? `(page ${i + 1} of ${pages.length})` : undefined)));
            c.width = 0; c.height = 0; // free canvas memory on iOS
          }
        }
        if (cancelled) return;
        setFiles(out);
        setUrls(tier === 'png' ? out.map((f) => URL.createObjectURL(f)) : []);
      } catch (e) {
        toast(`Report unable to build (${(e as Error).message}). Go back and try again.`);
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, 30);
    return () => { cancelled = true; window.clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g, tier, look, gameLog, setKey, potCoding, tickKey]);

  useEffect(() => () => { urls.forEach((u) => URL.revokeObjectURL(u)); }, [urls]);

  const [viewing, setViewing] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const [fullClosing, setFullClosing] = useState(false);
  const fullRef = useRef<HTMLDivElement>(null);
  const fullFrom = useRef<Element | null>(null);
  const [linkMade, setLinkMade] = useState<string | null>(() => (gameId ? reportLinkOf(gameId)?.link ?? null : null));
  const st = useStore();
  const hold = useRef<{ t: number; t0: number; x: number; y: number; done: boolean; i: number } | null>(null);
  const noCode = g ? allPlayers.filter((p) => g.playerIds.includes(p.id) && !p.codeIssued) : [];
  /** The bottom bar fades in and out with the tier; it keeps its last words while it leaves. */
  const barTier = useRef<Choice>('png');
  if (tier !== 'html') barTier.current = tier;

  const openFull = () => { fullFrom.current = document.activeElement; setFullClosing(false); setFull(true); };
  const closeFull = () => {
    if (!full || fullClosing) return;
    const done = () => { setFull(false); setFullClosing(false); (fullFrom.current as HTMLElement | null)?.focus?.({ preventScroll: true }); };
    if (motionOff()) { done(); return; }
    setFullClosing(true);
    window.setTimeout(done, calm() ? 150 : 200);
  };
  useEffect(() => {
    if (!full) return;
    fullRef.current?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); closeFull(); } };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [full, fullClosing]);
  if (!g) return <div className="felt-page"><Header back={() => go('')} title="Export" /><Empty title="Game not found">It may have been deleted.</Empty></div>;

  const ready = reportReady(g);
  const toggleLog = () => { setGameLog(!gameLog); keep(KEEP.gameLog, !gameLog); };
  const pickSet = (k: PngSet) => { setSetKey(k); keep(KEEP.set, k); setSetOpen(false); };
  const pickPot = (k: PotCoding) => { setPotCoding(k); keep(KEEP.pot, k); };
  const share = async () => {
    const r = await shareFiles(files, `${g.name} report`);
    if (r === 'downloaded') toast(`${files.length > 1 ? `${files.length} files` : 'File'} saved to Downloads`);
  };
  /** Makes the report link (30 days) and copies it. */
  const copyLink = (): Promise<boolean> => {
    // the clipboard call starts inside the press; the link arrives when the publish is done
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
  /** Copy the image once a press has held 550 ms. Runs in the pointer-up, so the phone still counts it as a press. */
  const copyImage = (i: number) => {
    const f = files[i];
    if (!f) return;
    copyLater('image/png', Promise.resolve(f)).then(
      () => { toast('Image copied.'); },
      () => { toast('Copy was blocked on this phone. Use Download or share instead.'); },
    );
  };
  const press = (i: number) => ({
    onPointerDown: (e: React.PointerEvent) => {
      const h = { t: 0, t0: performance.now(), x: e.clientX, y: e.clientY, done: false, i };
      h.t = window.setTimeout(() => { h.done = true; haptic(15); }, 550);
      hold.current = h;
    },
    onPointerMove: (e: React.PointerEvent) => {
      const h = hold.current;
      if (h && !h.done && Math.hypot(e.clientX - h.x, e.clientY - h.y) > 10) { window.clearTimeout(h.t); hold.current = null; }
    },
    onPointerUp: () => {
      const h = hold.current; hold.current = null;
      if (!h) return;
      window.clearTimeout(h.t);
      if (h.done || performance.now() - h.t0 >= 550) copyImage(h.i);
      else openFull();
    },
    onPointerCancel: () => { if (hold.current) window.clearTimeout(hold.current.t); hold.current = null; },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });
  const allOn = ticked.length === handIds.length;
  const setAll = (on: boolean) => setOff(on ? {} : Object.fromEntries(handIds.map((id) => [id, true as const])));
  const tickHand = (id: string) => setOff((o) => { const n = { ...o }; if (n[id]) delete n[id]; else n[id] = true; return n; });

  return (
    <div className="felt-page">
      <Header back={() => back(`game/${g.id}/close`)} title="Export" sub={g.name} />
      <div className="sat-stack">
        <div className="sat-split"><Caption>Share</Caption><Help k="tiers" /></div>
        <div className="sat-glass-2 felt-list" role="radiogroup" aria-label="Share">
          {TIERS.map((t) => (
            <div key={t.k}>
              <div className="felt-exp-row">
                <button role="radio" aria-checked={tier === t.k} className="felt-row felt-choice" onClick={() => setTier(t.k)}>
                  <span className="felt-choice-dot" aria-hidden="true" />
                  <span className="felt-row-main">
                    <span className="felt-row-title">{t.label}</span>
                    <span className="felt-row-sub">{t.desc}</span>
                  </span>
                  {t.k !== 'html' && <span className="sat-small sat-muted felt-right">{t.file}</span>}
                </button>
                {t.k === 'html' && (
                  <CopyButton className="sat-btn sat-btn--sm felt-exp-copy" ready={ready} onCopy={copyLink}><Icon name="copy" size={16} /> Copy</CopyButton>
                )}
              </div>

              {t.k === 'html' && (
                <Fold open={tier === 'html'}>
                  <label className="felt-row felt-tick">
                    <input type="checkbox" checked={gameLog} onChange={toggleLog} />
                    <span className="felt-row-main"><span className="felt-row-title">Game Log tab</span><span className="felt-row-sub">Every hand with its actions, open to anyone with the report. It does not show hidden cards.</span></span>
                  </label>
                  <div className="felt-exp-actions">
                    <button className="sat-btn sat-btn--sm" aria-disabled={busy || !files.length} onClick={async () => { if (!busy && files[0]) setViewing(await files[0].text()); }}><Icon name="eye" size={16} /> View</button>
                    <button className="sat-btn sat-btn--sm" aria-disabled={busy || !files.length} onClick={() => !busy && files.length && share()}><Icon name="download" size={16} /> Save HTML file</button>
                  </div>
                </Fold>
              )}

              {t.k === 'png' && (
                <Fold open={tier === 'png'}>
                  <div className="felt-fold">
                    <button className="felt-row felt-fold-head" aria-expanded={setOpen} aria-haspopup="listbox" onClick={() => setSetOpen(!setOpen)}>
                      <span className="felt-row-main"><span className="felt-row-title">{set.label}</span><span className="felt-row-sub">{set.desc}</span></span>
                      <span className="felt-fold-chev"><Icon name="chevron" size={18} /></span>
                    </button>
                    <Fold open={setOpen}>
                      <div role="listbox" aria-label="Image set">
                        {PNG_SETS.map((x) => (
                          <button key={x.k} role="option" aria-selected={setKey === x.k} className="felt-row felt-choice" onClick={() => pickSet(x.k)}>
                            <span className="felt-choice-dot" aria-hidden="true" />
                            <span className="felt-row-main"><span className="felt-row-title">{x.label}</span><span className="felt-row-sub">{x.desc}</span></span>
                          </button>
                        ))}
                      </div>
                    </Fold>
                  </div>
                  <Fold open={setKey === 'log'}>
                    <div role="group" aria-label="Hands to include">
                      <label className="felt-row felt-tick">
                        <input type="checkbox" checked={allOn} onChange={() => setAll(!allOn)} />
                        <span className="felt-row-main"><span className="felt-row-title">Select all</span><span className="felt-row-sub">{ticked.length} of {handIds.length} hands</span></span>
                      </label>
                      <div className="felt-exp-hands">
                        {g.hands.map((h) => (
                          <label key={h.id} className="felt-row felt-tick">
                            <input type="checkbox" checked={!off[h.id]} onChange={() => tickHand(h.id)} />
                            <span className="felt-row-main"><span className="felt-row-title">Hand {h.n}</span></span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </Fold>
                </Fold>
              )}

              {t.k === 'csv' && (
                <Fold open={tier === 'csv'}>
                  <div className="felt-exp-pot">
                    <span className="sat-small sat-muted">Pot coding in the hands file</span>
                    <div className="sat-seg" role="radiogroup" aria-label="Pot coding">
                      <TabPill />
                      <button role="radio" aria-checked={potCoding === 'street'} onClick={() => pickPot('street')}>Street won</button>
                      <button role="radio" aria-checked={potCoding === 'player'} onClick={() => pickPot('player')}>Player won</button>
                    </div>
                  </div>
                </Fold>
              )}
            </div>
          ))}
        </div>

        <div>
          <FoldKeep open={tier === 'png'}>
            <div className="sat-split" style={PAD}>
              <span className="sat-small sat-muted">Image colours:</span>
              <div className="sat-seg" role="radiogroup" aria-label="Image theme">
                <TabPill />
                <button role="radio" aria-checked={look === 'light'} onClick={() => setLook('light')} aria-label="Light image"><Icon name="sun" /></button>
                <button role="radio" aria-checked={look === 'dark'} onClick={() => setLook('dark')} aria-label="Dark image"><Icon name="moon" /></button>
              </div>
            </div>
          </FoldKeep>

          <FoldKeep open={busy}>
            <div style={PAD}><div className="felt-skel" style={{ height: 160 }} aria-label="Building the export" /></div>
          </FoldKeep>

          <FoldKeep open={tier === 'png' && ready && setKey === 'log' && !ticked.length}>
            <div style={PAD}><div className="sat-flat sat-card sat-small">Tick at least 1 hand.</div></div>
          </FoldKeep>

          <FoldKeep open={!busy && tier === 'png' && urls.length > 0}>
            <div style={PAD}>
              {urls.map((u, i) => (
                <img key={u} src={u} className="felt-preview felt-preview--press" alt={urls.length > 1 ? `${set.label} image, page ${i + 1} of ${urls.length}` : `${set.label} image`} draggable={false} {...press(i)} />
              ))}
            </div>
          </FoldKeep>

          <FoldKeep open={(tier === 'html' || tier === 'png') && !ready}>
            <div style={PAD}><div className="sat-flat sat-card sat-small">{tier === 'png' ? 'The images need' : 'The game report needs'} a closed game with at least {MIN_REPORT_HANDS} recorded hands. This game has {recordedHands(g)}.</div></div>
          </FoldKeep>

          <FoldKeep open={tier === 'html' && !!linkMade}>
            <div style={PAD}>
              <div className="sat-flat sat-card sat-stack" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)' }}>
                <span className="sat-cluster" style={{ ['--sat-gap' as string]: 'var(--sat-space-1)' }}><b>Report link</b><Help k="reportLink" /></span>
                <p className="sat-small sat-mono felt-selectable" style={{ wordBreak: 'break-all' }}>{linkMade}</p>
              </div>
            </div>
          </FoldKeep>

          <FoldKeep open={tier === 'html' && noCode.length > 0}>
            <div style={PAD}><div className="sat-flat sat-card sat-small">{noCode.map((p) => p.name).join(', ')} {noCode.length === 1 ? 'has' : 'have'} an unseen code. Open Players, tap the player and tap the eye. The report still builds.</div></div>
          </FoldKeep>

          <FoldKeep open={!busy && tier === 'csv' && files.length > 0}>
            <div style={PAD}>
              <div className="sat-glass-2 felt-list">
                {files.map((f) => (
                  <div key={f.name} className="felt-row">
                    <Icon name="file" size={20} />
                    <div className="felt-row-main"><div className="felt-row-title felt-ellipsis sat-mono sat-small">{f.name}</div><div className="felt-row-sub">{(f.size / 1024).toFixed(1)} KB</div></div>
                  </div>
                ))}
              </div>
            </div>
          </FoldKeep>
        </div>
      </div>

      {viewing !== null && createPortal(
        <div className="felt-report-view" role="dialog" aria-label="Game report">
          <div className="felt-report-bar sat-glass-2"><b className="felt-ellipsis">{g.name}</b><button className="sat-btn sat-btn--sm" onClick={() => setViewing(null)}>Close</button></div>
          <iframe title="Game report" srcDoc={viewing} />
        </div>, document.body)}

      {full && urls.length > 0 && createPortal(
        <div ref={fullRef} tabIndex={-1} className="felt-img-full" data-closing={fullClosing || undefined} role="dialog" aria-modal="true" aria-label={`${set.label} image, full screen. Press Escape to close.`} onClick={closeFull}>
          {urls.map((u, i) => <img key={u} src={u} alt={urls.length > 1 ? `${set.label} image, page ${i + 1} of ${urls.length}` : `${set.label} image`} draggable={false} />)}
        </div>, document.body)}

      <div className="sat-bottombar sat-glass-2 felt-bar-fade" data-open={tier !== 'html'} {...(tier === 'html' ? { inert: '' } : {})}>
        <button className="sat-btn sat-btn--primary sat-btn--lg" aria-disabled={busy || !files.length} onClick={() => !busy && files.length && share()}>
          <Icon name="share" /> {barTier.current === 'csv' ? 'Download or share 3 CSV files' : files.length > 1 ? `Download or share ${files.length} images` : 'Download or share image'}
        </button>
      </div>
    </div>
  );
}
