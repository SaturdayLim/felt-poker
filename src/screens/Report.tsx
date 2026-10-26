import { useEffect, useState } from 'react';
import { useGame, useStore, usePlayerName } from '../store';
import { back, go } from '../router';
import { Empty, Header, Help, Icon, toast } from '../components/ui';
import { renderReport, type Tier } from '../report/reports';
import { loadReportFonts, type ReportTheme } from '../report/canvas';
import { handsCsv, ledgerCsv, playersCsv, slug } from '../report/csv';
import { canvasToFile, shareFiles, textFile } from '../report/share';
import { useResolvedTheme } from '../theme';

type Choice = Tier | 'data';

const TIERS: { k: Choice; label: string; desc: string }[] = [
  { k: 'summary', label: 'Summary', desc: 'Buy-ins, results and payments.' },
  { k: 'detailed', label: 'Detailed', desc: 'Results, game stats, the money chart and highlights.' },
  { k: 'full', label: 'Full', desc: 'Everything, including the buy-in log and every hand with its cards.' },
  { k: 'data', label: 'Data', desc: '3 CSV files: players, hands and a ledger of every event.' },
];

export default function Report({ gameId }: { gameId: string }) {
  const g = useGame(gameId);
  const name = usePlayerName();
  const pref = useStore((s) => s.settings.theme);
  const appTheme = useResolvedTheme(pref);
  const [tier, setTier] = useState<Choice>('summary');
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
        if (tier === 'data') {
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
        setUrls(tier === 'data' ? [] : out.map((f) => URL.createObjectURL(f)));
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
    if (r === 'downloaded') toast('Report exported to Downloads');
  };
  const info = TIERS.find((t) => t.k === tier)!;

  return (
    <div className="felt-page">
      <Header back={() => back(`game/${g.id}/close`)} title="Share Report" sub={g.name} />
      <div className="sat-stack">
        <div className="sat-seg sat-seg--block" role="radiogroup" aria-label="Report type">
          {TIERS.map((t) => <button key={t.k} role="radio" aria-checked={tier === t.k} onClick={() => setTier(t.k)}>{t.label}</button>)}
        </div>
        <div className="sat-split">
          <p className="sat-small sat-muted felt-grow">{info.desc} <Help k="tiers" /></p>
          {tier !== 'data' && (
            <div className="sat-seg" role="radiogroup" aria-label="Image theme">
              <button role="radio" aria-checked={look === 'light'} onClick={() => setLook('light')} aria-label="Light image"><Icon name="sun" /></button>
              <button role="radio" aria-checked={look === 'dark'} onClick={() => setLook('dark')} aria-label="Dark image"><Icon name="moon" /></button>
            </div>
          )}
        </div>

        {busy && <div className="sat-flat sat-card sat-small sat-muted">Building the report.</div>}

        {!busy && tier !== 'data' && (
          <div>
            {files.length > 1 && <p className="sat-small sat-muted" style={{ marginBottom: 'var(--sat-space-2)' }}>{files.length} images, shared together.</p>}
            {urls.map((u, i) => <img key={u} src={u} className="felt-preview" alt={`Report page ${i + 1}`} />)}
          </div>
        )}

        {!busy && tier === 'data' && (
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
          <Icon name="share" /> Share {tier === 'data' ? '3 files' : files.length > 1 ? `${files.length} images` : 'image'}
        </button>
      </div>
    </div>
  );
}
