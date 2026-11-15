/* The event ledger of one game: every event off the felt (buy-ins, rebuys, cash-outs, counts, chip moves, 7-2 bounties,
   missed hands, expenses, transfers, status changes), in time order. Each event gets a reference (E1, E2 ...) and the hand
   it came after, so a report, a CSV row or a message can point to one event. The report and the CSV use this one list. */
import type { Game, ID } from '../types';
import { bountyPay } from '../lib/hand';

export interface LedgerRow {
  /** E1, E2 ... in time order. */
  ref: string;
  at: number;
  /** The last hand finished before the event (0 = before the first hand). */
  afterN: number;
  /** CSV word, for example buy_in or chip_move_tip. */
  code: string;
  /** Words for the report, for example Buy-in or Chip move (tip). */
  label: string;
  who: string;
  to: string;
  /** Chips, or null where the event has no chips (status, expense, transfer). */
  chips: number | null;
  /** Money at the game multiplier (expense and transfer amounts are money already). */
  money: number | null;
  detail: string;
}

const MOVE_WORD: Record<string, string> = { side: 'side game', tip: 'tip', other: 'other' };
const STATUS_WORD: Record<string, string> = { playing: 'back in', away: 'away', out: 'out' };

export function gameLedger(g: Game, name: (id: ID) => string): LedgerRow[] {
  const money = (u: number) => (g.type === 'cash' ? +(u * g.unitValue).toFixed(2) : u);
  const ends = g.hands.map((h) => ({ n: h.n, t: h.endedAt ?? h.at })).sort((a, b) => a.t - b.t);
  const after = (t: number) => { let n = 0; for (const e of ends) if (e.t <= t) n = Math.max(n, e.n); return n; };
  const rows: Omit<LedgerRow, 'ref'>[] = [];
  const add = (r: Omit<LedgerRow, 'ref' | 'afterN'> & { afterN?: number }) => rows.push({ ...r, afterN: r.afterN ?? after(r.at) });
  const seen = new Set<ID>();
  for (const b of [...g.buyIns].sort((x, y) => x.at - y.at)) {
    const again = seen.has(b.playerId);
    seen.add(b.playerId);
    add({ at: b.at, code: g.type === 'cash' ? 'buy_in' : 'entry', label: g.type === 'cash' ? (again ? 'Rebuy' : 'Buy-in') : 'Entry', who: name(b.playerId), to: '', chips: g.type === 'cash' ? b.amount : null, money: money(b.amount), detail: '' });
  }
  for (const c of g.cashOuts) add({ at: c.at, code: 'cash_out', label: 'Cash-out', who: name(c.playerId), to: '', chips: c.amount, money: money(c.amount), detail: '' });
  for (const e of g.statusEvents) add({ at: e.at, code: `status_${e.status}`, label: `Status: ${STATUS_WORD[e.status] ?? e.status}`, who: name(e.playerId), to: '', chips: null, money: null, detail: '' });
  for (const e of g.expenses) add({ at: g.endedAt ?? g.startedAt, code: 'expense', label: 'Expense', who: e.paidBy ? name(e.paidBy) : '', to: '', chips: null, money: e.amount, detail: `${e.label} (split ${e.splitAmong.map(name).join('/')})` });
  for (const t of g.transfers) add({ at: t.resolvedAt ?? g.endedAt ?? g.startedAt, code: t.resolved ? 'transfer_paid' : 'transfer_open', label: t.resolved ? 'Transfer paid' : 'Transfer open', who: name(t.from), to: name(t.to), chips: null, money: t.amount, detail: '' });
  for (const m of g.moves ?? []) add({ at: m.at, afterN: m.afterN, code: `chip_move_${m.kind}`, label: `Chip move (${MOVE_WORD[m.kind] ?? m.kind})`, who: name(m.from), to: m.to ? name(m.to) : 'off the table', chips: m.amount, money: money(m.amount), detail: m.note ?? '' });
  for (const c of g.counts ?? []) add({ at: c.at, code: 'stack_count', label: 'Count', who: name(c.playerId), to: '', chips: c.chips, money: money(c.chips), detail: '' });
  for (const h of g.hands) {
    const t = h.endedAt ?? h.at;
    if (h.missed) add({ at: t, afterN: h.n, code: 'missed_hand', label: 'Missed hand', who: '', to: '', chips: null, money: null, detail: `hand ${h.n}` });
    if (h.bounty) for (const p of h.bounty.payers) add({ at: t, afterN: h.n, code: 'bounty_27', label: '7-2 bounty', who: name(p), to: name(h.bounty.playerId), chips: bountyPay(h.bounty, p), money: money(bountyPay(h.bounty, p)), detail: `hand ${h.n}` });
  }
  rows.sort((a, b) => a.at - b.at || a.afterN - b.afterN);
  return rows.map((r, i) => ({ ref: `E${i + 1}`, ...r }));
}
