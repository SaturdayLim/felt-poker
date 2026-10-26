import { describe, expect, it } from 'vitest';
import { bestHand } from './cards';
import { suggestTransfers, playerResult, gameResults, chipDiscrepancy } from './calc';
import type { Game } from '../types';

describe('bestHand', () => {
  it('ranks categories', () => {
    expect(bestHand(['As', 'Ks', 'Qs', 'Js', 'Ts', '2d', '3c'])!.name).toBe('Royal Flush');
    expect(bestHand(['5s', '4s', '3s', '2s', 'As', 'Kd', 'Kc'])!.name).toBe('Straight Flush');
    expect(bestHand(['Ah', 'Ad', 'Ac', 'As', 'Kd', '2c', '3c'])!.name).toBe('Four of a Kind');
    expect(bestHand(['Ah', 'Ad', 'Ac', 'Ks', 'Kd', '2c', '3c'])!.name).toBe('Full House');
    expect(bestHand(['Ah', '9h', '7h', '4h', '2h', 'Kd', 'Kc'])!.name).toBe('Flush');
    expect(bestHand(['Ah', '2d', '3c', '4s', '5h', 'Kd', 'Qc'])!.name).toBe('Straight');
    expect(bestHand(['7h', '7d', '7c', '4s', '5h', 'Kd', 'Qc'])!.name).toBe('Three of a Kind');
    expect(bestHand(['7h', '7d', '4c', '4s', '5h', 'Kd', 'Qc'])!.name).toBe('Two Pair');
    expect(bestHand(['7h', '7d', '2c', '4s', '9h', 'Kd', 'Qc'])!.name).toBe('Pair');
    expect(bestHand(['7h', '8d', '2c', '4s', 'Jh', 'Kd', 'Qc'])!.name).toBe('High Card');
  });
  it('compares kickers', () => {
    const a = bestHand(['Ah', 'Kd', '7c', '7s', '2h', '3d', '9c'])!;
    const b = bestHand(['Qh', 'Jd', '7c', '7s', '2h', '3d', '9c'])!;
    expect(a.score).toBeGreaterThan(b.score);
    const wheel = bestHand(['Ah', '2d', '3c', '4s', '5h'])!;
    const six = bestHand(['6h', '2d', '3c', '4s', '5h'])!;
    expect(six.score).toBeGreaterThan(wheel.score);
  });
});

describe('settlement', () => {
  it('produces minimal balanced transfers', () => {
    const t = suggestTransfers([
      { playerId: 'a', balance: 30 }, { playerId: 'b', balance: -20 },
      { playerId: 'c', balance: -10 }, { playerId: 'd', balance: 0 },
    ]);
    expect(t).toEqual([{ from: 'b', to: 'a', amount: 20 }, { from: 'c', to: 'a', amount: 10 }]);
  });
  it('computes cash results with unit value and expenses', () => {
    const g = {
      id: 'g', type: 'cash', unitValue: 0.1, playerIds: ['a', 'b'],
      buyIns: [{ id: '1', playerId: 'a', amount: 200, at: 0 }, { id: '2', playerId: 'b', amount: 200, at: 0 }, { id: '3', playerId: 'b', amount: 200, at: 1 }],
      cashOuts: [{ id: '4', playerId: 'a', amount: 450, at: 2 }, { id: '5', playerId: 'b', amount: 150, at: 2 }],
      expenses: [{ id: 'e', label: 'Pizza', amount: 10, paidBy: 'a', splitAmong: ['a', 'b'] }],
      hands: [], statusEvents: [], transfers: [], seats: {},
    } as unknown as Game;
    expect(chipDiscrepancy(g)).toBe(0);
    expect(playerResult(g, 'a')).toMatchObject({ in: 20, out: 45, net: 25, expenses: 5, balance: 30 });
    expect(playerResult(g, 'b')).toMatchObject({ in: 40, out: 15, net: -25, expenses: -5, balance: -30 });
    expect(suggestTransfers(gameResults(g))).toEqual([{ from: 'b', to: 'a', amount: 30 }]);
  });
});

import { buildPots, positionSplit, timePlayed } from './calc';

const table = (over: Partial<Game> = {}) => ({
  id: 't', type: 'cash', sb: 1, bb: 2, unitValue: 0.1,
  playerIds: ['btn', 'sb', 'bb', 'utg'], seats: { btn: 1, sb: 2, bb: 3, utg: 4 },
  buyIns: [], cashOuts: [], expenses: [], hands: [], statusEvents: [], transfers: [], ...over,
}) as unknown as Game;

describe('positionSplit', () => {
  it('gives odd chips to the winners closest to the left of the button', () => {
    expect(positionSplit(table(), 5, ['btn', 'sb', 'bb'], 'btn')).toEqual({ sb: 2, bb: 2, btn: 1 });
    expect(positionSplit(table(), 7, ['utg', 'btn'], 'btn')).toEqual({ utg: 4, btn: 3 });
    expect(positionSplit(table(), 6, ['utg', 'btn'], 'btn')).toEqual({ utg: 3, btn: 3 });
  });
  it('rounds to the small blind step', () => {
    expect(positionSplit(table({ sb: 25 }), 150, ['sb', 'bb', 'btn'], 'btn')).toEqual({ sb: 50, bb: 50, btn: 50 });
    expect(positionSplit(table({ sb: 25 }), 175, ['sb', 'bb', 'btn'], 'btn')).toEqual({ sb: 75, bb: 50, btn: 50 });
  });
});

describe('buildPots', () => {
  it('makes a main pot and side pots from all-in amounts', () => {
    const pots = buildPots([
      { playerId: 'a', putIn: 50, folded: false },
      { playerId: 'b', putIn: 120, folded: false },
      { playerId: 'c', putIn: 120, folded: false },
      { playerId: 'd', putIn: 30, folded: true },
    ]);
    expect(pots).toEqual([
      { amount: 180, eligible: ['a', 'b', 'c'] },
      { amount: 140, eligible: ['b', 'c'] },
    ]);
  });
  it('merges pots with the same contenders', () => {
    expect(buildPots([{ playerId: 'a', putIn: 40, folded: false }, { playerId: 'b', putIn: 40, folded: false }, { playerId: 'c', putIn: 80, folded: true }]))
      .toEqual([{ amount: 160, eligible: ['a', 'b'] }]);
  });
});

describe('timePlayed', () => {
  it('pauses while away', () => {
    const g = table({ statusEvents: [
      { playerId: 'sb', status: 'playing', at: 0 },
      { playerId: 'sb', status: 'away', at: 60_000 },
      { playerId: 'sb', status: 'playing', at: 180_000 },
      { playerId: 'sb', status: 'out', at: 240_000 },
    ] } as Partial<Game>);
    expect(timePlayed(g, 'sb')).toBe(120_000);
  });
});
