/* Position names and the written action log. Pure functions, no React.
   Position names (owner, 12 Nov 2026): BTN, SB, BB, UTG, UTG+1, MP, LJ, HJ, CO. For fewer players the names go in
   this order: UTG+1, MP, LJ, HJ, CO. */

/** Names between the big blind and the button, in action order, for the largest table (9 players). */
const MIDDLE = ['UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO'];
const CUT_ORDER = ['UTG+1', 'MP', 'LJ', 'HJ', 'CO'];

/** Position names for `n` players, in time order: SB first, the button last.
    Heads-up the button posts the small blind, so the order is BTN, BB.
    For 10 or more players the extra seats are UTG+2, UTG+3 and so on, after UTG+1. */
export function positionsFor(n: number): string[] {
  if (n <= 1) return ['BTN'];
  if (n === 2) return ['BTN', 'BB'];
  const k = n - 3;
  let mid: string[];
  if (k === 0) mid = [];
  else if (k > MIDDLE.length) {
    const extra = k - (MIDDLE.length - 1); // UTG+1 up to UTG+extra
    mid = ['UTG', ...Array.from({ length: extra }, (_, i) => `UTG+${i + 1}`), 'MP', 'LJ', 'HJ', 'CO'];
  } else {
    const cut = CUT_ORDER.slice(0, MIDDLE.length - k);
    mid = MIDDLE.filter((x) => !cut.includes(x));
  }
  return ['SB', 'BB', ...mid, 'BTN'];
}

/** The position of each player. `order` runs in time order (small blind first, button last; heads-up button first).
    A button that is not dealt in is a virtual last seat, so the last player in the order is the cutoff. */
export function positionMap(order: string[], button?: string): Record<string, string> {
  const out: Record<string, string> = {};
  const n = order.length;
  if (n === 2 && button && order.includes(button)) {
    for (const p of order) out[p] = p === button ? 'BTN' : 'BB';
    return out;
  }
  const btnIn = !button || order.includes(button) || n < 2;
  const names = btnIn ? positionsFor(n) : positionsFor(n + 1).slice(0, -1);
  order.forEach((p, i) => { out[p] = names[i] ?? 'MP'; });
  return out;
}

export type ActKind = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin' | 'straddle';
/** One action. `pid` is the player, `pos` the position ("BB"), `name` the player name, `c` the player colour index
    (see `LOG_COLORS`). `amount` is the player's street total after the action. */
export interface LogAct {
  pid: string; pos: string; name: string; c?: number; k: ActKind; amount: number; dark?: boolean;
  /** The all-in was logged at the low end of a range stack: the amount is an estimate. */
  est?: boolean;
  /** With k "call": the caller is all-in for less than the bet. */
  allin?: boolean;
}
/** A piece of a written line. `c` is set for a position or name: the colour index of that player. */
export interface LogSeg { t: string; c?: number }
export type LogLine = LogSeg[];
/** A line as plain text. */
export const lineText = (l: LogLine) => l.map((s) => s.t).join('');

/** Player colours for the action log, one per player for the whole game (index = place in the game player list, so
    it matches the chart colours of the same index). These are the chart hues in shades that read as text
    (contrast 4.5:1 or more) on the report backgrounds of the theme. */
export const LOG_COLORS: Record<'light' | 'dark', string[]> = {
  light: ['#1D5FB8', '#A83A08', '#12714D', '#7F5600', '#6B3FB5', '#B02A65', '#0E6E80', '#586470'],
  dark: ['#6AA6F2', '#F08A5A', '#4CC796', '#E4B040', '#B89AF2', '#F27FB0', '#4DCAE0', '#A9B5C2'],
};
export const logColor = (theme: 'light' | 'dark', c: number) => LOG_COLORS[theme][((c % 8) + 8) % 8];

/** One street as written lines. One sentence per line, in time order, position first: "HJ (Eve) and CO (Mike) check."
    Neighbouring checks, calls and folds share a line. `named` holds the players already named in this hand: a player
    is written "BB (Nic)" on the first line that names them and "BB" after that (the set is updated).
    `left` is how many players are still in at the end of the street. A bet or raise that leaves one player takes the
    pot: that line ends "for a takedown" and the folds after it are not written. */
export function streetLines(acts: LogAct[], left: number, named: Set<string> = new Set()): LogLine[] {
  let end = acts.length;
  let takedown = false;
  const lastAct = acts.map((a) => a.k).reduce((n, k, i) => (k === 'fold' ? n : i), -1);
  if (left === 1 && lastAct >= 0 && acts[lastAct].k !== 'check' && acts[lastAct].k !== 'call') { takedown = true; end = lastAct + 1; }
  const body = acts.slice(0, end);
  const who = (a: LogAct): LogSeg[] => {
    const first = !named.has(a.pid);
    named.add(a.pid);
    // a player with no seat position is written by name alone
    if (!a.pos) return [{ t: a.name, c: a.c }];
    return [{ t: first ? `${a.pos} (${a.name})` : a.pos, c: a.c }];
  };
  const join = (xs: LogSeg[][]): LogSeg[] => xs.flatMap((x, i) => (i === 0 ? x : [{ t: i === xs.length - 1 ? ' and ' : ', ' }, ...x]));
  const lines: LogLine[] = [];
  for (let i = 0; i < body.length;) {
    const a = body[i];
    const dark = a.dark ? ' in the dark' : '';
    const about = a.est ? 'about ' : '';
    if (a.k === 'call' && a.allin) {
      // a call for less is never merged with other calls
      lines.push([...who(a), { t: ` calls all-in for ${about}${a.amount}${dark}.` }]);
      i++;
      continue;
    }
    if (a.k === 'check' || a.k === 'call' || a.k === 'fold') {
      let j = i;
      while (j < body.length && body[j].k === a.k && !body[j].allin && !!body[j].dark === !!a.dark) j++;
      const grp = body.slice(i, j);
      const verb = grp.length === 1 ? { check: 'checks', call: 'calls', fold: 'folds' }[a.k] : a.k;
      lines.push([...join(grp.map(who)), { t: ` ${verb}${a.k === 'fold' ? '' : dark}.` }]);
      i = j;
      continue;
    }
    const verb = a.k === 'bet' ? `bets ${a.amount}` : a.k === 'raise' ? `raises to ${a.amount}` : a.k === 'straddle' ? `straddles to ${a.amount}` : `is all-in for ${about}${a.amount}`;
    lines.push([...who(a), { t: ` ${verb}${dark}${takedown && i === body.length - 1 ? ' for a takedown' : ''}.` }]);
    i++;
  }
  return lines;
}
