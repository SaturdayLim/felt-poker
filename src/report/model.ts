/* Trial report model: every figure the trial report pages show, worked out from a Nightcap backup with the
   app's own logic (src/lib). The backup holds the group's game data and stays in trial/ (git-ignored).
   All amounts are chips; the report never converts to money. */
import type { Card, Game, HandLog, ID, Player, StreetName } from '../types';
import { playerSummary, type PlayerSummary } from '../lib/stats';
import { estimateStacks, exactStacks } from '../lib/stacks';
import { STREETS, STREET_CARDS, rowOrder, bountyPay, bountyTotal, contributions, defaultAct, inAtEnd, replayStreet, pfr, takedown, vpip, wentToShowdown } from '../lib/hand';
import { RANKS, bestHand } from '../lib/cards';
import { dateLabel, gameTitle, money, runningMs } from '../lib/format';
import { gameRules } from '../lib/rules';
import type { Settings } from '../types';
import { clashLevel, countedPairs, effectivePairs, privateOf, shownPair } from '../lib/clash';
import { wonAt } from '../lib/style';
import { playerResult, suggestTransfers } from '../lib/calc';
import { lineText, positionMap, positionsFor, streetLines, type LogAct, type LogLine } from './logText';

/** A table position: BTN, SB, BB, then UTG, UTG+1 and so on round to HJ and CO (see `positionNames`). */
export type Pos = string;
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
  /** The player's own private cards (recorded apart from the table), with how each hand went. Locked.
      `net` is the chips won (above 0) or lost (below 0) and `street` where the hand was decided. `lvl` marks a card
      that conflicts: red = the board or a card shown at the table, blue = another player's entry. */
  mine: { n: number; cards: Card[]; rank: string; shownAtTable: boolean; won: boolean; got: number; net: number; street: string; lvl: 'red' | 'blue' | null }[];
  /** Pots won, and how many of them were takedowns (no showdown). */
  takedowns: number;
  /** Starting-hand record (locked): for each hand type like "AKs", the pre-flop actions taken with it: folds, calls
      (a free check counts as a call) and raises. */
  range: Record<string, { fold: number; call: number; raise: number }>;
  /** Hands dealt in with the cards known (shown at the table, or entered and not red), and the hands left out for
      no known cards (none entered, or a red entry). `known` + `unknown` = hands dealt in. */
  known: number; unknown: number;
  /** Short list of ways a hand could have been played differently, from the logged action and position. A guide. */
  advice: { n: number; text: string }[];
  /** The action log of every hand the player was dealt into (locked). */
  logs: HandView[];
  /** Cards shown: chips won (part of the pot when split), or the pot lost. */
  shown: { n: number; cards: Card[]; rank: string; won: boolean; pot: number; got: number; split: boolean }[];
  /** Result against par (chips bought so far) at the start and after each hand; the last point uses the
      final count, so it matches the result. A rebuy does not move the line. */
  dev: number[];
  /** Buy-ins after the start: the hand they came after, and the chips. */
  rebuys: { after: number; amount: number; buyins: number }[];
  /** Highest and lowest point against par, and the hand after which each came. */
  high: number; highAt: number; low: number; lowAt: number;
  notes: Note[];
  /** Only the public part is in the shared report until the player's code unlocks the rest. */
  locked?: boolean;
}
/** One street of the action log: the board so far and one line per action. */
export interface LogStreet {
  street: string; cards: Card[]; lines: string[];
  /** The same lines in pieces: a position or name carries the colour index of its player (`LOG_COLORS`). */
  segs: LogLine[];
}
/** One hand's full action log, as text: every action in time order, the cards shown and the result. */
export interface HandView {
  n: number; pot: number; button: string; streets: LogStreet[];
  shown: { p: string; cards: Card[]; rank: string }[]; result: string; note?: string;
}
export interface TrialModel {
  game: string; date: string;
  /** Image header: "Potato Day (1 Nov 2026)" and "(1/2 * S$0.10 Cash)". */
  title: string; sub: string;
  /** Every position of the table, button first, then clockwise: BTN, SB, BB, UTG ... HJ, CO. */
  positions: Pos[];
  /** The seats the game had: the most seats used, never fewer than the players. */
  seatsN: number;
  /** The full game log, only when the host ticked it for the report. */
  log?: HandView[];
  hands: number; minutes: number; medianSec: number; players4: number;
  pots: { n: number; pot: number; winners: string[]; street: string }[];
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

/** Buy-ins between the same two hands are one rebuy set: sum them (owner rule, 10 Nov 2026). */
export function mergeRebuys(list: { after: number; amount: number }[], buyIn: number): { after: number; amount: number; buyins: number }[] {
  const out: { after: number; amount: number; buyins: number }[] = [];
  for (const r of list) {
    const last = out[out.length - 1];
    if (last && last.after === r.after) last.amount += r.amount;
    else out.push({ after: r.after, amount: r.amount, buyins: 0 });
  }
  for (const r of out) r.buyins = buyinsOf(r.amount, buyIn);
  return out;
}

/** A rebuy in buy-ins: its own amount over the game's buy-in, one decimal only when not a whole number (400 in a 200 game = 2). */
export function buyinsOf(amount: number, buyIn: number): number {
  if (!buyIn) return 1;
  const v = amount / buyIn;
  return Number.isInteger(v) ? v : Math.round(v * 10) / 10;
}

const ratio = (a: number, b: number) => (b ? a / b : 0);

/** Rough targets for solid play by players dealt in (short-handed strategy guides). A guide, not exact. */
export function targetFor(n: number): TrialModel['target'] {
  const v: Record<number, number> = { 2: 65, 3: 45, 4: 34, 5: 29, 6: 25 };
  return { vpip: v[Math.min(6, Math.max(2, n))] ?? 21, af: 2.5 };
}

/** Position names for a table of `n` seats, button first: BTN, SB, BB, then the rest (see `positionsFor`). */
export function positionNames(n: number): Pos[] {
  const names = positionsFor(Math.max(3, n));
  return ['BTN', ...names.slice(0, -1)];
}

/** A hand type as the grid shows it: AA, AKs (suited), AKo (offsuit), high card first. */
export function handClass(cards: Card[]): string {
  const [a, b] = cards;
  const ia = RANKS.indexOf(a[0]), ib = RANKS.indexOf(b[0]);
  const [hi, lo] = ia <= ib ? [a, b] : [b, a];
  return hi[0] === lo[0] ? `${hi[0]}${lo[0]}` : `${hi[0]}${lo[0]}${hi[1] === lo[1] ? 's' : 'o'}`;
}

const STREET_LABEL: Record<StreetName | 'showdown', string> = { preflop: 'Pre-flop', flop: 'Flop', turn: 'Turn', river: 'River', showdown: 'Showdown' };

/** The street a player's result was decided on. A loser who folded is out on the street they folded, even when the hand went to showdown. */
export function resultStreet(L: HandLog, p: ID, net: number): string {
  if (net < 0) {
    const folded = STREETS.find((st) => L.streets[st]?.folded.includes(p));
    if (folded) return STREET_LABEL[folded];
  }
  return STREET_LABEL[wonAt(L)];
}
const FOLD_PREMIUM = new Set(['AA', 'KK', 'QQ', 'JJ', 'AKs', 'AKo']);
/** Weakest starting hands: offsuit, 9 high or lower, and at least 4 ranks between the two cards. */
const trash = (c: string) => c.endsWith('o') && RANKS.indexOf(c[0]) >= 4 && RANKS.indexOf(c[1]) - RANKS.indexOf(c[0]) >= 4;

/** The action log of one hand as text: every action in time order, by street. */
export function handView(g: Game, h: Game['hands'][number], name: (id: ID) => string): HandView {
  const L = h.log as HandLog;
  const streets: LogStreet[] = [];
  const pos = positionMap(rowOrder(g, L), L.button);
  const named = new Set<string>(); // players already named in this hand's log
  const stacks = exactStacks(g, h.n); // the same stacks the host and the viewers replay with
  for (const st of STREETS) {
    const s = L.streets[st];
    if (!s) continue;
    let segs: LogLine[] = [];
    if (L.mode === 'bets' && s.acts) {
      const rp = replayStreet(g, L, st, stacks);
      const acts: LogAct[] = [];
      for (let r = 0; r < rp.cols; r++) {
        for (const p of rp.order) {
          const c = rp.cells[p]?.[r];
          if (!c || c.post || !c.needed) continue;
          const a = c.act ?? (c.implied ? (s.partial ? { k: 'call' as const } : defaultAct(c.toCall)) : null);
          if (!a) continue;
          const dark = !!(a as { dark?: boolean }).dark;
          const who = { pid: p, pos: pos[p] ?? '', name: name(p), c: g.playerIds.indexOf(p) < 0 ? undefined : g.playerIds.indexOf(p) };
          if (a.k === 'fold') acts.push({ ...who, k: 'fold', amount: 0 });
          else if (st === 'preflop' && rp.straddles.includes(p) && c.canStraddle && c.act) acts.push({ ...who, k: 'straddle', amount: c.amount });
          else if (a.k === 'allin' && c.amount <= c.high && c.high > 0) acts.push({ ...who, k: 'call', amount: c.amount, dark, allin: true, est: !!(a as { est?: boolean }).est });
          else if (a.k === 'allin') acts.push({ ...who, k: 'allin', amount: c.amount, dark, est: !!(a as { est?: boolean }).est });
          else if (c.amount > c.high) acts.push({ ...who, k: c.high > 0 ? 'raise' : 'bet', amount: c.amount, dark });
          else if (c.toCall > 0) acts.push({ ...who, k: 'call', amount: c.amount, dark, allin: c.amount < c.high });
          else acts.push({ ...who, k: 'check', amount: 0, dark });
        }
      }
      segs = streetLines(acts, inAtEnd(L, st).length, named);
    } else {
      // an older log or a pot count: the wagers and the folds, without the order
      const old: string[] = [];
      for (const p of L.dealt) if (s.bets[p]) old.push(`${name(p)} has ${s.bets[p]} in`);
      for (const p of s.folded) old.push(`${name(p)} folds`);
      if (s.pot !== undefined) old.push(`Pot counted: ${s.pot}`);
      segs = old.map((t) => [{ t }]);
    }
    streets.push({ street: STREET_LABEL[st], cards: h.board.slice(0, STREET_CARDS[st]), lines: segs.map(lineText), segs });
  }
  const dec = STREET_LABEL[wonAt(L)];
  const result = h.winners.length
    ? `${h.winners.map((w) => `${name(w.playerId)} wins ${w.amount}`).join(', ')} (${dec})`
    : 'No winner recorded';
  return {
    n: h.n, pot: h.pot, button: L.button ? name(L.button) : '', streets, result, note: h.note,
    shown: h.shown.filter((x) => x.cards.length).map((x) => ({ p: name(x.playerId), cards: x.cards, rank: h.board.length === 5 && x.cards.length === 2 ? bestHand([...x.cards, ...h.board])?.name ?? '' : '' })),
  };
}

export function buildModel(backup: { players: Player[]; games: Game[]; settings?: Settings }, gameIndex = 0, opts: { gameLog?: boolean } = {}): TrialModel {
  const name = (id: ID) => backup.players.find((p) => p.id === id)?.name ?? id;
  const g = backup.games[gameIndex];
  const hands = g.hands.filter((h) => !h.missed && h.log);
  const noOut = { ...g, cashOuts: [] };
  const finalEst = estimateStacks(noOut);
  // every seat the game had: the highest seat number used, never fewer than the players
  const seatsN = Math.max(4, g.playerIds.length, ...Object.values(g.seats ?? {}));
  const positions = positionNames(seatsN);
  const pos = (h: (typeof hands)[number], p: ID): Pos => positionMap(rowOrder(g, h.log!), h.log!.button)[p] ?? 'BB';
  const views = new Map<number, HandView>(hands.map((h) => [h.n, handView(g, h, name)]));
  const zero = (): Record<Pos, number> => Object.fromEntries(positions.map((k) => [k, 0]));

  const players: TrialPlayer[] = g.playerIds.map((p) => {
    const s = playerSummary([g], p);
    const r = playerResult(g, p);
    const byPos = zero();
    const byPosN = zero();
    const shown: TrialPlayer['shown'] = [];
    const mine: TrialPlayer['mine'] = [];
    const range: TrialPlayer['range'] = {};
    const advice: TrialPlayer['advice'] = [];
    const logs: HandView[] = [];
    let known = 0, unknown = 0, takedowns = 0;
    const checkCards = backup.settings?.checkCards !== false;
    for (const h of hands) {
      const L = h.log!;
      const put = contributions(g, L, L.button)[p] ?? 0;
      const got = (h.winners.find((w) => w.playerId === p)?.amount ?? 0) + (h.returned?.[p] ?? 0);
      const net = got - put;
      const ps = pos(h, p);
      byPos[ps] = (byPos[ps] ?? 0) + net; byPosN[ps] = (byPosN[ps] ?? 0) + 1;
      const dealt = L.dealt.includes(p);
      if (dealt && views.has(h.n)) logs.push(views.get(h.n)!);
      if (!h.excluded && h.winners.some((w) => w.playerId === p) && takedown(h)) takedowns++;
      // Your Cards lists every full entry, red ones too, each with its mark. The analysis leaves red entries out.
      const own = effectivePairs(h)[p];
      if (own) mine.push({
        n: h.n, cards: own, lvl: clashLevel(h, p), rank: h.board.length === 5 ? bestHand([...own, ...h.board])?.name ?? '' : '',
        shownAtTable: h.shown.some((x) => x.playerId === p), won: h.winners.some((w) => w.playerId === p),
        got: h.winners.find((w) => w.playerId === p)?.amount ?? 0, net: Math.round(net), street: resultStreet(L, p, net),
      });
      // known cards: a pair entered by the player (a red one is left out), else the pair shown at the table
      const cards = countedPairs(h, checkCards)[p] ?? (privateOf(h)[p] ? undefined : shownPair(h, p));
      const pre = L.streets.preflop;
      if (dealt && !cards) unknown++;
      if (dealt && cards) {
        known++;
        const cl = handClass(cards);
        const played = vpip(g, L, p, L.button);
        const cell = (range[cl] ??= { fold: 0, call: 0, raise: 0 });
        if (pfr(L, p)) cell.raise++; else if (played || !pre?.folded.includes(p)) cell.call++; else cell.fold++;
        if (!played && pre?.folded.includes(p) && FOLD_PREMIUM.has(cl) && pre.raisers.length <= 1)
          advice.push({ n: h.n, text: `You folded ${cl} before the flop against ${pre.raisers.length ? 'one raise' : 'no raise'}. A hand this strong is usually worth a call or a raise.` });
        else if (played && trash(cl) && ps !== 'BB')
          advice.push({ n: h.n, text: `You played ${cl} from ${ps}. A hand this weak is usually a fold, most of all out of position.` });
      }
      // from the action alone: a limp followed by a later fold, and a fold when a check was free
      if (dealt && pre && L.mode === 'bets' && !pre.raisers.length && pre.bets[p] === g.bb && ps !== 'BB' && ps !== 'SB'
        && STREETS.slice(1).some((st) => L.streets[st]?.folded.includes(p)))
        advice.push({ n: h.n, text: `You limped in from ${ps} and folded later. A raise or a fold before the flop gives you a clearer plan.` });
      if (dealt && L.mode === 'bets') {
        for (const st of STREETS) {
          if (!L.streets[st]?.acts) continue;
          const rp = replayStreet(g, L, st);
          const free = (rp.cells[p] ?? []).some((c) => c.needed && !c.post && c.act?.k === 'fold' && !c.act.d && c.toCall === 0);
          if (free) { advice.push({ n: h.n, text: `You folded on the ${STREET_LABEL[st].toLowerCase()} when a check was free. A check keeps your hand alive at no cost.` }); break; }
        }
      }
      const sh = h.shown.find((x) => x.playerId === p);
      if (sh) shown.push({ n: h.n, cards: sh.cards, rank: h.board.length === 5 ? bestHand([...sh.cards, ...h.board])?.name ?? '' : '', won: h.winners.some((w) => w.playerId === p), pot: h.pot, got: h.winners.find((w) => w.playerId === p)?.amount ?? 0, split: h.winners.length > 1 });
    }
    // par = chips bought so far; a buy-in after the start is a rebuy, placed after the last hand that ended before it
    const buys = g.buyIns.filter((b) => b.playerId === p).sort((a, b) => a.at - b.at);
    const start = buys.length ? buys[0].at : g.startedAt;
    const boughtBy = (t: number) => buys.filter((b) => b.at <= t).reduce((a, b) => a + b.amount, 0);
    const rebuys = mergeRebuys(buys.filter((b) => b.at > start + 60000).map((b) => ({
      after: hands.filter((h) => (h.endedAt ?? h.at) <= b.at).length, amount: b.amount,
    })), g.buyIns[0]?.amount ?? 0);
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
      byPos, byPosN, shown, mine, takedowns, range, known, unknown, advice: advice.slice(0, 8), logs, dev, rebuys, high, highAt: dev.indexOf(high), low, lowAt: dev.indexOf(low), notes: [],
    };
  });
  const dealtN = Math.round(hands.reduce((a, h) => a + h.log!.dealt.length, 0) / (hands.length || 1));
  const target = targetFor(dealtN);
  for (const x of players) x.notes = notesFor(x, target, dealtN);

  const reach = { preflop: hands.length, flop: 0, turn: 0, river: 0, showdown: 0 };
  for (const h of hands) {
    // a showdown means every street was dealt, even when an all-in left no betting on it
    const sd = wentToShowdown(h.log!);
    if (h.log!.streets.flop || sd) reach.flop++;
    if (h.log!.streets.turn || sd) reach.turn++;
    if (h.log!.streets.river || sd) reach.river++;
    if (sd) reach.showdown++;
  }
  const secs = hands.map((h) => Math.round(((h.endedAt ?? h.at) - h.at) / 1000)).sort((a, b) => a - b);
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
    game: g.name, date: dateLabel(g.startedAt),
    title: gameTitle(g),
    sub: `(${g.sb}/${g.bb} * ${money(g.unitValue, g.currency)} ${g.type === 'tournament' ? 'Tournament' : 'Cash'})`,
    positions, seatsN, log: opts.gameLog ? [...views.values()] : undefined,
    hands: hands.length, minutes: Math.round((runningMs(g) ?? 0) / 60000),
    medianSec: secs[Math.floor(secs.length / 2)] ?? 0, players4: dealtN,
    pots: hands.map((h) => ({ n: h.n, pot: h.pot, winners: h.winners.map((w) => name(w.playerId)), street: STREET_LABEL[wonAt(h.log!)] })),
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
export function rulesList(g: Game, s?: Settings): { label: string; value: string; tip?: string }[] {
  const r = s || g.rules ? gameRules(g, s as Settings) : undefined;
  const out: { label: string; value: string; tip?: string }[] = [
    { label: 'Game', value: g.type === 'cash' ? 'Cash' : 'Tournament' },
    { label: 'Blinds', value: `${g.sb}/${g.bb} chips` },
    { label: 'Buy-in', value: `${g.buyIns[0]?.amount ?? 0} chips` },
  ];
  if (!r) return out;
  out.push({ label: 'Minimum raise', value: MIN_RAISE[r.minRaise], tip: 'minRaise' });
  const b = r.bounty27;
  if (!b.on) out.push({ label: '7-2 bounty', value: 'Off' });
  else out.push(
    { label: '7-2 win', value: WIN_RULE[b.win], tip: 'bountyWin' },
    { label: '7-2 hand', value: b.suited ? 'Suited allowed' : 'Offsuit only', tip: 'bountyHand' },
    { label: '7-2 amount', value: `${b.amount} chips per player`, tip: 'bountyAmount' },
  );
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
  { title: 'Diamond Hands', best: 'Most showdowns seen', min: 'At least 5 showdowns' },
  { title: 'King Of The Hill', best: 'Most pots won', min: 'At least 5 pots' },
  { title: 'Leprechaun', best: 'Biggest pot', min: 'At least 50 BB' },
  { title: 'Apollo', best: 'Most consecutive pots won', min: 'At least 3 pots' },
  { title: 'Ice Cold', best: 'Lowest share of pots won relative to aggression', min: 'Under 20% won' },
  { title: 'Comeback', best: 'Biggest climb, from at least 100 BB down, to a finish above par', min: 'At least 100 BB down, then a finish above par' },
  { title: 'Unrelenting', best: 'Highest c-bet rate', min: 'At least 5 c-bet chances' },
  { title: 'The Rock', best: 'Lowest VPIP (fewest hands played)', min: 'VPIP under 40%' },
  { title: 'Bounty Hunter', best: 'Most 7-2 bounties won', min: 'At least 1 bounty' },
  { title: 'Iron Defender', best: 'Highest BB defense rate', min: 'At least 5 raises faced in the BB, more than 60% defended' },
];

/** "Eve: 11 pots won". A tie lists each name. */
export function kingCaption(won: Pick<TrialPlayer, 'name' | 's'>[]): string {
  return won.map((p) => `${p.name}: ${p.s.handsWon} ${p.s.handsWon === 1 ? 'pot' : 'pots'} won`).join('. ');
}

/** Table awards from AWARD_LIST, each with one line of the figures behind it, the player name first. */
export function awardsFor(ps: TrialPlayer[], big: TrialModel['biggest'][number] | undefined, bounties: TrialModel['bounties'], bb: number, streaks: Record<ID, number>): Award[] {
  const top = (k: (p: TrialPlayer) => number, ok: (p: TrialPlayer) => boolean) => {
    const pool = ps.filter(ok);
    if (!pool.length) return [];
    const best = Math.max(...pool.map(k));
    return pool.filter((p) => k(p) === best);
  };
  const ids = (xs: TrialPlayer[]) => xs.map((p) => p.id);
  const out: Award[] = [];
  const sd = top((p) => p.s.wtsd, (p) => p.s.wtsd >= 5);
  if (sd.length) out.push({ title: 'Diamond Hands', to: ids(sd), detail: `${sd[0].name}: ${sd[0].s.wtsd} showdowns participated` });
  const won = top((p) => p.s.handsWon, (p) => p.s.handsWon >= 5);
  if (won.length) out.push({ title: 'King Of The Hill', to: ids(won), detail: kingCaption(won) });
  if (big && big.pot >= 50 * bb) {
    const who = ps.filter((p) => big.winners.includes(p.name));
    out.push({ title: 'Leprechaun', to: ids(who), detail: `${who[0]?.name ?? big.winners[0]}: ${big.pot} chips won on hand #${big.n}` });
  }
  const hot = top((p) => streaks[p.id] ?? 0, (p) => (streaks[p.id] ?? 0) >= 3);
  if (hot.length) out.push({ title: 'Apollo', to: ids(hot), detail: `${hot[0].name}: ${streaks[hot[0].id]} consecutive wins` });
  const cold = top((p) => -ratio(p.s.handsWon, p.s.style.betsRaises), (p) => p.s.style.betsRaises > 0 && p.s.handsWon / p.s.style.betsRaises < 0.2);
  if (cold.length) out.push({ title: 'Ice Cold', to: ids(cold), detail: `${cold[0].name}: ${cold[0].s.handsWon}/${cold[0].s.style.betsRaises} successful aggressive pots won` });
  const back = top((p) => p.net - p.low, (p) => p.net > 0 && p.low <= -100 * bb && p.lowAt < p.dev.length - 1);
  if (back.length) out.push({ title: 'Comeback', to: ids(back), detail: `${back[0].name}: Climbed ${back[0].net - back[0].low} from ${back[0].low} (hand #${back[0].lowAt}) to finish ${back[0].net > 0 ? '+' : ''}${back[0].net}` });
  const cb = top((p) => ratio(p.s.style.cbet, p.s.style.cbetOpp), (p) => p.s.style.cbetOpp >= 5);
  if (cb.length) out.push({ title: 'Unrelenting', to: ids(cb), detail: `${cb[0].name}: ${cb[0].s.style.cbet}/${cb[0].s.style.cbetOpp} C-bet after pre-flop aggression` });
  const rock = top((p) => -p.vpip, (p) => p.s.logged > 0 && p.vpip < 40);
  if (rock.length) out.push({ title: 'The Rock', to: ids(rock), detail: `${rock[0].name}: Participated in ${rock[0].s.vpip}/${rock[0].s.logged} hands` });
  const bountyN = (p: TrialPlayer) => bounties.filter((b) => b.to === p.name).length;
  const hunt = top(bountyN, (p) => bountyN(p) >= 1);
  if (hunt.length) out.push({ title: 'Bounty Hunter', to: ids(hunt), detail: `${hunt[0].name}: ${bountyN(hunt[0])} ${bountyN(hunt[0]) === 1 ? 'bounty' : 'bounties'} collected (${bounties.filter((b) => b.to === hunt[0].name).map((b, i) => (i === 0 ? `#${b.n}` : String(b.n))).join(', ')})` });
  const def = top((p) => ratio(p.s.style.bbDefend, p.s.style.bbDefendOpp), (p) => p.s.style.bbDefendOpp >= 5 && p.s.style.bbDefend / p.s.style.bbDefendOpp > 0.6);
  if (def.length) out.push({ title: 'Iron Defender', to: ids(def), detail: `${def[0].name}: ${def[0].s.style.bbDefend}/${def[0].s.style.bbDefendOpp} BB defended against a raise` });
  return out;
}

/** The part of a player everyone sees in the shared report: the figures behind Game Summary and Compare.
    Strengths, weaknesses, seats, cards shown and chip sources stay in the player's locked box. */
export function publicPlayer(p: TrialPlayer): TrialPlayer {
  return {
    ...p, notes: [], shown: [], mine: [], range: {}, known: 0, unknown: 0, advice: [], logs: [], byPos: {}, byPosN: {}, sdNet: 0, foldNet: 0, locked: true,
    s: {
      ...p.s, history: [],
      flow: { winFold: 0, winShowdown: 0, winOther: 0, lossFold: 0, lossShowdown: 0, lossOther: 0 },
      wonAt: { preflop: 0, flop: 0, turn: 0, river: 0, showdown: 0 },
    },
  };
}
