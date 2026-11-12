import { describe, expect, it } from 'vitest';
import { chipsText, figureDelta, figureNumber, figureText, figureUnit, gameCaption, gameCaptionNarrow, gameTitle, runningLabel, runningMs, type Figure } from './format';
import type { Game } from '../types';

const cash: Figure = { money: 14, chips: 7, currency: 'S$' };
const tourney: Figure = { money: 50, chips: null, currency: 'S$' };

describe('result figures', () => {
  it('shows chips by default, with a sign on request', () => {
    expect(figureText(cash, undefined)).toBe('7 chips');
    expect(figureText(cash, false, { sign: true })).toBe('+7 chips');
    expect(chipsText(-3)).toBe('-3 chips');
  });

  it('shows money when Show money is on', () => {
    expect(figureText(cash, true)).toBe('S$14.00');
    expect(figureText(cash, true, { sign: true })).toBe('+S$14.00');
  });

  it('keeps tournaments in money, which have no chip figure', () => {
    expect(figureText(tourney, undefined)).toBe('S$50.00');
    expect(figureUnit(tourney, undefined)).toBe('S$');
  });

  it('gives bare numbers and units for tiles and captions', () => {
    expect(figureNumber(cash, undefined, { sign: true })).toBe('+7');
    expect(figureNumber(cash, true)).toBe('14.00');
    expect(figureUnit(cash, undefined)).toBe('chips');
    expect(figureUnit(cash, true)).toBe('S$');
  });

  it('builds a Delta in the same measure as its value', () => {
    const chips = figureDelta(cash, undefined);
    expect(chips.value).toBe(7);
    expect(chips.format(7)).toBe('7 chips');
    const money = figureDelta(cash, true);
    expect(money.value).toBe(14);
    expect(money.format(14)).toBe('S$14.00');
  });
});

describe('game time, one clock with the players', () => {
  const min = 60000;
  const buy = (at: number) => ({ at }) as Game['buyIns'][number];
  const hand = (at: number, endedAt: number) => ({ at, endedAt }) as Game['hands'][number];

  it('has no time with no buy-in and no hand', () => {
    expect(runningMs({ hands: [], buyIns: [], status: 'live' }, 5 * min)).toBeNull();
    expect(runningLabel({ hands: [], buyIns: [], status: 'live' }, 5 * min)).toBe('-');
  });

  it('counts from the first buy-in while live, with 0 hands', () => {
    const g = { hands: [], buyIns: [buy(10 * min), buy(20 * min)], status: 'live' as const };
    expect(runningLabel(g, 10 * min)).toBe('0m');
    expect(runningLabel(g, 11 * min)).toBe('1m');
    expect(runningLabel(g, 235 * min)).toBe('3h 45m');
  });

  it('keeps counting after 1 hand, from the buy-in and not from the hand', () => {
    const g = { hands: [hand(5 * min, 8 * min)], buyIns: [buy(0)], status: 'live' as const };
    expect(runningMs(g, 30 * min)).toBe(30 * min);
  });

  it('stops at the last event of a closed game, not at the later close press', () => {
    const g = { hands: [hand(0, 10 * min)], buyIns: [buy(0)], status: 'closed' as const, endedAt: 225 * min };
    expect(runningLabel(g, 999 * min)).toBe('10m');
  });

  it('uses the last hand when a closed game has no end time', () => {
    const g = { hands: [hand(0, 10 * min), hand(10 * min, 40 * min)], buyIns: [buy(0)], status: 'closed' as const };
    expect(runningMs(g, 999 * min)).toBe(40 * min);
  });

  it('stops at the last event when the game is closed much later', () => {
    const g = { hands: [hand(0, 10 * min), hand(10 * min, 90 * min)], buyIns: [buy(0)], status: 'closed' as const, endedAt: 700 * min };
    expect(runningMs(g, 999 * min)).toBe(90 * min);
  });

  it('counts a cash-out, a status change and a chip move as events', () => {
    const base = { hands: [hand(0, 10 * min)], buyIns: [buy(0)], status: 'closed' as const, endedAt: 700 * min };
    expect(runningMs({ ...base, cashOuts: [{ at: 120 * min } as Game['cashOuts'][number]] }, 0)).toBe(120 * min);
    expect(runningMs({ ...base, statusEvents: [{ at: 130 * min } as Game['statusEvents'][number]] }, 0)).toBe(130 * min);
    expect(runningMs({ ...base, moves: [{ at: 140 * min } as NonNullable<Game['moves']>[number]] }, 0)).toBe(140 * min);
  });

  it('ignores events at or after the close press', () => {
    const g = { hands: [hand(0, 10 * min)], buyIns: [buy(0)], status: 'closed' as const, endedAt: 50 * min,
      cashOuts: [{ at: 80 * min } as Game['cashOuts'][number]], statusEvents: [{ at: 50 * min, status: 'out' } as Game['statusEvents'][number]] };
    expect(runningMs(g, 999 * min)).toBe(10 * min);
  });

  it('leaves out the time a reopened game sat closed', () => {
    const live = { hands: [hand(0, 10 * min)], buyIns: [buy(0)], status: 'live' as const, pauses: [{ from: 60 * min, to: 1000 * min }] };
    expect(runningMs(live, 1030 * min)).toBe(90 * min);
    const again = { ...live, status: 'closed' as const, endedAt: 1100 * min, hands: [hand(0, 10 * min), hand(1000 * min, 1040 * min)] };
    expect(runningMs(again, 9999 * min)).toBe(1040 * min - 940 * min);
  });

  it('hands per hour use this same span', () => {
    const g = { hands: [hand(0, 10 * min)], buyIns: [buy(0)], status: 'closed' as const, endedAt: 700 * min };
    expect(runningMs(g)).toBe(10 * min);
  });
});

describe('game title and caption', () => {
  const day = (y: number, m: number, d: number) => new Date(y, m - 1, d, 20).getTime();
  const base = { name: 'Potato Day', type: 'cash', startedAt: day(2026, 11, 1), defaultBuyIn: 200, playerIds: ['a', 'b', 'c', 'd'], buyIns: [] as { amount: number }[] };
  const game = (o: Record<string, unknown> = {}, buys = 4) => ({ ...base, buyIns: Array.from({ length: buys }, () => ({ amount: 200 })), ...o }) as unknown as Game;

  it('title keeps the name as typed and the day without a leading zero', () => {
    expect(gameTitle(game())).toBe('Potato Day (1 Nov 2026)');
    expect(gameTitle(game({ name: 'friday night', startedAt: day(2026, 11, 12) }))).toBe('friday night (12 Nov 2026)');
  });

  it('caption counts pax and buy-ins, plural and singular', () => {
    expect(gameCaption(game())).toBe('4 Pax, 4 Buy-ins');
    expect(gameCaption(game({ playerIds: ['a'] }, 1))).toBe('1 Pax, 1 Buy-in');
    expect(gameCaption(game({ playerIds: ['a', 'b'] }, 10))).toBe('2 Pax, 10 Buy-ins');
  });

  it('counts rebuys in default buy-ins', () => {
    expect(gameCaption(game({ buyIns: [{ amount: 200 }, { amount: 400 }] }))).toBe('4 Pax, 3 Buy-ins');
  });

  it('puts the group after the buy-ins', () => {
    expect(gameCaption(game({ playerIds: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }, 10), 'Churchies')).toBe('7 Pax, 10 Buy-ins, Churchies');
  });

  it('narrow form puts the date first', () => {
    expect(gameCaptionNarrow(game())).toBe('1 Nov 2026, 4 Pax, 4 Buy-ins');
    expect(gameCaptionNarrow(game({ startedAt: day(2026, 11, 12) }), 'Churchies')).toBe('12 Nov 2026, 4 Pax, 4 Buy-ins, Churchies');
  });

  it('never uses the dash form', () => {
    expect(gameCaption(game(), 'Churchies')).not.toContain(' - ');
  });
});
