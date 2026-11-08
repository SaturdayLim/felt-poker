import { describe, expect, it } from 'vitest';
import type { Game, Hand } from '../types';
import { bustedPlayers, estimateStacks, rebuyDefault, rebuyOffered } from './stacks';

const bustHand = (bWins = 400): Hand => ({
  id: 'h1', n: 1, at: 10, endedAt: 20, pot: 400, winners: [{ playerId: 'B', amount: bWins }], board: [], shown: [],
  log: { v: 1, mode: 'bets', dealt: ['A', 'B', 'C'], streets: { preflop: { bets: { A: 200, B: 200, C: 0 }, prev: {}, typed: {}, folded: ['C'], raisers: [], at: 15 } }, allInAt: {}, runs: 1, runCards: [], shown: {}, mucked: [], startedAt: 10 },
} as unknown as Hand);
const game = (over: Partial<Game> = {}): Game => {
  const h = bustHand();
  return {
    id: 'g', name: 'g', type: 'cash', status: 'live', createdAt: 0, startedAt: 0, currency: 'S$', unitValue: 0.1, sb: 1, bb: 2, defaultBuyIn: 200,
    playerIds: ['A', 'B', 'C'], seats: { A: 1, B: 2, C: 3 },
    buyIns: ['A', 'B', 'C'].map((p, i) => ({ id: `b${i}`, playerId: p, amount: 200, at: 1 })),
    cashOuts: [], statusEvents: ['A', 'B', 'C'].map((p) => ({ playerId: p, status: 'playing' as const, at: 1 })), hands: [h], expenses: [], transfers: [], ...over,
  } as Game;
};

describe('bust and rebuy', () => {
  it('lists the players whose exact stack is 0 after the hand', () => {
    const g = game();
    expect(estimateStacks(g).stack).toMatchObject({ A: 0, B: 400, C: 200 });
    expect(bustedPlayers(g, g.hands[0])).toEqual(['A']);
  });
  it('ignores tournaments, ranges and clocked-out players', () => {
    const t = game({ type: 'tournament' });
    expect(bustedPlayers(t, t.hands[0])).toEqual([]);
    const g = game();
    // a pot-count hand leaves a spread: the stack is a range, never exactly 0
    const count = { ...g.hands[0], log: { ...g.hands[0].log!, mode: 'count' as const, streets: { preflop: { bets: {}, prev: {}, typed: {}, folded: ['C'], raisers: [], pot: 400, at: 15 } } } } as Hand;
    expect(bustedPlayers({ ...g, hands: [count] }, count)).toEqual([]);
    const out = game({ statusEvents: [...game().statusEvents, { playerId: 'A', status: 'out', at: 30 }] });
    expect(bustedPlayers(out, out.hands[0])).toEqual([]);
  });
  it('defaults to the largest whole multiple of the buy-in up to the biggest other stack, at least 1', () => {
    expect(rebuyDefault(game(), 'A')).toBe(400);
    // the others count 150 and 90: less than 1 buy-in, so the default is 1 buy-in
    const small = game({ counts: [{ id: 'k1', playerId: 'B', chips: 150, at: 25 }, { id: 'k2', playerId: 'C', chips: 90, at: 25 }] });
    expect(rebuyDefault(small, 'A')).toBe(200);
    // 590 chips: 2 whole buy-ins, rounded down
    const mid = game({ counts: [{ id: 'k1', playerId: 'B', chips: 590, at: 25 }] });
    expect(rebuyDefault(mid, 'A')).toBe(400);
    // the busted player's own stack and players who are out are left out
    const lone = game({ statusEvents: [...game().statusEvents, { playerId: 'B', status: 'out', at: 30 }] });
    expect(rebuyDefault(lone, 'A')).toBe(200);
  });
  it('is not offered again once a buy-in came after the hand closed', () => {
    const g = game();
    expect(rebuyOffered(g, g.hands[0], 'A')).toBe(true);
    expect(rebuyOffered(g, g.hands[0], 'B')).toBe(false);
    const rebought = game({ buyIns: [...g.buyIns, { id: 'r', playerId: 'A', amount: 400, at: 25 }] });
    expect(rebuyOffered(rebought, rebought.hands[0], 'A')).toBe(false);
  });
});
