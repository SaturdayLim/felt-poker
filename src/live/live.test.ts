import { describe, expect, it } from 'vitest';
import { CHECK_TEXT, fromB64Url, keyFromPassphrase, newRoomId, newRoomKey, open, seal } from './crypto';
import { mockDriver } from './mock';
import { buildPub } from './snapshot';
import { lock, unlock } from '../report/lock';
import type { Game, Player } from '../types';

const game = (): Game => ({
  id: 'g1', name: 'Potato Day', type: 'cash', status: 'live', createdAt: 0, startedAt: 1000, currency: 'S$', unitValue: 0.1, sb: 1, bb: 2, defaultBuyIn: 200,
  playerIds: ['a', 'b'], seats: { a: 1, b: 2 }, buyIns: [{ id: 'x', playerId: 'a', amount: 200, at: 1 }, { id: 'y', playerId: 'b', amount: 200, at: 2 }],
  cashOuts: [], statusEvents: [], expenses: [], transfers: [],
  hands: [{
    id: 'h1', n: 1, at: 10, endedAt: 20, pot: 8, winners: [{ playerId: 'a', amount: 8 }], board: ['2c', '3d', '4h', '5s', '9c'], shown: [{ playerId: 'a', cards: ['As', 'Ks'] }],
    allIn: false, straddle: false, tags: [], boardNA: false,
    private: { b: ['Qd', 'Jd'] },
    log: { v: 1, mode: 'bets', dealt: ['a', 'b'], streets: {}, runs: 1, runCards: [], shown: {}, mucked: [], startedAt: 10 },
  }],
} as unknown as Game);
const players: Player[] = [{ id: 'a', name: 'Everett', createdAt: 0 }, { id: 'b', name: 'Bel', createdAt: 0 }];

describe('live crypto', () => {
  it('makes unique url-safe ids and keys', () => {
    expect(newRoomId()).not.toBe(newRoomId());
    expect(newRoomId()).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(fromB64Url(newRoomKey()).length).toBe(16);
  });
  it('seals and opens, and a wrong key fails', async () => {
    const k = newRoomKey();
    const s = await seal({ hello: 'world' }, k);
    expect(await open(s, k)).toEqual({ hello: 'world' });
    await expect(open(s, newRoomKey())).rejects.toBeDefined();
  });
  it('derives the same key from a passphrase for one room, and a different key for another', async () => {
    const a = await keyFromPassphrase('Pizza', 'room1');
    expect(await keyFromPassphrase(' pizza ', 'room1')).toBe(a);
    expect(await keyFromPassphrase('pizza', 'room2')).not.toBe(a);
    expect(await open(await seal(CHECK_TEXT, a), a)).toBe(CHECK_TEXT);
  });
});

describe('public snapshot', () => {
  it('holds public facts and no private cards', () => {
    const pub = buildPub(game(), players);
    expect(pub.game.name).toBe('Potato Day');
    expect(pub.hands).toHaveLength(1);
    expect(pub.hands[0].shown[0].name).toBe('Everett');
    expect(pub.hands[0].winners).toEqual([{ name: 'Everett', amount: 8 }]);
    const text = JSON.stringify(pub);
    expect(text).not.toContain('private');
    expect(text).not.toContain('Qd');
    expect(text).not.toContain('Jd');
  });
});

describe('mock driver', () => {
  it('creates, writes, watches and removes a room', async () => {
    const d = mockDriver();
    await d.signIn();
    await d.create('r', { owner: 'u', meta: { n: 1 } });
    await expect(d.create('r', {})).rejects.toBeDefined();
    const seen: unknown[] = [];
    const stop = d.watch('r', 'meta/n', (v) => seen.push(v));
    await Promise.resolve();
    await d.set('r', 'meta/n', 2);
    await d.set('r', 'inbox/p/3', { box: 1 });
    await d.set('r', 'inbox/p/3', null);
    stop();
    await d.set('r', 'meta/n', 3);
    expect(seen).toEqual([1, 2]);
    await d.remove('r');
    await expect(d.set('r', 'x', 1)).rejects.toBeDefined();
  });
});

describe('card entry path', () => {
  it('a viewer locks cards with the code and only the host side with the same code opens them', async () => {
    const box = await lock({ cards: ['7h', 'Ks'] }, 'k7m 2qx');
    expect(await unlock(box, 'K7M2QX')).toEqual({ cards: ['7h', 'Ks'] });
    await expect(unlock(box, 'AAAAAA')).rejects.toBeDefined();
  });
});
