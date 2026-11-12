import { describe, expect, it } from 'vitest';
import type { Game, Hand } from '../types';
import { bustedAfterSave, bustedPlayers, estimateStacks, needsCount, rebuyDefault, rebuyOffered, roomFrom, shoveAt, stackBounds, type StackEstimate } from './stacks';

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
  it('defaults to one buy-in, whatever the biggest stack is', () => {
    expect(rebuyDefault(game(), 'A')).toBe(200);
    const mid = game({ counts: [{ id: 'k1', playerId: 'B', chips: 590, at: 25 }] });
    expect(rebuyDefault(mid, 'A')).toBe(200);
    expect(rebuyDefault({ ...game(), defaultBuyIn: 0 }, 'A')).toBe(0);
  });
  it('is not offered again once a buy-in came after the hand closed', () => {
    const g = game();
    expect(rebuyOffered(g, g.hands[0], 'A')).toBe(true);
    expect(rebuyOffered(g, g.hands[0], 'B')).toBe(false);
    const rebought = game({ buyIns: [...g.buyIns, { id: 'r', playerId: 'A', amount: 400, at: 25 }] });
    expect(rebuyOffered(rebought, rebought.hands[0], 'A')).toBe(false);
  });
  it('bustedAfterSave offers only when no later hand exists', () => {
    const g = game();
    expect(bustedAfterSave(g, g.hands[0])).toEqual(['A']);
    const later = { ...bustHand(), id: 'h2', n: 2, at: 40, endedAt: 50 } as Hand;
    const edited = { ...g, hands: [g.hands[0], later] };
    expect(bustedAfterSave(edited, edited.hands[0])).toEqual([]);
    // the latest hand still offers
    expect(bustedAfterSave({ ...g, hands: [g.hands[0]] }, g.hands[0])).toEqual(['A']);
    // a rebuy already taken ends the offer
    const rebought = game({ buyIns: [...g.buyIns, { id: 'r', playerId: 'A', amount: 400, at: 25 }] });
    expect(bustedAfterSave(rebought, rebought.hands[0])).toEqual([]);
  });
});

describe('needsCount', () => {
  const estHand = (): Hand => {
    const h = bustHand();
    h.log!.streets.preflop!.acts = { A: [{ k: 'allin', to: 150, est: true } as never] };
    h.log!.allInAt = { A: 'preflop' };
    return h;
  };
  it('names a player whose all-in was logged at the low end of a range, until a count comes after the hand', () => {
    const g = game({ hands: [estHand()] });
    expect(needsCount(g)).toEqual(['A']);
    const early = game({ hands: [estHand()], counts: [{ id: 'k0', playerId: 'A', chips: 90, at: 5 }] });
    expect(needsCount(early)).toEqual(['A']); // a count before the hand closed does not clear it
    const counted = game({ hands: [estHand()], counts: [{ id: 'k1', playerId: 'A', chips: 90, at: 25 }] });
    expect(needsCount(counted)).toEqual([]);
  });
  it('ignores an exact all-in and a missed hand', () => {
    const h = bustHand();
    h.log!.streets.preflop!.acts = { A: [{ k: 'allin', to: 200 }] };
    expect(needsCount(game({ hands: [h] }))).toEqual([]);
    expect(needsCount(game({ hands: [{ ...estHand(), missed: true } as Hand] }))).toEqual([]);
  });
});

describe('stackBounds and all-in room', () => {
  const est = (stack: number, spread: number): StackEstimate => ({ stack: { A: stack }, spread: { A: spread }, complete: spread === 0 });
  it('an exact stack has one end', () => {
    expect(stackBounds(game(), est(200, 0), 'A')).toEqual({ lo: 200, hi: 200 });
    expect(stackBounds(game(), est(197.36, 0), 'A')).toEqual({ lo: 197, hi: 197 });
  });
  it('a range floors the low end and ceils the high end to the big blind', () => {
    expect(stackBounds(game(), est(197.36, 33.1), 'A')).toEqual({ lo: 164, hi: 232 });
  });
  it('never goes below 0', () => {
    expect(stackBounds(game(), est(10, 40), 'A')).toEqual({ lo: 0, hi: 50 });
    expect(stackBounds(game(), est(-5, 0), 'A')).toEqual({ lo: 0, hi: 0 });
  });
  it('a range is an all-in only at or above the high end, logged at the floored low end', () => {
    const r = roomFrom(undefined, { lo: 164, hi: 232 }, 0)!;
    expect(r).toEqual({ room: 164, high: 232, range: true });
    expect(shoveAt(r, 100)).toBe(false);
    expect(shoveAt(r, 231)).toBe(false);
    expect(shoveAt(r, 232)).toBe(true);
    expect(shoveAt(r, 400)).toBe(true);
  });
  it('chips put in on earlier streets come off both ends', () => {
    expect(roomFrom(undefined, { lo: 164, hi: 232 }, 20)).toEqual({ room: 144, high: 212, range: true });
  });
  it('an exact stack is an all-in at or above the stack', () => {
    const r = roomFrom(197, undefined, 0)!;
    expect(r).toEqual({ room: 197, high: 197, range: false });
    expect(shoveAt(r, 196)).toBe(false);
    expect(shoveAt(r, 197)).toBe(true);
  });
  it('no room means no shove; a minimum raise at the high end already shoves', () => {
    expect(shoveAt(undefined, 50)).toBe(false);
    expect(shoveAt(roomFrom(undefined, { lo: 0, hi: 0 }, 0), 50)).toBe(false);
    expect(shoveAt(roomFrom(undefined, { lo: 20, hi: 40 }, 0), 40)).toBe(true); // minimum raise 40 with nothing typed
  });
});
