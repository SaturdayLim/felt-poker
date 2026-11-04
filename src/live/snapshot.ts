/* What the host publishes for viewers. Only what is already public at the table:
   settings, closed hands with the cards shown, and the hand in progress (board, actions, pot, who acts next,
   approximate stacks). Private cards are never in here. */
import type { Card, Game, ID, Player, Settings, StreetName } from '../types';
import { estimateStacks, exactStacks } from '../lib/stacks';
import { bestHand } from '../lib/cards';
import { finalists, hasActs, potTotal, replayStreet, rowOrder, STREETS } from '../lib/hand';
import { units } from '../lib/format';
import { rulesList } from '../report/model';
import type { HandLog } from '../types';

export interface ViewShown { name: string; cards: Card[]; rank: string }
export interface ViewCell { t: string; kind: string; past?: boolean; dark?: boolean }
export interface ViewRow { name: string; pos: string; folded: boolean; cells: ViewCell[] }
export interface ViewStreet { key: string; label: string; old: Card[]; fresh: Card[]; lines: string[]; cols: number; rows: ViewRow[]; pot: number; shown?: ViewShown[]; mucked?: string[] }
export interface HandView { streets: ViewStreet[]; dealt: string[]; button: string | null;
  /** The board of each run, when the rest of the board ran more than once. `common` cards are the same on every run. */
  runs?: { common: Card[]; cards: Card[] }[] }
export interface Standing { id: ID; now: number; low: number; high: number }
export interface PubHand {
  n: number; pot: number;
  winners: { name: string; amount: number }[];
  board: Card[];
  shown: ViewShown[];
  /** At showdown with no cards shown, and no share of the pot. */
  mucked?: string[];
  dealt: string[];
  view: HandView;
}
export interface StackLine { name: string; stack: number | null; spread: number }
export interface PubSnapshot {
  v: 1;
  game: { name: string; type: string; sb: number; bb: number; status: string; startedAt: number };
  rules: { label: string; value: string; tip?: string }[];
  players: { id: ID; name: string; seat: number }[];
  standings: Standing[];
  button: string | null;
  hands: PubHand[];
  stacks: StackLine[];
  updatedAt: number;
}
export interface NowSnapshot {
  v: 1;
  n: number;
  stage: string;
  board: Card[];
  pot: number;
  toAct: string | null;
  view: HandView;
  ended: boolean;
  /** Someone checked, called, bet, raised or folded. Before that viewers do not see the hand: blinds and card entry alone do not count. */
  acted: boolean;
  stacks: StackLine[];
  updatedAt: number;
}

const stackLines = (g: Game, name: (id: ID) => string): StackLine[] => {
  const est = estimateStacks(g);
  return g.playerIds.map((p) => ({ name: name(p), stack: est.stack[p] ?? null, spread: est.spread[p] ?? 0 }));
};

/** The slow part: settings, players, closed hands and approximate stacks. Sent when a hand closes or a setting changes. */
export function buildPub(g: Game, players: Player[], settings?: Settings, at = Date.now()): PubSnapshot {
  const name = (id: ID) => players.find((p) => p.id === id)?.name ?? '?';
  return {
    v: 1,
    game: { name: g.name, type: g.type, sb: g.sb, bb: g.bb, status: g.status, startedAt: g.startedAt },
    rules: rulesList(g, settings),
    players: g.playerIds.map((id) => ({ id, name: name(id), seat: g.seats[id] ?? 99 })),
    standings: standings(g),
    button: (() => { const last = [...g.hands].reverse().find((h) => h.log?.button)?.log?.button; return last ? name(last) : null; })(),
    hands: g.hands.filter((h) => !h.missed && h.log).map((h) => {
      const winners = h.winners.map((w) => ({ name: name(w.playerId), amount: w.amount }));
      // with more than one run a hand has no single rank
      const shown = h.shown.map((s) => ({ name: name(s.playerId), cards: s.cards, rank: h.board.length === 5 && (h.log!.runs ?? 1) <= 1 ? bestHand([...s.cards, ...h.board])?.name ?? '' : '' }));
      const fin = finalists(h.log!);
      const mucked = fin.length > 1 ? fin.filter((p) => !h.shown.some((s) => s.playerId === p) && !h.winners.some((w) => w.playerId === p)).map(name) : [];
      return {
        n: h.n, pot: h.pot, winners, board: h.board, shown, mucked,
        dealt: (h.log?.dealt ?? []).map(name),
        view: buildView(g, h.log!, h.board, name, { winners, shown, mucked }, undefined, h.n),
      };
    }),
    stacks: stackLines(g, name),
    updatedAt: at,
  };
}

const STAGE: Record<string, string> = { setup: 'Setup', preflop: 'Pre-flop', flop: 'Flop', turn: 'Turn', river: 'River', showdown: 'Showdown' };

/** Position names by table size: rows run from the small blind to the button. */
function positions(order: ID[]): Record<ID, string> {
  const n = order.length, out: Record<ID, string> = {};
  order.forEach((p, i) => {
    out[p] = n === 2 ? (i === 0 ? 'BTN' : 'BB')
      : i === n - 1 ? 'BTN' : i === 0 ? 'SB' : i === 1 ? 'BB'
      : i === n - 2 && n >= 5 ? 'CO' : i === n - 3 && n >= 6 ? 'HJ'
      : i === 2 ? 'UTG' : i === 3 ? 'UTG+1' : 'MP';
  });
  return out;
}

const cellKind = (a: { k: string } | null, post: boolean) => (post ? 'post' : a?.k ?? 'off');

/** One hand as viewers read it: lines for the action log, boxes for the play-by-play view. Public facts only. */
export function buildView(g: Game, log: HandLog, board: Card[], name: (id: ID) => string, end?: { winners: { name: string; amount: number }[]; shown: ViewShown[]; mucked?: string[] }, shownNow?: ViewShown[], n?: number): HandView {
  const order = rowOrder(g, log), pos = positions(order);
  // the same stacks the host records with: an all-in key has no amount of its own
  const stacks = n === undefined ? undefined : exactStacks(g, n);
  const multi = (log.runs ?? 1) > 1 && log.runFrom !== undefined;
  const common = multi ? board.slice(0, log.runFrom) : board;
  const who = (p: ID) => pos[p] ? `${pos[p]} (${name(p)}` : `(${name(p)}`;
  const streets: ViewStreet[] = [];
  const CUT: Record<string, [number, number]> = { preflop: [0, 0], flop: [0, 3], turn: [3, 4], river: [4, 5] };
  for (const street of STREETS as StreetName[]) {
    const [from, to] = CUT[street];
    const fresh = common.slice(from, to), had = log.streets[street]?.acts;
    if (!had && !fresh.length) continue;
    const lines: string[] = [];
    let cols = 0;
    const rows: ViewRow[] = [];
    if (had) {
      const rp = replayStreet(g, log, street, stacks);
      cols = rp.cols;
      const put: Record<ID, number> = {};
      for (let r = 0; r < rp.cols; r++) {
        for (const p of rp.order) {
          const c = rp.cells[p]?.[r];
          if (!c) continue;
          const before = put[p] ?? 0;
          const a = c.act ?? (c.implied ? { k: c.toCall ? 'fold' : 'call' } as const : null);
          if (c.post && !c.act) { lines.push(`${who(p)}, ${units(before)}) posts ${units(c.amount)}`); put[p] = c.amount; continue; }
          if (!a) continue;
          const text = a.k === 'fold' ? 'folds'
            : a.k === 'call' ? (c.toCall > 0 ? `calls to ${units(c.amount)}` : 'checks')
            : a.k === 'allin' ? `all-in to ${units(c.amount)}`
            : c.high > 0 ? `raises to ${units(c.amount)}` : `bets ${units(c.amount)}`;
          lines.push(`${who(p)}, ${units(before)}) ${text}`);
          put[p] = c.amount;
        }
      }
      for (const p of order) {
        const cells = rp.cells[p] ?? [];
        rows.push({
          name: name(p), pos: pos[p] ?? '', folded: !rp.order.includes(p) || (rp.street.folded ?? []).includes(p),
          cells: Array.from({ length: rp.cols }, (_, r) => {
            const c = rp.order.includes(p) ? cells[r] : undefined;
            if (!c || (!c.post && !c.needed)) return { t: '', kind: 'off' };
            const a = c.act ?? (c.implied ? { k: c.toCall ? 'fold' : 'call', d: true } as const : null);
            const t = c.post ? units(c.amount) : !a ? '' : a.k === 'fold' ? 'F' : a.k === 'call' ? 'C' : units(c.amount);
            return { t, kind: cellKind(a, c.post), past: c.past, dark: c.post || !!(a as { dark?: boolean } | null)?.dark };
          }),
        });
      }
    }
    streets.push({ key: street, label: STAGE[street], old: common.slice(0, from), fresh, lines, cols, rows, pot: potTotal(g, log, log.button, street) });
  }
  const shown = end?.shown ?? shownNow ?? [];
  if (end || shown.length) {
    const lines = (end?.winners ?? []).map((w) => `${w.name} wins ${units(w.amount)}`);
    streets.push({ key: 'showdown', label: STAGE.showdown, old: [], fresh: [], lines, cols: 0, rows: [], pot: 0, shown, mucked: end?.mucked });
  }
  const runs = multi ? (log.runCards ?? []).filter((r) => r.length).map((cards) => ({ common, cards })) : [];
  return { streets, dealt: log.dealt.map(name), button: log.button ? name(log.button) : null, runs: runs.length ? runs : undefined };
}

/** A hand as plain text: earliest action first, cards as "As" and "Td". */
export function viewText(n: number, sb: number, bb: number, v: HandView): string {
  // plain lines only: no dashes or bullets, which notes and chat apps turn into lists. A blank line between streets.
  const blocks: string[][] = [[`Hand ${n}, blinds ${sb}/${bb}`]];
  for (const s of v.streets) {
    const out: string[] = [];
    if (s.key === 'showdown') {
      out.push(s.label);
      for (const x of s.shown ?? []) out.push(`${x.name} shows ${x.cards.join(' ')}`);
      for (const m of s.mucked ?? []) out.push(`${m} mucks`);
      (v.runs ?? []).forEach((r, i) => out.push(`Run ${i + 1}: ${[...r.common, ...r.cards].join(' ')}`));
    } else out.push(s.fresh.length ? `${s.label}: ${s.fresh.join(' ')}` : s.label);
    out.push(...s.lines);
    blocks.push(out);
  }
  return blocks.map((b) => b.join('\n')).join('\n\n');
}

/** Each player's result so far (stack minus chips bought) and the lowest and highest it has reached. */
export function standings(g: Game): Standing[] {
  const hands = g.hands.filter((h) => !h.missed && h.log);
  const noOut = { ...g, cashOuts: [] };
  const runs: Record<ID, number[]> = Object.fromEntries(g.playerIds.map((p) => [p, [0]]));
  for (const h of hands) {
    const est = estimateStacks(noOut, h.n + 1);
    const t = h.endedAt ?? h.at;
    for (const p of g.playerIds) {
      const bought = g.buyIns.filter((b) => b.playerId === p && b.at <= t).reduce((a, b) => a + b.amount, 0);
      runs[p].push(bought ? Math.round((est.stack[p] ?? 0) - bought) : 0);
    }
  }
  return g.playerIds.map((id) => ({ id, now: runs[id][runs[id].length - 1], low: Math.min(...runs[id]), high: Math.max(...runs[id]) }));
}

/** The hand in progress: small, sent after each action. */
export function buildNow(g: Game, players: Player[], hand: { n: number; tab: string; log: HandLog; board: (Card | null)[]; ended: boolean; shown?: Record<ID, (Card | null)[]>; runSlots?: (Card | null)[][] }, at = Date.now()): NowSnapshot {
  const name = (id: ID) => players.find((p) => p.id === id)?.name ?? '?';
  const stacks = exactStacks(g, hand.n);
  let toAct: string | null = null;
  for (const street of STREETS as StreetName[]) {
    if (!hand.log.streets[street]?.acts) continue;
    const rp = replayStreet(g, hand.log, street, stacks);
    if (hand.tab === street && rp.next) toAct = name(rp.next.p);
  }
  const board = hand.board.filter(Boolean) as Card[];
  const shown = Object.entries(hand.shown ?? {}).map(([p, c]) => ({ name: name(p), cards: c.filter(Boolean) as Card[], rank: '' })).filter((x) => x.cards.length === 2);
  return {
    v: 1, n: hand.n, stage: STAGE[hand.tab] ?? hand.tab, board,
    pot: potTotal(g, hand.log, hand.log.button),
    toAct: hand.ended ? null : toAct,
    view: buildView(g, (hand.log.runs ?? 1) > 1 ? { ...hand.log, runCards: (hand.runSlots ?? []).map((r) => r.filter(Boolean) as Card[]) } : hand.log, board, name, undefined, shown, hand.n),
    ended: hand.ended, acted: hasActs(hand.log), stacks: stackLines(g, name), updatedAt: at,
  };
}
