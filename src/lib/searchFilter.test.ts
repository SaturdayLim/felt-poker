import { describe, expect, it } from 'vitest';
import { playersMatching } from './searchFilter';
import type { Game, Player } from '../types';

const pl = (id: string, name: string) => ({ id, name } as Player);
const players = [pl('c', 'Cat'), pl('a', 'Amy'), pl('b', 'Bob'), pl('d', 'Dan')];
const game = (id: string, name: string, at: number, playerIds: string[]) => ({ id, name, startedAt: at, playerIds } as unknown as Game);
const games = [
  game('g1', 'Potato Day', new Date(2026, 10, 1, 20).getTime(), ['a', 'b']),
  game('g2', 'Churchies', new Date(2026, 9, 5, 20).getTime(), ['b', 'c']),
];
const names = (l: Player[]) => l.map((p) => p.name);

describe('playersMatching', () => {
  it('player mode matches names, A to Z', () => {
    expect(names(playersMatching(players, games, 'person', 'a'))).toEqual(['Amy', 'Cat', 'Dan']);
  });
  it('game name mode lists the players of matching games', () => {
    expect(names(playersMatching(players, games, 'game', 'potato'))).toEqual(['Amy', 'Bob']);
    expect(names(playersMatching(players, games, 'game', 'church'))).toEqual(['Bob', 'Cat']);
  });
  it('date mode lists the players of games on that date', () => {
    expect(names(playersMatching(players, games, 'date', '1 nov'))).toEqual(['Amy', 'Bob']);
    expect(names(playersMatching(players, games, 'date', 'oct 2026'))).toEqual(['Bob', 'Cat']);
  });
  it('no match gives an empty list', () => {
    expect(playersMatching(players, games, 'game', 'zzz')).toEqual([]);
    expect(playersMatching(players, games, 'date', '2019')).toEqual([]);
    expect(playersMatching(players, games, 'person', 'zzz')).toEqual([]);
  });
  it('empty text lists every player in every mode', () => {
    for (const m of ['person', 'game', 'date'] as const) expect(names(playersMatching(players, games, m, '  '))).toEqual(['Amy', 'Bob', 'Cat', 'Dan']);
  });
});
