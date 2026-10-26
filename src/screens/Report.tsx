import { useEffect, useState } from 'react';
import { useGame, useStore, usePlayerName } from '../store';
import { back } from '../router';
import { Empty, Help, Icon, toast } from '../components/ui';
import { renderReport, type Tier } from '../report/reports';
import { loadReportFonts, type ReportTheme } from '../report/canvas';
import { handsCsv, ledgerCsv, playersCsv, slug } from '../report/csv';
import { canvasToFile, shareFiles, textFile } from '../report/share';
import { useResolvedTheme } from '../theme';

type Choice = Tier | 'data';

const TIERS: { k: Choice; label: string; desc: string }[] = [
  { k: 'summary', label: 'Summary', desc: 'Buy-ins, results and who pays whom.' },
  { k: 'detailed', label: 'Detailed', desc: 'Results plus game stats, the money chart and highlights.' },
  { k: 'full', label: 'Full', desc: 'Everything, including every hand with its cards.' },
  { k: 'data', label: 'Data', desc: 'Three CSV files: players, hands and a ledger of every event.' },
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
        toast(`Couldn't make the report: ${(e as Error).message}`);
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, 30);
    return () => { cancelled = true; window.clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g, tier, look]);

  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);

  if (!g) return <div className="screen plain"><Empty icon="games">This game doesn't exist any more.</Empty></div>;

  const share = async () => {
    const r = await shareFiles(files, `${g.name} report`);
    if (r === 'downloaded') toast('Saved to your downloads');
  };
  const info = TIERS.find((t) => t.k === tier)!;

  return (
    <div className="screen">
      <div className="topbar">
        <button className="icon-btn" onClick={() => back(`game/${g.id}/close`)} aria-label="Back"><Icon name="back" /></button>
        <div className="titles"><h1>Report</h1><div className="sub">{g.name}</div></div>
        <span style={{ width: 44 }} />
      </div>

      <div className="seg" role="tablist">
        {TIERS.map((t) => <button key={t.k} role="tab" aria-selected={tier === t.k} onClick={() => setTier(t.k)}>{t.label}</button>)}
      </div>
      <div className="row between" style={{ margin: '12px 2px 14px', gap: 12 }}>
        <span className="small muted row" style={{ gap: 2 }}>{info.desc} <Help k="tiers" /></span>
        {tier !== 'data' && (
          <div className="chips" style={{ flex: 'none', gap: 8 }}>
            <button className="chip sm" aria-pressed={look === 'light'} onClick={() => setLook('light')} aria-label="Light image"><Icon name="sun" size={15} /></button>
            <button className="chip sm" aria-pressed={look === 'dark'} onClick={() => setLook('dark')} aria-label="Dark image"><Icon name="moon" size={15} /></button>
          </div>
        )}
      </div>

      {busy && <div className="card center muted" style={{ padding: 40 }}>Making the report…</div>}

      {!busy && tier !== 'data' && (
        <>
          {files.length > 1 && <div className="small muted" style={{ marginBottom: 8 }}>{files.length} images, shared together.</div>}
          {urls.map((u, i) => <img key={u} src={u} className="report-preview" alt={`Report page ${i + 1}`} />)}
        </>
      )}

      {!busy && tier === 'data' && (
        <div className="card list">
          {files.map((f) => (
            <div key={f.name} className="list-row">
              <Icon name="file" size={20} />
              <div className="grow"><div className="ellipsis" style={{ fontWeight: 700, fontSize: 14.5 }}>{f.name}</div><div className="tiny faint">{(f.size / 1024).toFixed(1)} KB</div></div>
            </div>
          ))}
        </div>
      )}

      <div className="fab-bar"><div className="inner glass">
        <button className="btn primary amber lg" disabled={busy || !files.length} onClick={share}>
          <Icon name="share" /> Share {tier === 'data' ? 'files' : files.length > 1 ? `${files.length} images` : 'image'}
        </button>
      </div></div>
    </div>
  );
}
