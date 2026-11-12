import { describe, expect, it } from 'vitest';
import { gameRules, rulesForNew } from './rules';
import type { Game, Settings } from '../types';

const preset = { minRaise: 'double', bounty27: { on: true, win: 'won', suited: true, amount: 25 } } as Settings;

describe('rulesForNew', () => {
  it('takes the preset, not the last game', () => {
    expect(rulesForNew('cash', preset)).toEqual({ minRaise: 'double', bounty27: preset.bounty27 });
  });
  it('a change for one game does not touch the preset', () => {
    const r = rulesForNew('cash', preset);
    r.bounty27.amount = 99;
    expect(preset.bounty27.amount).toBe(25);
    expect(rulesForNew('cash', preset).bounty27.amount).toBe(25);
  });
  it('a tournament starts with the bounty off', () => {
    expect(rulesForNew('tournament', preset).bounty27).toEqual({ ...preset.bounty27, on: false });
  });
});

describe('gameRules', () => {
  it('an old game with no saved rules reads the settings', () => {
    expect(gameRules({} as Game, preset)).toEqual({ minRaise: 'double', bounty27: preset.bounty27 });
  });
  it('a game keeps its own rules', () => {
    const own = { minRaise: 'sb' as const, bounty27: { on: false, win: 'shown' as const, suited: false, amount: 5 } };
    expect(gameRules({ rules: own } as Game, preset)).toBe(own);
  });
});
