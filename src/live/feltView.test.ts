import { describe, expect, it } from 'vitest';
// @ts-expect-error node types are not in the app tsconfig; vitest runs in node
import { existsSync, readFileSync } from 'node:fs';
import type { Game } from '../types';
import { exactStacks } from '../lib/stacks';
import { handSteps } from '../lib/replay';
import { buildView } from './snapshot';
import { viewActions } from './feltView';

function games(): Game[] {
  const out: Game[] = [];
  for (const f of ['trial/potato-test-backup.json', 'trial/potato-backup.json']) if (existsSync(f)) out.push(...(JSON.parse(readFileSync(f, 'utf-8')).games as Game[]));
  return out;
}
const all = games();

describe.skipIf(!all.length)('the player view Table on real games', () => {
  it('reads the same actions from the viewer boxes as the host Table replays from the log', () => {
    let hands = 0, same = 0;
    for (const g of all) for (const h of g.hands) {
      if (!h.log || h.missed || h.log.mode !== 'bets') continue;
      const host = handSteps(g, h.log, exactStacks(g, h.n));
      const view = viewActions(buildView(g, h.log, h.board, (id) => id, undefined, undefined, h.n));
      hands++;
      // chips in, player by player
      const put = (list: { add: number }[], key: (x: never) => string) => { const o: Record<string, number> = {}; for (const s of list) o[key(s as never)] = Math.round(((o[key(s as never)] ?? 0) + s.add) * 100) / 100; return o; };
      expect(put(view, (x: { id: string }) => x.id), `game ${g.name}, hand ${h.n}`).toEqual(put(host, (x: { pid: string }) => x.pid));
      // the same players in the same order
      if (JSON.stringify(view.map((s) => s.id)) === JSON.stringify(host.map((s) => s.pid))) same++;
    }
    expect(hands).toBeGreaterThan(20);
    expect(same / hands).toBeGreaterThan(0.9);
  });
});
