import { describe, expect, it } from 'vitest';
import { critiqueFor, parseView } from './critique';
import type { HandView } from './model';

const seg = (t: string, c?: number) => (c === undefined ? { t } : { t, c });
type Cards = HandView['streets'][number]['cards'];
// Ann on the button raises, Bo in the BB calls; flop: Bo checks, Ann bets 8, Bo folds
const view: HandView = {
  n: 1, pot: 10, button: 'Ann', shown: [], result: 'Ann wins 10',
  streets: [
    { street: 'Pre-flop', cards: [], lines: [], segs: [[seg('BTN (Ann)', 0), seg(' raises to 6.')], [seg('BB (Bo)', 1), seg(' calls.')]] },
    { street: 'Flop', cards: ['As', '7d', '2c'], lines: [], segs: [[seg('BB', 1), seg(' checks.')], [seg('BTN', 0), seg(' bets 8.')], [seg('BB', 1), seg(' folds.')]] },
  ],
};
const paired = { ...view, streets: [view.streets[0], { ...view.streets[1], cards: ['4h', 'Ah', 'Ad'] as Cards }] };
const textOf = (n: { text: string; a?: string }[] | undefined) => (n ?? []).map((x) => `${x.text} ${x.a ?? ''}`).join(' ');

// Screenshot 1 (Churchies, owner 19 Nov 2026): Mike leads a 2-K-2 flop with no pair into 3 players, then bets the 2 turn again
const story: HandView = {
  n: 2, pot: 23, button: 'Des', shown: [], result: 'Clar wins 23 (Showdown)',
  streets: [
    { street: 'Pre-flop', cards: [], lines: [], segs: [[seg('UTG (Clar)', 0), seg(' calls.')], [seg('HJ (Eve)', 1), seg(' calls.')], [seg('CO (Des)', 2), seg(' calls.')], [seg('SB (Ben)', 3), seg(' folds.')], [seg('BB (Mike)', 4), seg(' checks.')]] },
    { street: 'Flop', cards: ['2s', 'Kd', '2c'], lines: [], segs: [[seg('BB', 4), seg(' bets 3.')], [seg('UTG', 0), seg(' calls.')], [seg('HJ', 1), seg(' and '), seg('CO', 2), seg(' fold.')]] },
    { street: 'Turn', cards: ['2s', 'Kd', '2c', '2h'], lines: [], segs: [[seg('BB', 4), seg(' bets 4.')], [seg('UTG', 0), seg(' calls.')]] },
    { street: 'River', cards: ['2s', 'Kd', '2c', '2h', '4h'], lines: [], segs: [[seg('BB', 4), seg(' and '), seg('UTG', 0), seg(' check.')]] },
  ],
};
// Screenshot 2: Mike raises the river with the nut flush and faces an all-in
const allin: HandView = {
  n: 3, pot: 376, button: 'Mike', shown: [], result: 'Mike wins 376 (Showdown)',
  streets: [
    { street: 'Pre-flop', cards: [], lines: [], segs: [[seg('LJ (Des)', 0), seg(' raises to 6.')], [seg('BTN (Mike)', 1), seg(' calls.')], [seg('SB (Ben)', 2), seg(' and '), seg('BB (Clar)', 3), seg(' fold.')]] },
    { street: 'Flop', cards: ['5s', '5d', '9s'], lines: [], segs: [[seg('LJ', 0), seg(' bets 10.')], [seg('BTN', 1), seg(' calls.')]] },
    { street: 'Turn', cards: ['5s', '5d', '9s', 'Ks'], lines: [], segs: [[seg('LJ', 0), seg(' and '), seg('BTN', 1), seg(' check.')]] },
    { street: 'River', cards: ['5s', '5d', '9s', 'Ks', '6d'], lines: [], segs: [[seg('LJ', 0), seg(' bets 40.')], [seg('BTN', 1), seg(' raises to 80.')], [seg('LJ', 0), seg(' is all-in for 123.')], [seg('BTN', 1), seg(' calls.')]] },
  ],
};

describe('gameplay critique', () => {
  it('reads the action back from the log lines', () => {
    const p = parseView(view);
    expect(p.posOf).toEqual({ Ann: 'BTN', Bo: 'BB' });
    expect(p.streets[1].acts.map((a) => `${a.who} ${a.k} ${a.to}`)).toEqual(['Bo check 0', 'Ann bet 8', 'Bo fold 0']);
  });
  it('basic analysis reads the action like a commentator, with no cards', () => {
    const c = critiqueFor([view], 'Bo', {}, { sb: 1, bb: 2 });
    expect(c.hands[0].status).toBe('nocards');
    const basic = c.hands[0].lines;
    expect(textOf(basic[0][0])).toMatch(/opens with a raise to 3 BB/);
    expect(textOf(basic[1][1])).toMatch(/continuation bet/);
    expect(textOf(basic[1][-1])).toMatch(/Flop A-7-2/);
    // the same basic notes for every player, whatever their cards
    expect(critiqueFor([view], 'Ann', { 1: { cards: ['Ah', 'Kd'], lvl: null } }, { sb: 1, bb: 2 }).hands[0].lines).toEqual(basic);
  });
  it('grades a top pair c-bet as a value bet', () => {
    const c = critiqueFor([view], 'Ann', { 1: { cards: ['Ah', 'Kd'], lvl: null } }, { sb: 1, bb: 2 });
    expect(c.valueBets).toBe(1);
    expect(c.hands[0].close![0][0].g).toBe('green');
    expect(c.hands[0].close![1][1].g).toBe('green');
    expect(c.hands[0].close![1][1].text).toMatch(/represent top pair \(A\)/);
  });
  it('judges a small pair under a paired board as a weak pair, not two pair', () => {
    const c = critiqueFor([paired], 'Ann', { 1: { cards: ['5s', '5d'], lvl: null } }, { sb: 1, bb: 2 });
    const t = Object.values(c.hands[0].deep![1]).map(textOf).join(' ');
    expect(t).toMatch(/You hold a weak pair/);
    expect(t).not.toMatch(/two pair/);
  });
  it('skips a red clash as an invalid hand and keeps a blue one', () => {
    expect(critiqueFor([view], 'Ann', { 1: { cards: ['Ah', 'Kd'], lvl: 'red' } }, { sb: 1, bb: 2 }).hands[0].status).toBe('invalid');
    expect(critiqueFor([view], 'Ann', { 1: { cards: ['Ah', 'Kd'], lvl: 'blue' } }, { sb: 1, bb: 2 }).hands[0].status).toBe('cards');
  });
  it('advanced insights read the board texture and ask questions at each decision', () => {
    const deep = critiqueFor([paired], 'Ann', { 1: { cards: ['5s', '5d'], lvl: null } }, { sb: 1, bb: 2 }).hands[0].deep!;
    const head = textOf(deep[1][-1]);
    expect(head).toMatch(/Flop 4-A-A: a paired board/);
    expect(head).toMatch(/Two aces show\. Only 2 are left/);
    expect(deep[1][1].some((x) => x.tone === 'ask' && /C-bet, or check\?/.test(x.text))).toBe(true);
  });
  it('grades each of my actions; no cards, no grade', () => {
    const weak = critiqueFor([view], 'Bo', { 1: { cards: ['9h', '4d'], lvl: null } }, { sb: 1, bb: 2 });
    expect(weak.hands[0].close![0][1].g).toBe('red');
    expect(weak.hands[0].close![0][1].v).toBe('Loose call');
    expect(weak.hands[0].verdict?.label).toBe('Loose call');
    expect(critiqueFor([view], 'Bo', {}, { sb: 1, bb: 2 }).hands[0].close![0][1].g).toBeUndefined();
  });
  it('a third card of a rank gives every player trips, not a pair', () => {
    const c = critiqueFor([story], 'Mike', { 2: { cards: ['9h', '7d'], lvl: null } }, { sb: 1, bb: 2 }).hands[0];
    const turn = textOf(c.deep![2][-1]) + textOf(c.lines[2][-1]);
    expect(turn).toMatch(/Every player now has at least trips/);
    expect(turn).not.toMatch(/Any 2x now has a pair/);
  });
  it('a bluff into several players is red, and the second bet that keeps the story is green', () => {
    const c = critiqueFor([story], 'Mike', { 2: { cards: ['9h', '7d'], lvl: null } }, { sb: 1, bb: 2 }).hands[0];
    expect(c.close![1][0].g).toBe('red');
    expect(c.close![2][0].g).toBe('green');
    expect(c.close![2][0].v).toBe('Consistent story');
  });
  it('facing an all-in, the only options are call or fold', () => {
    const c = critiqueFor([allin], 'Mike', { 3: { cards: ['As', '6s'], lvl: null } }, { sb: 1, bb: 2 }).hands[0];
    const call = c.close![3][3];
    expect(call.g).toBe('green');
    expect(call.text).not.toMatch(/369|aggressive/);
    expect(textOf(c.deep![3][3])).not.toMatch(/Re-raise/);
    expect(textOf(c.lines[3][2])).toMatch(/all-in/);
    expect(textOf(c.deep![3][-1])).toMatch(/You hold a flush/);
  });
});
