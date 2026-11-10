import { useEffect, useRef, useState } from 'react';
import { useGame, useStore, usePlayerName, rememberCountOpen, forgetCountOpen, undoCountOpen } from '../store';
import { back, go } from '../router';
import { Caption, Delta, Empty, Header, Help, Icon, num, toast } from '../components/ui';
import { buyInUnits, cashOutUnits, hasCashedOut, totalBuyInUnits } from '../lib/calc';
import { estimateStacks } from '../lib/stacks';
import { lostChips } from '../lib/hand';
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

  // The count writes its figures to the game as it goes, so leaving without closing puts the cash-outs back to what they
  // were when the page opened (none for a live game; the first close's for a reopened one). Close game and the hand
  // pages keep them. The saved list sits on the phone (store.ts, rememberCountOpen), so it outlives a trip to a hand page
  // and an app closed on this page; the game page puts it back too. The save runs in the mount effect, before the fill below writes.
  const keep = useRef(false);
  const toHand = useRef(false);
  useEffect(() => {
    // dev-mode remount: the cleanup below already put the list back, so take it again before the fill writes
    const cur = useStore.getState().games.find((x) => x.id === gameId);
    if (cur && cur.status !== 'closed') rememberCountOpen(cur);
    return () => {
    if (keep.current) { forgetCountOpen(gameId); return; }
    if (!toHand.current) undoCountOpen(gameId);
    };
  }, [gameId]);

  // the count starts filled: each player's own count if they sent one, else an exact estimate. The host edits any of them
  useEffect(() => {
    if (!g || g.status === 'closed') return;
    const e = estimateStacks(g);
    const t: Record<ID, string> = {};
    let n = 0;
    for (const p of g.playerIds) {
      if (hasCashedOut(g, p)) continue;
      const v = g.claimed?.[p]?.chips ?? (e.stack[p] !== undefined && !(e.spread[p] > 0) ? Math.round(e.stack[p]!) : null);
      if (v === null || v < 0) continue;
      t[p] = String(v); setCashOut(g.id, p, v); n++;
    }
    if (!n) return;
    setText((x) => ({ ...x, ...t }));
    toast(`${n} counts filled in. Check each against the chips.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!g) return <div className="felt-page"><Header back={() => go('')} title="Count Chips" /><Empty title="Game not found">It may have been deleted.</Empty></div>;
  const ordered = [...g.playerIds].sort((a, b) => (g.seats[a] ?? 99) - (g.seats[b] ?? 99));
  const list = ordered.filter((p) => name(p).toLowerCase().includes(q.toLowerCase()));
  const entered = ordered.filter((p) => hasCashedOut(g, p)).length;
  // chips tipped off the table are gone: they are not a miscount
  const offTable = (g.moves ?? []).filter((m) => !m.to).reduce((a, m) => a + m.amount, 0);
  const diff = g.cashOuts.reduce((a, c) => a + c.amount, 0) - totalBuyInUnits(g) + offTable;
  const allIn = entered === ordered.length;

  const est = estimateStacks(g);
  // each player's stack estimate before the count (a count resets the estimate, so leave it out)
  const before = estimateStacks({ ...g, cashOuts: [] });
  const estOf = (p: ID): number | null => (before.stack[p] !== undefined && !(before.spread[p] > 0) ? Math.round(before.stack[p]!) : null);
  const off = ordered.filter((p) => hasCashedOut(g, p) && estOf(p) !== null && cashOutUnits(g, p) !== estOf(p));
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
    keep.current = true;
    finishGame(g.id);
    go(`game/${g.id}/close`, true);
  };
  const gap = (n: number) => ({ ['--sat-gap' as string]: `var(--sat-space-${n})` });
  const leaks = g.hands.map((h) => ({ id: h.id, n: h.n, lost: lostChips(g, h) })).filter((x) => x.lost > 0);

  return (
    <div className="felt-page">
      <Header back={() => back(`game/${g.id}`)} title="End Game" sub={`Final chip count: ${entered} of ${ordered.length} players`} />

      {leaks.map((x) => (
        <button key={x.id} className="sat-flat sat-card sat-split felt-leak" onClick={() => { toHand.current = true; go(`game/${g.id}/hand/${x.id}`); }}>
          <span className="felt-warn-text">Hand {x.n}: {units(x.lost)} chips went to nobody.</span>
          <span className="sat-small" style={{ color: 'var(--sat-accent-text)', fontWeight: 600 }}>Open and save</span>
        </button>
      ))}

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
                <div className="sat-small sat-muted"><span className="sat-num">{units(buyInUnits(g, p))}</span> in{estOf(p) !== null ? <>, est <span className="sat-num">{units(estOf(p)!)}</span></> : null}</div>
                {g.claimed?.[p] && <div className="sat-small" style={{ color: 'var(--sat-accent-text)' }}>Sent <span className="sat-num">{units(g.claimed[p].chips)}</span></div>}
                {done && estOf(p) !== null && cashOutUnits(g, p) !== estOf(p) && <div className="sat-small felt-warn-text">{units(Math.abs(cashOutUnits(g, p) - estOf(p)!))} {cashOutUnits(g, p) > estOf(p)! ? 'over' : 'under'} the estimate</div>}
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
                {allIn && diff === 0 && off.length > 0 && <span className="sat-small felt-warn-text">{off.length} counts differ from the estimate. Log a missing chip move or side bet from the game page before you close.</span>}
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
