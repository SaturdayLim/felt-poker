import type { Game } from '../types';

export function money(n: number, currency: string, opts: { sign?: boolean } = {}): string {
  const abs = Math.abs(n);
  const s = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = n < -0.004 ? '-' : opts.sign && n > 0.004 ? '+' : '';
  return `${sign}${currency}${s}`;
}

export function units(n: number, opts: { sign?: boolean } = {}): string {
  const sign = n < 0 ? '-' : opts.sign && n > 0 ? '+' : '';
  return sign + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/** One result in both measures. `chips` null: no chip figure (tournaments), so money always shows. */
export interface Figure { money: number; chips: number | null; currency: string }

/** True when this figure shows in money: the setting is on, or it has no chip figure. */
export function showsMoney(f: Figure, showMoney: boolean | undefined): boolean {
  return !!showMoney || f.chips === null;
}

/** Chips text, for example "+14 chips" or "9 chips". */
export function chipsText(n: number, opts: { sign?: boolean } = {}): string {
  return `${units(n, opts)} chips`;
}

/** A result as text with its unit: "+14 chips" by default, "+S$1.40" with Show money on. */
export function figureText(f: Figure, showMoney: boolean | undefined, opts: { sign?: boolean } = {}): string {
  return showsMoney(f, showMoney) ? money(f.money, f.currency, opts) : chipsText(f.chips ?? 0, opts);
}

/** A result as a bare number, for tiles whose caption names the unit: "+14" or "+1.40". */
export function figureNumber(f: Figure, showMoney: boolean | undefined, opts: { sign?: boolean } = {}): string {
  return showsMoney(f, showMoney) ? money(f.money, '', opts) : units(f.chips ?? 0, opts);
}

/** The unit a figure shows in, for captions: the currency, or "chips". */
export function figureUnit(f: Figure, showMoney: boolean | undefined): string {
  return showsMoney(f, showMoney) ? f.currency : 'chips';
}

/** Props for a Delta: the value and a formatter in the same measure. */
export function figureDelta(f: Figure, showMoney: boolean | undefined): { value: number; format: (abs: number) => string } {
  const m = showsMoney(f, showMoney);
  return { value: m ? f.money : f.chips ?? 0, format: (a) => (m ? money(a, f.currency) : chipsText(a)) };
}

/** Units expressed in big blinds. */
export function inBB(g: Pick<Game, 'bb'>, n: number): string {
  const v = n / g.bb;
  return `${Number.isInteger(v) ? v : v.toFixed(1)} BB`;
}

export function duration(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(m / 60);
  return h ? `${h}h ${m % 60}m` : `${m}m`;
}

type Clock = Pick<Game, 'hands'> &
  Partial<Pick<Game, 'buyIns' | 'status' | 'endedAt' | 'cashOuts' | 'statusEvents' | 'moves' | 'pauses'>>;

/** Game time, the one clock (also for hands per hour). It starts at the first buy-in (the close of hand 1 when a game
    has no buy-in). A live game runs to now. A closed game stops at its last recorded event (a hand close, buy-in,
    cash-out, status change or chip move), never later than the close, so a Close game press next morning adds nothing.
    A closed game with no events and no end time stops at its start. Null until something gives it a start. */
export function runningMs(g: Clock, now = Date.now()): number | null {
  const closes = g.hands.filter((h) => !h.missed).map((h) => h.endedAt ?? h.at);
  const buys = (g.buyIns ?? []).map((b) => b.at);
  const starts = buys.length ? buys : closes;
  if (!starts.length) return null;
  const start = Math.min(...starts);
  const closed = g.status === 'closed' || (g.status === undefined && g.endedAt !== undefined);
  // time the game sat closed before a reopen does not count
  const paused = (end: number) => (g.pauses ?? []).reduce((a, p) => a + Math.max(0, Math.min(p.to, end) - Math.max(p.from, start)), 0);
  if (!closed) return Math.max(0, now - start - paused(now));
  // an event at the close press is the close itself (Close game writes an 'out' for each player then)
  const before = (t: number) => g.endedAt === undefined || t < g.endedAt;
  const events = [
    ...closes,
    ...buys,
    ...(g.cashOuts ?? []).map((c) => c.at),
    ...(g.statusEvents ?? []).map((e) => e.at),
    ...(g.moves ?? []).map((m) => m.at),
  ].filter(before);
  const end = Math.max(start, ...events);
  return Math.max(0, end - start - paused(end));
}

/** Text for the game time: "-" until it has a start. */
export function runningLabel(g: Clock, now = Date.now()): string {
  const ms = runningMs(g, now);
  return ms === null ? '-' : duration(ms);
}

/** Full date, as in source lines: 13 Oct 2026. */
export function dateLabel(t: number): string {
  return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function shortDate(t: number): string {
  return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function timeLabel(t: number): string {
  return new Date(t).toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit' });
}

/** A share as text: "40%", or "-" when there is nothing to share. */
export const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '-');
/** A share as a 0 to 1 bar length, or undefined when there is nothing to share. */
export const share = (a: number, b: number) => (b ? a / b : undefined);
/** One decimal at most, never a trailing ".0": 5 stays 5, 4.25 becomes 4.3. */
export const oneDecimal = (n: number) => String(Math.round(n * 10) / 10);
/** Date for a file name, for example 2026-11-09 (local time). */
export const fileDate = (t: number = Date.now()) => new Date(t).toLocaleDateString('en-CA');
/** "1 game", "2 games". */
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function initials(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || '?';
}

/** Colour class for a result: up, down, or neutral at break-even. */
export function tone(n: number): string {
  return n > 0.004 ? 'up' : n < -0.004 ? 'down' : '';
}

/** Units bought so far, counted in default buy-ins (e.g. 9 or 9.5). Used while a game is live. */
export function buyInsEquivalent(g: Game, totalUnits: number): string {
  if (!g.defaultBuyIn) return '0';
  const v = totalUnits / g.defaultBuyIn;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/** The caption of a closed game: "9 Nov'26 - Churchies (7pax, 10 buy-in)". The group is left out when there is none. */
export function gameCaption(g: Game, group?: string): string {
  const d = new Date(g.startedAt);
  const date = `${d.getDate()} ${d.toLocaleDateString('en-GB', { month: 'short' })}'${String(d.getFullYear()).slice(2)}`;
  const n = g.type === 'cash' ? Number(buyInsEquivalent(g, g.buyIns.reduce((a, b) => a + b.amount, 0))) : g.buyIns.length;
  const tail = `${g.playerIds.length}pax${g.type === 'cash' ? `, ${n} buy-in` : ''}`;
  return group ? `${date} - ${group} (${tail})` : `${date} (${tail})`;
}
