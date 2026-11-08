import { publishReport, reportLinkOf } from '../live/reportLink';
import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { useGame, useStore, usePlayerName } from '../store';
import { back, go } from '../router';
import { Caption, Empty, Header, Help, Icon, toast, TabPill, WordButton } from '../components/ui';
import { renderReport, type Tier } from '../report/reports';
import { loadReportFonts, type ReportTheme } from '../report/canvas';
import { handsCsv, ledgerCsv, outputName, playersCsv } from '../report/csv';
import { buildModel } from '../report/model';
import { SEGMENTS, renderSegment, type SegmentKey } from '../report/segments';
import { canvasToFile, shareFiles, textFile } from '../report/share';
import { MIN_REPORT_HANDS, makeHtmlReport, recordedHands, reportReady } from '../report/htmlReport';
import { useResolvedTheme } from '../theme';

type Choice = Tier | 'data' | 'html' | 'segments';

/** Ticks kept on this phone (not in the game, not in a backup). */
const KEEP = { segments: 'felt-report-segments', gameLog: 'felt-report-gamelog' };
function readKept<T>(key: string, fallback: T): T { try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; } }
function keep(key: string, v: unknown) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private mode: the ticks last for this visit only */ } }

/** Each option says what it contains and which files it gives, so nobody has to guess before sharing. */
const TIERS: { k: Choice; label: string; file: string; desc: string }[] = [
  { k: 'html', label: 'Game report', file: '1 HTML file', desc: 'Interactive page: awards, charts, stats and house rules. Each player opens their own page with a code.' },
  { k: 'segments', label: 'Game summary', file: 'Images (PNG)', desc: 'One sharp image for each part you tick: results, awards, charts and more.' },
  { k: 'summary', label: 'Results', file: '1 image (PNG)', desc: 'Buy-ins, results and who pays whom.' },
  { k: 'detailed', label: 'Results and stats', file: 'Image (PNG)', desc: 'Adds game stats, the money chart and highlights.' },
  { k: 'full', label: 'Full game record', file: 'Images (PNG)', desc: 'Adds the buy-in log and every hand with its cards.' },
  { k: 'data', label: 'Spreadsheet data', file: '3 CSV files', desc: 'Players, hands and an event ledger, for Excel or Google Sheets.' },
];

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
  const [segOn, setSegOn] = useState<Record<string, boolean>>(() => ({ ...Object.fromEntries(SEGMENTS.map((x) => [x.k, x.on])), ...readKept<Record<string, boolean>>(KEEP.segments, {}) }));
  const [gameLog, setGameLog] = useState<boolean>(() => readKept(KEEP.gameLog, false));
  const picked = SEGMENTS.filter((x) => segOn[x.k]);
  const pickKey = picked.map((x) => x.k).join(',');

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
        } else if (tier === 'data') {
          const list = [g];
          out = [
            textFile(playersCsv(list, name), outputName(g, 'data (3 csv)', 'csv', 'players')),
            textFile(handsCsv(list, name), outputName(g, 'data (3 csv)', 'csv', 'hands')),
            textFile(ledgerCsv(list, name), outputName(g, 'data (3 csv)', 'csv', 'ledger')),
          ];
        } else if (tier === 'segments') {
          // each ticked part is its own render at 2x
          out = [];
          if (reportReady(g) && picked.length) {
            await loadReportFonts();
            const model = buildModel({ players: allPlayers, games: [g], settings });
            for (const sg of picked) {
              const c = renderSegment(model, sg.k, look);
              out.push(await canvasToFile(c, outputName(g, `game summary, ${sg.label.toLowerCase()}`, 'png')));
              c.width = 0; c.height = 0; // free canvas memory on iOS
              if (cancelled) return;
            }
          }
        } else {
          await loadReportFonts();
          const canvases = renderReport(g, tier, name, look);
          const what = tier === 'summary' ? 'results' : tier === 'detailed' ? 'results and stats' : 'full game record';
          out = await Promise.all(canvases.map((c, i) => canvasToFile(c, outputName(g, what, 'png', canvases.length > 1 ? `(page ${i + 1} of ${canvases.length})` : undefined))));
          canvases.forEach((c) => { c.width = 0; c.height = 0; }); // free canvas memory on iOS
        }
        if (cancelled) return;
        setFiles(out);
        setUrls(tier === 'data' || tier === 'html' ? [] : out.map((f) => URL.createObjectURL(f)));
      } catch (e) {
        toast(`Report unable to build (${(e as Error).message}). Go back and try again.`);
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, 30);
    return () => { cancelled = true; window.clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g, tier, look, pickKey, gameLog]);

  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);

  const [viewing, setViewing] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [linkMade, setLinkMade] = useState<string | null>(() => (gameId ? reportLinkOf(gameId)?.link ?? null : null));
  const st = useStore();
  const noCode = g ? allPlayers.filter((p) => g.playerIds.includes(p.id) && !p.codeIssued) : [];
  if (!g) return <div className="felt-page"><Header back={() => go('')} title="Report" /><Empty title="Game not found">It may have been deleted.</Empty></div>;

  const toggleSeg = (k: SegmentKey) => { const next = { ...segOn, [k]: !segOn[k] }; setSegOn(next); keep(KEEP.segments, next); };
  const toggleLog = () => { setGameLog(!gameLog); keep(KEEP.gameLog, !gameLog); };
  const share = async () => {
    const r = await shareFiles(files, `${g.name} report`);
    if (r === 'downloaded') toast(`${info.label} saved to Downloads`);
  };
  const info = TIERS.find((t) => t.k === tier)!;
  const shareLink = async () => {
    if (busy || linking || !files.length) return;
    setLinking(true);
    try {
      const link = await publishReport(g, allPlayers, st.settings, { gameLog });
      setLinkMade(link);
      if (navigator.share) await navigator.share({ title: `${g.name} report`, url: link }).catch(() => undefined);
      else await navigator.clipboard?.writeText(link).catch(() => undefined);
      toast('Report link is ready. It works for 30 days.');
    } catch (e) { toast(`Report link did not save: ${(e as Error).message}`); }
    finally { setLinking(false); }
  };

  return (
    <div className="felt-page">
      <Header back={() => back(`game/${g.id}/close`)} title="Download or Share" sub={g.name} />
      <div className="sat-stack">
        <div className="sat-split"><Caption>What to download</Caption><Help k="tiers" /></div>
        <div className="sat-glass-2 felt-list" role="radiogroup" aria-label="What to download">
          {TIERS.map((t) => (
            <button key={t.k} role="radio" aria-checked={tier === t.k} className="felt-row felt-choice" onClick={() => setTier(t.k)}>
              <span className="felt-choice-dot" aria-hidden="true" />
              <span className="felt-row-main">
                <span className="felt-row-title">{t.label}</span>
                <span className="felt-row-sub">{t.desc}</span>
              </span>
              <span className="sat-small sat-muted felt-right">{t.file}</span>
            </button>
          ))}
        </div>
        <div className="sat-split">
          <span className="sat-small sat-muted">{tier === 'data' ? 'Opens in any spreadsheet app.' : tier === 'html' ? 'Opens in any browser. Works offline.' : 'Image colours:'}</span>
          {tier !== 'data' && tier !== 'html' && (
            <div className="sat-seg" role="radiogroup" aria-label="Image theme">
              <TabPill />
              <button role="radio" aria-checked={look === 'light'} onClick={() => setLook('light')} aria-label="Light image"><Icon name="sun" /></button>
              <button role="radio" aria-checked={look === 'dark'} onClick={() => setLook('dark')} aria-label="Dark image"><Icon name="moon" /></button>
            </div>
          )}
        </div>

        {tier === 'segments' && (
          <div className="sat-glass-2 felt-list" role="group" aria-label="Parts to include">
            {SEGMENTS.map((x) => (
              <label key={x.k} className="felt-row felt-tick">
                <input type="checkbox" checked={!!segOn[x.k]} onChange={() => toggleSeg(x.k)} />
                <span className="felt-row-main"><span className="felt-row-title">{x.label}</span><span className="felt-row-sub">{x.desc}</span></span>
              </label>
            ))}
          </div>
        )}

        {tier === 'html' && (
          <div className="sat-glass-2 felt-list">
            <label className="felt-row felt-tick">
              <input type="checkbox" checked={gameLog} onChange={toggleLog} />
              <span className="felt-row-main"><span className="felt-row-title">Game Log tab</span><span className="felt-row-sub">Every hand with its actions, open to anyone with the report. It does not show hidden cards.</span></span>
            </label>
          </div>
        )}

        {busy && <div className="felt-skel" style={{ height: 160 }} aria-label="Building the report" />}

        {tier === 'segments' && !reportReady(g) && (
          <div className="sat-flat sat-card sat-small">The game summary needs a closed game with at least {MIN_REPORT_HANDS} recorded hands. This game has {recordedHands(g)}.</div>
        )}
        {tier === 'segments' && reportReady(g) && picked.length === 0 && <div className="sat-flat sat-card sat-small">Tick at least 1 part.</div>}

        {!busy && tier !== 'data' && tier !== 'html' && (
          <div>
            {files.length > 1 && <p className="sat-small sat-muted" style={{ marginBottom: 'var(--sat-space-2)' }}>{files.length} images, shared together.</p>}
            {urls.map((u, i) => <img key={u} src={u} className="felt-preview" alt={`Report page ${i + 1}`} />)}
          </div>
        )}

        {tier === 'html' && !reportReady(g) && (
          <div className="sat-flat sat-card sat-small">The game report needs a closed game with at least {MIN_REPORT_HANDS} recorded hands. This game has {recordedHands(g)}.</div>
        )}

        {tier === 'html' && linkMade && (
          <div className="sat-flat sat-card sat-stack" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)' }}>
            <span className="sat-cluster" style={{ ['--sat-gap' as string]: 'var(--sat-space-1)' }}><b>Report link</b><Help k="reportLink" /></span>
            <p className="sat-small sat-mono" style={{ wordBreak: 'break-all' }}>{linkMade}</p>
            <WordButton word="Copied" instant className="sat-btn sat-btn--sm" run={() => { navigator.clipboard?.writeText(linkMade).catch(() => toast('Copy was blocked. Select the link and copy it.')); }}><Icon name="copy" size={16} /> Copy link</WordButton>
          </div>
        )}

        {tier === 'html' && noCode.length > 0 && (
          <div className="sat-flat sat-card sat-small">{noCode.map((p) => p.name).join(', ')} {noCode.length === 1 ? 'has' : 'have'} an unseen code. Open Players, tap the player and tap the eye. The report still builds.</div>
        )}

        {!busy && (tier === 'data' || tier === 'html') && (
          <div className="sat-glass-2 felt-list">
            {files.map((f) => (
              <div key={f.name} className="felt-row">
                <Icon name="file" size={20} />
                <div className="felt-row-main"><div className="felt-row-title felt-ellipsis sat-mono sat-small">{f.name}</div><div className="felt-row-sub">{(f.size / 1024).toFixed(1)} KB</div></div>
              </div>
            ))}
          </div>
        )}
      </div>

      {viewing !== null && createPortal(
        <div className="felt-report-view" role="dialog" aria-label="Game report">
          <div className="felt-report-bar sat-glass-2"><b className="felt-ellipsis">{g.name}</b><button className="sat-btn sat-btn--sm" onClick={() => setViewing(null)}>Close</button></div>
          <iframe title="Game report" srcDoc={viewing} />
        </div>, document.body)}

      <div className="sat-bottombar sat-glass-2">
        {tier === 'html' && <button className="sat-btn sat-btn--lg" aria-disabled={busy || !files.length} onClick={async () => { if (!busy && files[0]) setViewing(await files[0].text()); }}><Icon name="eye" /> View</button>}
        {tier === 'html' && <button className="sat-btn sat-btn--lg" aria-disabled={busy || !files.length || linking} onClick={shareLink}><Icon name="share" /> {linking ? 'Saving' : 'Link'}</button>}
        <button className="sat-btn sat-btn--primary sat-btn--lg" aria-disabled={busy || !files.length} onClick={() => !busy && files.length && share()}>
          <Icon name={tier === 'html' ? 'download' : 'share'} /> {tier === 'html' ? 'Download' : `Download or share ${tier === 'data' ? '3 CSV files' : files.length > 1 ? `${files.length} images` : 'image'}`}
        </button>
      </div>
    </div>
  );
}

