/* Hand replay for the spectator view. Pure functions, no React and no DOM, so they can be tested.
   A hand's action boxes are a complete event log: the blind posts and every action in time order rebuild the table at any
   step. `handSteps` turns a log into that ordered list (the same order the action log text uses), and `tableAt` replays the
   first k steps onto the starting stacks. Nothing here writes to a game: the spectator only moves a cursor over the list.
   Public information only: these functions never read a player's private cards (Hand.private, the recorder's `mine`). */
import type { Card, Game, Hand, HandLog, ID, StreetName } from '../types';
import { round2 } from './calc';
import { STREETS, STREET_CARDS, blinds, contributions, defaultAct, lastStreet, potsAndReturns, replayStreet } from './hand';

export type StepKind = 'sb' | 'bb' | 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin' | 'straddle';

/** One action on the felt: `to` is the player's street total after it, `add` the chips it put in. */
export interface Step {
  pid: ID;
  street: StreetName;
  k: StepKind;
  to: number;
  add: number;
  /** The player has no chips left after this action. */
  allin: boolean;
  dark?: boolean;
}

/** Every action of a hand in time order, blind posts first. A street logged as totals only (a pot count or an older log)
    gives one step per player with chips in, then its folds. */
export function handSteps(g: Game, log: HandLog, stacks?: Record<ID, number>): Step[] {
  const out: Step[] = [];
  const spent: Record<ID, number> = {};
  const put = (s: Omit<Step, 'add' | 'allin'>, allin = false, before = 0) => {
    const add = Math.max(0, round2(s.to - before));
    spent[s.pid] = round2((spent[s.pid] ?? 0) + add);
    const left = stacks?.[s.pid] === undefined ? undefined : round2(stacks[s.pid] - spent[s.pid]);
    out.push({ ...s, add, allin: allin || s.k === 'allin' || (left !== undefined && left <= 0 && s.k !== 'fold' && s.k !== 'check') });
  };
  for (const st of STREETS) {
    const s = log.streets[st];
    if (!s) continue;
    const street: Record<ID, number> = {};
    if (log.mode === 'bets' && s.acts) {
      const rp = replayStreet(g, log, st, stacks);
      if (st === 'preflop') {
        const bl = blinds(g, log.dealt, log.button);
        // the small blind posts first, then the big blind
        for (const p of Object.keys(bl).sort((a, b) => bl[a] - bl[b])) {
          const c = rp.cells[p]?.[0];
          if (!c?.post) continue;
          put({ pid: p, street: st, k: bl[p] <= g.sb && Object.keys(bl).length > 1 ? 'sb' : 'bb', to: c.amount });
          street[p] = c.amount;
        }
      }
      for (let r = 0; r < rp.cols; r++) {
        for (const p of rp.order) {
          const c = rp.cells[p]?.[r];
          if (!c || c.post || !c.needed) continue;
          const a = c.act ?? (c.implied ? (s.partial ? { k: 'call' as const } : defaultAct(c.toCall)) : null);
          if (!a) continue;
          const dark = !!a.dark || undefined;
          const before = street[p] ?? 0;
          let k: StepKind;
          if (a.k === 'fold') k = 'fold';
          else if (st === 'preflop' && rp.straddles.includes(p) && c.canStraddle && c.act) k = 'straddle';
          else if (a.k === 'allin' && c.amount > c.high) k = 'allin';
          else if (a.k === 'allin') k = c.high > 0 ? 'call' : 'allin';
          else if (c.amount > c.high) k = c.high > 0 ? 'raise' : 'bet';
          else if (c.toCall > 0) k = 'call';
          else k = 'check';
          const to = k === 'fold' || k === 'check' ? before : c.amount;
          put({ pid: p, street: st, k, to, dark }, a.k === 'allin', before);
          street[p] = to;
        }
      }
    } else {
      // totals only: what each player had in at the end of the street, in seat order, then the folds
      const prev = contributions(g, log, log.button, STREETS[STREETS.indexOf(st) - 1] ?? undefined);
      const now = contributions(g, log, log.button, st);
      const first = st === 'preflop';
      for (const p of log.dealt) {
        const v = first ? now[p] ?? 0 : round2((now[p] ?? 0) - (prev[p] ?? 0));
        street[p] = v;
        if (v > 0) put({ pid: p, street: st, k: 'call', to: v }, !!log.allInAt?.[p] && log.allInAt[p] === st);
      }
      for (const p of s.folded) put({ pid: p, street: st, k: 'fold', to: street[p] ?? 0 }, false, street[p] ?? 0);
    }
  }
  return out;
}

/** The table after the first `k` steps. `pot` holds the chips swept in from earlier streets; `bets` the chips in front of
    each seat on the current street. Side pots show once a player is all-in (built from the swept chips). */
export interface TableAt {
  k: number;
  street: StreetName;
  pot: number;
  /** Pot plus every bet in front. */
  total: number;
  pots: { amount: number; eligible: ID[] }[];
  stacks: Record<ID, number | undefined>;
  bets: Record<ID, number>;
  folded: ID[];
  allin: ID[];
  toAct: ID | null;
  boardCount: number;
  last: Step | null;
}

export interface ReplayInput {
  g: Game;
  log: HandLog;
  steps: Step[];
  /** Stacks before the hand, where they are exact. A missing player shows no stack figure. */
  start: Record<ID, number | undefined>;
  /** Board cards logged so far (nulls are empty slots). */
  board: (Card | null)[];
  /** A hand in play: at the last step a street opened in the log with no action yet is shown (bets swept, its cards). */
  live?: boolean;
}

export function tableAt(inp: ReplayInput, k: number): TableAt {
  const { g, log, steps, start } = inp;
  const n = Math.max(0, Math.min(k, steps.length));
  const done = steps.slice(0, n);
  const last = done[n - 1] ?? null;
  let street: StreetName = last?.street ?? 'preflop';
  if (inp.live && n === steps.length) {
    const open = lastStreet(log);
    if (STREETS.indexOf(open) > STREETS.indexOf(street)) street = open;
  }
  const si = STREETS.indexOf(street);
  const spent: Record<ID, number> = {};
  const bets: Record<ID, number> = {};
  let pot = 0;
  const folded = new Set<ID>();
  const allin = new Set<ID>();
  for (const s of done) {
    spent[s.pid] = round2((spent[s.pid] ?? 0) + s.add);
    if (STREETS.indexOf(s.street) < si) pot = round2(pot + s.add);
    else bets[s.pid] = s.to;
    if (s.k === 'fold') folded.add(s.pid);
    if (s.allin) allin.add(s.pid);
  }
  const stacks: Record<ID, number | undefined> = {};
  for (const p of log.dealt) {
    const s0 = start[p];
    stacks[p] = s0 === undefined ? undefined : round2(s0 - (spent[p] ?? 0));
    if (stacks[p] !== undefined && stacks[p]! <= 0 && (spent[p] ?? 0) > 0) allin.add(p);
  }
  const live = log.dealt.filter((p) => !folded.has(p));
  // side pots from the chips already swept in, once someone is all-in
  let pots: TableAt['pots'] = [];
  if (allin.size && pot > 0) {
    const swept: Record<ID, number> = {};
    for (const s of done) if (STREETS.indexOf(s.street) < si) swept[s.pid] = round2((swept[s.pid] ?? 0) + s.add);
    const built = potsAndReturns(swept, live).pots;
    if (built.length > 1) pots = built;
  }
  let toAct: ID | null = steps[n]?.pid ?? null;
  if (inp.live && n === steps.length) {
    const rp = log.streets[street] ? replayStreet(g, log, street, Object.fromEntries(Object.entries(start).filter(([, v]) => v !== undefined)) as Record<ID, number>) : null;
    toAct = rp?.next?.p ?? null;
  }
  const logged = inp.board.findIndex((c) => !c);
  const have = logged < 0 ? inp.board.length : logged;
  const total = round2(pot + Object.values(bets).reduce((a, b) => a + b, 0));
  return { k: n, street, pot, total, pots, stacks, bets, folded: [...folded], allin: [...allin], toAct, boardCount: Math.min(have, STREET_CARDS[street]), last };
}

/** A finished hand's result step: every chip in the pot, then paid out. Stacks include what each player won back. */
export interface ResultAt {
  pots: { amount: number; winners: { pid: ID; amount: number }[] }[];
  won: Record<ID, number>;
  stacks: Record<ID, number | undefined>;
  /** Players whose cards were shown at the table (public). */
  shown: { pid: ID; cards: Card[] }[];
}

export function resultAt(inp: ReplayInput, h: Pick<Hand, 'pot' | 'pots' | 'winners' | 'returned' | 'shown'>): ResultAt {
  const end = tableAt(inp, inp.steps.length);
  const won: Record<ID, number> = {};
  for (const w of h.winners) won[w.playerId] = round2((won[w.playerId] ?? 0) + w.amount);
  for (const [p, v] of Object.entries(h.returned ?? {})) won[p] = round2((won[p] ?? 0) + v);
  const stacks: Record<ID, number | undefined> = {};
  for (const [p, v] of Object.entries(end.stacks)) stacks[p] = v === undefined ? undefined : round2(v + (won[p] ?? 0));
  const pots = (h.pots?.length ? h.pots : [{ amount: h.pot, eligible: [], winners: h.winners }]).map((p) => ({ amount: p.amount, winners: p.winners.map((w) => ({ pid: w.playerId, amount: w.amount })) }));
  return { pots, won, stacks, shown: (h.shown ?? []).filter((s) => s.cards?.length === 2).map((s) => ({ pid: s.playerId, cards: s.cards })) };
}
