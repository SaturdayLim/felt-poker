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
/** One action. `who` is "BB (Nic)". `amount` is the player's street total after the action. */
export interface LogAct {
  who: string; k: ActKind; amount: number; dark?: boolean;
  /** The all-in was logged at the low end of a range stack: the amount is an estimate. */
  est?: boolean;
  /** With k "call": the caller is all-in for less than the bet. */
  allin?: boolean;
}

const list = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** One street as written lines. One sentence per line, in time order. Folds are written once, after the last other
    action. `left` is how many players are still in at the end of the street: one left after a bet or raise is a takedown. */
export function streetLines(acts: LogAct[], left: number): string[] {
  const folds = acts.filter((a) => a.k === 'fold');
  const rest = acts.filter((a) => a.k !== 'fold');
  const lines: string[] = [];
  for (let i = 0; i < rest.length;) {
    const a = rest[i];
    const dark = a.dark ? ' in the dark' : '';
    const about = a.est ? 'about ' : '';
    if (a.k === 'call' && a.allin) {
      // a call for less is never merged with other calls
      lines.push(`${a.who} calls all-in for ${about}${a.amount}${dark}.`);
      i++;
      continue;
    }
    if (a.k === 'check' || a.k === 'call') {
      let j = i;
      while (j < rest.length && rest[j].k === a.k && !rest[j].allin && !!rest[j].dark === !!a.dark) j++;
      const grp = rest.slice(i, j);
      if (grp.length === 1) lines.push(`${a.who} ${a.k === 'check' ? 'checks' : 'calls'}${dark}.`);
      else lines.push(`${a.k === 'check' ? 'Checks' : 'Calls'} from ${list(grp.map((x) => x.who))}${dark}.`);
      i = j;
      continue;
    }
    const verb = a.k === 'bet' ? `bets ${a.amount}` : a.k === 'raise' ? `raises to ${a.amount}` : a.k === 'straddle' ? `straddles to ${a.amount}` : `is all-in for ${about}${a.amount}`;
    const last = i === rest.length - 1;
    lines.push(`${a.who} ${verb}${dark}${last && left === 1 ? ' for a takedown' : ''}.`);
    i++;
  }
  const takedown = rest.length > 0 && left === 1 && rest[rest.length - 1].k !== 'check' && rest[rest.length - 1].k !== 'call';
  if (folds.length && !takedown) lines.push(folds.length === 1 ? `${folds[0].who} folds.` : `Folds from ${list(folds.map((f) => f.who))}.`);
  return lines;
}
