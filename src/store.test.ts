import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => undefined, del: async () => undefined }));
import { useStore } from './store';
import { estimateStacks } from './lib/stacks';
import { hasCashedOut, playerStatus } from './lib/calc';

const st = () => useStore.getState();

/** A cash game with three players and a 200 buy-in each, time under test control. */
function setup() {
  const [a, b, c] = ['a', 'b', 'c'].map((n) => st().addPlayer(n).id);
  const g = st().createGame({ type: 'cash', name: 'T', playerIds: [a, b], currency: 'S$', unitValue: 0.1, sb: 1, bb: 2, defaultBuyIn: 200, tournamentBuyIn: 20, startingStack: 10000, autoBuyIn: true, rules: {} as never });
  const game = () => st().games.find((x) => x.id === g.id)!;
  const stack = (p: string) => estimateStacks(game()).stack[p];
  const tick = () => vi.advanceTimersByTime(1000);
  return { a, b, c, id: g.id, game, stack, tick };
}

describe('stacks before the game starts', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(1_000_000); useStore.setState({ players: [], games: [] }); });
  afterEach(() => vi.useRealTimers());

  it('adding, clocking out, + and deleting a buy-in never drops a playing stack to 0', () => {
    const { a, b, c, id, game, stack, tick } = setup();
    tick(); st().addPlayerToGame(id, c);
    expect([stack(a), stack(b), stack(c)]).toEqual([200, 200, 200]);
    tick(); st().clockOut(id, a, 150);
    expect(stack(a)).toBe(0);
    // the + on a player who is out: back with the 150 left, plus the new 200
    tick(); st().addBuyIn(id, a, 200);
    expect(playerStatus(game(), a)).toBe('playing');
    expect(hasCashedOut(game(), a)).toBe(false);
    expect(stack(a)).toBe(350);
    // deleting that buy-in leaves the chips from before, not 0
    tick(); st().removeBuyIn(id, game().buyIns.filter((x) => x.playerId === a).at(-1)!.id);
    expect(stack(a)).toBe(150);
    expect(playerStatus(game(), a)).toBe('playing');
    expect([stack(b), stack(c)]).toEqual([200, 200]);
  });

  it('the old cash-out never lingers on a player who plays again', () => {
    const { a, id, game, stack, tick } = setup();
    tick(); st().clockOut(id, a, 120);
    tick(); st().addBuyIn(id, a, 200);
    tick(); st().clockOut(id, a, 300);
    // one clock-out of 300, not 120 + 300
    expect(game().cashOuts.filter((x) => x.playerId === a).map((x) => x.amount)).toEqual([300]);
    tick(); expect(st().backIn(id, a)).toEqual({ kind: 'resumed', chips: 300 });
    expect(stack(a)).toBe(300);
  });

  it('back in after a clock-out of 0 chips buys in: the stack is never silently 0', () => {
    const { a, id, game, stack, tick } = setup();
    tick(); st().clockOut(id, a, 0);
    tick(); expect(st().backIn(id, a)).toEqual({ kind: 'rebuy', chips: 200 });
    expect(playerStatus(game(), a)).toBe('playing');
    expect(hasCashedOut(game(), a)).toBe(false);
    expect(game().cashOuts.filter((x) => x.playerId === a)).toEqual([]);
    expect(stack(a)).toBe(200);
  });

  it('+ on a player clocked out with 0 chips drops the 0 cash-out and buys in', () => {
    const { a, id, game, stack, tick } = setup();
    tick(); st().clockOut(id, a, 0);
    tick(); st().addBuyIn(id, a, 200);
    expect(hasCashedOut(game(), a)).toBe(false);
    expect(playerStatus(game(), a)).toBe('playing');
    expect(stack(a)).toBe(200);
  });

  it('back in with chips left writes those chips as the count', () => {
    const { a, id, game, stack, tick } = setup();
    tick(); st().clockOut(id, a, 90);
    tick(); expect(st().backIn(id, a)).toEqual({ kind: 'resumed', chips: 90 });
    expect(game().counts?.at(-1)).toMatchObject({ playerId: a, chips: 90 });
    expect(stack(a)).toBe(90);
  });

  it('a player with no cash-out who is out comes back with a default buy-in', () => {
    const { a, id, stack, tick } = setup();
    tick(); st().setStatus(id, a, 'out');
    tick(); expect(st().backIn(id, a)).toEqual({ kind: 'rebuy', chips: 200 });
    expect(stack(a)).toBe(400);
  });
});
