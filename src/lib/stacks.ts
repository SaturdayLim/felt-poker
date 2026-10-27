/* Running stack estimate per player: buy-ins - wagers + pots won + chips returned, hand by hand.
   Exact in bet mode (if wagers were entered right), an estimate in count mode.
   Hands logged without the recorder have no wagers, so stacks are unknown once one appears. */
import type { Game, ID } from '../types';
import { round2 } from './calc';
import { contributions } from './hand';

export interface StackEstimate {
  /** Units in front of each player; undefined = cannot be estimated. */
  stack: Record<ID, number | undefined>;
  /** True when every hand so far was logged street by street. */
  complete: boolean;
}

/** Stacks before hand number `beforeN` (or after every hand when omitted). */
export function estimateStacks(g: Game, beforeN?: number): StackEstimate {
  type Ev = { at: number; kind: 'buy' | 'out' | 'hand'; i: number };
  const evs: Ev[] = [
    ...g.buyIns.map((b, i) => ({ at: b.at, kind: 'buy' as const, i })),
    ...g.cashOuts.map((c, i) => ({ at: c.at, kind: 'out' as const, i })),
    ...g.hands.map((h, i) => ({ at: h.endedAt ?? h.at, kind: 'hand' as const, i })),
  ].sort((a, b) => a.at - b.at);
  const stack: Record<ID, number | undefined> = Object.fromEntries(g.playerIds.map((p) => [p, 0]));
  let complete = true;
  for (const e of evs) {
    if (e.kind === 'buy') {
      const b = g.buyIns[e.i];
      if (stack[b.playerId] !== undefined) stack[b.playerId] = round2(stack[b.playerId]! + b.amount);
    } else if (e.kind === 'out') {
      const c = g.cashOuts[e.i];
      if (stack[c.playerId] !== undefined) stack[c.playerId] = 0;
    } else {
      const h = g.hands[e.i];
      if (beforeN !== undefined && h.n >= beforeN) continue;
      if (!h.log) {
        complete = false;
        for (const p of g.playerIds) stack[p] = undefined;
        continue;
      }
      const c = contributions(g, h.log, h.log.button ?? h.dealerId);
      for (const p of Object.keys(c)) if (stack[p] !== undefined) stack[p] = round2(stack[p]! - c[p]);
      for (const w of h.winners) if (stack[w.playerId] !== undefined) stack[w.playerId] = round2(stack[w.playerId]! + w.amount);
      for (const [p, a] of Object.entries(h.returned ?? {})) if (stack[p] !== undefined) stack[p] = round2(stack[p]! + a);
    }
  }
  return { stack, complete };
}
