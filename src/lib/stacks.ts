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
import type { Game, Hand, ID } from '../types';
import { playerStatus, round2 } from './calc';
import { bountyPay, bountyTotal, contributions, estAllIn, finalists, typedAllIn } from './hand';

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
  // before hand n: buy-ins, cash-outs, counts and moves after that hand started do not count yet
  const cutoff = beforeN === undefined ? Infinity : Math.min(Infinity, ...g.hands.filter((h) => h.n >= beforeN).map((h) => h.at));
  // a missed hand's spread: the average pot of the logged hands so far (10 BB before any)
  let potSum = 0, potN = 0;
  // a player's first buy-in always counts: a hand opened before the buy-ins were entered must not read every stack as 0
  const firstBuy = new Set<ID>();
  for (const e of evs) {
    if (e.kind === 'buy' && !firstBuy.has(g.buyIns[e.i].playerId)) { firstBuy.add(g.buyIns[e.i].playerId); if (e.at > cutoff) { const b = g.buyIns[e.i]; stack[b.playerId] = round2((stack[b.playerId] ?? 0) + b.amount); seated.add(b.playerId); continue; } }
    if (e.kind !== 'hand' && e.at > cutoff) continue;
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
  const b = stackBounds(g, est, p)!;
  if (b.lo === b.hi) return b.lo.toLocaleString('en-US');
  return `~${b.lo.toLocaleString('en-US')}-${b.hi.toLocaleString('en-US')}`;
}

/** The whole-chip ends of a stack estimate, rounded as `stackLabel` shows them (to the big blind, never below 0).
    An exact stack, or a spread under half a big blind, has one end for both. */
export function stackBounds(g: Game, est: StackEstimate, p: ID): { lo: number; hi: number } | undefined {
  const v = est.stack[p];
  if (v === undefined) return undefined;
  const s = est.spread[p] ?? 0;
  const step = g.bb > 0 ? g.bb : 1;
  if (s < step / 2) { const x = Math.round(Math.max(0, v)); return { lo: x, hi: x }; }
  const lo = Math.max(0, Math.floor((v - s) / step) * step);
  return { lo, hi: Math.max(lo, Math.ceil((v + s) / step) * step) };
}

/** Is a stack a range? Same test as `stackBounds`: a spread of half a big blind or more. Screens show no figure for a range. */
export const isRangeStack = (spread: number | undefined, bb: number): boolean => (spread ?? 0) >= (bb > 0 ? bb : 1) / 2;

/** What a player can still put in on a street. Exact stack (the real figure, as is): `room` equals `high`. Range stack:
    `room` is the low end (floored), `high` the high end, `range` true. `spent` is what they put in on earlier streets. */
export interface Room { room: number; high: number; range: boolean }
export function roomFrom(exact: number | undefined, bounds: { lo: number; hi: number } | undefined, spent: number): Room | undefined {
  if (exact !== undefined) { const r = Math.max(0, round2(exact - spent)); return { room: r, high: r, range: false }; }
  if (!bounds || bounds.lo === bounds.hi) return undefined;
  return { room: Math.max(0, Math.floor(bounds.lo - spent)), high: Math.max(0, Math.floor(bounds.hi - spent)), range: true };
}

/** Is a wager of `amount` (a street total) an all-in? Only at or above the most the player can put in:
    the high end of a range, the whole stack when exact. */
export const shoveAt = (r: Room | undefined, amount: number): boolean => !!r && r.high > 0 && amount >= r.high;

/** Stacks before hand n, only where the estimate is exact (a spread under half a big blind, as the player view reads it). All-ins resolve against these. */
export function exactStacks(g: Game, n: number): Record<ID, number> {
  const est = estimateStacks(g, n);
  return Object.fromEntries(Object.entries(est.stack).filter(([p, v]) => v !== undefined && !isRangeStack(est.spread[p], g.bb))) as Record<ID, number>;
}

/** The hand's close: when a rebuy for it counts as "after the hand". */
const handClose = (h: Pick<Hand, 'at' | 'endedAt'>) => h.endedAt ?? h.at;

/** Players dealt into a cash-game hand whose stack after it is exactly 0. Exact stacks only: a range or an estimate
    never counts. A player clocked out is not busted. These players are offered a rebuy before the next hand. */
export function bustedPlayers(g: Game, hand: Hand): ID[] {
  if (g.type !== 'cash' || hand.missed || !hand.log) return [];
  const est = estimateStacks(g, hand.n + 1);
  return hand.log.dealt.filter((p) => {
    const v = est.stack[p];
    return v !== undefined && Math.abs(v) < 0.005 && !(est.spread[p] > 0) && playerStatus(g, p) !== 'out';
  });
}

/** Chips to offer for a rebuy: one buy-in. The host can type any other amount, but never none. */
export function rebuyDefault(g: Game, _pid?: ID): number {
  return g.defaultBuyIn > 0 ? g.defaultBuyIn : 0;
}

/** A rebuy is offered for this hand: the player busted in it, and no buy-in came after the hand closed.
    Skipping or taking the rebuy both end the offer. A rebuy is stored as a buy-in with `at` after the hand ended. */
export function rebuyOffered(g: Game, hand: Hand, pid: ID): boolean {
  if (g.buyIns.some((b) => b.playerId === pid && b.at > handClose(hand))) return false;
  return bustedPlayers(g, hand).includes(pid);
}

/** Players to offer a rebuy right after `hand` was saved: busted in it, rebuy still open, and no later hand exists.
    Re-editing hand 5 after hands 6 to 9 gives an empty list. The recorder uses this to decide whether to wait for the
    rebuy sheet before the next hand. */
export function bustedAfterSave(g: Game, hand: Hand): ID[] {
  if (g.hands.some((h) => h.id !== hand.id && h.n > hand.n)) return [];
  return bustedPlayers(g, hand).filter((p) => rebuyOffered(g, hand, p));
}

/** Players who need a chip count: their latest all-in was logged against a range stack (at the lower end of the
    range), and no count (tap the stack, End game count) came after that hand closed. Cash-outs and a later
    exact all-in do not clear it, only a count does. The recorder and the game page show the flag; nothing blocks. */
export function needsCount(g: Game): ID[] {
  const out: ID[] = [];
  for (const p of g.playerIds) {
    let at: number | undefined;
    for (const h of g.hands) {
      if (h.missed || !h.log || !estAllIn(h.log, p)) continue;
      at = Math.max(at ?? 0, handClose(h));
    }
    if (at === undefined) continue;
    if (!(g.counts ?? []).some((c) => c.playerId === p && c.at >= at!)) out.push(p);
  }
  return out;
}
