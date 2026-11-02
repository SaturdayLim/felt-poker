import { useEffect, useState } from 'react';
import { useGame, useStore, usePlayerName } from '../store';
import { back, go } from '../router';
import { Caption, Empty, Header, Help, Icon, toast } from '../components/ui';
import { renderReport, type Tier } from '../report/reports';
import { loadReportFonts, type ReportTheme } from '../report/canvas';
import { handsCsv, ledgerCsv, playersCsv, slug } from '../report/csv';
import { canvasToFile, shareFiles, textFile } from '../report/share';
import { MIN_REPORT_HANDS, makeHtmlReport, recordedHands, reportReady, type PlayerCode } from '../report/htmlReport';
import { useResolvedTheme } from '../theme';

type Choice = Tier | 'data' | 'html';

/** Each option says what it contains and which files it gives, so nobody has to guess before sharing. */
const TIERS: { k: Choice; label: string; file: string; desc: string }[] = [
  { k: 'html', label: 'Game report', file: '1 HTML file', desc: 'Interactive page: awards, charts, stats and house rules. Each player opens their own page with a code.' },
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
  const [codes, setCodes] = useState<PlayerCode[]>([]);
  const [look, setLook] = useState<ReportTheme>(appTheme);
  const [files, setFiles] = useState<File[]>([]);
  const [urls, setUrls] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!g) return;
    let cancelled = false;
    setBusy(true);
    const t = window.setTimeout(async () => {
      try {
        const base = `${slug(g.name)}-${new Date(g.startedAt).toLocaleDateString('en-CA')}`;
        let out: File[];
        if (tier === 'html') {
          // a game too short for the report gets the card below that says why, not an error
          const made = reportReady(g) ? await makeHtmlReport(g, allPlayers, settings) : undefined;
          out = made ? [made.file] : [];
          if (!cancelled) setCodes(made?.codes ?? []);
        } else if (tier === 'data') {
          const list = [g];
          out = [
            textFile(playersCsv(list, name), `${base}-players.csv`),
            textFile(handsCsv(list, name), `${base}-hands.csv`),
            textFile(ledgerCsv(list, name), `${base}-ledger.csv`),
          ];
        } else {
          await loadReportFonts();
          const canvases = renderReport(g, tier, name, look);
          out = await Promise.all(canvases.map((c, i) => canvasToFile(c, `${base}-${tier}${canvases.length > 1 ? `-${i + 1}` : ''}.png`)));
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
  }, [g, tier, look]);

  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);

  if (!g) return <div className="felt-page"><Header back={() => go('')} title="Report" /><Empty title="Game not found">It may have been deleted.</Empty></div>;

  const share = async () => {
    const r = await shareFiles(files, `${g.name} report`);
    if (r === 'downloaded') toast(`${info.label} saved to Downloads`);
  };
  const info = TIERS.find((t) => t.k === tier)!;

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
              <button role="radio" aria-checked={look === 'light'} onClick={() => setLook('light')} aria-label="Light image"><Icon name="sun" /></button>
              <button role="radio" aria-checked={look === 'dark'} onClick={() => setLook('dark')} aria-label="Dark image"><Icon name="moon" /></button>
            </div>
          )}
        </div>

        {busy && <div className="sat-flat sat-card sat-small sat-muted">Building the report.</div>}

        {!busy && tier !== 'data' && tier !== 'html' && (
          <div>
            {files.length > 1 && <p className="sat-small sat-muted" style={{ marginBottom: 'var(--sat-space-2)' }}>{files.length} images, shared together.</p>}
            {urls.map((u, i) => <img key={u} src={u} className="felt-preview" alt={`Report page ${i + 1}`} />)}
          </div>
        )}

        {tier === 'html' && !reportReady(g) && (
          <div className="sat-flat sat-card sat-small">The game report needs a closed game with at least {MIN_REPORT_HANDS} recorded hands. This game has {recordedHands(g)}.</div>
        )}

        {!busy && tier === 'html' && files.length > 0 && <CodesCard codes={codes} game={g.name} />}

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

      <div className="sat-bottombar sat-glass-2">
        <button className="sat-btn sat-btn--primary sat-btn--lg" aria-disabled={busy || !files.length} onClick={() => !busy && files.length && share()}>
          <Icon name="share" /> Download or share {tier === 'data' ? '3 CSV files' : tier === 'html' ? 'report' : files.length > 1 ? `${files.length} images` : 'image'}
        </button>
      </div>
    </div>
  );
}

/** One code per player. The host sends each player only their own, so the code never travels with the file. */
function CodesCard({ codes, game }: { codes: PlayerCode[]; game: string }) {
  const [shown, setShown] = useState(false);
  const copy = async (c: PlayerCode) => {
    const text = `${c.name}, your code for the ${game} report is ${c.code}.`;
    try { await navigator.clipboard.writeText(text); toast(`Message for ${c.name} copied`); }
    catch { toast(`${c.name}: ${c.code}`); }
  };
  return (
    <section className="sat-glass sat-card sat-stack">
      <div className="sat-split"><h2 className="sat-h3">Player codes</h2><Help k="reportCodes" /></div>
      <div className="sat-glass-2 felt-list">
        {codes.map((c) => (
          <div key={c.id} className="felt-row">
            <span className="felt-row-main"><span className="felt-row-title">{c.name}</span><span className="felt-row-sub sat-mono">{shown ? c.code : '******'}</span></span>
            <button className="sat-btn" onClick={() => copy(c)}><Icon name="file" /> Copy message</button>
          </div>
        ))}
      </div>
      <button className="sat-btn sat-btn--ghost" onClick={() => setShown(!shown)}>{shown ? 'Hide codes' : 'Show codes'}</button>
    </section>
  );
}
