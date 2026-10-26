import { useState } from 'react';
import { useGame, useStore, usePlayerName } from '../store';
import { back, go } from '../router';
import { Empty, Help, Icon, num, toast } from '../components/ui';
import { buyInUnits, cashOutUnits, hasCashedOut, totalBuyInUnits } from '../lib/calc';
import { money, units, tone } from '../lib/format';
import type { ID } from '../types';

export default function CountChips({ gameId }: { gameId: string }) {
  const g = useGame(gameId);
  const name = usePlayerName();
  const setCashOut = useStore((s) => s.setCashOut);
  const finishGame = useStore((s) => s.finishGame);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<ID | null>(() => {
    if (!g) return null;
    const bySeat = [...g.playerIds].sort((a, b) => (g.seats[a] ?? 99) - (g.seats[b] ?? 99));
    return bySeat.find((p) => !hasCashedOut(g, p)) ?? bySeat[0] ?? null;
  });
  const [confirm, setConfirm] = useState(false);
  const [text, setText] = useState<Record<ID, string>>(() =>
    Object.fromEntries((g?.playerIds ?? []).filter((p) => hasCashedOut(g!, p)).map((p) => [p, String(cashOutUnits(g!, p))])),
  );

  if (!g) return <div className="screen plain"><Empty icon="games">This game doesn't exist any more.</Empty></div>;
  const ordered = [...g.playerIds].sort((a, b) => (g.seats[a] ?? 99) - (g.seats[b] ?? 99));
  const list = ordered.filter((p) => name(p).toLowerCase().includes(q.toLowerCase()));
  const entered = ordered.filter((p) => hasCashedOut(g, p)).length;
  const diff = g.cashOuts.reduce((a, c) => a + c.amount, 0) - totalBuyInUnits(g);
  const allIn = entered === ordered.length;

  const update = (p: ID, v: string) => {
    setText((t) => ({ ...t, [p]: v }));
    const n = num(v);
    setCashOut(g.id, p, n);
  };
  const idx = sel ? ordered.indexOf(sel) : -1;
  const selIn = sel ? buyInUnits(g, sel) : 0;
  const selOut = sel ? num(text[sel] ?? '') : null;

  const finish = () => {
    if (!allIn) { toast(`${ordered.length - entered} still to count`); return; }
    if (diff !== 0 && !confirm) { setConfirm(true); toast(`Off by ${units(diff)} units. Tap Finish again to close anyway.`); return; }
    finishGame(g.id);
    go(`game/${g.id}/close`, true);
  };

  return (
    <div className="screen">
      <div className="topbar left">
        <div className="titles">
          <h1>Count chips</h1>
          <div className="sub">{entered} of {ordered.length} counted · {money(totalBuyInUnits(g) * g.unitValue, g.currency)} bought</div>
        </div>
        <button className="icon-btn" onClick={() => back(`game/${g.id}`)} aria-label="Close"><Icon name="close" /></button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '44% 1fr', gap: 14, alignItems: 'start' }}>
        <div>
          <input className="input" style={{ minHeight: 42, fontSize: 15 }} placeholder="Find a player" value={q} onChange={(e) => setQ(e.target.value)} />
          <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
            {list.map((p) => {
              const done = hasCashedOut(g, p);
              const net = done ? cashOutUnits(g, p) - buyInUnits(g, p) : null;
              return (
                <button key={p} onClick={() => setSel(p)} aria-pressed={sel === p} className="btn" style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '8px 10px', minHeight: 58 }}>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="row" style={{ gap: 4 }}><span className="ellipsis" style={{ fontSize: 14.5 }}>{name(p)}</span>{done && <span className="up" style={{ display: 'inline-flex' }}><Icon name="check" size={14} /></span>}</div>
                    <div className="tiny faint" style={{ fontWeight: 400 }}>{units(buyInUnits(g, p))} in{net !== null && <> · <span className={`num ${tone(net)}`}>{units(net, { sign: true })}</span></>}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="panel" style={{ position: 'sticky', top: 'calc(var(--safe-top) + 78px)', minHeight: 360, display: 'flex', flexDirection: 'column' }}>
          {sel ? (
            <>
              <div style={{ font: '600 18px var(--font-display)' }}>{name(sel)}</div>
              <div className="label tiny" style={{ marginTop: 12 }}>Chips at the end, units</div>
              <input key={sel} className="input big" autoFocus inputMode="decimal" placeholder="0" value={text[sel] ?? ''}
                onChange={(e) => update(sel, e.target.value)} style={{ marginTop: 6 }} />
              <div className="row between small" style={{ marginTop: 14 }}><span className="muted">Bought in</span><span className="num">{units(selIn)}</span></div>
              <div className="row between small" style={{ marginTop: 8 }}><span className="muted">Result</span>
                {selOut !== null ? <span className={`num ${tone(selOut - selIn)}`}>{money((selOut - selIn) * g.unitValue, g.currency, { sign: true })}</span> : <span className="faint">—</span>}
              </div>
              <div className="grow" />
              <div className="row between" style={{ marginTop: 20 }}>
                <span className={`small row ${diff === 0 ? 'up' : allIn ? 'amber' : 'muted'}`} style={{ gap: 2 }}>{diff === 0 ? 'Balanced' : !allIn ? 'Left to count' : diff > 0 ? 'Too many' : 'Too few'}<Help k="count" /></span>
                <span className={`num ${diff === 0 ? 'up' : allIn ? 'amber' : ''}`} style={{ fontSize: 18 }}>{allIn ? units(diff, { sign: true }) : units(-diff)}</span>
              </div>
              <div className="btn-row" style={{ marginTop: 12 }}>
                <button className="btn sm" disabled={idx <= 0} onClick={() => setSel(ordered[idx - 1])}>Back</button>
                <button className="btn sm" onClick={() => {
                  const next = ordered.slice(idx + 1).find((p) => !hasCashedOut(g, p)) ?? ordered.find((p) => !hasCashedOut(g, p) && p !== sel);
                  if (next) setSel(next);
                  else toast('Everyone is counted');
                }}>Next</button>
              </div>
            </>
          ) : <Empty icon="users">No players.</Empty>}
        </div>
      </div>

      <div className="fab-bar"><div className="inner glass">
        <button className="btn lg" onClick={() => back(`game/${g.id}`)}>Back to game</button>
        <button className="btn primary lg" onClick={finish}>Finish</button>
      </div></div>
    </div>
  );
}
