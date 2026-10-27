import { describe, expect, it } from 'vitest';
import type { Game } from '../types';
import { actionClosed, contributions, finalists, inAtStart, newLog, openStreet, pfr, resolve, setStreetPot, tapPlayer, typeBet, vpip } from './hand';

const ids = ['CY', 'Edwin', 'Mike', 'Fabian', 'Everett'];
const game = () => ({
  id: 'g', type: 'cash', sb: 1, bb: 2, unitValue: 0.1, playerIds: ids,
  seats: { CY: 1, Edwin: 2, Mike: 3, Fabian: 4, Everett: 5 },
  buyIns: [], cashOuts: [], expenses: [], hands: [], statusEvents: [], transfers: [],
}) as unknown as Game;

describe('bet entry', () => {
  it('posts blinds and has everyone call the big blind', () => {
    const log = newLog(game(), ids, 'bets', 'Edwin');
    expect(log.streets.preflop!.bets).toEqual({ Mike: 2, Fabian: 2, Everett: 2, CY: 2, Edwin: 2 });
    expect(log.streets.preflop!.prev).toMatchObject({ Mike: 1, Fabian: 2, Everett: 0 });
  });

  it('a raise updates callers; a fold keeps only what was in before', () => {
    const g = game();
    let log = newLog(g, ids, 'bets', 'Edwin');
    log = typeBet(g, log, 'preflop', 'CY', 20);
    expect(log.streets.preflop!.bets).toMatchObject({ CY: 20, Edwin: 20, Mike: 20, Fabian: 20, Everett: 20 });
    log = tapPlayer(log, 'preflop', 'Mike');      // small blind folds: 1 stays in
    log = tapPlayer(log, 'preflop', 'Everett');   // limped 2, folds to the raise
    expect(log.streets.preflop!.bets).toMatchObject({ Mike: 1, Everett: 2 });
    expect(pfr(log, 'CY')).toBe(true);
    expect(vpip(g, log, 'Everett', 'Edwin')).toBe(true); // limped then folded: still voluntary
    expect(vpip(g, log, 'Mike', 'Edwin')).toBe(false);
    expect(inAtStart(log, 'flop')).toEqual(['CY', 'Edwin', 'Fabian']);
  });

  it('replays hand 22: two all-ins, an uncalled 36 returned, run twice', () => {
    const g = game();
    const stacks = { CY: 116, Edwin: 1000, Mike: 50, Fabian: 154, Everett: 50 };
    let log = newLog(g, ids, 'bets', 'Edwin', stacks);
    log = typeBet(g, log, 'preflop', 'CY', 20, stacks);
    log = tapPlayer(log, 'preflop', 'Mike', stacks);
    log = tapPlayer(log, 'preflop', 'Everett', stacks);
    log = typeBet(g, log, 'preflop', 'Everett', 0, stacks); // Everett had not limped: override to 0
    log = openStreet(g, log, 'flop', stacks);
    log = openStreet(g, log, 'turn', stacks);
    log = typeBet(g, log, 'turn', 'Edwin', 170, stacks);
    expect(log.streets.turn!.bets).toEqual({ CY: 96, Edwin: 170, Fabian: 134 });
    expect(Object.keys(log.allInAt!).sort()).toEqual(['CY', 'Fabian']);
    expect(actionClosed(log, 'turn')).toBe(true);
    expect(contributions(g, log, 'Edwin')).toEqual({ CY: 116, Edwin: 190, Mike: 1, Fabian: 154, Everett: 0 });

    log = { ...log, runs: 2, runFrom: 4, runCards: [['5c'], ['8h']], shown: { CY: ['7d', '2c'], Edwin: ['9h', 'Jh'], Fabian: ['Qc', '9d'] } };
    const r = resolve(g, log, ['Qd', '7s', '6h', 'Th', '5c'], 'Edwin', {});
    expect(r.returned).toEqual({ Edwin: 36 });
    expect(r.pots.map((p) => [p.amount, p.eligible.sort()])).toEqual([[349, ['CY', 'Edwin', 'Fabian']], [76, ['Edwin', 'Fabian']]]);
    expect(r.pots[0].runs.map((x) => x.winners)).toEqual([['Fabian'], ['Edwin']]);
    expect(Object.fromEntries(r.winners.map((w) => [w.playerId, w.amount]))).toEqual({ Fabian: 213, Edwin: 212 });
    expect(r.missing).toBe(false);
    expect(finalists(log).sort()).toEqual(['CY', 'Edwin', 'Fabian']);
  });
});

describe('pot counting', () => {
  it('estimates wagers from each street pot', () => {
    const g = game();
    let log = newLog(g, ids, 'count', 'Edwin');
    log = tapPlayer(log, 'preflop', 'Mike');    // folds the small blind
    log = tapPlayer(log, 'preflop', 'Everett');
    log = setStreetPot(log, 'preflop', 61);
    log = openStreet(g, log, 'flop');
    log = tapPlayer(log, 'flop', 'CY');
    log = setStreetPot(log, 'flop', 101);
    const c = contributions(g, log, 'Edwin');
    expect(c).toEqual({ CY: 20, Edwin: 40, Mike: 1, Fabian: 40, Everett: 0 });
    expect(vpip(g, log, 'CY', 'Edwin')).toBe(true);
    expect(vpip(g, log, 'Mike', 'Edwin')).toBe(false);
  });
});

describe('all-in detection', () => {
  it('a call that uses the whole stack is all-in, and closes the action', () => {
    const g = game();
    const stacks = { CY: 200, Edwin: 200, Mike: 200, Fabian: 200, Everett: 200 };
    let log = newLog(g, ids, 'bets', 'Edwin', stacks);
    log = tapPlayer(log, 'preflop', 'Everett', stacks);
    log = typeBet(g, log, 'preflop', 'CY', 20, stacks);
    log = tapPlayer(log, 'preflop', 'Mike', stacks);
    log = openStreet(g, log, 'flop', stacks);
    log = typeBet(g, log, 'flop', 'Fabian', 30, stacks);
    log = openStreet(g, log, 'turn', stacks);
    log = typeBet(g, log, 'turn', 'Edwin', 300, stacks);
    expect(log.streets.turn!.bets).toEqual({ Fabian: 150, CY: 150, Edwin: 150 });
    expect(Object.keys(log.allInAt!).sort()).toEqual(['CY', 'Edwin', 'Fabian']);
    expect(actionClosed(log, 'turn')).toBe(true);
  });
});
