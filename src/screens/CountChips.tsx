import { useState } from 'react';
import { useGame, useStore, usePlayerName } from '../store';
import { back, go } from '../router';
import { Caption, Delta, Empty, Header, Help, Icon, num, toast } from '../components/ui';
import { buyInUnits, cashOutUnits, hasCashedOut, totalBuyInUnits } from '../lib/calc';
import { estimateStacks } from '../lib/stacks';
import { units } from '../lib/format';
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

  if (!g) return <div className="felt-page"><Header back={() => go('')} title="Count Chips" /><Empty title="Game not found">It may have been deleted.</Empty></div>;
  const ordered = [...g.playerIds].sort((a, b) => (g.seats[a] ?? 99) - (g.seats[b] ?? 99));
  const list = ordered.filter((p) => name(p).toLowerCase().includes(q.toLowerCase()));
  const entered = ordered.filter((p) => hasCashedOut(g, p)).length;
  // chips tipped off the table are gone: they are not a miscount
  const offTable = (g.moves ?? []).filter((m) => !m.to).reduce((a, m) => a + m.amount, 0);
  const diff = g.cashOuts.reduce((a, c) => a + c.amount, 0) - totalBuyInUnits(g) + offTable;
  const allIn = entered === ordered.length;

  const est = estimateStacks(g);
  const fillable = est.complete ? ordered.filter((p) => !hasCashedOut(g, p) && est.stack[p] !== undefined) : [];
  const fillEstimates = () => {
    const t = { ...text };
    for (const p of fillable) { const v = Math.round(est.stack[p]!); t[p] = String(v); setCashOut(g.id, p, v); }
    setText(t);
    toast(`${fillable.length} counts filled from estimates. Check each against the chips.`);
  };
  const update = (p: ID, v: string) => {
    setText((t) => ({ ...t, [p]: v }));
    const n = num(v);
    setCashOut(g.id, p, n);
  };
  const idx = sel ? ordered.indexOf(sel) : -1;
  // Next (or Enter on the keyboard): the next player not counted yet
  const goNext = () => {
    const next = ordered.slice(idx + 1).find((p) => !hasCashedOut(g, p)) ?? ordered.find((p) => !hasCashedOut(g, p) && p !== sel);
    if (next) setSel(next);
    else toast('All players are counted.');
  };
  const selIn = sel ? buyInUnits(g, sel) : 0;
  const selOut = sel ? num(text[sel] ?? '') : null;

  const finish = () => {
    if (!allIn) { toast(`${ordered.length - entered} players not counted. Enter a count for each player.`); return; }
    if (diff !== 0 && !confirm) { setConfirm(true); toast(`Counts differ from buy-ins by ${units(diff)} chips. Tap Close game again to close anyway.`); return; }
    finishGame(g.id);
    go(`game/${g.id}/close`, true);
  };
  const gap = (n: number) => ({ ['--sat-gap' as string]: `var(--sat-space-${n})` });

  return (
    <div className="felt-page">
      <Header back={() => back(`game/${g.id}`)} title="End Game" sub={`Final chip count: ${entered} of ${ordered.length} players`} />

      <div style={{ display: 'grid', gridTemplateColumns: '42% 1fr', gap: 'var(--sat-space-3)', alignItems: 'start' }}>
        <div className="sat-stack" style={gap(2)}>
          <input className="sat-input" aria-label="Find a player" placeholder="Find player" value={q} onChange={(e) => setQ(e.target.value)} />
          {fillable.length > 0 && <button className="sat-btn sat-btn--sm" style={{ whiteSpace: 'normal', minHeight: 40 }} onClick={fillEstimates}>Use estimates ({fillable.length})</button>}
          {list.map((p) => {
            const done = hasCashedOut(g, p);
            const net = done ? cashOutUnits(g, p) - buyInUnits(g, p) : null;
            const on = sel === p;
            return (
              <button key={p} onClick={() => setSel(p)} aria-pressed={on} className={on ? 'sat-glass-2' : 'sat-flat'}
                style={{ textAlign: 'left', padding: 'var(--sat-space-2) var(--sat-space-3)', borderRadius: 'var(--sat-radius-md)', minHeight: 56, borderColor: on ? 'var(--sat-accent)' : undefined }}>
                <div className="sat-split" style={{ flexWrap: 'nowrap', gap: 4 }}>
                  <span className="felt-ellipsis" style={{ fontWeight: 600 }}>{name(p)}</span>
                  {done && <span className="felt-up" aria-label="Counted"><Icon name="check" size={14} /></span>}
                </div>
                <div className="sat-small sat-muted"><span className="sat-num">{units(buyInUnits(g, p))}</span> in</div>
                {net !== null && <Delta value={net} format={(a) => units(a)} />}
              </button>
            );
          })}
        </div>

        <div className="sat-glass sat-card sat-stack" style={{ position: 'sticky', top: 'calc(var(--felt-safe-top) + 88px)', ...gap(3), padding: 'var(--sat-space-4)' }}>
          {sel ? (
            <>
              <h2 className="sat-h2">{name(sel)}</h2>
              <div className="sat-field">
                <label htmlFor="cnt">Chips at the end <Help k="endGame" /></label>
                <input key={sel} id="cnt" className="sat-input sat-num" style={{ fontSize: '1.5rem', minHeight: 56 }} autoFocus inputMode="decimal" placeholder="0" value={text[sel] ?? ''}
                  enterKeyHint="next" onChange={(e) => update(sel, e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') goNext(); }} />
              </div>
              <div className="sat-split sat-small"><span className="sat-muted">Bought in</span><span className="sat-num">{units(selIn)}</span></div>
              <div className="sat-split sat-small"><span className="sat-muted">Result</span>
                {selOut !== null ? <Delta value={selOut - selIn} format={(a) => `${units(a)} chips`} /> : <span className="sat-muted">-</span>}
              </div>
              <hr className="sat-rule" style={{ margin: 0 }} />
              <div className="sat-stack" style={gap(1)}>
                <Caption q="chips" tip="count">{allIn ? 'Difference' : 'Left to count'}</Caption>
                <span className={`sat-kpi ${diff === 0 ? 'felt-up' : ''}`} style={{ fontSize: '1.75rem' }}>{allIn ? units(diff) : units(-diff)}</span>
                {allIn && <span className="sat-small sat-muted">{diff === 0 ? 'Counts match the buy-ins.' : diff > 0 ? 'More chips counted than bought.' : 'Fewer chips counted than bought.'}{offTable ? ` Allows for ${units(offTable)} chips tipped off the table.` : ''}</span>}
              </div>
              <div className="sat-cluster" style={gap(2)}>
                <button className="sat-btn sat-btn--sm felt-grow" aria-disabled={idx <= 0} onClick={() => idx > 0 && setSel(ordered[idx - 1])}>Previous</button>
                <button className="sat-btn sat-btn--sm felt-grow" onClick={goNext}>Next</button>
              </div>
            </>
          ) : <Empty title="No players" />}
        </div>
      </div>

      <div className="sat-bottombar sat-glass-2">
        <button className="sat-btn sat-btn--lg" onClick={() => back(`game/${g.id}`)}>Back to game</button>
        <button className="sat-btn sat-btn--primary sat-btn--lg" onClick={finish}>{confirm ? 'Close anyway' : 'Close game'}</button>
      </div>
    </div>
  );
}
