/* Trial report model: every figure the trial report pages show, worked out from a Felt backup with the
   app's own logic (src/lib). The backup holds the group's game data and stays in trial/ (git-ignored).
   All amounts are chips; the report never converts to money. */
import type { Card, Game, ID, Player } from '../src/types';
import { playerSummary, type PlayerSummary } from '../src/lib/stats';
import { estimateStacks } from '../src/lib/stacks';
import { actingOrder, bountyPay, bountyTotal, contributions, finalists, inAtEnd } from '../src/lib/hand';
import { bestHand } from '../src/lib/cards';
import { gameRules } from '../src/lib/rules';
import type { Settings } from '../src/types';
import { playerResult, suggestTransfers } from '../src/lib/calc';

export type Pos = 'BTN' | 'SB' | 'BB' | 'UTG';
/** A strength or weakness: "Strength: Aggression - Won 42 in takedowns", with what to do about it. */
export interface Note { kind: 'strength' | 'weakness'; title: string; stat: string; advice: string; w: number }
/** A table award. `detail` is one sentence with the figures behind it (shown when the award is expanded). */
export interface Award { title: string; to: ID[]; detail: string }

export interface TrialPlayer {
  id: ID; name: string; seat: number;
  count: number; bought: number; net: number;
  /** Stack estimate after the last hand, and the count minus it. */
  estimate: number; off: number;
  moves: number; bounty: number;
  s: PlayerSummary;
  vpip: number; pfr: number; af: number;
  /** Net of showdowns, and of hands won or folded without a showdown. */
  sdNet: number; foldNet: number;
  byPos: Record<Pos, number>; byPosN: Record<Pos, number>;
  /** The player's own private cards (recorded apart from the table), with how each hand went. Locked. */
  mine: { n: number; cards: Card[]; rank: string; shownAtTable: boolean; won: boolean; got: number }[];
  /** Cards shown: chips won (part of the pot when split), or the pot lost. */
  shown: { n: number; cards: Card[]; rank: string; won: boolean; pot: number; got: number; split: boolean }[];
  /** Result against par (chips bought so far) at the start and after each hand; the last point uses the
      final count, so it matches the result. A rebuy does not move the line. */
  dev: number[];
  /** Buy-ins after the start: the hand they came after, and the chips. */
  rebuys: { after: number; amount: number }[];
  /** Highest and lowest point against par, and the hand after which each came. */
  high: number; highAt: number; low: number; lowAt: number;
  notes: Note[];
  /** Only the public part is in the shared report until the player's code unlocks the rest. */
  locked?: boolean;
}
export interface TrialModel {
  game: string; date: string;
  hands: number; minutes: number; medianSec: number; players4: number;
  pots: { n: number; pot: number; winners: string[] }[];
  reach: { preflop: number; flop: number; turn: number; river: number; showdown: number };
  multiway: number; raisedPre: number;
  bounties: { n: number; to: string; total: number }[];
  moves: { from: string; to: string; amount: number; afterN: number; note?: string }[];
  biggest: { n: number; pot: number; winners: string[]; board: Card[]; shown: { p: string; cards: Card[]; rank: string }[] }[];
  avgVpip: number; avgAf: number;
  /** Target for the number of players dealt in: VPIP % and aggression (a point, shown like a player). */
  target: { vpip: number; af: number };
  awards: Award[];
  /** The house rules this game used, as label and value pairs. */
  rules: { label: string; value: string }[];
  /** Who pays whom, in chips, to close the accounts. */
  settle: { from: string; to: string; amount: number }[];
  players: TrialPlayer[];
}

const ratio = (a: number, b: number) => (b ? a / b : 0);

/** Rough targets for solid play by players dealt in (short-handed strategy guides). A guide, not exact. */
export function targetFor(n: number): TrialModel['target'] {
  const v: Record<number, number> = { 2: 65, 3: 45, 4: 34, 5: 29, 6: 25 };
  return { vpip: v[Math.min(6, Math.max(2, n))] ?? 21, af: 2.5 };
}

export function buildModel(backup: { players: Player[]; games: Game[]; settings?: Settings }, gameIndex = 0): TrialModel {
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
    const shown: TrialPlayer['shown'] = [];
    const mine: TrialPlayer['mine'] = [];
    for (const h of hands) {
      const L = h.log!;
      const net = (h.winners.find((w) => w.playerId === p)?.amount ?? 0) + (h.returned?.[p] ?? 0) - (contributions(g, L, L.button)[p] ?? 0);
      const ps = pos(h, p);
      byPos[ps] += net; byPosN[ps]++;
      const own = h.private?.[p] ?? (h.mine?.playerId === p ? h.mine.cards : undefined);
      if (own?.length === 2) mine.push({ n: h.n, cards: own, rank: h.board.length === 5 ? bestHand([...own, ...h.board])?.name ?? '' : '',
        shownAtTable: h.shown.some((x) => x.playerId === p), won: h.winners.some((w) => w.playerId === p), got: h.winners.find((w) => w.playerId === p)?.amount ?? 0 });
      const sh = h.shown.find((x) => x.playerId === p);
      if (sh) shown.push({ n: h.n, cards: sh.cards, rank: h.board.length === 5 ? bestHand([...sh.cards, ...h.board])?.name ?? '' : '', won: h.winners.some((w) => w.playerId === p), pot: h.pot, got: h.winners.find((w) => w.playerId === p)?.amount ?? 0, split: h.winners.length > 1 });
    }
    // par = chips bought so far; a buy-in after the start is a rebuy, placed after the last hand that ended before it
    const buys = g.buyIns.filter((b) => b.playerId === p).sort((a, b) => a.at - b.at);
    const start = buys.length ? buys[0].at : g.startedAt;
    const boughtBy = (t: number) => buys.filter((b) => b.at <= t).reduce((a, b) => a + b.amount, 0);
    const rebuys = buys.filter((b) => b.at > start + 60000).map((b) => ({ after: hands.filter((h) => (h.endedAt ?? h.at) <= b.at).length, amount: b.amount }));
    const dev = [0, ...hands.map((h, i) => (i === hands.length - 1
      ? r.outUnits - r.inUnits
      : Math.round((estimateStacks(noOut, h.n + 1).stack[p] ?? 0) - boughtBy(h.endedAt ?? h.at))))];
    const high = Math.max(...dev), low = Math.min(...dev);
    const moves = (g.moves ?? []).reduce((a, m) => a + (m.to === p ? m.amount : 0) - (m.from === p ? m.amount : 0), 0);
    const bounty = hands.reduce((a, h) => a + (h.bounty ? (h.bounty.playerId === p ? bountyTotal(h.bounty) : 0) - (h.bounty.payers.includes(p) ? bountyPay(h.bounty, p) : 0) : 0), 0);
    const estimate = Math.round(finalEst.stack[p] ?? 0);
    const st = s.style, f = s.flow;
    return {
      id: p, name: name(p), seat: g.seats[p] ?? 0, count: r.outUnits, bought: r.inUnits, net: r.outUnits - r.inUnits,
      estimate, off: r.outUnits - estimate, moves, bounty, s,
      vpip: ratio(s.vpip, s.logged) * 100, pfr: ratio(s.pfr, s.logged) * 100, af: st.calls ? st.betsRaises / st.calls : st.betsRaises,
      sdNet: f.winShowdown - f.lossShowdown, foldNet: f.winFold - f.lossFold,
      byPos, byPosN, shown, mine, dev, rebuys, high, highAt: dev.indexOf(high), low, lowAt: dev.indexOf(low), notes: [],
    };
  });
  const dealtN = Math.round(hands.reduce((a, h) => a + h.log!.dealt.length, 0) / (hands.length || 1));
  const target = targetFor(dealtN);
  for (const x of players) x.notes = notesFor(x, target, dealtN);

  const reach = { preflop: hands.length, flop: 0, turn: 0, river: 0, showdown: 0 };
  for (const h of hands) {
    if (h.log!.streets.flop) reach.flop++;
    if (h.log!.streets.turn) reach.turn++;
    if (h.log!.streets.river) reach.river++;
    if (finalists(h.log!).length > 1) reach.showdown++;
  }
  const secs = hands.map((h) => Math.round(((h.endedAt ?? h.at) - h.at) / 1000)).sort((a, b) => a - b);
  const last = hands[hands.length - 1];
  const biggest = [...hands].sort((a, b) => b.pot - a.pot).slice(0, 3).map((h) => ({
    n: h.n, pot: h.pot, winners: h.winners.map((w) => name(w.playerId)), board: h.board,
    shown: h.shown.map((s) => ({ p: name(s.playerId), cards: s.cards, rank: h.board.length === 5 ? bestHand([...s.cards, ...h.board])?.name ?? '' : '' })),
  }));
  // longest run of pots won in a row, counting only hands the player was dealt into
  const streaks: Record<ID, number> = {};
  for (const p of g.playerIds) {
    let run = 0, best = 0;
    for (const h of hands) {
      if (!h.log!.dealt.includes(p)) continue;
      run = h.winners.some((w) => w.playerId === p) ? run + 1 : 0;
      best = Math.max(best, run);
    }
    streaks[p] = best;
  }
  const bounties = hands.filter((h) => h.bounty).map((h) => ({ n: h.n, to: name(h.bounty!.playerId), total: bountyTotal(h.bounty!) }));
  return {
    game: g.name, date: new Date(g.startedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
    hands: hands.length, minutes: Math.round(((last?.endedAt ?? last?.at ?? g.startedAt) - g.startedAt) / 60000),
    medianSec: secs[Math.floor(secs.length / 2)] ?? 0, players4: dealtN,
    pots: hands.map((h) => ({ n: h.n, pot: h.pot, winners: h.winners.map((w) => name(w.playerId)) })),
    reach,
    multiway: hands.filter((h) => inAtEnd(h.log!, 'preflop').length >= 3).length,
    raisedPre: hands.filter((h) => h.log!.streets.preflop?.raisers.length).length,
    bounties,
    moves: (g.moves ?? []).map((m) => ({ from: name(m.from), to: m.to ? name(m.to) : 'off the table', amount: m.amount, afterN: m.afterN, note: m.note })),
    biggest,
    avgVpip: players.reduce((a, x) => a + x.vpip, 0) / players.length,
    avgAf: players.reduce((a, x) => a + x.af, 0) / players.length,
    target,
    rules: rulesList(g, backup.settings),
    settle: suggestTransfers(players.map((x) => ({ playerId: x.id, balance: x.net }))).map((t) => ({ from: name(t.from), to: name(t.to), amount: t.amount })),
    awards: awardsFor(players, biggest[0], bounties, g.bb, streaks),
    players,
  };
}

const WIN_RULE = { shown: 'Revealed at showdown', won: 'Winning the pot', sole: 'Best hand' } as const;
const MIN_RAISE = { last: 'Last raise', sb: 'SB steps', double: 'Double' } as const;

/** The house rules a game was played under, as label and value pairs for the report. */
function rulesList(g: Game, s?: Settings): { label: string; value: string }[] {
  const r = s || g.rules ? gameRules(g, s as Settings) : undefined;
  const out = [
    { label: 'Game', value: g.type === 'cash' ? 'Cash' : 'Tournament' },
    { label: 'Blinds', value: `${g.sb}/${g.bb} chips` },
    { label: 'Buy-in', value: `${g.buyIns[0]?.amount ?? 0} chips` },
  ];
  if (!r) return out;
  out.push({ label: 'Minimum raise', value: MIN_RAISE[r.minRaise] });
  const b = r.bounty27;
  out.push({ label: '2-7 bounty', value: b.on ? `${WIN_RULE[b.win]}, ${b.suited ? 'suited allowed' : 'offsuit only'}, ${b.amount} chips from each player` : 'Off' });
  return out;
}

/** Strengths, then weaknesses, each with what to do next. Each needs at least 5 chances (or 30 chips). */
function notesFor(x: TrialPlayer, target: TrialModel['target'], n: number): Note[] {
  const s = x.s, st = s.style, f = s.flow;
  const out: Note[] = [];
  const add = (kind: Note['kind'], title: string, stat: string, advice: string, w: number) => out.push({ kind, title, stat, advice, w });
  if (s.logged >= 10 && x.vpip >= target.vpip + 20) add('weakness', 'Plays too many hands', `VPIP ${Math.round(x.vpip)}%`,
    `Fold more weak hands before the flop. About ${target.vpip}% suits ${n} players: keep pairs, big cards and suited connectors.`, 35 + (x.vpip - target.vpip) / 4);
  if (s.wtsd >= 5) {
    if (x.sdNet >= 30) add('strength', 'Showdown strength', `Won ${s.wsd}/${s.wtsd}, +${x.sdNet}`,
      'Keep betting strong hands for value: this table pays you off at showdown.', x.sdNet);
    else if (x.sdNet <= -30) add('weakness', 'Showdown strength', `Won ${s.wsd}/${s.wtsd}, ${x.sdNet}`,
      'Call less on the turn and river with one pair. A bet there is rarely a bluff at this table.', -x.sdNet);
  }
  if (x.foldNet >= 30) add('strength', 'Aggression', `Won ${x.foldNet} in takedowns`,
    'Keep betting when others check: pots won without a showdown add up.', x.foldNet);
  else if (x.foldNet <= -30) add('weakness', 'Late folds', `Lost ${f.lossFold} before folding`,
    'Decide earlier. Fold before you put chips in, or keep going with hands worth the pot.', -x.foldNet);
  if (st.foldCbetOpp >= 5 && st.foldCbet / st.foldCbetOpp >= 0.6) add('weakness', 'Folds to c-bets', `${st.foldCbet}/${st.foldCbetOpp}`,
    'Call or raise some flop bets with a pair or a draw. Players bet the flop because you fold.', 40);
  if (st.foldCbetOpp >= 5 && st.foldCbet / st.foldCbetOpp <= 0.25) add('strength', 'Stands up to c-bets', `Folded ${st.foldCbet}/${st.foldCbetOpp}`,
    'Keep defending against flop bets, and raise your strong hands.', 30);
  if (st.cbetOpp >= 5 && st.cbet / st.cbetOpp >= 0.7) add('strength', 'Follows through', `C-bet ${st.cbet}/${st.cbetOpp}`,
    'Keep betting the flop after you raise. Check some strong hands so the bet does not give your hand away.', 30);
  if (st.threeBetOpp >= 5 && st.threeBet === 0) add('weakness', 'Never re-raises', `3-bet 0/${st.threeBetOpp}`,
    'Re-raise your best hands before the flop (big pairs, AK). It builds the pot while you are ahead.', 25);
  if (s.logged >= 10 && x.pfr < 5) add('weakness', 'Rarely raises pre-flop', `PFR ${s.pfr}/${s.logged}`,
    'Raise good hands instead of calling. A raise thins the field and takes control of the hand.', 24);
  if (st.bbDefendOpp >= 5 && st.bbDefend / st.bbDefendOpp >= 0.8) add('strength', 'Defends the BB', `${st.bbDefend}/${st.bbDefendOpp}`,
    'Keep defending: the BB already has chips in, so a call costs less.', 15);
  // up to 2 strengths and 2 weaknesses, so every player sees both sides when the data has them
  const by = (k: Note['kind']) => out.filter((n) => n.kind === k).sort((a, b) => b.w - a.w);
  const pick = [...by('strength').slice(0, 2), ...by('weakness').slice(0, 2)];
  const rest = out.filter((n) => !pick.includes(n)).sort((a, b) => b.w - a.w);
  return [...pick, ...rest].slice(0, 4).sort((a, b) => (a.kind === b.kind ? b.w - a.w : a.kind === 'strength' ? -1 : 1));
}

/** The award list. Each award goes to the best player in its category, but only once that player clears
    the minimum, so a thin sample never hands out an award. Ties share it. */
export const AWARD_LIST: { title: string; best: string; min: string }[] = [
  { title: 'Diamond Hands', best: 'Seen the most showdowns', min: 'More than 5 showdowns' },
  { title: 'King Of The Hill', best: 'Most pots won', min: 'More than 5 pots' },
  { title: 'Leprechaun', best: 'Biggest single pot won', min: 'A pot of more than 50 BB' },
  { title: 'Apollo', best: 'Most pots won in a row', min: 'More than 3 in a row' },
  { title: 'Ice Cold', best: 'Lowest pots won against bets and raises made', min: 'Fewer than 10% won' },
  { title: 'Comeback', best: 'Largest climb from the lowest point to the final result', min: 'At least 50 BB' },
  { title: 'Unrelenting', best: 'Highest c-bet rate', min: '5 c-bet chances' },
  { title: 'The Rock', best: 'Lowest VPIP', min: 'VPIP under 40%' },
  { title: 'Bounty Hunter', best: 'Most 2-7 bounties won', min: '1 bounty' },
  { title: 'Iron Defender', best: 'Highest BB defense rate', min: '5 raises faced in the BB, more than 60% defended' },
];

/** Table awards from AWARD_LIST, each with one sentence of the figures behind it. */
function awardsFor(ps: TrialPlayer[], big: TrialModel['biggest'][number] | undefined, bounties: TrialModel['bounties'], bb: number, streaks: Record<ID, number>): Award[] {
  const top = (k: (p: TrialPlayer) => number, ok: (p: TrialPlayer) => boolean) => {
    const pool = ps.filter(ok);
    if (!pool.length) return [];
    const best = Math.max(...pool.map(k));
    return pool.filter((p) => k(p) === best);
  };
  const ids = (xs: TrialPlayer[]) => xs.map((p) => p.id);
  const out: Award[] = [];
  const sd = top((p) => p.s.wtsd, (p) => p.s.wtsd > 5);
  if (sd.length) out.push({ title: 'Diamond Hands', to: ids(sd), detail: `Saw ${sd[0].s.wtsd} showdowns and won ${sd[0].s.wsd}, ${sd[0].sdNet > 0 ? '+' : ''}${sd[0].sdNet} from them.` });
  const won = top((p) => p.s.handsWon, (p) => p.s.handsWon > 5);
  if (won.length) out.push({ title: 'King Of The Hill', to: ids(won), detail: `${won[0].s.handsWon} pots${won.length > 1 ? ' each' : ''}. ${won.map((p) => `${p.name}: ${p.s.handsWon - p.s.wsd} without a showdown`).join('. ')}.` });
  if (big && big.pot > 50 * bb) {
    const rank = big.shown.find((s) => big.winners.includes(s.p))?.rank;
    out.push({ title: 'Leprechaun', to: ps.filter((p) => big.winners.includes(p.name)).map((p) => p.id), detail: `Won ${big.pot} on hand #${big.n}${rank ? ` with a ${rank.toLowerCase()}` : ''}.` });
  }
  const hot = top((p) => streaks[p.id] ?? 0, (p) => (streaks[p.id] ?? 0) > 3);
  if (hot.length) out.push({ title: 'Apollo', to: ids(hot), detail: `Won ${streaks[hot[0].id]} pots in a row.` });
  const cold = top((p) => -ratio(p.s.handsWon, p.s.style.betsRaises), (p) => p.s.style.betsRaises > 0 && p.s.handsWon / p.s.style.betsRaises < 0.1);
  if (cold.length) out.push({ title: 'Ice Cold', to: ids(cold), detail: `Won ${cold[0].s.handsWon} pots after ${cold[0].s.style.betsRaises} bets or raises.` });
  const back = top((p) => p.net - p.low, (p) => p.net - p.low >= 50 * bb && p.lowAt < p.dev.length - 1);
  if (back.length) out.push({ title: 'Comeback', to: ids(back), detail: `Climbed ${back[0].net - back[0].low} from ${back[0].low} after hand #${back[0].lowAt} to finish ${back[0].net > 0 ? '+' : ''}${back[0].net}.` });
  const cb = top((p) => ratio(p.s.style.cbet, p.s.style.cbetOpp), (p) => p.s.style.cbetOpp >= 5);
  if (cb.length) out.push({ title: 'Unrelenting', to: ids(cb), detail: `Bet the flop after raising ${cb[0].s.style.cbet} of ${cb[0].s.style.cbetOpp} times.` });
  const rock = top((p) => -p.vpip, (p) => p.vpip < 40);
  if (rock.length) out.push({ title: 'The Rock', to: ids(rock), detail: `Played ${rock[0].s.vpip} of ${rock[0].s.logged} hands, the fewest at the table.` });
  const bountyN = (p: TrialPlayer) => bounties.filter((b) => b.to === p.name).length;
  const hunt = top(bountyN, (p) => bountyN(p) >= 1);
  if (hunt.length) out.push({ title: 'Bounty Hunter', to: ids(hunt), detail: `Collected ${bountyN(hunt[0])} ${bountyN(hunt[0]) === 1 ? 'bounty' : 'bounties'} for a shown 2-7: ${bounties.filter((b) => b.to === hunt[0].name).map((b) => `${b.total} chips on hand #${b.n}`).join(', ')}.` });
  const def = top((p) => ratio(p.s.style.bbDefend, p.s.style.bbDefendOpp), (p) => p.s.style.bbDefendOpp >= 5 && p.s.style.bbDefend / p.s.style.bbDefendOpp > 0.6);
  if (def.length) out.push({ title: 'Iron Defender', to: ids(def), detail: `Defended the BB ${def[0].s.style.bbDefend} of ${def[0].s.style.bbDefendOpp} times against a raise.` });
  return out;
}

/** The part of a player everyone sees in the shared report: the figures behind Game Summary and Compare.
    Strengths, weaknesses, seats, cards shown and chip sources stay in the player's locked box. */
export function publicPlayer(p: TrialPlayer): TrialPlayer {
  const zero = { BTN: 0, SB: 0, BB: 0, UTG: 0 };
  return {
    ...p, notes: [], shown: [], mine: [], byPos: { ...zero }, byPosN: { ...zero }, locked: true,
    s: {
      ...p.s, history: [],
      flow: { winFold: 0, winShowdown: 0, winOther: 0, lossFold: 0, lossShowdown: 0, lossOther: 0 },
      wonAt: { preflop: 0, flop: 0, turn: 0, river: 0, showdown: 0 },
    },
  };
}
