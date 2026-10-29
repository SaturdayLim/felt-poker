/* Running stack estimate per player: buy-ins - wagers + pots won + chips returned +/- 2-7 bounties
   +/- chip moves (side games, tips), hand by hand.
   Each estimate carries a spread (±chips) for what Felt could not see:
   - hands logged street by street with every wager: exact, no spread
   - pot-count hands (wagers shared evenly per street): spread of 30% of the estimated wager
   - hands logged with pot and winner only: the pot is charged evenly to everyone still in the game,
     and that share is added to each player's spread
   - partly recorded hands: chips in the pot beyond the recorded wagers are charged evenly to the
     players still in at the end, and added to their spread
   - missed hands (played but not logged): every player dealt in could have won or lost, so each
     player still in the game gets a spread of one average pot
   Three things make a stack exact again (no spread):
   - a count typed in mid-game
   - an all-in with the amount typed in: that amount was the whole stack
   - clocking out: the stack resets to 0 (the count is real) */
import type { Game, ID } from '../types';
import { playerStatus, round2 } from './calc';
import { bountyPay, bountyTotal, contributions, finalists, typedAllIn } from './hand';

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
  type Ev = { at: number; kind: 'buy' | 'out' | 'hand' | 'count' | 'move'; i: number };
  const evs: Ev[] = [
    ...g.buyIns.map((b, i) => ({ at: b.at, kind: 'buy' as const, i })),
    ...g.cashOuts.map((c, i) => ({ at: c.at, kind: 'out' as const, i })),
    ...(g.counts ?? []).map((c, i) => ({ at: c.at, kind: 'count' as const, i })),
    ...(g.moves ?? []).map((m, i) => ({ at: m.at, kind: 'move' as const, i })),
    ...g.hands.map((h, i) => ({ at: h.endedAt ?? h.at, kind: 'hand' as const, i })),
  ].sort((a, b) => a.at - b.at);
  const stack: Record<ID, number | undefined> = Object.fromEntries(g.playerIds.map((p) => [p, 0]));
  const spread: Record<ID, number> = Object.fromEntries(g.playerIds.map((p) => [p, 0]));
  const seated = new Set<ID>();
  // a missed hand's spread: the average pot of the logged hands so far (10 BB before any)
  let potSum = 0, potN = 0;
  for (const e of evs) {
    if (e.kind === 'buy') {
      const b = g.buyIns[e.i];
      stack[b.playerId] = round2((stack[b.playerId] ?? 0) + b.amount);
      seated.add(b.playerId);
    } else if (e.kind === 'move') {
      const m = g.moves![e.i];
      if (beforeN !== undefined && m.afterN >= beforeN) continue;
      stack[m.from] = round2((stack[m.from] ?? 0) - m.amount);
      if (m.to) stack[m.to] = round2((stack[m.to] ?? 0) + m.amount);
    } else if (e.kind === 'count') {
      const c = g.counts![e.i];
      if (beforeN !== undefined && g.hands.some((h) => h.n >= beforeN && (h.endedAt ?? h.at) <= c.at)) continue;
      stack[c.playerId] = c.chips;
      spread[c.playerId] = 0;
    } else if (e.kind === 'out') {
      const c = g.cashOuts[e.i];
      stack[c.playerId] = 0;
      spread[c.playerId] = 0;
      seated.delete(c.playerId);
    } else {
      const h = g.hands[e.i];
      if (beforeN !== undefined && h.n >= beforeN) continue;
      if (h.bounty) {
        const b = h.bounty;
        for (const p of b.payers) stack[p] = round2((stack[p] ?? 0) - bountyPay(b, p));
        stack[b.playerId] = round2((stack[b.playerId] ?? 0) + bountyTotal(b));
      }
      if (h.missed) {
        const avg = potN ? potSum / potN : g.bb * 10;
        for (const p of seated) spread[p] = round2(spread[p] + avg);
        continue;
      }
      potSum += h.pot; potN++;
      if (!h.log) {
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
        // all-in with the amount typed in while the stack was a range: that amount was the whole stack
        if (spread[p] > 0 && h.log.allInAt?.[p] && typedAllIn(h.log, p)) { stack[p] = c[p]; spread[p] = 0; }
        stack[p] = round2((stack[p] ?? 0) - c[p]);
        if (h.log.mode === 'count') spread[p] = round2((spread[p] ?? 0) + c[p] * 0.3);
      }
      for (const w of h.winners) stack[w.playerId] = round2((stack[w.playerId] ?? 0) + w.amount);
      for (const [p, a] of Object.entries(h.returned ?? {})) stack[p] = round2((stack[p] ?? 0) + a);
      if (h.partial) {
        // chips in the pot beyond the recorded wagers: charged evenly to the players still in at the end
        const recorded = Object.values(c).reduce((a, b) => a + b, 0) - Object.values(h.returned ?? {}).reduce((a, b) => a + b, 0);
        const extra = round2(h.pot - recorded);
        const fin = finalists(h.log);
        if (extra > 0 && fin.length) {
          for (const p of fin) { stack[p] = round2((stack[p] ?? 0) - extra / fin.length); spread[p] = round2((spread[p] ?? 0) + extra / fin.length); }
        }
      }
    }
  }
  return { stack, spread, complete: Object.values(spread).every((s) => !(s > 0)) };
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
