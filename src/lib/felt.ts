/* The table from above: the model both table views share (the host's Table and the player view's Table), with no React and no DOM.
   A hand is a list of steps. `feltAt` replays the first k steps onto the starting stacks; nothing here writes to a game.
   `seatSpots` places every part of a seat from that seat's own point on the rail, so cards and chips stay beside their player.
   Public facts only: a hand carries the board and the cards shown at the table, never a player's private cards. */
import type { Card } from '../types';
import { FELT_MOVES, type FeltMoves, type FeltPart } from './feltLayout';

export type FeltSeg = 'preflop' | 'flop' | 'turn' | 'river' | 'end';
export type FeltKind = 'sb' | 'bb' | 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin' | 'straddle' | 'deal' | 'show' | 'win';
/** One step of a hand. An action carries its player; `to` is the player's street total after it, `add` the chips it put in. */
export interface FeltStep { id?: string; seg: FeltSeg; k: FeltKind; to: number; add: number; allin: boolean }
export type FeltAction = Required<Pick<FeltStep, 'id'>> & Omit<FeltStep, 'id' | 'seg'> & { seg: Exclude<FeltSeg, 'end'> };
export interface FeltPlayer { id: string; name: string; /** Index of the player's colour (FELT_HUES). */ hue: number; /** The player's photo, when they set one. */ photo?: string }
export interface FeltHand {
  n: number;
  live: boolean;
  /** Seats in table order. */
  players: FeltPlayer[];
  /** Players dealt into this hand. Empty when no hand is on the table. */
  dealt: string[];
  button: string | null;
  steps: FeltStep[];
  /** Stacks before the hand, where they are known. */
  start: Record<string, number | undefined>;
  board: Card[];
  /** Cards shown at the table, by player. */
  shown: Record<string, Card[]>;
  /** Chips paid out at the win step. */
  pays: { id: string; amount: number }[];
  /** The player to act after the last step of a hand in play. */
  toActEnd: string | null;
  bb: number;
  showdown: boolean;
  /** Names for the hand list. */
  winners: string[];
}

export const FELT_HUES = ['#3b74d6', '#c8473d', '#3a9a5e', '#8a5cc2', '#c9772b', '#2a8c95', '#c2478f', '#b8902f', '#7b8794', '#5b6ee1'];
const DEAL: Record<string, number> = { flop: 3, turn: 4, river: 5 };
const SEGS: FeltSeg[] = ['preflop', 'flop', 'turn', 'river'];
const r2 = (n: number) => Math.round(n * 100) / 100;
export const feltFig = (n: number) => r2(n).toLocaleString('en-US');

/** The steps of a hand from its actions: a deal step where a street opens (also for streets dealt with no action, as in an
    all-in run-out), then the showdown and the win. */
export function feltSteps(acts: FeltAction[], o: { board: number; show: boolean; win: boolean }): FeltStep[] {
  const out: FeltStep[] = [];
  let at = 0;
  const dealTo = (i: number) => { while (at < i) { at++; out.push({ seg: SEGS[at], k: 'deal', to: 0, add: 0, allin: false }); } };
  for (const a of acts) { dealTo(SEGS.indexOf(a.seg)); out.push(a); }
  dealTo(o.board >= 5 ? 3 : o.board >= 4 ? 2 : o.board >= 3 ? 1 : 0);
  if (o.show) out.push({ seg: 'end', k: 'show', to: 0, add: 0, allin: false });
  if (o.win) out.push({ seg: 'end', k: 'win', to: 0, add: 0, allin: false });
  return out;
}

export interface FeltPot { amount: number; /** All-in players who can win this pot. Players who can still bet are in every pot. */ who: string[] }
export interface FeltAt {
  stacks: Record<string, number | undefined>;
  /** Chips in front of each seat on this street. */
  bets: Record<string, number>;
  /** Folded players, first fold first. */
  folded: string[];
  allin: string[];
  boardCount: number;
  shown: boolean;
  won: Record<string, number>;
  paid: boolean;
  /** Each player's last action in words. */
  act: Record<string, string>;
  toAct: string | null;
  /** The pot that still grows first, then each side pot (capped by an all-in). */
  pots: FeltPot[];
}

/** The table after the first k steps. */
export function feltAt(h: FeltHand, k: number): FeltAt {
  const stacks: FeltAt['stacks'] = { ...h.start };
  let bets: Record<string, number> = {};
  let swept: Record<string, number> = {};
  const folded: string[] = [], allin = new Set<string>(), act: Record<string, string> = {}, won: Record<string, number> = {};
  let boardCount = 0, shown = false, paid = false;
  const sweep = () => { for (const p in bets) swept[p] = r2((swept[p] ?? 0) + bets[p]); bets = {}; };
  // a new street clears the last action of everyone who can still act
  const quiet = () => { for (const p in act) if (!folded.includes(p) && !allin.has(p)) delete act[p]; };
  const n = Math.max(0, Math.min(k, h.steps.length));
  for (let i = 0; i < n; i++) {
    const s = h.steps[i];
    if (s.k === 'deal') { sweep(); quiet(); boardCount = Math.min(h.board.length, DEAL[s.seg] ?? 0); continue; }
    if (s.k === 'show') { sweep(); quiet(); shown = true; boardCount = h.board.length; continue; }
    if (s.k === 'win') {
      sweep(); quiet(); swept = {}; paid = true; boardCount = h.board.length;
      for (const p of h.pays) { won[p.id] = r2((won[p.id] ?? 0) + p.amount); if (stacks[p.id] !== undefined) stacks[p.id] = r2(stacks[p.id]! + p.amount); }
      continue;
    }
    const p = s.id!;
    if (stacks[p] !== undefined) stacks[p] = r2(stacks[p]! - s.add);
    if (s.k === 'fold') { folded.push(p); act[p] = 'Fold'; continue; }
    if (s.k === 'check') { act[p] = 'Check'; continue; }
    bets[p] = s.to;
    const all = s.allin || s.k === 'allin' || (stacks[p] !== undefined && stacks[p]! <= 0);
    if (all) allin.add(p);
    const t = feltFig(s.to);
    act[p] = all ? `All-in to ${t}` : s.k === 'sb' ? `SB ${t}` : s.k === 'bb' ? `BB ${t}` : s.k === 'straddle' ? `Straddle to ${t}` : s.k === 'call' ? `Call ${t}` : s.k === 'bet' ? `Bet ${t}` : `Raise to ${t}`;
  }
  const next = h.steps[n];
  let toAct: string | null = null;
  if (next) toAct = next.id && next.k !== 'sb' && next.k !== 'bb' ? next.id : null;
  else if (h.live && !shown) toAct = h.toActEnd;
  return { stacks, bets, folded, allin: [...allin], boardCount, shown, won, paid, act, toAct, pots: feltPots(swept, [...allin], folded) };
}

/** The pots in the middle, from the chips swept in. The pot that still grows comes first. A pot capped by an all-in is a side
    pot: it names each all-in player who can win it. */
export function feltPots(swept: Record<string, number>, allin: string[], folded: string[]): FeltPot[] {
  const capped = allin.filter((p) => !folded.includes(p) && (swept[p] ?? 0) > 0);
  const caps = [...new Set(capped.map((p) => swept[p]))].sort((a, b) => a - b);
  const pots: FeltPot[] = [];
  let prev = 0;
  for (const cap of [...caps, Infinity]) {
    let amount = 0;
    for (const p in swept) amount += Math.min(swept[p], cap) - Math.min(swept[p], prev);
    if (amount > 0.004) pots.push({ amount: r2(amount), who: cap === Infinity ? [] : capped.filter((p) => swept[p] >= cap) });
    prev = cap;
  }
  return pots.reverse();
}

/* ------------------------------- chips ------------------------------- */

/** Chip values in big blinds, largest first: face, edge and mark colours. */
export const FELT_CHIPS: [number, string, string, string][] = [
  [100, '#E9B84A', '#9c7620', '#1c1e21'], [50, '#7446ad', '#472a6b', '#ffffff'], [25, '#2a2d32', '#0c0d0f', '#E9B84A'], [5, '#2f9454', '#1b5a32', '#ffffff'],
  [2.5, '#2a5bd0', '#173a8c', '#ffffff'], [1, '#cf3b30', '#8a211a', '#ffffff'], [0.5, '#f2efe6', '#b9b4a3', '#2a5bd0'],
];
/** An amount as chip columns: [index into FELT_CHIPS, count]. It keeps some change, so a stack reads as a stack; it is an
    approximation of the amount, to half a big blind. */
export function chipCols(amount: number, bb: number, maxCols = 4): [number, number][] {
  const run = (keep: number) => {
    let rem = Math.round((amount / (bb || 1)) * 2) / 2, kept = 0;
    const cols: [number, number][] = [];
    FELT_CHIPS.forEach(([v], i) => {
      let n = Math.floor(rem / v + 1e-9);
      if (n > 0 && v > 0.5 && kept < keep) { n--; kept++; }
      if (n > 0) { cols.push([i, Math.min(n, 12)]); rem -= n * v; }
    });
    return cols;
  };
  if (!(amount > 0)) return [];
  let cols = run(2);
  if (cols.length > maxCols) cols = run(1);
  if (cols.length > maxCols) cols = run(0);
  if (!cols.length) cols = [[FELT_CHIPS.length - 1, 1]];
  return cols.slice(0, maxCols);
}
/** Chip columns as an SVG picture, and its width in chip widths. Each chip has edge marks; the top chip has its face. */
export function chipSvg(cols: [number, number][]): { html: string; wide: number } {
  if (!cols.length) return { html: '', wide: 0 };
  const w = 30, ry = 6.4, th = 5, gap = 3, top = Math.max(...cols.map((c) => c[1])), H = ry * 2 + th * top + 5, Wd = cols.length * (w + gap) - gap + 6;
  let g = '';
  cols.forEach(([ci, n], col) => {
    const [, face, dark, mark] = FELT_CHIPS[ci], cx = 3 + w / 2 + col * (w + gap), base = H - 3 - ry;
    g += `<ellipse cx="${cx + 1.5}" cy="${base + 2.2}" rx="${w / 2 + 1.5}" ry="${ry + 1}" fill="rgba(0,0,0,.4)"/>`;
    for (let j = 0; j < n; j++) {
      const x = cx + (((col * 7 + j * 13) % 5) - 2) * 0.4, yt = base - (j + 1) * th;
      g += `<path d="M${x - w / 2} ${yt} v${th} a${w / 2} ${ry} 0 0 0 ${w} 0 v${-th} z" fill="${dark}"/>`;
      g += `<path d="M${x - w / 2 + 0.3} ${yt + th / 2} a${w / 2 - 0.3} ${ry} 0 0 0 ${w - 0.6} 0" fill="none" stroke="${mark}" stroke-width="${th * 0.6}" stroke-dasharray="4.6 6.2" stroke-dashoffset="${(j % 2) * 5}" opacity=".92"/>`;
      g += `<path d="M${x - w / 2} ${yt + th} a${w / 2} ${ry} 0 0 0 ${w} 0" fill="none" stroke="rgba(0,0,0,.45)" stroke-width=".7"/>`;
      g += `<ellipse cx="${x}" cy="${yt}" rx="${w / 2}" ry="${ry}" fill="${face}"/>`;
      if (j === n - 1) {
        g += `<ellipse cx="${x}" cy="${yt}" rx="${w / 2 - 1.9}" ry="${ry - 0.85}" fill="none" stroke="${mark}" stroke-width="3" stroke-dasharray="6 6.9"/>`;
        g += `<ellipse cx="${x}" cy="${yt}" rx="${w / 2 - 5.4}" ry="${ry - 2.3}" fill="${face}" stroke="${mark}" stroke-width=".7" stroke-opacity=".7"/>`;
      } else g += `<ellipse cx="${x}" cy="${yt}" rx="${w / 2}" ry="${ry}" fill="none" stroke="rgba(0,0,0,.35)" stroke-width=".6"/>`;
    }
  });
  return { html: `<svg viewBox="0 0 ${Wd} ${H}" aria-hidden="true">${g}</svg>`, wide: Wd / w };
}

/* ------------------------------- places ------------------------------- */

export interface Pt { x: number; y: number }
/** A point on the edge of a pill of w by h: t of the way round from the bottom centre (clockwise seen from above), plus
    `along` round the edge. nx, ny point in toward the table. */
export function pillPoint(w: number, h: number, t: number, along = 0): Pt & { nx: number; ny: number } {
  const r = Math.min(w, h) / 2, lh = w - 2 * r, lv = h - 2 * r, q = (Math.PI * r) / 2, per = 2 * lh + 2 * lv + 4 * q;
  const parts: [string, number, number, number, number][] = [['h', lh / 2, w / 2, h, -1], ['a', q, r, h - r, 90], ['v', lv, 0, h - r, -1], ['a', q, r, r, 180], ['h', lh, r, 0, 1], ['a', q, w - r, r, 270], ['v', lv, w, r, 1], ['a', q, w - r, h - r, 0], ['h', lh / 2, w - r, h, -1]];
  let dist = ((((t % 1) + 1) % 1) * per + along + per * 4) % per;
  let x = w / 2, y = h, nx = 0, ny = -1;
  for (const [kind, len, a, b, c] of parts) {
    if (dist <= len) {
      if (kind === 'h') { x = a + c * dist; y = b; nx = 0; ny = b === 0 ? 1 : -1; }
      else if (kind === 'v') { x = a; y = b + c * dist; nx = a === 0 ? 1 : -1; ny = 0; }
      else { const ang = ((c + (dist / (q || 1)) * 90) * Math.PI) / 180; x = a + r * Math.cos(ang); y = b + r * Math.sin(ang); nx = -Math.cos(ang); ny = -Math.sin(ang); }
      break;
    }
    dist -= len;
  }
  return { x, y, nx, ny };
}

export interface SeatSpots {
  /** The photo, on the rail. */
  seat: Pt;
  /** Hole cards, turned `rot` degrees to face the centre. */
  hole: Pt & { rot: number };
  dealer: Pt;
  /** Committed chips, past the hole cards. */
  bet: Pt;
  /** The foot of stack column j of k: the columns stand in one row across the screen, in front of the photo. */
  stack: (j: number, k?: number) => Pt;
}
/** Stack row: at most 4 columns, 3.6 m apart, each at most 5.6 m tall (8 chips). */
const STACK_COLS = 4, STACK_GAP = 3.6, STACK_H = 5.6;
/** Where each part of each seat sits, for a table of w by h (px). Every part is measured from the seat's own point on the
    rail: in m (1% of the table height) toward the centre, and to the side. So a seat's cards and chips are always nearer to
    its own photo than to any other.
    One rule for every seat and every table size (from the owner's own placing, 13 Nov 2026): each seat is the same when it is
    seen from its own chair.
    Option E (owner pick, 13 Nov 2026):
    - The name and stack sit on a plate across the foot of the photo. The action sits above the head, centred on the photo.
    - The stack stands in one row of columns straight in front of the photo, across the screen.
    - Hole cards lie past the stack row, across the pass line, turned to face the centre.
    - Committed chips stand straight past the hole cards.
    - The dealer button sits at the front left corner of the hole cards.
    `moves` can shift a part of one seat at one table size (src/lib/feltLayout.ts). */
export function seatSpots(w: number, h: number, n: number, moves: FeltMoves = FELT_MOVES): SeatSpots[] {
  const M = h / 100;
  return Array.from({ length: n }, (_, i) => {
    const f = pillPoint(w, h, i / Math.max(1, n));
    // d in from the edge, a to the player's left (clockwise round the rail)
    const at = (d: number, a: number): Pt => ({ x: f.x + (a * f.ny + d * f.nx) * M, y: f.y + (-a * f.nx + d * f.ny) * M });
    const ax = Math.abs(f.nx), ay = Math.abs(f.ny);
    // the stack row: STACK_COLS columns side by side across the screen, each STACK_H tall at most. Its half size measured toward the centre:
    const half = ax * ((STACK_COLS - 1) * STACK_GAP / 2 + 1.65) + ay * (STACK_H / 2);
    // it starts past the photo, and on a lower seat also past the action label above the head
    const near = 7.5 + 4.5 * Math.max(0, -f.ny), centre = near + half;
    // the hole cards lie past the stack row (half a card deep plus a small gap)
    const cd = centre + half + 4.2;
    const row = at(centre, 0);
    const mv = moves[n]?.[i];
    const moved = (p: Pt, part: FeltPart): Pt => { const m = mv?.[part]; return m ? { x: p.x + m[0] * M, y: p.y + m[1] * M } : p; };
    return {
      seat: at(1, 0),
      hole: { ...moved(at(cd, 0), 'hole'), rot: (Math.atan2(f.nx, -f.ny) * 180) / Math.PI + (mv?.hole?.[2] ?? 0) },
      dealer: moved(at(cd + 3, 8.3), 'dealer'),
      bet: moved(at(cd + 9, 0), 'bet'),
      stack: (j: number, k = 1) => moved({ x: row.x + (j - (k - 1) / 2) * STACK_GAP * M, y: row.y + (STACK_H / 2) * M }, 'stack'),
    };
  });
}
