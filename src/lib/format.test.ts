import { describe, expect, it } from 'vitest';
import { chipsText, figureDelta, figureNumber, figureText, figureUnit, type Figure } from './format';

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
