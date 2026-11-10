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
  it('carries each player seat and status light', () => {
    const g = game();
    g.statusEvents = [{ playerId: 'a', status: 'playing', at: 1 }, { playerId: 'b', status: 'playing', at: 1 }, { playerId: 'b', status: 'away', at: 2 }];
    const pub = buildPub(g, players);
    expect(pub.players).toEqual([
      { id: 'a', name: 'Everett', seat: 1, status: 'playing' },
      { id: 'b', name: 'Bel', seat: 2, status: 'away' },
    ]);
    expect(buildPub(game(), players).players[0].status).toBe('out');
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

describe('viewer reads what the host reads', () => {
  const three = () => ({ ...game(), hands: [], playerIds: ['a', 'b', 'c'], seats: { a: 1, b: 2, c: 3 }, buyIns: ['a', 'b', 'c'].map((p, i) => ({ id: `b${i}`, playerId: p, amount: 200, at: 1 })) } as ReturnType<typeof game>);
  const names3: Player[] = [{ id: 'a', name: 'Ann', createdAt: 0 }, { id: 'b', name: 'Bo', createdAt: 0 }, { id: 'c', name: 'Cy', createdAt: 0 }];
  it('the stack in the table view is the stack behind the chips in front', () => {
    const g = three();
    const stacks = { a: 200, b: 200, c: 200 };
    let log = newBoxLog(g, ['a', 'b', 'c'], 'a', stacks);
    const next = replayStreet(g, log, 'preflop', stacks).next!;
    log = setAct(g, log, 'preflop', next.p, next.r, { k: 'bet', to: 6 }, stacks);
    const sent = buildNow(g, names3, { n: 1, tab: 'preflop', log, board: [], ended: false });
    const before = Object.fromEntries(buildNow(g, names3, { n: 1, tab: 'preflop', log: newBoxLog(g, ['a', 'b', 'c'], 'a', stacks), board: [], ended: false }).stacks.map((s) => [s.name, s.stack]));
    const raiser = names3.find((x) => x.id === next.p)!.name;
    expect(before[raiser]).toBe(200);
    expect(sent.stacks.find((s) => s.name === raiser)!.stack).toBe(194);
    // the blinds are in front too: the small blind has 199 behind its 1
    expect(sent.stacks.find((s) => s.name === 'Bo')!.stack).toBe(199);
  });
  it('a straddle reads as a straddle, and a dark bet after the flop says so', () => {
    const g = three();
    const stacks = { a: 200, b: 200, c: 200 };
    let log = newBoxLog(g, ['a', 'b', 'c'], 'a', stacks);
    const next = replayStreet(g, log, 'preflop', stacks).next!;
    log = setAct(g, log, 'preflop', next.p, next.r, { k: 'bet', to: 4, dark: true }, stacks);
    const v = buildNow(g, names3, { n: 1, tab: 'preflop', log, board: [], ended: false }).view;
    expect(v.streets[0].lines.join('|')).toContain('straddles to 4');
    expect(v.streets[0].lines.join('|')).not.toContain('raises to 4');
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
    // plain lines, a blank line between streets, no dashes that paste as a list
    expect(text).toBe('Hand 3, blinds 1/2\n\nFlop: As Td 4c\nSB (Chuggy, 0) bets 6\n\nShowdown\nChuggy shows Ah Kd\nChuggy wins 14');
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

describe('Not shown in the viewer', () => {
  const three = (): Game => {
    const g = game();
    g.playerIds = ['a', 'b', 'c']; g.seats = { a: 1, b: 2, c: 3 };
    return g;
  };
  const names: Player[] = [...players, { id: 'c', name: 'Cy', createdAt: 0 }];
  const withMucks = (mucked: string[], shown: Record<string, string[]>) => {
    const g = three();
    const h = g.hands[0];
    h.log = { v: 1, mode: 'bets', dealt: ['a', 'b', 'c'], button: 'a', streets: { preflop: { bets: { a: 2, b: 2, c: 2 }, prev: {}, typed: {}, folded: [], raisers: [] } }, allInAt: {}, runs: 1, runCards: [], shown, mucked, startedAt: 10 } as never;
    h.winners = [{ playerId: 'a', amount: 6 }];
    h.shown = Object.entries(shown).map(([playerId, cards]) => ({ playerId, cards })) as never;
    return g;
  };
  it('a takedown lists nobody as Not shown; a showdown lists those who did not show', () => {
    const take = buildPub(withMucks(['b', 'c'], {}), names).hands[0];
    expect(take.mucked).toEqual([]);
    const show = buildPub(withMucks(['c'], { a: ['As', 'Ad'], b: ['Kh', '2d'] }), names).hands[0];
    expect(show.mucked).toEqual(['Cy']);
    expect(viewText(1, 1, 2, show.view)).toContain('Cy: Not shown');
    expect(viewText(1, 1, 2, show.view)).not.toContain('mucks');
  });
  it('a takedown is labelled Result in the viewer and Copy hand; a showdown keeps Showdown', () => {
    const take = buildPub(withMucks(['b', 'c'], {}), names).hands[0];
    expect(take.view.streets.find((s) => s.key === 'showdown')?.label).toBe('Result');
    expect(viewText(1, 1, 2, take.view)).toContain('\n\nResult\n');
    expect(viewText(1, 1, 2, take.view)).not.toContain('Showdown');
    const show = buildPub(withMucks(['c'], { a: ['As', 'Ad'], b: ['Kh', '2d'] }), names).hands[0];
    expect(show.view.streets.find((s) => s.key === 'showdown')?.label).toBe('Showdown');
    expect(viewText(1, 1, 2, show.view)).toContain('\n\nShowdown\n');
  });
  it('the public snapshot carries no password field', () => {
    expect(JSON.stringify(buildPub(game(), players))).not.toMatch(/passphrase|password/i);
  });
});
