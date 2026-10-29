import { describe, expect, it } from 'vitest';
import type { Game, Hand, HandLog } from '../types';
import { bountyPay, bountyTotal, closeStreet, fillBefore, newBoxLog, openStreetBoxes, replayStreet, resolve, setAct } from './hand';
import { addFlow, addStyle, emptyFlow, emptyStyle, wonAt } from './style';
import { estimateStacks } from './stacks';

// button Bel, SB Gab, BB Clar, then Nat, Ev, Nic act first preflop
const six = ['Bel', 'Gab', 'Clar', 'Nat', 'Ev', 'Nic'];
const game = (): Game => ({
  id: 'g', name: 'g', type: 'cash', status: 'live', createdAt: 0, startedAt: 0, currency: 'S$', unitValue: 0.1, sb: 1, bb: 2, defaultBuyIn: 200,
  playerIds: six, seats: Object.fromEntries(six.map((p, i) => [p, i + 1])),
  buyIns: six.map((p, i) => ({ id: `b${i}`, playerId: p, amount: 200, at: 1 })), cashOuts: [], statusEvents: [], hands: [], expenses: [], transfers: [],
});
const stacks = Object.fromEntries(six.map((p) => [p, 200]));

/** Nat opens to 6, Bel 3-bets to 18, Nat calls; flop: Nat checks, Bel c-bets 20, Nat folds. */
function threeBetHand(g: Game): HandLog {
  let l = newBoxLog(g, six, 'Bel', stacks);
  l = setAct(g, l, 'preflop', 'Nat', 0, { k: 'bet', to: 6 }, stacks);
  l = fillBefore(g, l, 'preflop', 'Bel', 0, stacks);
  l = setAct(g, l, 'preflop', 'Bel', 0, { k: 'bet', to: 18 }, stacks);
  l = fillBefore(g, l, 'preflop', 'Nat', 1, stacks);
  l = setAct(g, l, 'preflop', 'Nat', 1, { k: 'call' }, stacks);
  l = closeStreet(g, l, 'preflop', 2, stacks);
  l = openStreetBoxes(g, l, 'flop', stacks);
  l = setAct(g, l, 'flop', 'Nat', 0, { k: 'call' }, stacks);
  l = setAct(g, l, 'flop', 'Bel', 0, { k: 'bet', to: 20 }, stacks);
  l = setAct(g, l, 'flop', 'Nat', 1, { k: 'fold' }, stacks);
  return closeStreet(g, l, 'flop', 3, stacks);
}

describe('playing style', () => {
  it('counts the 3-bet, the fold to it never happening, the c-bet and the fold to the c-bet', () => {
    const g = game();
    const l = threeBetHand(g);
    expect(replayStreet(g, l, 'preflop', stacks).street.raisers).toEqual(['Nat', 'Bel']);
    const bel = emptyStyle(), nat = emptyStyle(), clar = emptyStyle();
    addStyle(bel, g, l, 'Bel');
    addStyle(nat, g, l, 'Nat');
    addStyle(clar, g, l, 'Clar');
    expect(bel).toMatchObject({ threeBet: 1, threeBetOpp: 1, cbet: 1, cbetOpp: 1, steal: 0, stealOpp: 0, betsRaises: 1 });
    expect(nat).toMatchObject({ threeBetOpp: 0, fold3Bet: 0, fold3BetOpp: 1, foldCbet: 1, foldCbetOpp: 1 });
    // Clar in the BB faced Nat's raise and folded
    expect(clar).toMatchObject({ bbDefend: 0, bbDefendOpp: 1 });
    expect(wonAt(l)).toBe('flop');
  });

  it('a raise from the button after everyone folds is a steal', () => {
    const g = game();
    let l = newBoxLog(g, six, 'Bel', stacks);
    l = fillBefore(g, l, 'preflop', 'Bel', 0, stacks);
    l = setAct(g, l, 'preflop', 'Bel', 0, { k: 'bet', to: 6 }, stacks);
    const bel = emptyStyle(), nic = emptyStyle();
    addStyle(bel, g, l, 'Bel');
    addStyle(nic, g, l, 'Nic');
    expect(bel).toMatchObject({ steal: 1, stealOpp: 1 });
    expect(nic).toMatchObject({ steal: 0, stealOpp: 1 }); // Nic sits before the button and folded
  });

  it('chips won and lost: net per hand by folds and showdown, bounties as others', () => {
    const g = game();
    const l = threeBetHand(g);
    const res = resolve(g, l, [], 'Bel', {});
    const h: Hand = {
      id: 'h', n: 1, at: 1, pot: 41, winners: res.winners, returned: res.returned, board: [], boardNA: false, shown: [], allIn: false,
      straddle: false, tags: [], log: l, bounty: { playerId: 'Bel', amount: 10, payers: ['Nat', 'Gab'], short: { Gab: 4 } },
    };
    const bel = emptyFlow(), nat = emptyFlow(), gab = emptyFlow();
    addFlow(bel, g, h, 'Bel');
    addFlow(nat, g, h, 'Nat');
    addFlow(gab, g, h, 'Gab');
    // pot = 1 + 2 + 18 + 18 + 20; Bel put in 38 and took 41 (the c-bet came back as unmatched)
    expect(bel.winFold).toBe(21);
    expect(bel.winOther).toBe(14);
    expect(nat.lossFold).toBe(18);
    expect(nat.lossOther).toBe(10);
    expect(gab).toMatchObject({ lossFold: 1, lossOther: 4 });
    expect(bountyPay(h.bounty!, 'Gab')).toBe(4);
    expect(bountyTotal(h.bounty!)).toBe(14);
  });
});

describe('stack estimate anchors', () => {
  const hand = (n: number, at: number, extra: Partial<Hand> = {}): Hand => ({
    id: `h${n}`, n, at, endedAt: at, pot: 0, winners: [], board: [], boardNA: true, shown: [], allIn: false, straddle: false, tags: [], ...extra,
  });

  it('a missed hand turns stacks into ranges; a count makes one exact again', () => {
    const g = game();
    g.hands = [hand(1, 10, { missed: true, excluded: true })];
    let est = estimateStacks(g);
    expect(est.spread.Bel).toBe(20); // 10 BB before any logged pot
    expect(est.complete).toBe(false);
    g.counts = [{ id: 'c', playerId: 'Bel', chips: 230, at: 20 }];
    est = estimateStacks(g);
    expect(est.stack.Bel).toBe(230);
    expect(est.spread.Bel).toBe(0);
    expect(est.spread.Nat).toBe(20);
  });

  it('an all-in with the amount typed in sets a range stack to that amount', () => {
    const g = game();
    g.hands = [hand(1, 10, { missed: true, excluded: true })];
    let l = newBoxLog(g, six, 'Bel'); // no exact stacks: Nat's is a range
    l = setAct(g, l, 'preflop', 'Nat', 0, { k: 'allin', to: 150 });
    l = fillBefore(g, l, 'preflop', 'Clar', 1);
    l = setAct(g, l, 'preflop', 'Clar', 1, { k: 'call' });
    l = closeStreet(g, l, 'preflop', 30);
    const res = resolve(g, l, [], 'Bel', { 0: ['Clar'] });
    g.hands.push(hand(2, 30, { log: l, winners: res.winners, pots: res.pots.map((p) => ({ amount: p.amount, eligible: p.eligible, winners: p.winners })), pot: 301 }));
    const est = estimateStacks(g);
    expect(est.stack.Nat).toBe(0);
    expect(est.spread.Nat).toBe(0);
  });

  it('chip moves change both stacks; a tip off the table leaves it', () => {
    const g = game();
    g.moves = [
      { id: 'm1', from: 'Bel', to: 'Nat', amount: 15, kind: 'side', at: 5, afterN: 0 },
      { id: 'm2', from: 'Ev', amount: 4, kind: 'tip', at: 6, afterN: 0 },
    ];
    const est = estimateStacks(g);
    expect(est.stack.Bel).toBe(185);
    expect(est.stack.Nat).toBe(215);
    expect(est.stack.Ev).toBe(196);
  });
});
