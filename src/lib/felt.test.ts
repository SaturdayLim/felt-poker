import { describe, expect, it } from 'vitest';
import { chipCols, feltAt, feltPots, feltSteps, seatSpots, type FeltAction, type FeltHand } from './felt';

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe('seatSpots', () => {
  it('keeps each seat\'s cards, chips and button nearer to its own photo than to any other, for 2 to 10 players', () => {
    for (const [w, h] of [[2000, 1000], [520, 260]]) {
      for (let n = 2; n <= 10; n++) {
        const spots = seatSpots(w, h, n);
        spots.forEach((s, i) => {
          for (const part of [s.hole, s.bet, s.dealer, s.stack(0), s.stack(3)]) {
            const own = dist(part, s.seat);
            spots.forEach((o, j) => { if (j !== i) expect(own, `${n} players, seat ${i} against seat ${j}`).toBeLessThan(dist(part, o.seat)); });
          }
          // hole cards and the stack stay close: within a third of the table height from the photo
          expect(dist(s.hole, s.seat)).toBeLessThan(h * 0.33);
          expect(dist(s.stack(3), s.seat)).toBeLessThan(h * 0.33);
        });
      }
    }
  });
});

describe('feltPots', () => {
  it('names the growing pot first and gives the capped pot the all-in player', () => {
    expect(feltPots({ a: 40, b: 90, c: 90, d: 1 }, ['a'], ['d'])).toEqual([{ amount: 100, who: [] }, { amount: 121, who: ['a'] }]);
  });
  it('is one pot with nobody all-in', () => {
    expect(feltPots({ a: 6, b: 6, c: 2 }, [], ['c'])).toEqual([{ amount: 14, who: [] }]);
  });
});

describe('feltAt', () => {
  const act = (id: string, seg: FeltAction['seg'], k: FeltAction['k'], to: number, add: number, allin = false): FeltAction => ({ id, seg, k, to, add, allin });
  const acts = [act('a', 'preflop', 'sb', 1, 1), act('b', 'preflop', 'bb', 2, 2), act('c', 'preflop', 'raise', 6, 6), act('a', 'preflop', 'fold', 1, 0), act('b', 'preflop', 'call', 6, 4), act('b', 'flop', 'check', 0, 0), act('c', 'flop', 'bet', 10, 10)];
  const hand: FeltHand = {
    n: 1, live: false, players: ['a', 'b', 'c'].map((id, hue) => ({ id, name: id, hue })), dealt: ['a', 'b', 'c'], button: 'c',
    steps: feltSteps(acts, { board: 5, show: true, win: true }), start: { a: 100, b: 100, c: 100 }, board: ['Ah', 'Kd', '2c', '7s', '9h'], shown: {}, pays: [{ id: 'c', amount: 23 }],
    toActEnd: null, bb: 2, showdown: true, winners: ['c'],
  };
  it('adds a deal step for each street, a showdown and a win', () => {
    expect(hand.steps.map((s) => s.k)).toEqual(['sb', 'bb', 'raise', 'fold', 'call', 'deal', 'check', 'bet', 'deal', 'deal', 'show', 'win']);
  });
  it('replays stacks, bets, pots, labels and the player to act', () => {
    const pre = feltAt(hand, 3);
    expect(pre.bets).toEqual({ a: 1, b: 2, c: 6 });
    expect(pre.act.c).toBe('Raise to 6');
    expect(pre.toAct).toBe('a');
    const flop = feltAt(hand, 8);
    expect(flop.boardCount).toBe(3);
    expect(flop.pots).toEqual([{ amount: 13, who: [] }]);
    expect(flop.bets).toEqual({ c: 10 });
    expect(flop.stacks).toEqual({ a: 99, b: 94, c: 84 });
    expect(flop.folded).toEqual(['a']);
    const end = feltAt(hand, hand.steps.length);
    expect(end.paid).toBe(true);
    expect(end.pots).toEqual([]);
    expect(end.stacks.c).toBe(107);
  });
});

describe('chipCols', () => {
  it('gives no more columns than asked and none for nothing', () => {
    expect(chipCols(0, 2)).toEqual([]);
    expect(chipCols(1234, 2, 4).length).toBeLessThanOrEqual(4);
    expect(chipCols(1, 2).length).toBe(1);
  });
});
