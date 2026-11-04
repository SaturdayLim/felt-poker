import type { Card, Game, Hand, ID } from '../types';

/** The private cards entered for a hand, with the older single-owner form folded in. */
export const privateOf = (h: Hand): Record<ID, Card[]> => h.private ?? (h.mine ? { [h.mine.playerId]: h.mine.cards } : {});

/** Private cards that count: a full pair only. Half a pair says nothing, so it stays out of all analysis. */
export const fullPairs = (h: Hand): Record<ID, Card[]> => Object.fromEntries(Object.entries(privateOf(h)).filter(([, c]) => c.length === 2));

/** Players whose private cards for a hand cannot all be right: two players hold the same card, or a private card
    is also on the board or shown by another player. Felt tells each of them in private. Until an entry changes,
    every entry counts as entered, so each player's stats follow what that player reported, even if it is impossible.
    A player's own shown cards may match their own private cards. */
export function clashingPlayers(h: Hand): ID[] {
  const priv = fullPairs(h);
  const out = new Set<ID>();
  const seen = new Map<Card, ID>();
  for (const [p, cards] of Object.entries(priv)) {
    for (const c of cards) {
      const other = seen.get(c);
      if (other && other !== p) { out.add(p); out.add(other); }
      seen.set(c, p);
    }
  }
  for (const [p, cards] of Object.entries(priv)) {
    for (const c of cards) {
      if (h.board.includes(c)) out.add(p);
      if (h.shown.some((s) => s.playerId !== p && s.cards.includes(c))) out.add(p);
    }
  }
  return [...out];
}

/** The hand numbers a player must check. Only saved hands count, so nothing leaks while a hand is in play. */
export const clashHands = (g: Game, p: ID): number[] => g.hands.filter((h) => !h.missed && clashingPlayers(h).includes(p)).map((h) => h.n);
