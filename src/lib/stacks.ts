/* Running stack estimate per player: buy-ins - wagers + pots won + chips returned, hand by hand.
   Each estimate carries a spread (±chips) for what Felt could not see:
   - hands logged street by street with every wager: exact, no spread
   - pot-count hands (wagers shared evenly per street): spread of 30% of the estimated wager
   - hands logged with pot and winner only: the pot is charged evenly to everyone still in the game,
     and that share is added to each player's spread
   - partly recorded hands: chips in the pot beyond the recorded wagers are charged evenly to the
     players still in at the end, and added to their spread
   A player who clocks out resets to 0 with no spread (the count is real). */
import type { Game, ID } from '../types';
import { playerStatus, round2 } from './calc';
import { contributions, finalists } from './hand';

export interface StackEstimate {
  /** Chips in front of each player (best guess). */
  stack: Record<ID, number | undefined>;
  /** Plus or minus chips around the best guess. 0 = exact. */
  spread: Record<ID, number>;
  /** True when every hand so far was logged with every wager (no spread anywhere). */
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
  const spread: Record<ID, number> = Object.fromEntries(g.playerIds.map((p) => [p, 0]));
  const seated = new Set<ID>();
  let complete = true;
  for (const e of evs) {
    if (e.kind === 'buy') {
      const b = g.buyIns[e.i];
      stack[b.playerId] = round2((stack[b.playerId] ?? 0) + b.amount);
      seated.add(b.playerId);
    } else if (e.kind === 'out') {
      const c = g.cashOuts[e.i];
      stack[c.playerId] = 0;
      spread[c.playerId] = 0;
      seated.delete(c.playerId);
    } else {
      const h = g.hands[e.i];
      if (beforeN !== undefined && h.n >= beforeN) continue;
      if (!h.log) {
        complete = false;
        const inGame = [...seated];
        const share = inGame.length ? h.pot / inGame.length : 0;
        for (const p of inGame) {
          stack[p] = round2((stack[p] ?? 0) - share);
          spread[p] = round2(spread[p] + share);
        }
        for (const w of h.winners) stack[w.playerId] = round2((stack[w.playerId] ?? 0) + w.amount);
        continue;
      }
      const c = contributions(g, h.log, h.log.button ?? h.dealerId);
      for (const p of Object.keys(c)) {
        stack[p] = round2((stack[p] ?? 0) - c[p]);
        if (h.log.mode === 'count') { spread[p] = round2((spread[p] ?? 0) + c[p] * 0.3); complete = false; }
      }
      for (const w of h.winners) stack[w.playerId] = round2((stack[w.playerId] ?? 0) + w.amount);
      for (const [p, a] of Object.entries(h.returned ?? {})) stack[p] = round2((stack[p] ?? 0) + a);
      if (h.partial) {
        // chips in the pot beyond the recorded wagers: charged evenly to the players still in at the end
        const recorded = Object.values(c).reduce((a, b) => a + b, 0) - Object.values(h.returned ?? {}).reduce((a, b) => a + b, 0);
        const extra = round2(h.pot - recorded);
        const fin = finalists(h.log);
        if (extra > 0 && fin.length) {
          complete = false;
          for (const p of fin) { stack[p] = round2((stack[p] ?? 0) - extra / fin.length); spread[p] = round2((spread[p] ?? 0) + extra / fin.length); }
        }
      }
    }
  }
  return { stack, spread, complete };
}

/** "~180-220" when there is a spread, "200" when exact. Rounded to the big blind; never below 0. */
export function stackLabel(g: Game, est: StackEstimate, p: ID): string | null {
  const v = est.stack[p];
  if (v === undefined || playerStatus(g, p) === 'out') return null;
  const s = est.spread[p] ?? 0;
  const step = g.bb > 0 ? g.bb : 1;
  if (s < step / 2) return Math.round(Math.max(0, v)).toLocaleString('en-US');
  const lo = Math.max(0, Math.floor((v - s) / step) * step);
  const hi = Math.max(lo, Math.ceil((v + s) / step) * step);
  return `~${lo.toLocaleString('en-US')}-${hi.toLocaleString('en-US')}`;
}
