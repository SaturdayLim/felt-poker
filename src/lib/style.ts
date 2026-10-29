/* Playing-style counts and chip flows per player, from hands logged with action boxes.
   Each rate is "times it happened / times the player had the chance", counted once per hand.
   - 3-bet: facing one raise before the flop (not their own), they raise again.
   - Fold to 3-bet: they opened with a raise, someone raised again, they fold.
   - C-bet: they made the last raise before the flop and bet the flop when nobody had bet before them.
   - Fold to c-bet: facing that flop bet, they fold.
   - Aggression: (bets + raises) / calls after the flop.
   - BB defend: in the BB facing a raise, they call or raise.
   - Steal: everyone before them folded, they sit in the seat before the button, on the button or in the SB,
     and they raise.
   A straddle counts as a blind, not a raise. */
import type { Game, Hand, HandLog, ID, StreetName } from '../types';
import { round2 } from './calc';
import { STREETS, actingOrder, bountyPay, contributions, defaultAct, finalists, lastStreet, replayStreet, streetOrder } from './hand';

export interface StyleCounts {
  threeBet: number; threeBetOpp: number;
  fold3Bet: number; fold3BetOpp: number;
  cbet: number; cbetOpp: number;
  foldCbet: number; foldCbetOpp: number;
  betsRaises: number; calls: number;
  bbDefend: number; bbDefendOpp: number;
  steal: number; stealOpp: number;
}
export const emptyStyle = (): StyleCounts => ({
  threeBet: 0, threeBetOpp: 0, fold3Bet: 0, fold3BetOpp: 0, cbet: 0, cbetOpp: 0, foldCbet: 0, foldCbetOpp: 0,
  betsRaises: 0, calls: 0, bbDefend: 0, bbDefendOpp: 0, steal: 0, stealOpp: 0,
});

export type WonAt = StreetName | 'showdown';
/** Chips won and lost per player, by where they came from. Fold and showdown are net per hand. */
export interface ChipFlow { winFold: number; winShowdown: number; winOther: number; lossFold: number; lossShowdown: number; lossOther: number }
export const emptyFlow = (): ChipFlow => ({ winFold: 0, winShowdown: 0, winOther: 0, lossFold: 0, lossShowdown: 0, lossOther: 0 });

interface Move { p: ID; k: 'fold' | 'check' | 'call' | 'bet' | 'raise'; high: number }

/** One street's actions in time order (boxes skipped over count as their default). */
export function streetMoves(g: Game, log: HandLog, street: StreetName): Move[] {
  const s = log.streets[street];
  if (!s?.acts) return [];
  const rp = replayStreet(g, log, street);
  const out: Move[] = [];
  for (let r = 0; r < rp.cols; r++) {
    for (const p of rp.order) {
      const c = rp.cells[p]?.[r];
      if (!c?.needed || c.post) continue;
      const a = c.act ?? (c.implied ? (s.partial ? { k: 'call' as const } : defaultAct(c.toCall)) : null);
      if (!a) continue;
      if (street === 'preflop' && r === 0 && rp.straddles.includes(p)) continue;
      const k: Move['k'] = a.k === 'fold' ? 'fold' : c.amount > c.high ? (c.high > 0 ? 'raise' : 'bet') : c.toCall > 0 ? 'call' : 'check';
      out.push({ p, k, high: c.high });
    }
  }
  return out;
}

/** Adds one hand's chances and actions for player `p` to `s`. */
export function addStyle(s: StyleCounts, g: Game, log: HandLog, p: ID) {
  if (!log.dealt.includes(p) || !log.streets.preflop?.acts) return;
  const pre = streetMoves(g, log, 'preflop');
  const seat = actingOrder(g, log.dealt, log.button);
  const bb = seat.length === 2 ? seat.find((x) => x !== log.button) : seat[1];
  const po = streetOrder(g, log, 'preflop');
  const btn = log.button;
  const co = seat.length > 3 && btn ? po[po.indexOf(btn) - 1] : undefined;
  const stealSeats = [co, btn, seat.length > 2 ? seat[0] : undefined].filter((x): x is ID => !!x && x !== bb);
  let raises = 0, opener: ID | null = null, aggressor: ID | null = null, entered = false;
  let did3 = false, didF3 = false, didBb = false, didSteal = false;
  for (const m of pre) {
    if (m.p === p) {
      if (!didSteal) {
        didSteal = true;
        if (stealSeats.includes(p) && !entered) { s.stealOpp++; if (m.k === 'raise') s.steal++; }
      }
      if (raises === 1 && opener !== p && !did3) { did3 = true; s.threeBetOpp++; if (m.k === 'raise') s.threeBet++; }
      if (raises === 2 && opener === p && !didF3) { didF3 = true; s.fold3BetOpp++; if (m.k === 'fold') s.fold3Bet++; }
      if (p === bb && raises >= 1 && !didBb) { didBb = true; s.bbDefendOpp++; if (m.k !== 'fold') s.bbDefend++; }
    }
    if (m.k === 'raise' || m.k === 'bet') { raises++; if (raises === 1) opener = m.p; aggressor = m.p; }
    if (m.k !== 'fold' && m.k !== 'check') entered = true;
  }
  const flop = streetMoves(g, log, 'flop');
  let cbetBy: ID | null = null, sawCbetAnswer = false, myFirst = true;
  for (const m of flop) {
    if (m.p === p && myFirst) {
      myFirst = false;
      if (aggressor === p && m.high === 0 && !cbetBy) { s.cbetOpp++; if (m.k === 'bet') s.cbet++; }
    }
    if (cbetBy && cbetBy !== '-' && m.p === p && !sawCbetAnswer && cbetBy !== p) { sawCbetAnswer = true; s.foldCbetOpp++; if (m.k === 'fold') s.foldCbet++; }
    // the first flop bet is a c-bet only when the preflop aggressor made it ('-' marks someone else's bet)
    if (!cbetBy && m.k === 'bet') cbetBy = m.p === aggressor ? m.p : '-';
  }
  for (const st of STREETS.slice(1)) {
    for (const m of streetMoves(g, log, st)) {
      if (m.p !== p) continue;
      if (m.k === 'bet' || m.k === 'raise') s.betsRaises++;
      else if (m.k === 'call') s.calls++;
    }
  }
}

/** Where a hand the player won (all or part of) was decided: the street everyone else folded on, or showdown. */
export function wonAt(log: HandLog): WonAt {
  return finalists(log).length > 1 ? 'showdown' : lastStreet(log);
}

/** Adds one hand's chips for `p` to `f`. Fold and showdown are the hand's net (pots won + chips returned -
    chips put in). Others: 2-7 bounties. Partly recorded or excluded hands only count their bounty. */
export function addFlow(f: ChipFlow, g: Game, h: Hand, p: ID) {
  if (h.bounty) {
    if (h.bounty.playerId === p) f.winOther = round2(f.winOther + h.bounty.payers.reduce((a, q) => a + bountyPay(h.bounty!, q), 0));
    if (h.bounty.payers.includes(p)) f.lossOther = round2(f.lossOther + bountyPay(h.bounty, p));
  }
  const L = h.log;
  if (!L || h.excluded || h.partial || L.mode !== 'bets' || !L.dealt.includes(p)) return;
  const put = contributions(g, L, L.button)[p] ?? 0;
  const got = (h.winners.find((w) => w.playerId === p)?.amount ?? 0) + (h.returned?.[p] ?? 0);
  const net = round2(got - put);
  const showdown = finalists(L).length > 1;
  if (net > 0) { if (showdown) f.winShowdown = round2(f.winShowdown + net); else f.winFold = round2(f.winFold + net); }
  else if (net < 0) {
    if (showdown && finalists(L).includes(p)) f.lossShowdown = round2(f.lossShowdown - net);
    else f.lossFold = round2(f.lossFold - net);
  }
}

/** Chip moves (side games, tips, other) for `p` in one game: received are wins, given are losses. */
export function addMoves(f: ChipFlow, g: Game, p: ID) {
  for (const m of g.moves ?? []) {
    if (m.to === p) f.winOther = round2(f.winOther + m.amount);
    if (m.from === p) f.lossOther = round2(f.lossOther + m.amount);
  }
}
