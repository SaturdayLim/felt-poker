import { describe, expect, it } from 'vitest';
// @ts-expect-error node types are not in the app tsconfig; vitest runs in node
import { existsSync, readFileSync } from 'node:fs';
import type { Game } from '../types';
import { bountyPay, bountyTotal, contributions, potTotal } from './hand';
import { estimateStacks, exactStacks } from './stacks';
import { handSteps, resultAt, tableAt, type ReplayInput } from './replay';

const close = (a: number | undefined, b: number | undefined) => expect(Math.abs((a ?? 0) - (b ?? 0))).toBeLessThan(0.011);

function games(): Game[] {
  const out: Game[] = [];
  for (const f of ['trial/potato-test-backup.json', 'trial/potato-backup.json']) if (existsSync(f)) out.push(...(JSON.parse(readFileSync(f, 'utf-8')).games as Game[]));
  return out;
}
const all = games();

describe.skipIf(!all.length)('replay on real games', () => {
  it('puts in the same chips as the logged wagers, hand by hand and player by player', () => {
    let hands = 0, steps = 0;
    for (const g of all) for (const h of g.hands) {
      if (!h.log || h.missed) continue;
      const stacks = exactStacks(g, h.n);
      const list = handSteps(g, h.log, stacks);
      const put: Record<string, number> = {};
      for (const s of list) put[s.pid] = (put[s.pid] ?? 0) + s.add;
      const c = contributions(g, h.log, h.log.button);
      for (const p of h.log.dealt) close(put[p], c[p]);
      close(Object.values(put).reduce((a, b) => a + b, 0), potTotal(g, h.log, h.log.button));
      hands++; steps += list.length;
    }
    expect(hands).toBeGreaterThan(20);
    expect(steps).toBeGreaterThan(hands * 3);
  });

  it('ends on the recorded result: start minus wagers plus winnings is the stack before the next hand', () => {
    let checked = 0;
    for (const g of all) {
      // only games with no counts, so the stacks change by the pots, 7-2 bounties and chip moves (skipped below) alone
      if ((g.counts ?? []).length) continue;
      const hs = g.hands.filter((h) => h.log && !h.missed);
      for (const h of hs) {
        const next = g.hands.find((x) => x.n === h.n + 1);
        // a partly recorded hand charges the pot beyond the logged wagers to the finalists as an estimate: no exact end state
        if (!next || next.missed || h.partial) continue;
        const before = estimateStacks(g, h.n), after = estimateStacks(g, h.n + 1);
        const start = exactStacks(g, h.n);
        const inp: ReplayInput = { g, log: h.log!, steps: handSteps(g, h.log!, start), start, board: h.board };
        const end = tableAt(inp, inp.steps.length);
        const res = resultAt(inp, h);
        for (const p of h.log!.dealt) {
          if (start[p] === undefined || after.spread[p] > 0 || before.spread[p] > 0) continue;
          // a buy-in or cash-out between the two hands moves the stack: skip those players
          const moved = g.buyIns.some((b) => b.playerId === p && b.at > (h.endedAt ?? h.at) && b.at < next.at) || g.cashOuts.some((c) => c.playerId === p && c.at < next.at && c.at > h.at);
          if (moved || (g.moves ?? []).some((m) => (m.afterN === h.n || (m.at > h.at && m.at < next.at)) && (m.from === p || m.to === p))) continue;
          close(end.stacks[p], start[p]! - (contributions(g, h.log!, h.log!.button)[p] ?? 0));
          const b = h.bounty ? (h.bounty.playerId === p ? bountyTotal(h.bounty) : 0) - (h.bounty.payers.includes(p) ? bountyPay(h.bounty, p) : 0) : 0;
          close((res.stacks[p] ?? 0) + b, after.stack[p]);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(20);
  });

  it('sweeps bets into the pot when the street changes and shows only that street\'s board cards', () => {
    for (const g of all) for (const h of g.hands) {
      if (!h.log || h.missed) continue;
      const start = exactStacks(g, h.n);
      const inp: ReplayInput = { g, log: h.log, steps: handSteps(g, h.log, start), start, board: h.board };
      for (let k = 0; k <= inp.steps.length; k++) {
        const t = tableAt(inp, k);
        close(t.total, inp.steps.slice(0, k).reduce((a, s) => a + s.add, 0));
        expect(t.boardCount).toBeLessThanOrEqual({ preflop: 0, flop: 3, turn: 4, river: 5 }[t.street]);
        expect(t.boardCount).toBeLessThanOrEqual(h.board.length);
        for (const p of Object.keys(t.bets)) expect(inp.steps[k - 1]?.street === t.street || !t.bets[p]).toBe(true);
      }
    }
  });
});

describe('replay of a small hand', () => {
  const g = { id: 'g', sb: 1, bb: 2, seats: { a: 1, b: 2, c: 3 }, playerIds: ['a', 'b', 'c'] } as unknown as Game;
  const log = {
    v: 1, mode: 'bets', dealt: ['a', 'b', 'c'], button: 'a', runs: 1, runCards: [], shown: {}, mucked: [], startedAt: 0,
    streets: {
      preflop: { acts: { a: [{ k: 'bet', to: 6, at: 2 }], b: [null, { k: 'fold', at: 6 }], c: [null, { k: 'call', at: 6 }] }, bets: {}, prev: {}, typed: {}, folded: ['b'], raisers: [], at: 1 },
      flop: { acts: { c: [{ k: 'call', at: 0 }], a: [{ k: 'bet', to: 10, at: 0 }] }, bets: {}, prev: {}, typed: {}, folded: [], raisers: [] },
    },
  } as unknown as Game['hands'][number]['log'] & object;
  const start = { a: 100, b: 100, c: 100 };
  const steps = handSteps(g, log, start);
  it('lists the posts, then each action in time order', () => {
    expect(steps.map((s) => `${s.pid}:${s.k}:${s.to}`)).toEqual(['b:sb:1', 'c:bb:2', 'a:raise:6', 'b:fold:1', 'c:call:6', 'c:check:0', 'a:bet:10']);
  });
  it('replays any step with stacks, bets, pot and the next to act', () => {
    const inp: ReplayInput = { g, log, steps, start, board: ['Qs', 'Jd', '2c', null, null], live: true };
    const t3 = tableAt(inp, 3);
    expect(t3).toMatchObject({ street: 'preflop', pot: 0, total: 9, bets: { b: 1, c: 2, a: 6 }, toAct: 'b', boardCount: 0 });
    expect(t3.stacks).toMatchObject({ a: 94, b: 99, c: 98 });
    const t6 = tableAt(inp, 6);
    expect(t6).toMatchObject({ street: 'flop', pot: 13, bets: { c: 0 }, boardCount: 3, folded: ['b'], toAct: 'a' });
    const end = tableAt(inp, steps.length);
    expect(end).toMatchObject({ pot: 13, total: 23, bets: { c: 0, a: 10 }, toAct: 'c' });
  });
});
