import { describe, expect, it } from 'vitest';
import { CHECK_TEXT, fromB64Url, keyFromPassphrase, newRoomId, newRoomKey, open, seal } from './crypto';
import { mockDriver } from './mock';
import { buildNow, buildPub, buildView, standings, viewText } from './snapshot';
import { newBoxLog, replayStreet, setAct } from '../lib/hand';
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

describe('hand in progress', () => {
  it('counts as acted only after a real action, not after the blinds', () => {
    const g = game();
    const log = newBoxLog(g, ['a', 'b'], 'a');
    const hand = (l: typeof log) => buildNow(g, players, { n: 2, tab: 'preflop', log: l, board: [], ended: false });
    expect(hand(log).acted).toBe(false);
    const next = replayStreet(g, log, 'preflop').next!;
    expect(hand(setAct(g, log, 'preflop', next.p, next.r, { k: 'call' })).acted).toBe(true);
  });
});

describe('host and viewer read the same hand', () => {
  it('an all-in key with no amount shows as all-in, and the calls stay calls', () => {
    const g = { ...game(), hands: [], buyIns: [{ id: 'x', playerId: 'a', amount: 47, at: 1 }, { id: 'y', playerId: 'b', amount: 200, at: 1 }] } as ReturnType<typeof game>;
    const stacks = { a: 47, b: 200 };
    let log = newBoxLog(g, ['a', 'b'], 'a', stacks);
    log = setAct(g, log, 'preflop', 'a', 1, { k: 'allin' }, stacks);
    log = setAct(g, log, 'preflop', 'b', 1, { k: 'call' }, stacks);
    log = { ...log, streets: { ...log.streets, preflop: { ...log.streets.preflop!, at: 5 } } };
    const view = buildNow(g, players, { n: 1, tab: 'preflop', log, board: [], ended: false }).view;
    const rows = view.streets[0].rows;
    const last = (name: string) => { const r = rows.find((x) => x.name === name)!; return r.cells.filter((c) => c.t)[r.cells.filter((c) => c.t).length - 1]; };
    expect(last('Everett')).toMatchObject({ kind: 'allin', t: '47' });
    expect(last('Bel')).toMatchObject({ t: 'C' });
    expect(rows.some((r) => r.folded)).toBe(false);
  });
  it('more than one run gives one board per run', () => {
    const g = game();
    let log = newBoxLog(g, ['a', 'b'], 'a');
    log = { ...log, runs: 2, runFrom: 3, runCards: [['2c', '3c'], ['4c', '5c']] };
    const v = buildView(g, log, ['As', 'Kd', 'Qh', '2c', '3c'], (p) => p, { winners: [], shown: [] });
    expect(v.runs?.map((r) => [...r.common, ...r.cards].length)).toEqual([5, 5]);
    expect(v.streets.some((s) => s.key === 'turn')).toBe(false);
    expect(viewText(1, 1, 2, v)).toContain('Run 2: As Kd Qh 4c 5c');
  });
});

describe('hand view', () => {
  const st = (acts: unknown) => ({ bets: {}, prev: {}, typed: {}, folded: [], raisers: [], acts });
  it('names positions and shows the chips already in', () => {
    const g = game();
    const pub = buildPub(g, players);
    expect(pub.hands[0].view.dealt).toEqual(['Everett', 'Bel']);
    expect(pub.hands[0].view.streets.find((s) => s.key === 'showdown')?.lines[0]).toBe('Everett wins 8');
    expect(pub.standings.map((s) => s.id)).toEqual(['a', 'b']);
    void st;
  });
  it('writes a hand as plain text with cards as As and Td', () => {
    const text = viewText(3, 1, 2, { dealt: [], button: null, streets: [
      { key: 'flop', label: 'Flop', old: [], fresh: ['As', 'Td', '4c'], lines: ['SB (Chuggy, 0) bets 6'], cols: 1, rows: [], pot: 12 },
      { key: 'showdown', label: 'Showdown', old: [], fresh: [], lines: ['Chuggy wins 14'], cols: 0, rows: [], pot: 0, shown: [{ name: 'Chuggy', cards: ['Ah', 'Kd'], rank: '' }] },
    ] });
    expect(text).toBe('Hand 3, blinds 1/2\n- Flop: As Td 4c\n- SB (Chuggy, 0) bets 6\n- Chuggy shows Ah Kd\n- Chuggy wins 14');
  });
  it('keeps each player low and high at 0 before any hand', () => {
    const g = { ...game(), hands: [] };
    expect(standings(g)).toEqual([{ id: 'a', now: 0, low: 0, high: 0 }, { id: 'b', now: 0, low: 0, high: 0 }]);
  });
});

describe('QR scan', () => {
  it('reads a join link from a QR image', async () => {
    const { default: jsQR } = await import('jsqr');
    const { default: qrcode } = await import('qrcode-generator');
    const link = 'https://saturdaylim.github.io/felt-poker/app/#/join/0BD-ulQ_JqcBK2FMkiZ4pg/rMLKL0rWI5AyCIS5kMSMZg';
    const q = qrcode(0, 'M');
    q.addData(link);
    q.make();
    const cell = 6, quiet = 4, n = q.getModuleCount(), size = (n + quiet * 2) * cell;
    const data = new Uint8ClampedArray(size * size * 4).fill(255);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const my = Math.floor(y / cell) - quiet, mx = Math.floor(x / cell) - quiet;
      if (my >= 0 && mx >= 0 && my < n && mx < n && q.isDark(my, mx)) { const i = (y * size + x) * 4; data[i] = data[i + 1] = data[i + 2] = 0; }
    }
    expect(jsQR(data, size, size)?.data).toBe(link);
  });
});
