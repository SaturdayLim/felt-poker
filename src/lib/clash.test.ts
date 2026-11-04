import { describe, expect, it } from 'vitest';
import { clashHands, clashingPlayers, fullPairs } from './clash';
import type { Game, Hand } from '../types';

const hand = (over: Partial<Hand>): Hand => ({ id: 'h', n: 1, at: 0, pot: 0, winners: [], board: [], shown: [], ...over } as Hand);

describe('clashingPlayers', () => {
  it('is empty when private cards are unique', () => {
    expect(clashingPlayers(hand({ private: { a: ['As', 'Kd'], b: ['2c', '3h'] }, board: ['9s', 'Td', 'Jh'] }))).toEqual([]);
  });
  it('a half pair is not an entry: it flags nobody', () => {
    const h = { board: [], shown: [], private: { Ana: ['As'], Bel: ['As', 'Kd'] } } as unknown as Hand;
    expect(clashingPlayers(h)).toEqual([]);
    expect(Object.keys(fullPairs(h))).toEqual(['Bel']);
  });

  it('lists the saved hands a player must check', () => {
    const g = { hands: [
      { n: 1, board: [], shown: [], private: { Ana: ['As', 'Ac'], Bel: ['Ac', 'Kc'] } },
      { n: 2, board: [], shown: [], private: { Ana: ['2s', '3c'], Bel: ['Ac', 'Kc'] } },
    ] } as unknown as Game;
    expect(clashHands(g, 'Ana')).toEqual([1]);
    expect(clashHands(g, 'Bel')).toEqual([1]);
  });

  it('flags both players who hold the same card', () => {
    expect(clashingPlayers(hand({ private: { a: ['As', 'Kd'], b: ['As', '3h'], c: ['2c', '4d'] } })).sort()).toEqual(['a', 'b']);
  });
  it('flags a private card that is on the board', () => {
    expect(clashingPlayers(hand({ private: { a: ['As', 'Kd'] }, board: ['As', '9d', '2c'] }))).toEqual(['a']);
  });
  it('flags a private card another player showed, but not the same player', () => {
    const h = hand({ private: { a: ['As', 'Kd'], b: ['2c', '3h'] }, shown: [{ playerId: 'b', cards: ['As', 'Kh'] }] });
    expect(clashingPlayers(h)).toEqual(['a']);
    expect(clashingPlayers(hand({ private: { b: ['As', 'Kh'] }, shown: [{ playerId: 'b', cards: ['As', 'Kh'] }] }))).toEqual([]);
  });
  it('reads the older single-owner form', () => {
    expect(clashingPlayers(hand({ mine: { playerId: 'a', cards: ['As', 'Kd'] }, board: ['Kd'] }))).toEqual(['a']);
  });
});
