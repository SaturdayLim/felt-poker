import type { Card, Hand, ID } from '../types';

/** The private cards entered for a hand, with the older single-owner form folded in. */
export const privateOf = (h: Hand): Record<ID, Card[]> => h.private ?? (h.mine ? { [h.mine.playerId]: h.mine.cards } : {});

/** Players whose private cards for a hand cannot be right: two players hold the same card, or a private card
    is also on the board or shown by another player. Everyone involved is left out of the report until
    an entry is replaced. A player's own shown cards may match their own private cards. */
export function clashingPlayers(h: Hand): ID[] {
  const priv = privateOf(h);
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
