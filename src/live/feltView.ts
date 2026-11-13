/* The player view's Table: a viewer snapshot as a table hand (src/lib/felt.ts). The snapshot carries each hand as the action
   boxes viewers read; the boxes in time order give the same steps the host's Table replays.
   Players are known by name here, as everywhere in the snapshot. Public facts only. */
import { FELT_HUES, feltSteps, type FeltAction, type FeltHand, type FeltPlayer } from '../lib/felt';
import { isRangeStack } from '../lib/stacks';
import type { HandView, NowSnapshot, PubHand, PubSnapshot, StackLine } from './snapshot';

const num = (t: string) => { const n = Number(t.replace(/,/g, '')); return t.trim() !== '' && Number.isFinite(n) ? n : null; };

/** Every action of a hand in time order, from its boxes. A box holds the street total (a number), C (call or check), F (fold)
    or a blind post. Boxes run pass by pass, and each pass from the small blind to the button. */
export function viewActions(view: HandView): FeltAction[] {
  const out: FeltAction[] = [];
  for (const st of view.streets) {
    if (st.key === 'showdown' || !st.rows.length) continue;
    const seg = st.key as FeltAction['seg'];
    const own: Record<string, number> = {};
    const posts = st.rows.reduce((a, r) => a + r.cells.filter((c) => c.kind === 'post').length, 0);
    let high = 0, posted = 0;
    for (let col = 0; col < st.cols; col++) {
      for (const r of st.rows) {
        const c = r.cells[col];
        if (!c || c.kind === 'off') continue;
        const before = own[r.name] ?? 0, n = num(c.t);
        let k: FeltAction['k'], to = before, allin = false;
        if (c.kind === 'post') { if (n === null) continue; k = posts > 1 && posted === 0 ? 'sb' : 'bb'; posted++; to = n; }
        else if (c.kind === 'fold') k = 'fold';
        else if (c.kind === 'call') { to = n ?? Math.max(before, high); k = to > before ? 'call' : 'check'; }
        else if (c.kind === 'allin') { if (n === null) continue; to = n; allin = true; k = to > high ? 'allin' : 'call'; }
        else { if (n === null) continue; to = n; k = to <= high ? (to > before ? 'call' : 'check') : high > 0 ? 'raise' : 'bet'; }
        out.push({ id: r.name, seg, k, to, add: Math.max(0, Math.round((to - before) * 100) / 100), allin });
        own[r.name] = to;
        high = Math.max(high, to);
      }
    }
  }
  return out;
}

/** Seats in table order; a player keeps the colour the host's Table gives them (their place in the game's player list). */
function seats(pub: PubSnapshot, only?: string[]): FeltPlayer[] {
  const all = pub.players.map((p, i) => ({ id: p.name, name: p.name, hue: i % FELT_HUES.length, seat: p.seat })).sort((a, b) => a.seat - b.seat);
  const list: FeltPlayer[] = (only ? all.filter((p) => only.includes(p.id)) : all).map(({ id, name, hue }) => ({ id, name, hue }));
  // a player who has left the game since still sits in the hands they played
  for (const nm of only ?? []) if (!list.some((p) => p.id === nm)) list.push({ id: nm, name: nm, hue: 8 });
  return list;
}
const shownBy = (list: { name: string; cards: FeltHand['board'] }[]) => Object.fromEntries(list.filter((s) => s.cards.length === 2).map((s) => [s.name, s.cards]));

/** A finished hand. The snapshot has no stacks for it, so the seats show no stack. */
export function pubFelt(pub: PubSnapshot, h: PubHand): FeltHand {
  const shown = shownBy(h.shown);
  return {
    n: h.n, live: false, players: seats(pub, h.dealt), dealt: h.dealt, button: h.view.button,
    steps: feltSteps(viewActions(h.view), { board: h.board.length, show: Object.keys(shown).length > 0, win: true }),
    start: {}, board: h.board, shown, pays: h.winners.filter((w) => w.amount > 0).map((w) => ({ id: w.name, amount: w.amount })),
    toActEnd: null, bb: pub.game.bb, showdown: h.view.streets.some((s) => s.key === 'showdown' && s.label === 'Showdown'), winners: [...new Set(h.winners.map((w) => w.name))],
  };
}

const exact = (bb: number, l: StackLine) => (l.stack === null || isRangeStack(l.spread, bb) ? undefined : l.stack);

/** The hand in play. Its stacks are the chips behind each player now; the chips put in this hand go back on, to give the stacks at the start. */
export function nowFelt(pub: PubSnapshot, now: NowSnapshot): FeltHand {
  const actions = viewActions(now.view);
  const put: Record<string, number> = {};
  for (const a of actions) put[a.id] = (put[a.id] ?? 0) + a.add;
  const start: FeltHand['start'] = {};
  for (const l of now.stacks) { const v = exact(pub.game.bb, l); start[l.name] = v === undefined ? undefined : v + (put[l.name] ?? 0); }
  const shown = now.ended ? shownBy(now.view.streets.find((s) => s.key === 'showdown')?.shown ?? []) : {};
  return {
    n: now.n, live: true, players: seats(pub), dealt: now.view.dealt, button: now.view.button ?? pub.button,
    steps: feltSteps(actions, { board: now.board.length, show: Object.keys(shown).length > 0, win: false }),
    start, board: now.board, shown, pays: [], toActEnd: now.ended ? null : now.toAct, bb: pub.game.bb, showdown: true, winners: [],
  };
}

/** No hand on the table: every seat with its stack. */
export function idleFelt(pub: PubSnapshot, stacks: StackLine[]): FeltHand {
  return {
    n: 0, live: false, players: seats(pub), dealt: [], button: null, steps: [], start: Object.fromEntries(stacks.map((l) => [l.name, exact(pub.game.bb, l)])),
    board: [], shown: {}, pays: [], toActEnd: null, bb: pub.game.bb, showdown: false, winners: [],
  };
}
