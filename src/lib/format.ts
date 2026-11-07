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

/** Time from the close of hand 1 to the close of the last hand. Null until hand 1 closes. */
export function playMs(g: Pick<Game, 'hands'>): number | null {
  const closes = g.hands.filter((h) => !h.missed).map((h) => h.endedAt ?? h.at);
  return closes.length ? Math.max(...closes) - Math.min(...closes) : null;
}

export function gameLength(g: Pick<Game, 'hands'>): string {
  const ms = playMs(g);
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

export function ago(t: number, now = Date.now()): string {
  const m = Math.floor((now - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function stakesLabel(g: Game): string {
  if (g.type === 'tournament') return `${money(g.tournament?.buyIn ?? 0, g.currency)} tournament`;
  return `${g.sb}/${g.bb} cash, multiplier ${money(g.unitValue, g.currency)}`;
}

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
