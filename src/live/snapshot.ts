/* What the host publishes for viewers. Only what is already public at the table:
   settings, closed hands with the cards shown, and the hand in progress (board, actions, pot, who acts next,
   approximate stacks). Private cards are never in here. */
import type { Card, Game, ID, Player, Settings, StreetName } from '../types';
import { estimateStacks } from '../lib/stacks';
import { bestHand } from '../lib/cards';
import { potTotal, replayStreet, STREETS } from '../lib/hand';
import { rulesList } from '../report/model';
import type { HandLog } from '../types';

export interface PubHand {
  n: number; pot: number;
  winners: { name: string; amount: number }[];
  board: Card[];
  shown: { name: string; cards: Card[]; rank: string }[];
  dealt: string[];
}
export interface StackLine { name: string; stack: number | null; spread: number }
export interface PubSnapshot {
  v: 1;
  game: { name: string; type: string; sb: number; bb: number; status: string; startedAt: number };
  rules: { label: string; value: string }[];
  players: { id: ID; name: string }[];
  hands: PubHand[];
  stacks: StackLine[];
  updatedAt: number;
}
export interface NowSnapshot {
  v: 1;
  n: number;
  stage: string;
  board: Card[];
  pot: number;
  toAct: string | null;
  actions: { street: string; text: string }[];
  ended: boolean;
  stacks: StackLine[];
  updatedAt: number;
}

const stackLines = (g: Game, name: (id: ID) => string): StackLine[] => {
  const est = estimateStacks(g);
  return g.playerIds.map((p) => ({ name: name(p), stack: est.stack[p] ?? null, spread: est.spread[p] ?? 0 }));
};

/** The slow part: settings, players, closed hands and approximate stacks. Sent when a hand closes or a setting changes. */
export function buildPub(g: Game, players: Player[], settings?: Settings, at = Date.now()): PubSnapshot {
  const name = (id: ID) => players.find((p) => p.id === id)?.name ?? '?';
  return {
    v: 1,
    game: { name: g.name, type: g.type, sb: g.sb, bb: g.bb, status: g.status, startedAt: g.startedAt },
    rules: rulesList(g, settings),
    players: g.playerIds.map((id) => ({ id, name: name(id) })),
    hands: g.hands.filter((h) => !h.missed && h.log).map((h) => ({
      n: h.n, pot: h.pot,
      winners: h.winners.map((w) => ({ name: name(w.playerId), amount: w.amount })),
      board: h.board,
      shown: h.shown.map((s) => ({ name: name(s.playerId), cards: s.cards, rank: h.board.length === 5 ? bestHand([...s.cards, ...h.board])?.name ?? '' : '' })),
      dealt: (h.log?.dealt ?? []).map(name),
    })),
    stacks: stackLines(g, name),
    updatedAt: at,
  };
}

const STAGE: Record<string, string> = { setup: 'Setup', preflop: 'Pre-flop', flop: 'Flop', turn: 'Turn', river: 'River', showdown: 'Showdown' };

/** The hand in progress: small, sent after each action. */
export function buildNow(g: Game, players: Player[], hand: { n: number; tab: string; log: HandLog; board: (Card | null)[]; ended: boolean }, at = Date.now()): NowSnapshot {
  const name = (id: ID) => players.find((p) => p.id === id)?.name ?? '?';
  const actions: NowSnapshot['actions'] = [];
  let toAct: string | null = null;
  for (const street of STREETS as StreetName[]) {
    if (!hand.log.streets[street]?.acts) continue;
    const rp = replayStreet(g, hand.log, street);
    for (let r = 0; r < rp.cols; r++) {
      for (const p of rp.order) {
        const c = rp.cells[p]?.[r];
        if (!c || c.past) continue;
        if (c.post && !c.act) { actions.push({ street, text: `${name(p)} posts ${c.amount}` }); continue; }
        if (!c.act) continue;
        const a = c.act;
        const text = a.k === 'fold' ? 'folds'
          : a.k === 'call' ? (c.toCall > 0 ? `calls ${c.toCall}` : 'checks')
          : a.k === 'allin' ? `all-in${a.to ? ` ${a.to}` : ''}`
          : c.high > 0 ? `raises to ${a.to ?? c.amount}` : `bets ${a.to ?? c.amount}`;
        actions.push({ street, text: `${name(p)} ${text}` });
      }
    }
    if (hand.tab === street && rp.next) toAct = name(rp.next.p);
  }
  return {
    v: 1, n: hand.n, stage: STAGE[hand.tab] ?? hand.tab,
    board: hand.board.filter(Boolean) as Card[],
    pot: potTotal(g, hand.log, hand.log.button),
    toAct: hand.ended ? null : toAct,
    actions, ended: hand.ended, stacks: stackLines(g, name), updatedAt: at,
  };
}
