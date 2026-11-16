import { describe, expect, it } from 'vitest';
import { critiqueFor, parseView } from './critique';
import type { HandView } from './model';

const seg = (t: string, c?: number) => (c === undefined ? { t } : { t, c });
// Ann on the button raises, Bo in the BB calls; flop: Bo checks, Ann bets 8, Bo folds
const view: HandView = {
  n: 1, pot: 10, button: 'Ann', shown: [], result: 'Ann wins 10',
  streets: [
    { street: 'Pre-flop', cards: [], lines: [], segs: [[seg('BTN (Ann)', 0), seg(' raises to 6.')], [seg('BB (Bo)', 1), seg(' calls.')]] },
    { street: 'Flop', cards: ['As', '7d', '2c'], lines: [], segs: [[seg('BB', 1), seg(' checks.')], [seg('BTN', 0), seg(' bets 8.')], [seg('BB', 1), seg(' folds.')]] },
  ],
};

describe('gameplay critique', () => {
  it('reads the action back from the log lines', () => {
    const p = parseView(view);
    expect(p.posOf).toEqual({ Ann: 'BTN', Bo: 'BB' });
    expect(p.streets[1].acts.map((a) => `${a.who} ${a.k} ${a.to}`)).toEqual(['Bo check 0', 'Ann bet 8', 'Bo fold 0']);
  });
  it('calls a top pair c-bet a value bet', () => {
    const c = critiqueFor([view], 'Ann', { 1: { cards: ['Ah', 'Kd'], lvl: null } }, { sb: 1, bb: 2 });
    const notes = c.hands[0].lines[1][1].map((x) => x.text).join(' ');
    expect(notes).toMatch(/continuation bet/);
    expect(notes).toMatch(/value bet/);
    expect(c.valueBets).toBe(1);
  });
  it('judges a small pair under a paired board as a weak pair, not two pair', () => {
    const paired = { ...view, streets: [view.streets[0], { ...view.streets[1], cards: ['4h', 'Ah', 'Ad'] as HandView['streets'][number]['cards'] }] };
    const c = critiqueFor([paired], 'Ann', { 1: { cards: ['5s', '5d'], lvl: null } }, { sb: 1, bb: 2 });
    const notes = c.hands[0].lines[1][1].map((x) => x.text).join(' ');
    expect(notes).toMatch(/weak pair/);
    expect(notes).not.toMatch(/two pair/);
  });
  it('skips a red clash as an invalid hand and keeps a blue one', () => {
    expect(critiqueFor([view], 'Ann', { 1: { cards: ['Ah', 'Kd'], lvl: 'red' } }, { sb: 1, bb: 2 }).hands[0].status).toBe('invalid');
    expect(critiqueFor([view], 'Ann', { 1: { cards: ['Ah', 'Kd'], lvl: 'blue' } }, { sb: 1, bb: 2 }).hands[0].status).toBe('cards');
  });
  it('reads a hand without cards from the action only', () => {
    const c = critiqueFor([view], 'Bo', {}, { sb: 1, bb: 2 });
    expect(c.hands[0].status).toBe('nocards');
    expect(c.hands[0].lines[1][2].map((x) => x.text).join(' ')).toMatch(/cannot be checked/);
  });
  it('advanced insights read the board texture and ask questions when checked to you', () => {
    const paired = { ...view, streets: [view.streets[0], { ...view.streets[1], cards: ['4h', 'Ah', 'Ad'] as HandView['streets'][number]['cards'] }] };
    const deep = critiqueFor([paired], 'Ann', { 1: { cards: ['5s', '5d'], lvl: null } }, { sb: 1, bb: 2 }).hands[0].deep!;
    const head = deep[1][-1].map((x) => x.text).join(' ');
    expect(head).toMatch(/Flop 4-A-A: a paired board/);
    expect(head).toMatch(/Two aces show\. Only 2 are left/);
    expect(deep[1][1].some((x) => x.tone === 'ask' && /Bet or check\?/.test(x.text))).toBe(true);
  });
});
