import { describe, expect, it } from 'vitest';
import { backWay, parentOf } from './router';

describe('back', () => {
  it('goes to the logical parent when this session has no trail (reload, cold load)', () => {
    expect(backWay(0)).toBe('parent');
  });
  it('steps the history back when this session opened the screen', () => {
    expect(backWay(1)).toBe('history');
  });
});

describe('parentOf', () => {
  const closed = (id: string) => id === 'c';
  it('maps each sub page to its parent', () => {
    expect(parentOf('#/game/l', closed)).toBe('');
    expect(parentOf('#/game/c', closed)).toBe('games');
    expect(parentOf('#/game/c/hands', closed)).toBe('games');
    expect(parentOf('#/game/l/hand/3', closed)).toBe('game/l');
    expect(parentOf('#/game/c/hand/3', closed)).toBe('game/c/hands');
    expect(parentOf('#/game/l/count')).toBe('game/l');
    expect(parentOf('#/game/l/close')).toBe('game/l');
    expect(parentOf('#/game/l/report')).toBe('game/l/close');
    expect(parentOf('#/group/g')).toBe('players');
    expect(parentOf('#/new/cash')).toBe('');
  });
  it('has none for a main tab', () => {
    expect(parentOf('#/games/stats')).toBeUndefined();
    expect(parentOf('')).toBeUndefined();
  });
});
