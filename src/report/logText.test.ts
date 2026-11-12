import { describe, expect, it } from 'vitest';
// @ts-expect-error node types are not in the app tsconfig; vitest runs in node
import { existsSync, readFileSync } from 'node:fs';
import { LOG_COLORS, lineText, positionMap, positionsFor, streetLines, type LogAct } from './logText';
import { buildModel } from './model';
import { wrapLine } from './segments';

describe('positionsFor', () => {
  it('cuts names in the owner order', () => {
    expect(positionsFor(9)).toEqual(['SB', 'BB', 'UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO', 'BTN']);
    expect(positionsFor(8)).toEqual(['SB', 'BB', 'UTG', 'MP', 'LJ', 'HJ', 'CO', 'BTN']);
    expect(positionsFor(7)).toEqual(['SB', 'BB', 'UTG', 'LJ', 'HJ', 'CO', 'BTN']);
    expect(positionsFor(6)).toEqual(['SB', 'BB', 'UTG', 'HJ', 'CO', 'BTN']);
    expect(positionsFor(5)).toEqual(['SB', 'BB', 'UTG', 'CO', 'BTN']);
    expect(positionsFor(4)).toEqual(['SB', 'BB', 'UTG', 'BTN']);
    expect(positionsFor(3)).toEqual(['SB', 'BB', 'BTN']);
    expect(positionsFor(2)).toEqual(['BTN', 'BB']);
  });
  it('adds UTG+2, UTG+3 for 10 or more', () => {
    expect(positionsFor(10)).toEqual(['SB', 'BB', 'UTG', 'UTG+1', 'UTG+2', 'MP', 'LJ', 'HJ', 'CO', 'BTN']);
    expect(positionsFor(11)).toHaveLength(11);
  });
  it('maps players, also when the button is not dealt in', () => {
    expect(positionMap(['a', 'b', 'c'], 'c')).toEqual({ a: 'SB', b: 'BB', c: 'BTN' });
    expect(positionMap(['a', 'b', 'c'], 'x')).toEqual({ a: 'SB', b: 'BB', c: 'UTG' });
    expect(positionMap(['b', 'a'], 'b')).toEqual({ a: 'BB', b: 'BTN' });
  });
});

const PEOPLE: Record<string, [string, string, number]> = {
  Al: ['UTG', 'Al', 0], Nic: ['BB', 'Nic', 1], Eve: ['HJ', 'Eve', 2], Mike: ['CO', 'Mike', 3], Nat: ['BTN', 'Nat', 4], Ben: ['SB', 'Ben', 5],
};
const a = (who: string, k: LogAct['k'], amount = 0): LogAct => { const [pos, name, c] = PEOPLE[who]; return { pid: who, pos, name, c, k, amount }; };
const text = (acts: LogAct[], left: number, named = new Set<string>()) => streetLines(acts, left, named).map(lineText);

describe('streetLines', () => {
  it('writes the position first, one, two and three players', () => {
    expect(text([a('Nic', 'raise', 4)], 2)).toEqual(['BB (Nic) raises to 4.']);
    expect(text([a('Ben', 'check'), a('Mike', 'check')], 2)).toEqual(['SB (Ben) and CO (Mike) check.']);
    expect(text([a('Eve', 'call', 4), a('Mike', 'call', 4), a('Nat', 'call', 4)], 4)).toEqual(['HJ (Eve), CO (Mike) and BTN (Nat) call.']);
    expect(text([a('Nic', 'bet', 4), a('Eve', 'call', 4)], 2)).toEqual(['BB (Nic) bets 4.', 'HJ (Eve) calls.']);
  });
  it('names a player on the first reference in the hand only', () => {
    const named = new Set<string>();
    expect(text([a('Nic', 'bet', 4), a('Eve', 'call', 4)], 2, named)).toEqual(['BB (Nic) bets 4.', 'HJ (Eve) calls.']);
    expect(text([a('Eve', 'check'), a('Nic', 'raise', 12), a('Eve', 'call', 12)], 2, named)).toEqual(['HJ checks.', 'BB raises to 12.', 'HJ calls.']);
    // a new hand starts with an empty set and names again
    expect(text([a('Nic', 'check')], 2)).toEqual(['BB (Nic) checks.']);
    // inside one group each player is judged alone
    expect(text([a('Al', 'check'), a('Nic', 'check')], 3, new Set(['Al']))).toEqual(['UTG and BB (Nic) check.']);
  });
  it('writes folds where they happen and groups neighbouring folds', () => {
    const l = text([a('Al', 'fold'), a('Eve', 'fold'), a('Nic', 'bet', 4), a('Mike', 'call', 4), a('Nat', 'fold'), a('Ben', 'fold')], 2);
    expect(l).toEqual(['UTG (Al) and HJ (Eve) fold.', 'BB (Nic) bets 4.', 'CO (Mike) calls.', 'BTN (Nat) and SB (Ben) fold.']);
    expect(text([a('Al', 'fold'), a('Ben', 'check'), a('Eve', 'fold')], 2)).toEqual(['UTG (Al) folds.', 'SB (Ben) checks.', 'HJ (Eve) folds.']);
    expect(text([a('Al', 'fold'), a('Eve', 'fold'), a('Mike', 'fold')], 4)).toEqual(['UTG (Al), HJ (Eve) and CO (Mike) fold.']);
  });
  it('ends a takedown and drops the closing folds', () => {
    expect(text([a('Al', 'fold'), a('Ben', 'raise', 12), a('Nic', 'fold'), a('Eve', 'fold')], 1)).toEqual(['UTG (Al) folds.', 'SB (Ben) raises to 12 for a takedown.']);
    expect(text([a('Ben', 'fold')], 1)).toEqual(['SB (Ben) folds.']);
  });
  it('never merges a call for less with other calls', () => {
    const l = text([a('Nic', 'bet', 40), a('Eve', 'call', 40), { ...a('Mike', 'call', 30), allin: true }, a('Nat', 'call', 40), a('Ben', 'call', 40)], 5);
    expect(l).toEqual(['BB (Nic) bets 40.', 'HJ (Eve) calls.', 'CO (Mike) calls all-in for 30.', 'BTN (Nat) and SB (Ben) call.']);
  });
  it('says about for an estimated all-in', () => {
    expect(text([{ ...a('Mike', 'allin', 197), est: true }], 2)).toEqual(['CO (Mike) is all-in for about 197.']);
    expect(text([a('Nic', 'bet', 300), { ...a('Mike', 'call', 197), allin: true, est: true }], 2)).toEqual(['BB (Nic) bets 300.', 'CO (Mike) calls all-in for about 197.']);
  });
  it('keeps the dark suffix on bets and calls', () => {
    expect(text([{ ...a('Al', 'bet', 4), dark: true }, { ...a('Nat', 'call', 4), dark: true }], 2)).toEqual(['UTG (Al) bets 4 in the dark.', 'BTN (Nat) calls in the dark.']);
  });
  it('writes straddles and all-ins', () => {
    expect(text([a('Al', 'straddle', 4), a('Nat', 'allin', 90)], 2)).toEqual(['UTG (Al) straddles to 4.', 'BTN (Nat) is all-in for 90.']);
  });
  it('colours the position and name with the player colour, the verb plain', () => {
    const l = streetLines([a('Nic', 'raise', 4)], 2)[0];
    expect(l).toEqual([{ t: 'BB (Nic)', c: 1 }, { t: ' raises to 4.' }]);
  });
});

describe('player colours', () => {
  it('has 8 text colours per theme and no repeats', () => {
    for (const t of ['light', 'dark'] as const) expect(new Set(LOG_COLORS[t]).size).toBe(8);
  });
  it('matches the HTML report tokens', () => {
    const css = readFileSync('scripts/trial-report.css', 'utf-8');
    for (const t of ['light', 'dark'] as const) for (const [i, c] of LOG_COLORS[t].entries()) expect(css).toContain(`--trial-t${i + 1}: ${c};`);
  });
});

describe('wrapLine', () => {
  const measure = (s: string) => s.length * 10; // fake width: 10 px a character
  const line = [{ t: 'HJ (Eve)', c: 2 }, { t: ', ' }, { t: 'CO (Mike)', c: 3 }, { t: ' and ' }, { t: 'BTN (Nat)', c: 4 }, { t: ' call.' }];
  it('never starts a wrapped line with a separator', () => {
    for (let maxW = 80; maxW <= 400; maxW += 10) {
      const lines = wrapLine(line, '400 23px x', maxW, measure);
      for (const l of lines.slice(1)) expect(['', ',', 'and']).not.toContain(l[0].t.trim());
      expect(lines.flat().map((s) => s.t).join('')).toBe(line.map((s) => s.t).join(''));
    }
  });
  it('keeps one line when it fits', () => {
    expect(wrapLine(line, '400 23px x', 1000, measure)).toHaveLength(1);
  });
});

const BACKUP ='trial/potato-test-backup.json';
describe.skipIf(!existsSync(BACKUP))('colours in a real game', () => {
  it('give a player the same colour in every hand, and the name once per hand', () => {
    const m = buildModel(JSON.parse(readFileSync(BACKUP, 'utf-8')), 0, { gameLog: true });
    // player name -> every colour that player's segments carried, over all hands
    const byPlayer = new Map<string, Set<number>>();
    for (const v of m.log!) {
      const nameAt = new Map<string, string>(); // position -> name, within this hand
      for (const st of v.streets) for (const l of st.segs) for (const sg of l) {
        if (sg.c === undefined) continue;
        const named = /^(.+?) \((.*)\)$/.exec(sg.t);
        if (named) { expect(nameAt.has(named[1])).toBe(false); nameAt.set(named[1], named[2]); }
        const name = named ? named[2] : nameAt.get(sg.t);
        expect(name, `${sg.t} in hand ${v.n} is named before it repeats`).toBeDefined();
        const set = byPlayer.get(name!) ?? new Set<number>();
        set.add(sg.c); byPlayer.set(name!, set);
      }
    }
    for (const [name, set] of byPlayer) expect([...set], `${name} has one colour`).toHaveLength(1);
    expect(byPlayer.size).toBeGreaterThan(1);
  });
});
