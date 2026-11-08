// @ts-expect-error node types are not in the app tsconfig; vitest runs in node
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AWARD_LIST, awardsFor, buildModel, handClass, kingCaption, positionNames, type TrialPlayer } from './model';
import { AWARD_ICONS } from './awardIcons';

const zeros = { wtsd: 0, wsd: 0, handsWon: 0, logged: 10, vpip: 5, style: { betsRaises: 0, cbet: 0, cbetOpp: 0, bbDefend: 0, bbDefendOpp: 0 } };
function fake(over: Partial<TrialPlayer> & { id: string }): TrialPlayer {
  return { name: over.id, net: 0, low: 0, lowAt: 1, dev: [0, 0, 0], vpip: 50, takedowns: 0, sdNet: 0, s: { ...zeros }, ...over } as unknown as TrialPlayer;
}

describe('Comeback', () => {
  const bb = 2;
  const comeback = (p: TrialPlayer) => awardsFor([p], undefined, [], bb, {}).some((a) => a.title === 'Comeback');
  it('needs a low point at least 20 BB under par', () => {
    expect(comeback(fake({ id: 'a', low: -10 * bb, net: 50 * bb }))).toBe(false);
    expect(comeback(fake({ id: 'b', low: -20 * bb, net: 50 * bb }))).toBe(true);
  });
  it('needs a final result at least 50 BB over par', () => {
    expect(comeback(fake({ id: 'c', low: -30 * bb, net: 49 * bb }))).toBe(false);
    expect(comeback(fake({ id: 'd', low: -30 * bb, net: 50 * bb }))).toBe(true);
  });
  it('needs the low point before the end', () => {
    expect(comeback(fake({ id: 'e', low: -30 * bb, net: 50 * bb, lowAt: 2 }))).toBe(false);
  });
  it('AWARD_LIST says so', () => {
    expect(AWARD_LIST.find((a) => a.title === 'Comeback')!.min).toMatch(/20 BB/);
  });
});

describe('King Of The Hill caption', () => {
  const p = (name: string, won: number, td: number) => ({ name, takedowns: td, s: { handsWon: won } }) as Pick<TrialPlayer, 'name' | 'takedowns' | 's'>;
  it('counts takedowns', () => {
    expect(kingCaption([p('Ann', 11, 4)] as never)).toBe('Won 11 pots, including 4 takedowns.');
    expect(kingCaption([p('Ann', 7, 1)] as never)).toBe('Won 7 pots, including 1 takedown.');
  });
  it('lists each name on a tie', () => {
    expect(kingCaption([p('Ann', 9, 2), p('Bo', 9, 0)] as never)).toBe('Ann: won 9 pots, including 2 takedowns. Bo: won 9 pots, including 0 takedowns.');
  });
});

describe('award marks', () => {
  it('every award has its own mark', () => {
    const marks = AWARD_LIST.map((a) => (AWARD_ICONS[a.title] ?? []).join('|'));
    expect(marks.every((m) => m.length > 0)).toBe(true);
    expect(new Set(marks).size).toBe(AWARD_LIST.length);
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
    }
  });
});
