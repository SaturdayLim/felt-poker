import type { Card } from '../types';

export const RANKS = 'AKQJT98765432'.split('');
export const SUITS = ['s', 'h', 'd', 'c'] as const;
export const SUIT_SYMBOL: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };
export const SUIT_COLOR: Record<string, string> = { s: '#111', h: '#d62839', d: '#1f6fd6', c: '#1b8a4b' };

export const DECK: Card[] = SUITS.flatMap((s) => RANKS.map((r) => r + s));

export const rankOf = (c: Card) => c[0];
export const suitOf = (c: Card) => c[1];
export const rankLabel = (c: Card) => (c[0] === 'T' ? '10' : c[0]);
export const cardText = (c: Card) => rankLabel(c) + SUIT_SYMBOL[suitOf(c)];

const RANK_VALUE: Record<string, number> = Object.fromEntries(
  '23456789TJQKA'.split('').map((r, i) => [r, i + 2]),
);

export const CATEGORY = [
  'High Card',
  'Pair',
  'Two Pair',
  'Three of a Kind',
  'Straight',
  'Flush',
  'Full House',
  'Four of a Kind',
  'Straight Flush',
] as const;

export interface HandValue {
  score: number;
  category: number;
  name: string;
  cards: Card[];
}

/** Score exactly five cards. Higher is better. */
function score5(cards: Card[]): { score: number; category: number } {
  const vals = cards.map((c) => RANK_VALUE[c[0]]).sort((a, b) => b - a);
  const flush = cards.every((c) => c[1] === cards[0][1]);
  const uniq = [...new Set(vals)];
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (vals[0] - vals[4] === 4) straightHigh = vals[0];
    else if (vals[0] === 14 && vals[1] === 5) straightHigh = 5; // wheel
  }
  const counts = new Map<number, number>();
  vals.forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1));
  // order ranks by count desc then value desc
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const shape = groups.map((g) => g[1]).join('');
  const kick = groups.map((g) => g[0]);

  let category: number;
  let tiebreak: number[];
  if (straightHigh && flush) { category = 8; tiebreak = [straightHigh]; }
  else if (shape === '41') { category = 7; tiebreak = kick; }
  else if (shape === '32') { category = 6; tiebreak = kick; }
  else if (flush) { category = 5; tiebreak = vals; }
  else if (straightHigh) { category = 4; tiebreak = [straightHigh]; }
  else if (shape === '311') { category = 3; tiebreak = kick; }
  else if (shape === '221') { category = 2; tiebreak = kick; }
  else if (shape === '2111') { category = 1; tiebreak = kick; }
  else { category = 0; tiebreak = vals; }

  let score = category;
  for (let i = 0; i < 5; i++) score = score * 16 + (tiebreak[i] ?? 0);
  return { score, category };
}

function combos<T>(arr: T[], k: number): T[][] {
  const out: T[][] = [];
  const rec = (start: number, acc: T[]) => {
    if (acc.length === k) { out.push(acc.slice()); return; }
    for (let i = start; i < arr.length; i++) { acc.push(arr[i]); rec(i + 1, acc); acc.pop(); }
  };
  rec(0, []);
  return out;
}

/** Best 5-card hand from 5–7 cards. Returns null with fewer than 5 cards. */
export function bestHand(cards: Card[]): HandValue | null {
  if (cards.length < 5) return null;
  let best: HandValue | null = null;
  for (const c of combos(cards, 5)) {
    const s = score5(c);
    if (!best || s.score > best.score) best = { ...s, name: '', cards: c };
  }
  if (best) best.name = handName(best);
  return best;
}

function handName(h: HandValue): string {
  if (h.category === 8) {
    const vals = h.cards.map((c) => RANK_VALUE[c[0]]);
    if (vals.includes(14) && vals.includes(13)) return 'Royal Flush';
  }
  return CATEGORY[h.category];
}

export function isValidCard(c: string): boolean {
  return DECK.includes(c);
}
