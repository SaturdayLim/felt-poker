/* Trial report model: every figure the trial report pages show, worked out from a Felt backup with the
   app's own logic (src/lib). The backup holds the group's game data and stays in trial/ (git-ignored). */
import type { Card, Game, ID, Player } from '../src/types';
import { playerSummary, type PlayerSummary } from '../src/lib/stats';
import { estimateStacks } from '../src/lib/stacks';
import { actingOrder, bountyPay, bountyTotal, contributions, finalists, inAtEnd, STREETS } from '../src/lib/hand';
import { streetMoves } from '../src/lib/style';
import { bestHand } from '../src/lib/cards';
import { playerResult } from '../src/lib/calc';

export type Pos = 'BTN' | 'SB' | 'BB' | 'UTG';
export interface TrialPlayer {
  id: ID; name: string; seat: number;
  count: number; bought: number; net: number; money: number;
  /** Stack estimate at the end (before the count), and the count minus it. */
  estimate: number; off: number;
  moves: number; bounty: number;
  s: PlayerSummary;
  /** Actions after the flop. */
  post: { bet: number; raise: number; call: number; check: number; fold: number };
  byPos: Record<Pos, number>; byPosN: Record<Pos, number>;
  shown: { n: number; cards: Card[]; rank: string; won: boolean; pot: number }[];
  /** Stack at the start, after each hand (estimate), and the final count (last). */
  line: number[];
  insights: string[];
  style: string;
}
export interface TrialModel {
  game: string; date: string; currency: string; unitValue: number;
  hands: number; minutes: number; medianSec: number;
  pots: { n: number; pot: number; winners: string[] }[];
  reach: { flop: number; turn: number; river: number; showdown: number };
  multiway: number; raisedPre: number;
  bounties: { n: number; to: string; total: number }[];
  moves: { from: string; to: string; amount: number; afterN: number; note?: string }[];
  biggest: { n: number; pot: number; winners: string[]; board: Card[]; shown: { p: string; cards: Card[]; rank: string }[] }[];
  players: TrialPlayer[];
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

export function buildModel(backup: { players: Player[]; games: Game[] }, gameIndex = 0): TrialModel {
  const name = (id: ID) => backup.players.find((p) => p.id === id)?.name ?? id;
  const g = backup.games[gameIndex];
  const hands = g.hands.filter((h) => !h.missed && h.log);
  const noOut = { ...g, cashOuts: [] };
  const finalEst = estimateStacks(noOut);
  const pos = (h: (typeof hands)[number], p: ID): Pos => {
    if (p === h.log!.button) return 'BTN';
    const i = actingOrder(g, h.log!.dealt, h.log!.button).indexOf(p);
    return i === 0 ? 'SB' : i === 1 ? 'BB' : 'UTG';
  };

  const players: TrialPlayer[] = g.playerIds.map((p) => {
    const s = playerSummary([g], p);
    const r = playerResult(g, p);
    const byPos: Record<Pos, number> = { BTN: 0, SB: 0, BB: 0, UTG: 0 };
    const byPosN: Record<Pos, number> = { BTN: 0, SB: 0, BB: 0, UTG: 0 };
    const post = { bet: 0, raise: 0, call: 0, check: 0, fold: 0 };
    const shown: TrialPlayer['shown'] = [];
    for (const h of hands) {
      const L = h.log!;
      const net = (h.winners.find((w) => w.playerId === p)?.amount ?? 0) + (h.returned?.[p] ?? 0) - (contributions(g, L, L.button)[p] ?? 0);
      const ps = pos(h, p);
      byPos[ps] += net; byPosN[ps]++;
      for (const st of STREETS.slice(1)) for (const m of streetMoves(g, L, st)) if (m.p === p) post[m.k]++;
      const sh = h.shown.find((x) => x.playerId === p);
      if (sh) shown.push({ n: h.n, cards: sh.cards, rank: h.board.length === 5 ? bestHand([...sh.cards, ...h.board])?.name ?? '' : '', won: h.winners.some((w) => w.playerId === p), pot: h.pot });
    }
    // start, after each hand (estimate), then the final count
    const line = [r.inUnits, ...hands.map((h) => Math.round(estimateStacks(noOut, h.n + 1).stack[p] ?? 0)), r.outUnits];
    const moves = (g.moves ?? []).reduce((a, m) => a + (m.to === p ? m.amount : 0) - (m.from === p ? m.amount : 0), 0);
    const bounty = hands.reduce((a, h) => a + (h.bounty ? (h.bounty.playerId === p ? bountyTotal(h.bounty) : 0) - (h.bounty.payers.includes(p) ? bountyPay(h.bounty, p) : 0) : 0), 0);
    const estimate = Math.round(finalEst.stack[p] ?? 0);
    return {
      id: p, name: name(p), seat: g.seats[p] ?? 0, count: r.outUnits, bought: r.inUnits, net: r.outUnits - r.inUnits, money: r.net,
      estimate, off: r.outUnits - estimate, moves, bounty, s, post, byPos, byPosN, shown, line, insights: [], style: '',
    };
  });

  // style label relative to this table: looser or tighter than the table, more or less aggressive
  const vp = (x: TrialPlayer) => pct(x.s.vpip, x.s.logged);
  const af = (x: TrialPlayer) => (x.s.style.calls ? x.s.style.betsRaises / x.s.style.calls : x.s.style.betsRaises);
  const avgVp = players.reduce((a, x) => a + vp(x), 0) / players.length;
  const avgAf = players.reduce((a, x) => a + af(x), 0) / players.length;
  for (const x of players) {
    x.style = `${vp(x) > avgVp + 3 ? 'Looser' : vp(x) < avgVp - 3 ? 'Tighter' : 'Average range'}, ${af(x) >= avgAf ? 'more aggressive' : 'more passive'} than the table`;
    x.insights = insightsFor(x, players);
  }

  const secs = hands.map((h) => Math.round(((h.endedAt ?? h.at) - h.at) / 1000)).sort((a, b) => a - b);
  const reach = { flop: 0, turn: 0, river: 0, showdown: 0 };
  for (const h of hands) {
    if (h.log!.streets.flop) reach.flop++;
    if (h.log!.streets.turn) reach.turn++;
    if (h.log!.streets.river) reach.river++;
    if (finalists(h.log!).length > 1) reach.showdown++;
  }
  const last = hands[hands.length - 1];
  return {
    game: g.name, date: new Date(g.startedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
    currency: g.currency, unitValue: g.unitValue,
    hands: hands.length, minutes: Math.round(((last?.endedAt ?? last?.at ?? g.startedAt) - g.startedAt) / 60000), medianSec: secs[Math.floor(secs.length / 2)] ?? 0,
    pots: hands.map((h) => ({ n: h.n, pot: h.pot, winners: h.winners.map((w) => name(w.playerId)) })),
    reach,
    multiway: hands.filter((h) => inAtEnd(h.log!, 'preflop').length >= 3).length,
    raisedPre: hands.filter((h) => h.log!.streets.preflop?.raisers.length).length,
    bounties: hands.filter((h) => h.bounty).map((h) => ({ n: h.n, to: name(h.bounty!.playerId), total: bountyTotal(h.bounty!) })),
    moves: (g.moves ?? []).map((m) => ({ from: name(m.from), to: m.to ? name(m.to) : 'off the table', amount: m.amount, afterN: m.afterN, note: m.note })),
    biggest: [...hands].sort((a, b) => b.pot - a.pot).slice(0, 3).map((h) => ({
      n: h.n, pot: h.pot, winners: h.winners.map((w) => name(w.playerId)), board: h.board,
      shown: h.shown.map((s) => ({ p: name(s.playerId), cards: s.cards, rank: h.board.length === 5 ? bestHand([...s.cards, ...h.board])?.name ?? '' : '' })),
    })),
    players,
  };
}

/** Up to 4 findings per player, strongest first. Each needs at least 5 chances behind it. */
function insightsFor(x: TrialPlayer, all: TrialPlayer[]): string[] {
  const s = x.s, st = s.style, f = s.flow;
  const out: { w: number; t: string }[] = [];
  const most = (k: (p: TrialPlayer) => number) => all.every((o) => o === x || k(o) < k(x));
  // where the chips came from
  const sd = f.winShowdown - f.lossShowdown, fold = f.winFold - f.lossFold;
  if (Math.abs(sd) >= 30) out.push({ w: Math.abs(sd), t: sd > 0 ? `Showdowns paid: +${sd} chips net, ${s.wsd} of ${s.wtsd} won.` : `Showdowns cost ${-sd} chips: ${s.wsd} of ${s.wtsd} won.` });
  if (Math.abs(fold) >= 30) out.push({ w: Math.abs(fold), t: fold > 0 ? `Took ${fold} chips net in pots where everyone else folded.` : `Lost ${-fold} chips in hands folded after putting chips in.` });
  if (st.foldCbetOpp >= 5 && st.foldCbet / st.foldCbetOpp >= 0.6) out.push({ w: 40, t: `Folded to ${st.foldCbet} of ${st.foldCbetOpp} continuation bets. A flop bet takes the pot most of the time.` });
  if (st.threeBetOpp >= 5 && st.threeBet === 0) out.push({ w: 25, t: `Never re-raised before the flop (0 of ${st.threeBetOpp} chances).` });
  if (st.cbetOpp >= 5 && st.cbet / st.cbetOpp >= 0.7) out.push({ w: 30, t: `Bet the flop after raising ${st.cbet} of ${st.cbetOpp} times.` });
  if (most((p) => (p.s.style.calls ? p.s.style.betsRaises / p.s.style.calls : 0))) out.push({ w: 35, t: `Most aggressive after the flop: ${st.betsRaises} bets and raises against ${st.calls} calls.` });
  if (most((p) => -(p.s.style.calls ? p.s.style.betsRaises / p.s.style.calls : 0))) out.push({ w: 30, t: `Most passive after the flop: ${st.calls} calls against ${st.betsRaises} bets and raises.` });
  const posArr = (Object.entries(x.byPos) as [Pos, number][]).sort((a, b) => b[1] - a[1]);
  if (posArr[0][1] >= 30) out.push({ w: 20, t: `Best seat: ${posArr[0][0]} (+${posArr[0][1]} chips over ${x.byPosN[posArr[0][0]]} hands).` });
  if (posArr[3][1] <= -40) out.push({ w: 20, t: `Worst seat: ${posArr[3][0]} (${posArr[3][1]} chips over ${x.byPosN[posArr[3][0]]} hands).` });
  if (Math.abs(x.off) >= 2) out.push({ w: 15, t: `Final count is ${Math.abs(x.off)} chips ${x.off > 0 ? 'above' : 'below'} the estimate. A wager was likely logged differently from play.` });
  return out.sort((a, b) => b.w - a.w).slice(0, 4).map((o) => o.t);
}
