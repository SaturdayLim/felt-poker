import { useState } from 'react';
import { useGame, useStore, usePlayerName } from '../store';
import { back, go } from '../router';
import { Avatar, Empty, Icon, num, toast } from '../components/ui';
import { buyInUnits, cashOutUnits, hasCashedOut, totalBuyInUnits } from '../lib/calc';
import { money, units } from '../lib/format';
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

  if (!g) return <div className="screen"><Empty icon="games">Game not found.</Empty></div>;
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
    if (!allIn) { toast(`${ordered.length - entered} player(s) still need a count`); return; }
    if (diff !== 0 && !confirm) { setConfirm(true); toast(`Off by ${units(diff)} units — tap again to finish anyway`); return; }
    finishGame(g.id);
    go(`game/${g.id}/close`, true);
  };

  return (
    <div className="screen no-nav">
      <div className="topbar left">
        <div className="titles">
          <h1>Count chips</h1>
          <div className="sub">{money(totalBuyInUnits(g) * g.unitValue, g.currency)} total · {entered}/{ordered.length} entered</div>
        </div>
        <button className="icon-btn ghost" onClick={() => back(`game/${g.id}`)} aria-label="Close"><Icon name="close" /></button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '44% 1fr', gap: 10, alignItems: 'start' }}>
        <div>
          <input className="input" style={{ height: 40, fontSize: 14, borderRadius: 20 }} placeholder="Find player" value={q} onChange={(e) => setQ(e.target.value)} />
          <div style={{ marginTop: 8 }}>
            {list.map((p) => {
              const done = hasCashedOut(g, p);
              const net = done ? cashOutUnits(g, p) - buyInUnits(g, p) : null;
              return (
                <button key={p} onClick={() => setSel(p)} className="row" style={{
                  width: '100%', textAlign: 'left', padding: '9px 8px', borderRadius: 12, marginBottom: 4,
                  border: `1px solid ${sel === p ? 'var(--mint)' : 'transparent'}`, background: sel === p ? 'var(--mint-dark)' : 'none',
                }}>
                  <Avatar name={name(p)} size="sm" />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="row" style={{ gap: 4 }}><span className="ellipsis" style={{ fontWeight: 650, fontSize: 13.5 }}>{name(p)}</span>{done && <span className="pos"><Icon name="check" size={13} /></span>}</div>
                    <div className="tiny muted">{units(buyInUnits(g, p))} in</div>
                    {net !== null && <div className={`tiny ${net >= 0 ? 'pos' : 'neg'}`}>{units(net, { sign: true })}</div>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="card" style={{ position: 'sticky', top: 'calc(var(--safe-top) + 10px)', minHeight: 360, display: 'flex', flexDirection: 'column' }}>
          {sel ? (
            <>
              <div className="row"><Avatar name={name(sel)} size="sm" /><span style={{ fontWeight: 700 }}>{name(sel)}</span></div>
              <div className="tiny muted" style={{ marginTop: 10 }}>Final chip count (units)</div>
              <input key={sel} className="input big" autoFocus inputMode="decimal" placeholder="0" value={text[sel] ?? ''}
                onChange={(e) => update(sel, e.target.value)} style={{ marginTop: 6, borderWidth: '0 0 2px', borderRadius: 0, background: 'none', paddingLeft: 0 }} />
              <div className="row between small" style={{ marginTop: 14 }}><span className="muted">Bought in</span><span>{units(selIn)} u</span></div>
              <div className="row between small" style={{ marginTop: 8 }}><span className="muted">Result</span>
                {selOut !== null ? <span className={selOut - selIn >= 0 ? 'pos' : 'neg'} style={{ fontWeight: 700 }}>{money((selOut - selIn) * g.unitValue, g.currency, { sign: true })}</span> : <span className="muted">—</span>}
              </div>
              <div className="grow" />
              <div className="row between" style={{ marginTop: 20 }}>
                <span className={`small ${diff === 0 ? 'pos' : allIn ? 'gold' : 'muted'}`}>{diff === 0 ? 'Balanced' : !allIn ? 'Left to count' : diff > 0 ? 'Over' : 'Short'}</span>
                <span className={diff === 0 ? 'pos' : allIn ? 'gold' : ''} style={{ fontWeight: 800, fontSize: 18 }}>{allIn ? units(diff, { sign: true }) : units(-diff)} u</span>
              </div>
              <div className="btn-row" style={{ marginTop: 12 }}>
                <button className="btn sm" disabled={idx <= 0} onClick={() => setSel(ordered[idx - 1])}>Previous</button>
                <button className="btn sm primary" onClick={() => {
                  const next = ordered.slice(idx + 1).find((p) => !hasCashedOut(g, p)) ?? ordered.find((p) => !hasCashedOut(g, p) && p !== sel);
                  if (next) setSel(next);
                  else toast('All counts entered');
                }}>Done</button>
              </div>
            </>
          ) : <Empty icon="users">No players.</Empty>}
        </div>
      </div>

      <div className="fab-bar"><div className="inner">
        <button className="btn lg" onClick={() => back(`game/${g.id}`)}>Back to game</button>
        <button className="btn primary lg" onClick={finish}>Finish &amp; settle</button>
      </div></div>
    </div>
  );
}
