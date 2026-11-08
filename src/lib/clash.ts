import type { Card, Game, Hand, ID } from '../types';

/** The private cards entered for a hand, with the older single-owner form folded in. */
export const privateOf = (h: Hand): Record<ID, Card[]> => h.private ?? (h.mine ? { [h.mine.playerId]: h.mine.cards } : {});

/** Private cards that count: a full pair only. Half a pair says nothing, so it stays out of all analysis. */
export const fullPairs = (h: Hand): Record<ID, Card[]> => Object.fromEntries(Object.entries(privateOf(h)).filter(([, c]) => c.length === 2));

/** The pair a player showed at the table, if it is a full pair. */
export const shownPair = (h: Hand, p: ID): Card[] | undefined => {
  const s = h.shown.find((x) => x.playerId === p)?.cards;
  return s?.length === 2 ? s : undefined;
};

/** The pair that counts for each player who entered cards: the cards shown at the table, else the entry. Shown cards
    override an entry that differs from them. That entry is dropped without a flag or a message. */
export const effectivePairs = (h: Hand): Record<ID, Card[]> =>
  Object.fromEntries(Object.entries(fullPairs(h)).map(([p, c]) => [p, shownPair(h, p) ?? c]));

/** Players whose cards for a hand cannot all be right: two players hold the same card, or a card is also on the
    board or shown by another player. Felt tells each of them in private. A player's own shown cards always win over
    that player's own entry, so a difference between the two is never a clash. */
export function clashingPlayers(h: Hand): ID[] {
  const eff = effectivePairs(h);
  const out = new Set<ID>();
  const seen = new Map<Card, ID>();
  for (const [p, cards] of Object.entries(eff)) {
    for (const c of cards) {
      const other = seen.get(c);
      if (other && other !== p) { out.add(p); out.add(other); }
      seen.set(c, p);
    }
  }
  for (const [p, cards] of Object.entries(eff)) {
    for (const c of cards) {
      if (h.board.includes(c)) out.add(p);
      if (h.shown.some((s) => s.playerId !== p && s.cards.includes(c))) out.add(p);
    }
  }
  return [...out];
}

/** The hand numbers a player must check. Only saved hands count, so nothing leaks while a hand is in play. */
export const clashHands = (g: Game, p: ID): number[] => g.hands.filter((h) => !h.missed && clashingPlayers(h).includes(p)).map((h) => h.n);

export type ClashWhy = 'board' | 'shown' | 'entry';
/** Why a player's cards for a hand cannot all be right: on the board, shown by another player, or also in another
    player's hidden entry. Only that player sees it. The other entry's cards stay hidden. Another player's entry is
    read as that player's effective pair, so a dropped entry is compared as the cards that player showed. */
export function clashWhy(h: Hand, p: ID): ClashWhy[] {
  const eff = effectivePairs(h);
  const mine = eff[p];
  if (!mine) return [];
  const out = new Set<ClashWhy>();
  for (const c of mine) {
    if (h.board.includes(c)) out.add('board');
    if (h.shown.some((s) => s.playerId !== p && s.cards.includes(c))) out.add('shown');
    // a card another player showed is 'shown' already; 'entry' is for hidden cards only
    if (Object.entries(eff).some(([q, cards]) => q !== p && !shownPair(h, q) && cards.includes(c))) out.add('entry');
  }
  return [...out];
}

/** Red: a card contradicts a card shown at the table (board or another player's shown hand). The entry cannot
    be right, so it is left out of stats and reports. Blue: it only contradicts another hidden entry; it still counts. */
export function clashLevel(h: Hand, p: ID): 'red' | 'blue' | null {
  const why = clashWhy(h, p);
  return why.includes('board') || why.includes('shown') ? 'red' : why.includes('entry') ? 'blue' : null;
}

/** Pairs that count in stats and reports: the effective pair of each player who entered cards. With the check on
    (the default), a red entry is left out. */
export function countedPairs(h: Hand, check = true): Record<ID, Card[]> {
  const all = effectivePairs(h);
  if (!check) return all;
  return Object.fromEntries(Object.entries(all).filter(([p]) => clashLevel(h, p) !== 'red'));
}
