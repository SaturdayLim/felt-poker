import { describe, expect, it } from 'vitest';
import { clashHands, clashingPlayers, clashWhy, effectivePairs, fullPairs } from './clash';
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
    // a holds a card b showed. b's effective pair is the shown pair, which a's entry contradicts: b is flagged as well
    expect(clashingPlayers(h).sort()).toEqual(['a', 'b']);
    expect(clashingPlayers(hand({ private: { b: ['As', 'Kh'] }, shown: [{ playerId: 'b', cards: ['As', 'Kh'] }] }))).toEqual([]);
  });
  it('shown cards override the own entry: a difference is no clash and no reason', () => {
    const h = hand({ private: { a: ['As', 'Kd'] }, shown: [{ playerId: 'a', cards: ['2c', '3h'] }] });
    expect(clashingPlayers(h)).toEqual([]);
    expect(clashWhy(h, 'a')).toEqual([]);
    expect(effectivePairs(h)).toEqual({ a: ['2c', '3h'] });
    expect(clashingPlayers(hand({ private: { a: ['Kd', 'As'] }, shown: [{ playerId: 'a', cards: ['As', 'Kd'] }] }))).toEqual([]);
  });
  it('a dropped entry is read as the shown cards: another entry that holds one of them clashes', () => {
    // a entered As Kd but showed 2c 3h. b entered 2c 9d: that card is a shown card, so b is red and a is blue.
    const h = hand({ private: { a: ['As', 'Kd'], b: ['2c', '9d'] }, shown: [{ playerId: 'a', cards: ['2c', '3h'] }] });
    expect(clashingPlayers(h).sort()).toEqual(['a', 'b']);
    expect(clashWhy(h, 'b')).toEqual(['shown']);
    expect(clashWhy(h, 'a')).toEqual(['entry']);
    // the dropped entry (As Kd) clashes with nothing: c holding As is fine
    const h2 = hand({ private: { a: ['As', 'Kd'], c: ['As', 'Qd'] }, shown: [{ playerId: 'a', cards: ['2c', '3h'] }] });
    expect(clashingPlayers(h2)).toEqual([]);
  });
  it('reads the older single-owner form', () => {
    expect(clashingPlayers(hand({ mine: { playerId: 'a', cards: ['As', 'Kd'] }, board: ['Kd'] }))).toEqual(['a']);
  });
});

describe('clashWhy', () => {
  it('names the board, a shown hand or another hidden entry, and nothing for a clean entry', () => {
    const h = hand({ private: { a: ['As', 'Kd'], b: ['Kd', '3h'], c: ['2c', '4d'], d: ['9s', '8s'] }, board: ['As', '7c', '6h'], shown: [{ playerId: 'e', cards: ['2c', 'Jh'] }] });
    expect(clashWhy(h, 'a').sort()).toEqual(['board', 'entry']);
    expect(clashWhy(h, 'b')).toEqual(['entry']);
    expect(clashWhy(h, 'c')).toEqual(['shown']);
    expect(clashWhy(h, 'd')).toEqual([]);
  });
});

describe('clash levels', () => {
  it('red for the table, blue for another entry; red pairs drop out of counted pairs unless the check is off', async () => {
    const { clashLevel, countedPairs } = await import('./clash');
    const h = hand({ private: { a: ['As', 'Kd'], b: ['Kd', '3h'], c: ['2c', '4d'] }, board: ['As', '7c', '6h'] });
    expect(clashLevel(h, 'a')).toBe('red');
    expect(clashLevel(h, 'b')).toBe('blue');
    expect(clashLevel(h, 'c')).toBeNull();
    expect(Object.keys(countedPairs(h)).sort()).toEqual(['b', 'c']);
    expect(Object.keys(countedPairs(h, false)).sort()).toEqual(['a', 'b', 'c']);
  });
  it('counted pairs use the shown cards over the entry', async () => {
    const { countedPairs } = await import('./clash');
    const h = hand({ private: { a: ['As', 'Kd'] }, shown: [{ playerId: 'a', cards: ['2c', '3h'] }] });
    expect(countedPairs(h)).toEqual({ a: ['2c', '3h'] });
  });
});
