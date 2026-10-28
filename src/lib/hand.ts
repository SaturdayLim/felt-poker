/* Street-by-street hand logic. Pure functions, no React, so it can be tested.
   Two entry modes:
   - bets:  each player's wager per street (tap = call, typed number = raise or all-in for less)
   - count: the pot total counted at the end of each street; wagers are estimated */
import type { Act, Card, Game, HandLog, ID, Pot, StreetLog, StreetName, Winner } from '../types';
import { buildPots, fromSmallBlind, positionSplit, round2 } from './calc';
import { bestHand } from './cards';

export const STREETS: StreetName[] = ['preflop', 'flop', 'turn', 'river'];
export const STREET_CARDS: Record<StreetName, number> = { preflop: 0, flop: 3, turn: 4, river: 5 };

/** Seat order of the players dealt in, starting from the small blind. */
export function actingOrder(g: Game, dealt: ID[], button?: ID): ID[] {
  return fromSmallBlind(g, button, dealt);
}

export function blinds(g: Game, dealt: ID[], button?: ID): Record<ID, number> {
  const o = actingOrder(g, dealt, button);
  if (o.length < 2) return {};
  // heads-up: the button posts the small blind
  if (o.length === 2) return { [button && dealt.includes(button) ? button : o[0]]: g.sb, [o.find((p) => p !== button) ?? o[1]]: g.bb };
  return { [o[0]]: g.sb, [o[1]]: g.bb };
}

/** Order players act on a street: preflop starts after the big blind, later streets start at the small blind. */
export function streetOrder(g: Game, log: HandLog, street: StreetName): ID[] {
  const o = actingOrder(g, log.dealt, log.button);
  if (street !== 'preflop' || o.length < 3) return o;
  return [...o.slice(2), ...o.slice(0, 2)];
}

const emptyStreet = (): StreetLog => ({ bets: {}, prev: {}, typed: {}, folded: [], raisers: [] });

/** Players still contesting the pot when a street starts. */
export function inAtStart(log: HandLog, street: StreetName): ID[] {
  const i = STREETS.indexOf(street);
  const out = new Set<ID>();
  for (const s of STREETS.slice(0, i)) for (const p of log.streets[s]?.folded ?? []) out.add(p);
  return log.dealt.filter((p) => !out.has(p));
}

export function inAtEnd(log: HandLog, street: StreetName): ID[] {
  const folded = new Set(log.streets[street]?.folded ?? []);
  return inAtStart(log, street).filter((p) => !folded.has(p));
}

/** Players who can still bet on a street (in, and not all-in before it). */
export function actors(log: HandLog, street: StreetName): ID[] {
  const allInBefore = new Set(log.allInAt ? Object.entries(log.allInAt).filter(([, s]) => STREETS.indexOf(s) < STREETS.indexOf(street)).map(([p]) => p) : []);
  return inAtStart(log, street).filter((p) => !allInBefore.has(p));
}

export function highBet(s: StreetLog | undefined): number {
  return Math.max(0, ...Object.values(s?.bets ?? {}));
}

/** Open a street: everyone still in is selected. Preflop posts the blinds and has everyone call the big blind. */
export function openStreet(g: Game, log: HandLog, street: StreetName, stacks?: Record<ID, number>): HandLog {
  const button = log.button;
  const s = emptyStreet();
  const who = actors(log, street);
  if (street === 'preflop') {
    const bl = blinds(g, log.dealt, button);
    const call = Math.max(0, ...Object.values(bl));
    for (const p of who) {
      s.prev[p] = bl[p] ?? 0;
      s.bets[p] = log.mode === 'bets' ? cap(log, p, call, stacks, 'preflop') : 0;
    }
  } else {
    for (const p of who) { s.prev[p] = 0; s.bets[p] = 0; }
  }
  return { ...log, streets: { ...log.streets, [street]: s } };
}

/** Chips a player has left for this street (estimate). Undefined = unknown, no cap. */
function room(log: HandLog, p: ID, stacks: Record<ID, number> | undefined, street: StreetName): number | undefined {
  if (!stacks || stacks[p] === undefined) return undefined;
  let spent = 0;
  for (const s of STREETS) { if (s === street) break; spent += log.streets[s]?.bets[p] ?? 0; }
  return Math.max(0, stacks[p] - spent);
}

function cap(log: HandLog, p: ID, amount: number, stacks: Record<ID, number> | undefined, street: StreetName): number {
  const r = room(log, p, stacks, street);
  return r === undefined ? amount : Math.min(amount, r);
}

function markAllIn(log: HandLog, p: ID, street: StreetName): HandLog {
  return { ...log, allInAt: { ...(log.allInAt ?? {}), [p]: street } };
}
function clearAllIn(log: HandLog, p: ID): HandLog {
  const a = { ...(log.allInAt ?? {}) };
  delete a[p];
  return { ...log, allInAt: a };
}

/** Tap a player's box: folds a selected player (their wager so far stays in the pot), or brings a folded player back in with a call. */
export function tapPlayer(log: HandLog, street: StreetName, p: ID, stacks?: Record<ID, number>): HandLog {
  const s = structuredClone(log.streets[street] ?? emptyStreet());
  let next = log;
  if (s.folded.includes(p)) {
    s.folded = s.folded.filter((x) => x !== p);
    if (log.mode === 'bets') {
      const call = highBet(s);
      s.prev[p] = s.bets[p] ?? 0;
      s.bets[p] = cap(log, p, call, stacks, street);
      if (s.bets[p] < call || room(log, p, stacks, street) === s.bets[p]) next = markAllIn(next, p, street);
    }
  } else {
    s.folded = [...s.folded, p];
    if (log.mode === 'bets' && !s.typed[p]) s.bets[p] = s.prev[p] ?? 0;
    s.raisers = s.raisers.filter((x) => x !== p);
    next = clearAllIn(next, p);
  }
  return { ...next, streets: { ...next.streets, [street]: s } };
}

/** Type a wager. More than the high bet = raise (everyone still selected calls it, up to their stack).
    Less than the high bet while still in = all-in for less. 0 on a folded player clears their wager. */
export function typeBet(g: Game, log: HandLog, street: StreetName, p: ID, amount: number, stacks?: Record<ID, number>): HandLog {
  const s = structuredClone(log.streets[street] ?? emptyStreet());
  const before = highBet({ ...s, bets: Object.fromEntries(Object.entries(s.bets).filter(([q]) => q !== p)) });
  let next = log;
  const myRoom = room(log, p, stacks, street);
  if (myRoom !== undefined && amount > myRoom) amount = myRoom; // cannot bet more than they have
  s.bets[p] = amount;
  s.prev[p] = amount;
  s.typed[p] = true;
  if (!s.folded.includes(p)) {
    const r = room(log, p, stacks, street);
    if (r !== undefined && amount >= r) next = markAllIn(next, p, street);
    else next = clearAllIn(next, p);
    if (amount > before) {
      // preflop, only a wager above the big blind is a raise (the big blind itself is a forced bet)
      const isRaise = street !== 'preflop' || amount > Math.max(g.bb, before);
      if (isRaise && !s.raisers.includes(p)) s.raisers = [...s.raisers, p];
      // players who acted before the raiser and are still in had matched the earlier bet;
      // players after the raiser have not acted yet, so a fold keeps only what they had confirmed
      const order = streetOrder(g, next, street);
      const pi = order.indexOf(p);
      for (const q of actors(next, street)) {
        if (q === p || s.folded.includes(q) || next.allInAt?.[q]) continue;
        if ((s.bets[q] ?? 0) < amount) {
          if (order.indexOf(q) < pi) s.prev[q] = s.bets[q] ?? 0;
          const c = cap(next, q, amount, stacks, street);
          s.bets[q] = c;
          if (c < amount || room(next, q, stacks, street) === c) next = markAllIn(next, q, street);
        }
      }
    } else if (amount < before) {
      next = markAllIn(next, p, street);
    }
  }
  return { ...next, streets: { ...next.streets, [street]: s } };
}

/** Toggle all-in by hand (stack estimates can be off). */
export function toggleAllIn(log: HandLog, street: StreetName, p: ID): HandLog {
  return log.allInAt?.[p] ? clearAllIn(log, p) : markAllIn(log, p, street);
}

/** Count mode: mark or unmark a preflop raiser (for PFR). */
export function toggleRaiser(log: HandLog, street: StreetName, p: ID): HandLog {
  const s = structuredClone(log.streets[street] ?? emptyStreet());
  s.raisers = s.raisers.includes(p) ? s.raisers.filter((x) => x !== p) : [...s.raisers, p];
  return { ...log, streets: { ...log.streets, [street]: s } };
}

export function setStreetPot(log: HandLog, street: StreetName, pot: number | undefined): HandLog {
  const s = structuredClone(log.streets[street] ?? emptyStreet());
  s.pot = pot;
  return { ...log, streets: { ...log.streets, [street]: s } };
}

/** Is the betting over before the river? (fewer than 2 players can still bet, and someone is all-in) */
export function actionClosed(log: HandLog, street: StreetName): boolean {
  const live = inAtEnd(log, street);
  if (live.length < 2) return true;
  const canBet = live.filter((p) => !log.allInAt?.[p]);
  return canBet.length <= 1 && live.some((p) => log.allInAt?.[p]);
}

/** Wager per player per street. Bet mode = as entered. Count mode = each street's pot increase shared
    by the players still in at its end; players who folded preflop put in their blind. */
export function contributions(g: Game, log: HandLog, button?: ID, upTo?: StreetName): Record<ID, number> {
  const total: Record<ID, number> = Object.fromEntries(log.dealt.map((p) => [p, 0]));
  const last = upTo ? STREETS.indexOf(upTo) : 3;
  let prevPot = 0;
  for (const st of STREETS.slice(0, last + 1)) {
    const s = log.streets[st];
    if (!s) break;
    if (log.mode === 'bets') {
      for (const [p, v] of Object.entries(s.bets)) total[p] = round2((total[p] ?? 0) + v);
    } else {
      if (s.pot === undefined) break;
      const delta = Math.max(0, s.pot - prevPot);
      prevPot = s.pot;
      const live = inAtEnd(log, st).filter((p) => !(log.allInAt?.[p] && STREETS.indexOf(log.allInAt[p]) < STREETS.indexOf(st)));
      let dead = 0;
      if (st === 'preflop') {
        const bl = blinds(g, log.dealt, button);
        for (const p of s.folded) { total[p] = round2((total[p] ?? 0) + (bl[p] ?? 0)); dead += bl[p] ?? 0; }
      }
      const share = live.length ? (delta - dead) / live.length : 0;
      for (const p of live) total[p] = round2((total[p] ?? 0) + share);
    }
  }
  return total;
}

export function potTotal(g: Game, log: HandLog, button?: ID, upTo?: StreetName): number {
  if (log.mode === 'count') {
    const st = upTo ?? lastStreet(log);
    for (let i = STREETS.indexOf(st); i >= 0; i--) { const v = log.streets[STREETS[i]]?.pot; if (v !== undefined) return v; }
    return 0;
  }
  return round2(Object.values(contributions(g, log, button, upTo)).reduce((a, b) => a + b, 0));
}

export function lastStreet(log: HandLog): StreetName {
  let last: StreetName = 'preflop';
  for (const s of STREETS) if (log.streets[s]) last = s;
  return last;
}

/** Players still in at the end of the hand. */
export function finalists(log: HandLog): ID[] {
  return inAtEnd(log, lastStreet(log));
}

/** Pots from wagers. A wager nobody could match comes back to its owner. */
export function potsAndReturns(contrib: Record<ID, number>, live: ID[]): { pots: { amount: number; eligible: ID[] }[]; returned: Record<ID, number> } {
  const returned: Record<ID, number> = {};
  const c = { ...contrib };
  if (live.length >= 2) {
    const sorted = [...live].sort((a, b) => (c[b] ?? 0) - (c[a] ?? 0));
    const top = c[sorted[0]] ?? 0, second = c[sorted[1]] ?? 0;
    if (top > second) { returned[sorted[0]] = round2(top - second); c[sorted[0]] = second; }
  }
  const entries = Object.keys(c).map((p) => ({ playerId: p, putIn: c[p] ?? 0, folded: !live.includes(p) }));
  if (live.length === 1) {
    const amount = round2(entries.reduce((a, e) => a + e.putIn, 0));
    return { pots: amount > 0 ? [{ amount, eligible: live }] : [], returned };
  }
  return { pots: buildPots(entries), returned };
}

/** Split an amount into n runs, rounded to the small blind; leftover chips go to run 1. */
export function splitRuns(g: Game, amount: number, runs: number): number[] {
  if (runs <= 1) return [amount];
  const step = g.sb > 0 ? g.sb : 1;
  const base = Math.floor(amount / step / runs) * step;
  const out = Array(runs).fill(base);
  out[0] = round2(amount - base * (runs - 1));
  return out;
}

export interface Resolution {
  pots: (Pot & { runs: { winners: ID[] }[]; manual: boolean })[];
  returned: Record<ID, number>;
  winners: Winner[];
  /** True when a pot has no shown hand to decide it and no manual pick. */
  missing: boolean;
}

/** Decide every pot on every run from the shown cards, then apply manual picks (they win every run of that pot). */
export function resolve(g: Game, log: HandLog, board: Card[], button: ID | undefined, manual: Record<number, ID[]>): Resolution {
  const contrib = contributions(g, log, button);
  const live = finalists(log);
  let { pots, returned } = potsAndReturns(contrib, live);
  if (log.mode === 'count' && pots.length === 1) pots = [{ amount: potTotal(g, log, button), eligible: live }];
  const runs = Math.max(1, log.runs ?? 1);
  const common = board.slice(0, log.runFrom ?? board.length);
  const runBoards = runs > 1 ? Array.from({ length: runs }, (_, r) => [...common, ...(log.runCards?.[r] ?? [])]) : [board];
  const sums: Record<ID, number> = {};
  let missing = false;
  const out = pots.map((pot, i) => {
    const parts = splitRuns(g, pot.amount, runs);
    const runRes = runBoards.map((b, r) => {
      let winners: ID[] = [];
      if (manual[i]?.length) winners = manual[i].filter((p) => pot.eligible.includes(p));
      else if (pot.eligible.length === 1) winners = [...pot.eligible];
      else if (b.length === 5) {
        const scored = pot.eligible.map((p) => ({ p, v: log.shown?.[p]?.length === 2 ? bestHand([...log.shown[p], ...b]) : null })).filter((x) => x.v);
        // a pot is decided by the shown hands only if everyone who could win it showed or mucked
        const undecided = pot.eligible.some((p) => !(log.shown?.[p]?.length === 2) && !log.mucked?.includes(p));
        if (scored.length && !undecided) {
          const top = Math.max(...scored.map((x) => x.v!.score));
          winners = scored.filter((x) => x.v!.score === top).map((x) => x.p);
        }
      }
      if (!winners.length) missing = true;
      const alloc = positionSplit(g, parts[r], winners, button);
      for (const [p, a] of Object.entries(alloc)) sums[p] = round2((sums[p] ?? 0) + a);
      return { winners };
    });
    const agg: Record<ID, number> = {};
    runRes.forEach((rr, r) => { for (const [p, a] of Object.entries(positionSplit(g, parts[r], rr.winners, button))) agg[p] = round2((agg[p] ?? 0) + a); });
    return { amount: pot.amount, eligible: pot.eligible, winners: Object.entries(agg).map(([playerId, amount]) => ({ playerId, amount })), runs: runRes, manual: !!manual[i]?.length };
  });
  return {
    pots: out,
    returned,
    winners: fromSmallBlind(g, button, Object.keys(sums)).map((p) => ({ playerId: p, amount: sums[p] })),
    missing,
  };
}

/** Did the player put chips in voluntarily before the flop? (calls or raises beyond their blind) */
export function vpip(g: Game, log: HandLog, p: ID, button?: ID): boolean {
  const s = log.streets.preflop;
  if (!s || !log.dealt.includes(p)) return false;
  const bl = blinds(g, log.dealt, button)[p] ?? 0;
  if (log.mode === 'bets') return (s.bets[p] ?? 0) > bl || (s.raisers.includes(p));
  // count mode: still in at the flop, except a big blind who only checked (no raise preflop)
  const sawFlop = inAtEnd(log, 'preflop').includes(p);
  if (!sawFlop) return false;
  const bbOnly = bl === g.bb && !s.raisers.length;
  return !bbOnly || s.raisers.includes(p);
}

export function pfr(log: HandLog, p: ID): boolean {
  return !!log.streets.preflop?.raisers.includes(p);
}

/** Start a new log for a hand. */
export function newLog(g: Game, dealt: ID[], mode: 'bets' | 'count', button?: ID, stacks?: Record<ID, number>): HandLog {
  const base: HandLog = { v: 1, mode, dealt, button, streets: {}, allInAt: {}, runs: 1, runCards: [], shown: {}, mucked: [], startedAt: Date.now() };
  return openStreet(g, base, 'preflop', stacks);
}

/* ------------------------------------------------------------------------------------------------
   Action boxes (current recorder). Each player gets one box per pass around the table. A street is
   replayed box by box in time order (pass 1 in seat order, then pass 2, ...) to work out the wagers,
   folds, raises and all-ins, so everything above (contributions, pots, VPIP, stacks) keeps working.
   An empty box is still waiting; once the street is closed (its `at` is set) an empty box counts as
   a call. A new pass opens for players who acted but now face a bet they have not matched. */

export interface Cell {
  /** The player has to act in this box. */
  needed: boolean;
  act: Act | null;
  /** Empty box that counts as a call because the street is closed. */
  implied: boolean;
  /** Player's street wager after this box. */
  amount: number;
  /** Chips the player had to add to call when this box came up. */
  toCall: number;
}

export interface Replay {
  street: StreetLog;
  /** Players who went all-in on this street. */
  allIn: ID[];
  /** Rows in acting order: players who could still bet when the street began. */
  order: ID[];
  cols: number;
  cells: Record<ID, Cell[]>;
  /** First box still waiting for an action. */
  next: { p: ID; r: number } | null;
  high: number;
}

export function replayStreet(g: Game, log: HandLog, street: StreetName, stacks?: Record<ID, number>): Replay {
  const src = log.streets[street] ?? emptyStreet();
  const acts = src.acts ?? {};
  const closed = !!src.at;
  const canBet = actors(log, street);
  const order = streetOrder(g, log, street).filter((p) => canBet.includes(p));
  const bets: Record<ID, number> = {};
  const folded: ID[] = [];
  const raisers: ID[] = [];
  const typed: Record<ID, boolean> = {};
  const allIn = new Set<ID>();
  const cells: Record<ID, Cell[]> = Object.fromEntries(order.map((p) => [p, [] as Cell[]]));
  const roomOf = (p: ID) => room(log, p, stacks, street);
  for (const p of inAtStart(log, street)) bets[p] = 0;
  if (street === 'preflop') {
    for (const [p, v] of Object.entries(blinds(g, log.dealt, log.button))) {
      const r = roomOf(p);
      bets[p] = r === undefined ? v : Math.min(v, r);
      if (r !== undefined && r <= v) allIn.add(p);
    }
  }
  let high = Math.max(0, ...Object.values(bets));
  let next: Replay['next'] = null;
  const maxStored = Math.max(0, ...Object.values(acts).map((a) => a.length));
  const acted = new Set<ID>();
  const waiting = new Set<ID>();
  for (let r = 0; r < 12; r++) {
    let anyNeeded = false;
    for (const p of order) {
      const owe = round2(high - (bets[p] ?? 0));
      const needed = !folded.includes(p) && !allIn.has(p) && !waiting.has(p) && (r === 0 || (acted.has(p) && owe > 0));
      const cell: Cell = { needed, act: needed ? acts[p]?.[r] ?? null : null, implied: false, amount: bets[p] ?? 0, toCall: Math.max(0, owe) };
      cells[p][r] = cell;
      if (!needed) continue;
      anyNeeded = true;
      let a = cell.act;
      if (!a) {
        if (!closed) { waiting.add(p); if (!next) next = { p, r }; continue; }
        a = { k: 'call' };
        cell.implied = true;
      }
      acted.add(p);
      const rm = roomOf(p);
      const have = bets[p] ?? 0;
      if (a.k === 'fold') {
        folded.push(p);
      } else if (a.k === 'call') {
        bets[p] = Math.max(have, rm === undefined ? high : Math.min(high, rm));
        if (rm !== undefined && rm > 0 && bets[p] >= rm) allIn.add(p);
      } else {
        let to = a.k === 'allin' ? (rm ?? Math.max(high, a.to ?? 0)) : (a.to ?? high);
        if (rm !== undefined) to = Math.min(to, rm);
        to = Math.max(to, have);
        typed[p] = true;
        if (to > high) {
          if (!raisers.includes(p)) raisers.push(p);
          high = to;
          bets[p] = to;
        } else if (rm !== undefined && to >= rm) {
          bets[p] = to; // all-in for less than the bet
        } else {
          bets[p] = Math.max(have, rm === undefined ? high : Math.min(high, rm)); // a bet no higher than the current one is a call
        }
        if (a.k === 'allin' || (rm !== undefined && bets[p] >= rm)) allIn.add(p);
      }
      cell.amount = bets[p] ?? 0;
    }
    if (!anyNeeded && r >= maxStored - 1) {
      for (const p of order) cells[p].length = r;
      break;
    }
  }
  const cols = Math.max(1, ...order.map((p) => cells[p].length));
  for (const p of order) for (let r = 0; r < cols; r++) cells[p][r] ??= { needed: false, act: null, implied: false, amount: bets[p] ?? 0, toCall: 0 };
  return {
    street: { ...src, acts, bets, prev: { ...bets }, typed, folded, raisers },
    allIn: [...allIn],
    order,
    cols,
    cells,
    next,
    high,
  };
}

/** Replay every street that uses action boxes, in order (later streets depend on earlier folds and all-ins). */
export function rederive(g: Game, log: HandLog, stacks?: Record<ID, number>): HandLog {
  let out: HandLog = { ...log, allInAt: { ...(log.allInAt ?? {}) } };
  for (const st of STREETS) {
    const s = out.streets[st];
    if (!s?.acts) continue;
    const allInAt = { ...(out.allInAt ?? {}) };
    for (const [p, at] of Object.entries(allInAt)) if (STREETS.indexOf(at) >= STREETS.indexOf(st)) delete allInAt[p];
    out = { ...out, allInAt };
    const rp = replayStreet(g, out, st, stacks);
    for (const p of rp.allIn) allInAt[p] = st;
    out = { ...out, allInAt, streets: { ...out.streets, [st]: rp.street } };
  }
  return out;
}

/** Fill, change or clear one action box, then replay the hand. */
export function setAct(g: Game, log: HandLog, street: StreetName, p: ID, r: number, act: Act | null, stacks?: Record<ID, number>): HandLog {
  const s = log.streets[street] ?? emptyStreet();
  const acts = { ...(s.acts ?? {}) };
  const row = [...(acts[p] ?? [])];
  while (row.length <= r) row.push(null);
  row[r] = act;
  while (row.length && row[row.length - 1] === null) row.pop();
  acts[p] = row;
  return rederive(g, { ...log, streets: { ...log.streets, [street]: { ...s, acts } } }, stacks);
}

/** Tap cycle for a box: empty, call, fold, empty. A bet or all-in goes to fold. */
export function cycleAct(a: Act | null): Act | null {
  if (!a) return { k: 'call' };
  if (a.k === 'fold') return null;
  return { k: 'fold' };
}

/** Open a street with action boxes: everyone who can still bet gets an empty box. */
export function openStreetBoxes(g: Game, log: HandLog, street: StreetName, stacks?: Record<ID, number>): HandLog {
  return rederive(g, { ...log, streets: { ...log.streets, [street]: { ...emptyStreet(), acts: {} } } }, stacks);
}

/** Start a hand with action boxes. Only the blinds are filled in. */
export function newBoxLog(g: Game, dealt: ID[], button?: ID, stacks?: Record<ID, number>): HandLog {
  const base: HandLog = { v: 1, mode: 'bets', dealt, button, streets: {}, allInAt: {}, runs: 1, runCards: [], shown: {}, mucked: [], startedAt: Date.now() };
  return openStreetBoxes(g, base, 'preflop', stacks);
}

/** Close a street (empty boxes count as calls), or reopen it with `at` undefined. */
export function closeStreet(g: Game, log: HandLog, street: StreetName, at: number | undefined, stacks?: Record<ID, number>): HandLog {
  const s = log.streets[street];
  if (!s) return log;
  return rederive(g, { ...log, streets: { ...log.streets, [street]: { ...s, at } } }, stacks);
}

/** Drop the streets after `street` (used when an earlier street changes so the hand ends sooner). */
export function dropAfter(log: HandLog, street: StreetName): HandLog {
  const keep = STREETS.slice(0, STREETS.indexOf(street) + 1);
  return { ...log, streets: Object.fromEntries(Object.entries(log.streets).filter(([k]) => keep.includes(k as StreetName))) };
}
