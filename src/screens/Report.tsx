import { useEffect, useState } from 'react';
import { useGame, usePlayerName } from '../store';
import { back } from '../router';
import { Empty, Icon, toast } from '../components/ui';
import { renderReport, type Tier } from '../report/reports';
import { handsCsv, ledgerCsv, playersCsv, slug } from '../report/csv';
import { canvasToFile, shareFiles, textFile } from '../report/share';

type Choice = Tier | 'data';

const TIERS: { k: Choice; label: string; desc: string }[] = [
  { k: 'summary', label: 'Summary', desc: 'Buy-ins, final balances and who won or lost the most.' },
  { k: 'detailed', label: 'Detailed', desc: 'Standings plus game statistics, charts and highlights.' },
  { k: 'full', label: 'Full', desc: 'Everything: ledger, expenses and every hand with cards.' },
  { k: 'data', label: 'Data', desc: 'CSV files (players, hands, ledger) for your own analysis.' },
];

export default function Report({ gameId }: { gameId: string }) {
  const g = useGame(gameId);
  const name = usePlayerName();
  const [tier, setTier] = useState<Choice>('summary');
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
          const canvases = renderReport(g, tier, name);
          out = await Promise.all(canvases.map((c, i) => canvasToFile(c, `${base}-${tier}${canvases.length > 1 ? `-${i + 1}` : ''}.png`)));
          canvases.forEach((c) => { c.width = 0; c.height = 0; }); // free canvas memory on iOS
        }
        if (cancelled) return;
        setFiles(out);
        setUrls((old) => {
          old.forEach((u) => URL.revokeObjectURL(u));
          return tier === 'data' ? [] : out.map((f) => URL.createObjectURL(f));
        });
      } catch (e) {
        toast(`Could not build report: ${(e as Error).message}`);
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, 30);
    return () => { cancelled = true; window.clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g, tier]);

  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);

  if (!g) return <div className="screen"><Empty icon="games">Game not found.</Empty></div>;

  const share = async () => {
    const r = await shareFiles(files, `${g.name} report`);
    if (r === 'downloaded') toast('Saved to downloads');
  };
  const info = TIERS.find((t) => t.k === tier)!;

  return (
    <div className="screen no-nav">
      <div className="topbar">
        <button className="icon-btn" onClick={() => back(`game/${g.id}/close`)} aria-label="Back"><Icon name="back" /></button>
        <div className="titles"><h1>Share report</h1><div className="sub">{g.name}</div></div>
        <span style={{ width: 40 }} />
      </div>

      <div className="seg">
        {TIERS.map((t) => <button key={t.k} className={tier === t.k ? 'on' : ''} onClick={() => setTier(t.k)}>{t.label}</button>)}
      </div>
      <div className="small muted" style={{ margin: '10px 2px 14px' }}>{info.desc}</div>

      {busy && <div className="card flat center muted" style={{ padding: 40 }}>Rendering…</div>}

      {!busy && tier !== 'data' && (
        <>
          {files.length > 1 && <div className="small muted" style={{ marginBottom: 8 }}>{files.length} images — they'll be shared together.</div>}
          {urls.map((u, i) => <img key={u} src={u} className="report-preview" alt={`Report page ${i + 1}`} />)}
        </>
      )}

      {!busy && tier === 'data' && (
        <div className="card flat" style={{ padding: '4px 14px' }}>
          {files.map((f) => (
            <div key={f.name} className="list-row">
              <Icon name="file" size={20} />
              <div className="grow"><div className="ellipsis" style={{ fontWeight: 600, fontSize: 14 }}>{f.name}</div><div className="tiny muted">{(f.size / 1024).toFixed(1)} KB</div></div>
            </div>
          ))}
        </div>
      )}

      <div className="fab-bar"><div className="inner">
        <button className="btn gold lg" disabled={busy || !files.length} onClick={share}>
          <Icon name="share" /> Share {tier === 'data' ? 'CSV files' : files.length > 1 ? `${files.length} images` : 'image'}
        </button>
      </div></div>
    </div>
  );
}
