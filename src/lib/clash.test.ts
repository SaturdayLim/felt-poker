import { describe, expect, it } from 'vitest';
import { clashingPlayers } from './clash';
import type { Hand } from '../types';

const hand = (over: Partial<Hand>): Hand => ({ id: 'h', n: 1, at: 0, pot: 0, winners: [], board: [], shown: [], ...over } as Hand);

describe('clashingPlayers', () => {
  it('is empty when private cards are unique', () => {
    expect(clashingPlayers(hand({ private: { a: ['As', 'Kd'], b: ['2c', '3h'] }, board: ['9s', 'Td', 'Jh'] }))).toEqual([]);
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
