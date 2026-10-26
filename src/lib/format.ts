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

export function dateLabel(t: number): string {
  return new Date(t).toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export function shortDate(t: number): string {
  return new Date(t).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' });
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
  return `${g.sb}/${g.bb} cash · ${money(g.unitValue, g.currency)} a unit`;
}

export function initials(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || '?';
}

/** Colour class for a result: up, down, or neutral at break-even. */
export function tone(n: number): string {
  return n > 0.004 ? 'up' : n < -0.004 ? 'down' : '';
}
