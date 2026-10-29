import { describe, expect, it } from 'vitest';
import type { Game } from '../types';
import { minRaiseTo, actionClosed, closeStreet, contributions, fillBefore, finalists, inAtEnd, inAtStart, newBoxLog, newLog, openStreet, openStreetBoxes, pfr, potTotal, replayStreet, resolve, rowOrder, setAct, setStreetPot, streetOrder, tapPlayer, typeBet, vpip } from './hand';

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

describe('action order', () => {
  it('after the flop, action starts left of the button: the big blind acts before the cutoff', () => {
    const g = game();
    let log = newLog(g, ids, 'bets', 'Edwin');
    log = tapPlayer(log, 'preflop', 'Everett');
    log = tapPlayer(log, 'preflop', 'Mike');
    log = openStreet(g, log, 'flop');
    const live = inAtStart(log, 'flop');
    expect(streetOrder(g, log, 'flop').filter((p) => live.includes(p))).toEqual(['Fabian', 'CY', 'Edwin']);
    expect(streetOrder(g, log, 'preflop')).toEqual(['Everett', 'CY', 'Edwin', 'Mike', 'Fabian']);
  });
});

describe('action boxes', () => {
  // The user's mockup: button Bel, SB Gab, BB Clar, then Nat, Ev, Nic. Everyone has 200.
  const six = ['Bel', 'Gab', 'Clar', 'Nat', 'Ev', 'Nic'];
  const g6 = () => ({ ...game(), playerIds: six, seats: Object.fromEntries(six.map((p, i) => [p, i + 1])) }) as unknown as Game;
  const stacks = Object.fromEntries(six.map((p) => [p, 200]));

  it('rows run from the small blind to the button; blinds post in column 1 and act from column 2', () => {
    const g = g6();
    const log = newBoxLog(g, six, 'Bel', stacks);
    expect(rowOrder(g, log)).toEqual(['Gab', 'Clar', 'Nat', 'Ev', 'Nic', 'Bel']);
    const rp = replayStreet(g, log, 'preflop', stacks);
    expect(rp.cells.Gab[0]).toMatchObject({ post: true, amount: 1 });
    expect(rp.cells.Clar[0]).toMatchObject({ post: true, amount: 2 });
    expect(rp.cols).toBe(1);
    expect(rp.next).toEqual({ p: 'Nat', r: 0 });
    expect(potTotal(g, log)).toBe(3);
  });

  it('replays the mockup: a raise opens column 2, a re-raise opens column 3 for one player', () => {
    const g = g6();
    let log = newBoxLog(g, six, 'Bel', stacks);
    log = setAct(g, log, 'preflop', 'Nat', 0, { k: 'call' }, stacks);
    log = setAct(g, log, 'preflop', 'Ev', 0, { k: 'call' }, stacks);
    expect(replayStreet(g, log, 'preflop', stacks).cols).toBe(1);
    log = setAct(g, log, 'preflop', 'Nic', 0, { k: 'bet', to: 4 }, stacks);
    let rp = replayStreet(g, log, 'preflop', stacks);
    expect(rp.cols).toBe(2); // action reopens
    log = setAct(g, log, 'preflop', 'Bel', 0, { k: 'fold' }, stacks);
    rp = replayStreet(g, log, 'preflop', stacks);
    expect(rp.cells.Bel[1].needed).toBe(false); // folded: greyed in column 2
    expect(rp.next).toEqual({ p: 'Gab', r: 1 });
    log = setAct(g, log, 'preflop', 'Gab', 1, { k: 'call' }, stacks);
    log = setAct(g, log, 'preflop', 'Clar', 1, { k: 'fold' }, stacks);
    log = setAct(g, log, 'preflop', 'Nat', 1, { k: 'bet', to: 10 }, stacks);
    log = setAct(g, log, 'preflop', 'Ev', 1, { k: 'fold' }, stacks);
    log = setAct(g, log, 'preflop', 'Nic', 1, { k: 'call' }, stacks);
    rp = replayStreet(g, log, 'preflop', stacks);
    expect(rp.cols).toBe(3);
    expect(six.filter((p) => rp.cells[p][2].needed)).toEqual(['Gab']);
    log = setAct(g, log, 'preflop', 'Gab', 2, { k: 'call' }, stacks);
    rp = replayStreet(g, log, 'preflop', stacks);
    expect(rp.next).toBeNull();
    expect(rp.street.bets).toEqual({ Bel: 0, Gab: 10, Clar: 2, Nat: 10, Ev: 2, Nic: 10 });
    expect(potTotal(g, log)).toBe(34);
    expect(inAtEnd(log, 'preflop')).toEqual(['Gab', 'Nat', 'Nic']);
  });

  it('limped pot: column 2 opens for the blinds once column 1 is done', () => {
    const g = g6();
    let log = newBoxLog(g, six, 'Bel', stacks);
    for (const p of ['Nat', 'Ev', 'Nic', 'Bel']) log = setAct(g, log, 'preflop', p, 0, { k: 'call' }, stacks);
    const rp = replayStreet(g, log, 'preflop', stacks);
    expect(rp.cols).toBe(2);
    expect(rp.next).toEqual({ p: 'Gab', r: 1 });
    expect(rp.cells.Clar[1]).toMatchObject({ needed: true, toCall: 0 }); // big blind option
  });

  it('picking a later box fills the boxes before it: fold facing a bet, check otherwise', () => {
    const g = g6();
    let log = newBoxLog(g, six, 'Bel', stacks);
    log = fillBefore(g, log, 'preflop', 'Nic', 0, stacks);
    log = setAct(g, log, 'preflop', 'Nic', 0, { k: 'bet', to: 6 }, stacks);
    const rp = replayStreet(g, log, 'preflop', stacks);
    expect(rp.cells.Nat[0].act).toMatchObject({ k: 'fold', d: true });
    expect(rp.cells.Ev[0].act).toMatchObject({ k: 'fold', d: true });
    expect(rp.next).toEqual({ p: 'Bel', r: 0 });
    log = setAct(g, log, 'preflop', 'Bel', 0, { k: 'call' }, stacks);
    // on the flop nobody has bet: skipped boxes check
    let l2 = closeStreet(g, log, 'preflop', 1, stacks);
    expect(inAtEnd(l2, 'preflop')).toEqual(['Bel', 'Nic']);
    l2 = openStreetBoxes(g, l2, 'flop', stacks);
    const fo = replayStreet(g, l2, 'flop', stacks).order;
    l2 = fillBefore(g, l2, 'flop', fo[fo.length - 1], 0, stacks);
    expect(replayStreet(g, l2, 'flop', stacks).cells[fo[0]][0].act).toMatchObject({ k: 'call', d: true });
  });

  it('closing a street: empty boxes fold when facing a bet; a skipped-ahead street keeps them in', () => {
    const g = g6();
    let log = newBoxLog(g, six, 'Bel', stacks);
    log = setAct(g, log, 'preflop', 'Nat', 0, { k: 'bet', to: 6 }, stacks);
    const closed = closeStreet(g, log, 'preflop', 1, stacks);
    expect(inAtEnd(closed, 'preflop')).toEqual(['Nat']);
    const partial = closeStreet(g, log, 'preflop', 1, stacks, true);
    expect(inAtEnd(partial, 'preflop')).toEqual(six);
    expect(potTotal(g, partial)).toBe(36);
  });

  it('heads-up: the button posts the small blind and acts first preflop', () => {
    const g = g6();
    const log = newBoxLog(g, ['Bel', 'Gab'], 'Bel', stacks);
    expect(streetOrder(g, log, 'preflop')).toEqual(['Bel', 'Gab']);
    const rp = replayStreet(g, log, 'preflop', stacks);
    expect(rp.cells.Bel[0].post && rp.cells.Gab[0].post).toBe(true);
    expect(rp.next).toEqual({ p: 'Bel', r: 1 });
    expect(streetOrder(g, log, 'flop')).toEqual(['Gab', 'Bel']);
  });

  it('all-in is capped at the stack and marks the player', () => {
    const g = g6();
    const st = { ...stacks, Nat: 50 };
    let log = newBoxLog(g, six, 'Bel', st);
    log = setAct(g, log, 'preflop', 'Nat', 0, { k: 'allin' }, st);
    expect(log.streets.preflop!.bets.Nat).toBe(50);
    expect(log.allInAt?.Nat).toBe('preflop');
  });

  it('only the latest box of a player stands; earlier ones are marked past', () => {
    const g = g6();
    let log = newBoxLog(g, six, 'Bel', stacks);
    for (const p of ['Nat', 'Ev', 'Nic', 'Bel']) log = setAct(g, log, 'preflop', p, 0, { k: 'call' }, stacks);
    let rp = replayStreet(g, log, 'preflop', stacks);
    expect(rp.cells.Gab[0].past).toBe(false); // the 1 stands until the small blind acts
    log = setAct(g, log, 'preflop', 'Gab', 1, { k: 'bet', to: 2 }, stacks); // typing 2 = calling 2
    rp = replayStreet(g, log, 'preflop', stacks);
    expect(rp.cells.Gab[0].past).toBe(true);
    expect(rp.street.bets.Gab).toBe(2);
    expect(rp.street.raisers).toEqual([]);
  });

  it('an action whose bet was changed earlier is forgotten', () => {
    const g = g6();
    let log = newBoxLog(g, six, 'Bel', stacks);
    log = setAct(g, log, 'preflop', 'Nat', 0, { k: 'call' }, stacks);
    log = setAct(g, log, 'preflop', 'Ev', 0, { k: 'call' }, stacks);
    expect(replayStreet(g, log, 'preflop', stacks).cells.Ev[0].act?.k).toBe('call');
    log = setAct(g, log, 'preflop', 'Nat', 0, { k: 'bet', to: 6 }, stacks); // Ev had called 2, not 6
    const rp = replayStreet(g, log, 'preflop', stacks);
    expect(rp.cells.Ev[0].act).toBeNull();
    expect(rp.next).toEqual({ p: 'Ev', r: 0 });
  });

  it('a dark raise before the flop is a straddle: the straddler gets the last word', () => {
    const g = g6();
    let log = newBoxLog(g, six, 'Bel', stacks);
    log = setAct(g, log, 'preflop', 'Nat', 0, { k: 'bet', to: 4, dark: true }, stacks);
    for (const p of ['Ev', 'Nic', 'Bel']) log = setAct(g, log, 'preflop', p, 0, { k: 'call' }, stacks);
    log = setAct(g, log, 'preflop', 'Gab', 1, { k: 'call' }, stacks);
    log = setAct(g, log, 'preflop', 'Clar', 1, { k: 'call' }, stacks);
    const rp = replayStreet(g, log, 'preflop', stacks);
    expect(rp.straddles).toEqual(['Nat']);
    expect(rp.next).toEqual({ p: 'Nat', r: 1 });
    expect(rp.cells.Nat[1].toCall).toBe(0);
    expect(rp.street.raisers).toEqual([]);
    // after the flop a dark action is only a mark
    let l2 = setAct(g, log, 'preflop', 'Nat', 1, { k: 'call' }, stacks);
    l2 = closeStreet(g, l2, 'preflop', 1, stacks);
    l2 = openStreetBoxes(g, l2, 'flop', stacks);
    l2 = setAct(g, l2, 'flop', 'Gab', 0, { k: 'call', dark: true }, stacks);
    expect(replayStreet(g, l2, 'flop', stacks).next?.p).toBe('Clar');
  });

  it('minimum raise house rules', () => {
    const g = g6();
    // last raise (standard): 2, 4, 6, 8
    expect(minRaiseTo(g, 'last', 2, 2)).toBe(4);
    expect(minRaiseTo(g, 'last', 4, 2)).toBe(6);
    expect(minRaiseTo(g, 'last', 10, 6)).toBe(16);
    // small-blind steps: 2, 3, 4, 5
    expect(minRaiseTo(g, 'sb', 2, 2)).toBe(3);
    // double: 2, 4, 8, 16
    expect(minRaiseTo(g, 'double', 4, 2)).toBe(8);
    // opening bet after the flop
    expect(minRaiseTo(g, 'last', 0, 0)).toBe(2);
    expect(minRaiseTo(g, 'sb', 0, 0)).toBe(1);
    // the replay tracks the largest raise for the cell
    let log = newBoxLog(g, six, 'Bel', stacks);
    log = setAct(g, log, 'preflop', 'Nat', 0, { k: 'bet', to: 8 }, stacks);
    const c = replayStreet(g, log, 'preflop', stacks).cells.Ev[0];
    expect([c.high, c.inc]).toEqual([8, 6]);
  });

  it('only the first to act (or the next after straddles) can straddle', () => {
    const g = g6();
    let log = newBoxLog(g, six, 'Bel', stacks);
    log = setAct(g, log, 'preflop', 'Nat', 0, { k: 'call' }, stacks);
    log = setAct(g, log, 'preflop', 'Ev', 0, { k: 'bet', to: 4, dark: true }, stacks); // not first: a plain raise
    let rp = replayStreet(g, log, 'preflop', stacks);
    expect(rp.straddles).toEqual([]);
    expect(rp.cells.Ev[0].canStraddle).toBe(false);
    expect(rp.street.raisers).toEqual(['Ev']);
    // a chain from the first to act: Nat straddles, Ev re-straddles
    log = newBoxLog(g, six, 'Bel', stacks);
    log = setAct(g, log, 'preflop', 'Nat', 0, { k: 'bet', to: 4, dark: true }, stacks);
    log = setAct(g, log, 'preflop', 'Ev', 0, { k: 'bet', to: 6, dark: true }, stacks);
    rp = replayStreet(g, log, 'preflop', stacks);
    expect(rp.straddles).toEqual(['Nat', 'Ev']);
    expect(rp.cells.Nic[0].canStraddle).toBe(true); // next in the chain may re-straddle
    log = setAct(g, log, 'preflop', 'Nic', 0, { k: 'call' }, stacks);
    expect(replayStreet(g, log, 'preflop', stacks).cells.Bel[0].canStraddle).toBe(false); // chain broken
  });

  it('the last live player cannot reopen the action against nobody', () => {
    const g = g6();
    // everyone folds to the straddler: no turn left for them
    let log = newBoxLog(g, six, 'Bel', stacks);
    log = setAct(g, log, 'preflop', 'Nat', 0, { k: 'bet', to: 4, dark: true }, stacks);
    for (const p of ['Ev', 'Nic', 'Bel']) log = setAct(g, log, 'preflop', p, 0, { k: 'fold' }, stacks);
    for (const p of ['Gab', 'Clar']) log = setAct(g, log, 'preflop', p, 1, { k: 'fold' }, stacks);
    let rp = replayStreet(g, log, 'preflop', stacks);
    expect(rp.cells.Nat[1]?.needed ?? false).toBe(false);
    expect(rp.next).toBeNull();
    // everyone else all-in: the last player can call but not raise
    const st = { ...stacks, Nat: 10 };
    log = newBoxLog(g, six, 'Bel', st);
    log = setAct(g, log, 'preflop', 'Nat', 0, { k: 'allin' }, st);
    for (const p of ['Ev', 'Nic', 'Bel']) log = setAct(g, log, 'preflop', p, 0, { k: 'fold' }, st);
    log = setAct(g, log, 'preflop', 'Gab', 1, { k: 'fold' }, st);
    rp = replayStreet(g, log, 'preflop', st);
    expect(rp.cells.Clar[1]).toMatchObject({ needed: true, canRaise: false, toCall: 8 });
    log = setAct(g, log, 'preflop', 'Clar', 1, { k: 'bet', to: 50 }, st);
    rp = replayStreet(g, log, 'preflop', st);
    expect(rp.street.bets.Clar).toBe(10); // the raise counts as a call
    expect(rp.cells.Clar[1].act?.k).toBe('call');
  });
});
