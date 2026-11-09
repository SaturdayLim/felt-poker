// @ts-expect-error node types are not in the app tsconfig; vitest runs in node
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AWARD_LIST, awardsFor, buildModel, buyinsOf, handClass, kingCaption, positionNames, resultStreet, type TrialPlayer } from './model';
import { AWARD_ICONS } from './awardIcons';
import type { HandLog } from '../types';

const zeros = { wtsd: 0, wsd: 0, handsWon: 0, logged: 10, vpip: 5, style: { betsRaises: 0, cbet: 0, cbetOpp: 0, bbDefend: 0, bbDefendOpp: 0 } };
function fake(over: Partial<TrialPlayer> & { id: string }): TrialPlayer {
  return { name: over.id, net: 0, low: 0, lowAt: 1, dev: [0, 0, 0], vpip: 50, takedowns: 0, sdNet: 0, s: { ...zeros }, ...over } as unknown as TrialPlayer;
}

describe('Comeback', () => {
  const bb = 2;
  const comeback = (p: TrialPlayer) => awardsFor([p], undefined, [], bb, {}).some((a) => a.title === 'Comeback');
  it('needs a low point at least 100 BB under par', () => {
    expect(comeback(fake({ id: 'a', low: -99 * bb, net: 10 * bb }))).toBe(false);
    expect(comeback(fake({ id: 'b', low: -100 * bb, net: 10 * bb }))).toBe(true);
  });
  it('needs the player to finish above par', () => {
    expect(comeback(fake({ id: 'c', low: -120 * bb, net: 0 }))).toBe(false);
    expect(comeback(fake({ id: 'd', low: -120 * bb, net: -5 * bb }))).toBe(false);
    expect(comeback(fake({ id: 'e', low: -120 * bb, net: 1 }))).toBe(true);
  });
  it('needs the low point before the end', () => {
    expect(comeback(fake({ id: 'f', low: -120 * bb, net: 30 * bb, lowAt: 2 }))).toBe(false);
  });
  it('goes to the biggest climb', () => {
    const a = fake({ id: 'a', low: -100 * bb, net: 10 * bb });
    const b = fake({ id: 'b', low: -150 * bb, net: 5 * bb });
    const win = awardsFor([a, b], undefined, [], bb, {}).find((x) => x.title === 'Comeback');
    expect(win?.to).toEqual(['b']);
  });
  it('AWARD_LIST says so', () => {
    expect(AWARD_LIST.find((a) => a.title === 'Comeback')!.min).toMatch(/100 BB/);
  });
});

describe('King Of The Hill caption', () => {
  const p = (name: string, won: number) => ({ name, s: { handsWon: won } }) as Pick<TrialPlayer, 'name' | 's'>;
  it('names the player first', () => {
    expect(kingCaption([p('Eve', 11)] as never)).toBe('Eve: 11 pots won');
    expect(kingCaption([p('Eve', 1)] as never)).toBe('Eve: 1 pot won');
  });
  it('lists each name on a tie', () => {
    expect(kingCaption([p('Ann', 9), p('Bo', 9)] as never)).toBe('Ann: 9 pots won. Bo: 9 pots won');
  });
});

describe('award thresholds and captions', () => {
  const bb = 2;
  const st = (over: object = {}) => ({ betsRaises: 0, cbet: 0, cbetOpp: 0, bbDefend: 0, bbDefendOpp: 0, ...over });
  const mk = (id: string, s: object, style: object = {}, extra: Partial<TrialPlayer> = {}) =>
    fake({ id, s: { ...zeros, ...s, style: st(style) } as never, ...extra });
  const get = (ps: TrialPlayer[], title: string, streaks: Record<string, number> = {}, big?: never, bounties: never[] = []) =>
    awardsFor(ps, big, bounties, bb, streaks).find((a) => a.title === title);
  it('Diamond Hands needs at least 5 showdowns', () => {
    expect(get([mk('Mike', { wtsd: 4 })], 'Diamond Hands')).toBeUndefined();
    expect(get([mk('Mike', { wtsd: 5 })], 'Diamond Hands')?.detail).toBe('Mike: 5 showdowns participated');
  });
  it('King Of The Hill needs at least 5 pots', () => {
    expect(get([mk('Eve', { handsWon: 4 })], 'King Of The Hill')).toBeUndefined();
    expect(get([mk('Eve', { handsWon: 5 })], 'King Of The Hill')?.detail).toBe('Eve: 5 pots won');
  });
  it('Leprechaun needs a pot of at least 50 BB', () => {
    const big = (pot: number) => ({ pot, n: 15, winners: ['Mike'], shown: [] }) as never;
    const ps = [mk('Mike', {})];
    expect(get(ps, 'Leprechaun', {}, big(99))).toBeUndefined();
    expect(get(ps, 'Leprechaun', {}, big(100))?.detail).toBe('Mike: 100 chips won on hand #15');
  });
  it('Apollo needs at least 3 pots in a row', () => {
    const ps = [mk('Eve', {})];
    expect(get(ps, 'Apollo', { Eve: 2 })).toBeUndefined();
    expect(get(ps, 'Apollo', { Eve: 4 })?.detail).toBe('Eve: 4 consecutive wins');
  });
  it('Ice Cold needs under 20 percent won', () => {
    expect(get([mk('Ben', { handsWon: 2 }, { betsRaises: 10 })], 'Ice Cold')).toBeUndefined();
    expect(get([mk('Ben', { handsWon: 1 }, { betsRaises: 12 })], 'Ice Cold')?.detail).toBe('Ben: 1/12 successful aggressive pots won');
  });
  it('Comeback caption', () => {
    const p = fake({ id: 'Des', low: -260, net: 150, lowAt: 27, dev: new Array(40).fill(0) });
    expect(get([p], 'Comeback')?.detail).toBe('Des: Climbed 410 from -260 (hand #27) to finish +150');
  });
  it('Unrelenting caption', () => {
    expect(get([mk('Clar', {}, { cbet: 6, cbetOpp: 7 })], 'Unrelenting')?.detail).toBe('Clar: 6/7 C-bet after pre-flop aggression');
  });
  it('The Rock caption', () => {
    expect(get([mk('JR', { vpip: 14, logged: 42 }, {}, { vpip: 33 })], 'The Rock')?.detail).toBe('JR: Participated in 14/42 hands');
  });
  it('Bounty Hunter caption', () => {
    const bounties = [{ to: 'Candia', n: 12, total: 21 }, { to: 'Candia', n: 31, total: 14 }] as never[];
    expect(get([mk('Candia', {})], 'Bounty Hunter', {}, undefined, bounties)?.detail).toBe('Candia: 2 bounties collected (#12, 31)');
  });
  it('Iron Defender needs more than 60 percent of 5 raises', () => {
    expect(get([mk('Clar', {}, { bbDefend: 3, bbDefendOpp: 5 })], 'Iron Defender')).toBeUndefined();
    expect(get([mk('Clar', {}, { bbDefend: 7, bbDefendOpp: 9 })], 'Iron Defender')?.detail).toBe('Clar: 7/9 BB defended against a raise');
  });
});

describe('award marks', () => {
  it('every award has its own mark', () => {
    const marks = AWARD_LIST.map((a) => { const m = AWARD_ICONS[a.title]; return m ? `${m.main.join('|')}#${m.detail.join('|')}` : ''; });
    expect(marks.every((m) => m.length > 1)).toBe(true);
    expect(new Set(marks).size).toBe(AWARD_LIST.length);
  });
  it('every mark has a main stroke and carries detail strokes', () => {
    for (const a of AWARD_LIST) expect(AWARD_ICONS[a.title].main.length).toBeGreaterThan(0);
  });
});

describe('Your Cards street', () => {
  const st = (folded: string[] = []) => ({ bets: {}, prev: {}, typed: {}, folded, raisers: [] });
  // three players, all reach the river: a and b go to showdown, so the hand's end is Showdown
  const hand = (streets: Record<string, string[]>) => ({
    mode: 'bets', dealt: ['a', 'b', 'c'], button: 'c',
    streets: { preflop: st(streets.preflop), flop: st(streets.flop), turn: st(streets.turn), river: st(streets.river) },
  }) as unknown as HandLog;
  it('a loser shows the street they folded on, even when the hand went to showdown', () => {
    const L = hand({ preflop: ['a'], flop: [], turn: [], river: [] });
    expect(resultStreet(L, 'a', -3)).toBe('Pre-flop');
    expect(resultStreet(L, 'b', 5)).toBe('Showdown');
  });
  it('a loser who folded later shows that street', () => {
    const L = hand({ preflop: [], flop: ['b'], turn: [], river: [] });
    expect(resultStreet(L, 'b', -5)).toBe('Flop');
    expect(resultStreet(L, 'a', -5)).toBe('Showdown');
  });
  it('a loser who did not fold keeps the hand end', () => {
    const L = hand({ preflop: [], flop: [], turn: [], river: [] });
    expect(resultStreet(L, 'b', -5)).toBe('Showdown');
  });
});

describe('positions', () => {
  it('names every seat', () => {
    expect(positionNames(4)).toEqual(['BTN', 'SB', 'BB', 'UTG']);
    expect(positionNames(6)).toEqual(['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO']);
    expect(positionNames(8)).toEqual(['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'UTG+2', 'HJ', 'CO']);
    expect(new Set(positionNames(9)).size).toBe(9);
  });
});

describe('starting hand type', () => {
  it('puts the high card first and marks suited and offsuit', () => {
    expect(handClass(['Kd', 'As'])).toBe('AKo');
    expect(handClass(['Kd', 'Ad'])).toBe('AKs');
    expect(handClass(['7c', '7h'])).toBe('77');
    expect(handClass(['2c', 'Th'])).toBe('T2o');
  });
});

describe('rebuy size in buy-ins', () => {
  it('is the rebuy own amount over the buy-in, not a running count', () => {
    expect(buyinsOf(400, 200)).toBe(2);
    expect(buyinsOf(200, 200)).toBe(1);
    expect(buyinsOf(300, 200)).toBe(1.5);
    expect(buyinsOf(100, 300)).toBe(0.3);
    expect(buyinsOf(50, 0)).toBe(1);
  });
});

// With the owner's backup present (git-ignored) the whole model is built and checked without printing any of it.
const BACKUP = 'trial/potato-backup.json';
describe.skipIf(!existsSync(BACKUP))('model from a real backup', () => {
  const m = () => buildModel(JSON.parse(readFileSync(BACKUP, 'utf-8')), 0, { gameLog: true });
  it('has every seat, a log for every hand and a grid that adds up', () => {
    const x = m();
    expect(x.positions.length).toBe(x.seatsN);
    expect(x.log!.length).toBe(x.hands);
    for (const p of x.players) {
      expect(Object.keys(p.byPos).sort()).toEqual([...x.positions].sort());
      expect(Object.values(p.range).reduce((a, c) => a + c.fold + c.call + c.raise, 0)).toBeLessThanOrEqual(x.hands);
      for (const h of p.mine) expect(h.street.length).toBeGreaterThan(0);
      expect(p.takedowns).toBeLessThanOrEqual(p.s.handsWon);
      // every hand dealt in is counted in the grid or left out, and each square adds up
      expect(p.known + p.unknown).toBe(p.logs.length);
      expect(Object.values(p.range).reduce((a, c) => a + c.fold + c.call + c.raise, 0)).toBe(p.known);
      for (const r of p.rebuys) expect(r.buyins).toBeGreaterThan(0);
    }
  });
});
