import { describe, expect, it } from 'vitest';
import { positionMap, positionsFor, streetLines, type LogAct } from './logText';

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

const a = (who: string, k: LogAct['k'], amount = 0): LogAct => ({ who, k, amount });

describe('streetLines', () => {
  it('groups calls, holds folds to the end and ends a takedown', () => {
    const l = streetLines([a('UTG (Al)', 'fold'), a('BB (Nic)', 'bet', 4), a('HJ (Eve)', 'call', 4), a('CO (Mike)', 'call', 4), a('BTN (Nat)', 'call', 4), a('SB (Ben)', 'fold')], 4);
    expect(l).toEqual(['BB (Nic) bets 4.', 'Calls from HJ (Eve), CO (Mike) and BTN (Nat).', 'Folds from UTG (Al) and SB (Ben).']);
  });
  it('writes one call and one check alone with no amount', () => {
    expect(streetLines([a('BB (Nic)', 'bet', 4), a('HJ (Eve)', 'call', 4)], 2)).toEqual(['BB (Nic) bets 4.', 'HJ (Eve) calls.']);
    expect(streetLines([a('SB (Ben)', 'check')], 2)).toEqual(['SB (Ben) checks.']);
  });
  it('never merges a call for less with other calls', () => {
    const l = streetLines([a('BB (Nic)', 'bet', 40), a('HJ (Eve)', 'call', 40), { ...a('CO (Mike)', 'call', 30), allin: true }, a('BTN (Nat)', 'call', 40), a('SB (Ben)', 'call', 40)], 5);
    expect(l).toEqual(['BB (Nic) bets 40.', 'HJ (Eve) calls.', 'CO (Mike) calls all-in for 30.', 'Calls from BTN (Nat) and SB (Ben).']);
  });
  it('says about for an estimated all-in', () => {
    expect(streetLines([{ ...a('CO (Mike)', 'allin', 197), est: true }], 2)).toEqual(['CO (Mike) is all-in for about 197.']);
    expect(streetLines([a('BB (Nic)', 'bet', 300), { ...a('CO (Mike)', 'call', 197), allin: true, est: true }], 2)).toEqual(['BB (Nic) bets 300.', 'CO (Mike) calls all-in for about 197.']);
  });
  it('keeps the dark suffix on bets and calls', () => {
    expect(streetLines([{ ...a('UTG (Al)', 'bet', 4), dark: true }, { ...a('BTN (Nat)', 'call', 4), dark: true }], 2)).toEqual(['UTG (Al) bets 4 in the dark.', 'BTN (Nat) calls in the dark.']);
  });
  it('writes a takedown with no fold line', () => {
    expect(streetLines([a('A (x)', 'fold'), a('SB (Ben)', 'raise', 12), a('B (y)', 'fold')], 1)).toEqual(['SB (Ben) raises to 12 for a takedown.']);
  });
  it('groups checks', () => {
    expect(streetLines([a('SB (Ben)', 'check'), a('BB (Nic)', 'check')], 2)).toEqual(['Checks from SB (Ben) and BB (Nic).']);
  });
  it('writes a lone fold, straddles and all-ins', () => {
    expect(streetLines([a('SB (Ben)', 'fold')], 1)).toEqual(['SB (Ben) folds.']);
    expect(streetLines([a('UTG (Al)', 'straddle', 4), a('BTN (Nat)', 'allin', 90)], 2)).toEqual(['UTG (Al) straddles to 4.', 'BTN (Nat) is all-in for 90.']);
  });
});
