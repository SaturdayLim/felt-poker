import type { Game, ID } from '../types';
import { handStats, playerResult, timePlayed } from '../lib/calc';
import { bestHand } from '../lib/cards';
import { STREETS, bountyPay, bountyTotal, inAtEnd, pfr, potTotal, vpip } from '../lib/hand';

type NameFn = (id: ID) => string;

const pad = (n: number) => String(n).padStart(2, '0');
/** Local date-time, e.g. 2026-10-23 21:05:09 — easier to read than UTC ISO in a spreadsheet. */
const iso = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
const day = (t: number) => new Date(t).toLocaleDateString('en-CA');

function cell(v: unknown): string {
  if (v === undefined || v === null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(header: string[], rows: unknown[][]): string {
  // BOM so Excel opens UTF-8 (card suits, currency symbols) correctly
  return '﻿' + [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

export function playersCsv(games: Game[], name: NameFn): string {
  const rows: unknown[][] = [];
  for (const g of games) {
    const hs = handStats(g);
    for (const p of g.playerIds) {
      const r = playerResult(g, p);
      rows.push([
        g.id, g.name, day(g.startedAt), g.type, g.currency, g.unitValue, name(p), g.seats[p] ?? '',
        r.buyIns, r.inUnits, r.outUnits, r.in, r.out, r.net, r.expenses, r.balance, r.place ?? '',
        Math.round(timePlayed(g, p) / 60000), hs.handsWon[p] ?? 0, hs.potsWon[p] ?? 0,
      ]);
    }
  }
  return toCsv([
    'game_id', 'game', 'date', 'type', 'currency', 'unit_value', 'player', 'seat',
    'buy_ins', 'buy_in_chips', 'cash_out_chips', 'money_in', 'money_out', 'net', 'expenses', 'balance', 'place',
    'minutes_played', 'hands_won', 'units_won_in_pots',
  ], rows);
}

export function handsCsv(games: Game[], name: NameFn): string {
  const rows: unknown[][] = [];
  for (const g of games) {
    for (const h of g.hands) {
      const board = h.boardNA ? 'NA' : h.board.join(' ');
      const shown = h.shown.map((s) => `${name(s.playerId)}:${s.cards.join('')}`).join('; ');
      const ranks = h.shown.map((s) => {
        const v = !h.boardNA && h.board.length === 5 && s.cards.length === 2 ? bestHand([...s.cards, ...h.board]) : null;
        return v ? `${name(s.playerId)}:${v.name}` : '';
      }).filter(Boolean).join('; ');
      rows.push([
        g.id, g.name, day(g.startedAt), h.n, iso(h.at), h.dealerId ? name(h.dealerId) : '',
        h.pot, g.type === 'cash' ? +(h.pot * g.unitValue).toFixed(2) : '',
        h.winners.map((w) => name(w.playerId)).join('; '), h.winners.map((w) => `${name(w.playerId)}:${w.amount}`).join('; '),
        h.winners.length > 1 ? 1 : 0, board,
        h.boardNA ? 'NA' : h.board.slice(0, 3).join(' '), h.boardNA ? 'NA' : h.board[3] ?? '', h.boardNA ? 'NA' : h.board[4] ?? '',
        shown, ranks, h.allIn ? 1 : 0, h.straddle ? 1 : 0, h.tags.join('; '), h.note ?? '',
        (h.pots ?? []).map((p, i) => `${i ? `side${i}` : 'main'}:${p.amount}:${p.winners.map((w) => `${name(w.playerId)}=${w.amount}`).join('+')}`).join('; '),
        h.log?.mode ?? '',
        h.log ? h.log.dealt.filter((p) => vpip(g, h.log!, p, h.log!.button)).map(name).join('; ') : '',
        h.log ? h.log.dealt.filter((p) => pfr(h.log!, p)).map(name).join('; ') : '',
        h.log ? STREETS.filter((st) => h.log!.streets[st]).map((st) => `${st}:${potTotal(g, h.log!, h.log!.button, st)}`).join('; ') : '',
        h.log ? STREETS.filter((st) => h.log!.streets[st]).map((st) => `${st}:${inAtEnd(h.log!, st).map(name).join('/')}`).join('; ') : '',
        h.log?.runs ?? '',
        Object.entries(h.returned ?? {}).map(([p, a]) => `${name(p)}:${a}`).join('; '),
        h.endedAt ? Math.round((h.endedAt - h.at) / 1000) : '',
        h.bounty ? `${name(h.bounty.playerId)}:${bountyTotal(h.bounty)}` : '',
        h.bounty ? h.bounty.payers.map((p) => `${name(p)}:${bountyPay(h.bounty!, p)}`).join('; ') : '',
      ]);
    }
  }
  return toCsv([
    'game_id', 'game', 'date', 'hand', 'time', 'button', 'pot_chips', 'pot_money', 'winners', 'winner_amounts',
    'split', 'board', 'flop', 'turn', 'river', 'shown_cards', 'shown_hand_ranks', 'all_in', 'straddle', 'tags', 'note', 'pots',
    'entry_mode', 'vpip_players', 'pfr_players', 'pot_by_street', 'in_by_street', 'runs', 'returned', 'seconds', 'bounty_27', 'bounty_27_paid_by',
  ], rows);
}

export function ledgerCsv(games: Game[], name: NameFn): string {
  const rows: unknown[][] = [];
  for (const g of games) {
    const unitMoney = (u: number) => (g.type === 'cash' ? +(u * g.unitValue).toFixed(2) : u);
    for (const b of g.buyIns) rows.push([g.id, g.name, iso(b.at), g.type === 'cash' ? 'buy_in' : 'entry', name(b.playerId), '', g.type === 'cash' ? b.amount : '', unitMoney(b.amount), '']);
    for (const c of g.cashOuts) rows.push([g.id, g.name, iso(c.at), 'cash_out', name(c.playerId), '', c.amount, unitMoney(c.amount), '']);
    for (const e of g.statusEvents) rows.push([g.id, g.name, iso(e.at), `status_${e.status}`, name(e.playerId), '', '', '', '']);
    for (const e of g.expenses) rows.push([g.id, g.name, iso(g.endedAt ?? g.startedAt), 'expense', e.paidBy ? name(e.paidBy) : '', '', '', e.amount, `${e.label} (split ${e.splitAmong.map(name).join('/')})`]);
    for (const t of g.transfers) rows.push([g.id, g.name, iso(t.resolvedAt ?? g.endedAt ?? g.startedAt), t.resolved ? 'transfer_paid' : 'transfer_open', name(t.from), name(t.to), '', t.amount, '']);
  }
  rows.sort((a, b) => String(a[2]).localeCompare(String(b[2])));
  return toCsv(['game_id', 'game', 'time', 'event', 'player', 'to_player', 'chips', 'money', 'detail'], rows);
}

export function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'game';
}
