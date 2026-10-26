import type { Game, ID, PlayerStatus, Transfer } from '../types';
import { uid } from './ids';
import { bestHand } from './cards';

export const round2 = (n: number) => Math.round(n * 100) / 100;

export function playerStatus(g: Game, pid: ID): PlayerStatus {
  let s: PlayerStatus = 'out';
  for (const e of g.statusEvents) if (e.playerId === pid) s = e.status;
  return s;
}

/** Milliseconds a player spent playing. Time away from the table (amber) does not count. */
export function timePlayed(g: Game, pid: ID, now = Date.now()): number {
  let total = 0;
  let since: number | null = null;
  for (const e of g.statusEvents) {
    if (e.playerId !== pid) continue;
    if (e.status === 'playing') {
      if (since === null) since = e.at;
    } else if (since !== null) {
      total += e.at - since;
      since = null;
    }
  }
  if (since !== null) total += (g.endedAt ?? now) - since;
  return total;
}

/** Seats clockwise starting with the seat left of the button (small blind first).
    Without a button, seat 1 goes first. */
export function fromSmallBlind(g: Game, buttonId: ID | undefined, ids: ID[]): ID[] {
  const bySeat = [...g.playerIds].sort((a, b) => (g.seats[a] ?? 99) - (g.seats[b] ?? 99));
  const n = bySeat.length;
  const bi = buttonId ? bySeat.indexOf(buttonId) : -1;
  const dist = (p: ID) => {
    const i = bySeat.indexOf(p);
    return bi < 0 ? i : (i - bi - 1 + n) % n;
  };
  return [...ids].sort((a, b) => dist(a) - dist(b));
}

/** Even split rounded to the chip step (the small blind). Odd chips go one step at a time to the
    winners closest to the left of the button. 3 winners of 5 chips: SB 2, BB 2, Button 1. */
export function positionSplit(g: Game, pot: number, winners: ID[], buttonId?: ID): Record<ID, number> {
  const out: Record<ID, number> = {};
  if (!winners.length) return out;
  const step = g.sb > 0 ? g.sb : 1;
  const order = fromSmallBlind(g, buttonId, winners);
  const k = order.length;
  const base = Math.floor(pot / step / k) * step;
  let rest = round2(pot - base * k);
  for (const w of order) out[w] = base;
  for (const w of order) {
    if (rest < step - 1e-9) break;
    out[w] = round2(out[w] + step);
    rest = round2(rest - step);
  }
  if (rest > 0) out[order[0]] = round2(out[order[0]] + rest); // less than one step left over
  return out;
}

/** Build the main pot and side pots from what each player put in.
    Folded players add chips but cannot win. Pots with the same contenders are merged. */
export function buildPots(entries: { playerId: ID; putIn: number; folded: boolean }[]): { amount: number; eligible: ID[] }[] {
  const live = entries.filter((e) => !e.folded && e.putIn > 0);
  const levels = [...new Set(live.map((e) => e.putIn))].sort((a, b) => a - b);
  const pots: { amount: number; eligible: ID[] }[] = [];
  let prev = 0;
  levels.forEach((lvl, i) => {
    const top = i === levels.length - 1 ? Infinity : lvl;
    const amount = entries.reduce((a, e) => a + Math.max(0, Math.min(e.putIn, top) - prev), 0);
    const eligible = live.filter((e) => e.putIn >= lvl).map((e) => e.playerId);
    const last = pots[pots.length - 1];
    if (last && last.eligible.length === eligible.length && last.eligible.every((p) => eligible.includes(p))) last.amount = round2(last.amount + amount);
    else if (amount > 0) pots.push({ amount: round2(amount), eligible });
    prev = lvl;
  });
  return pots;
}

export const buyInUnits = (g: Game, pid: ID) =>
  g.buyIns.filter((b) => b.playerId === pid).reduce((a, b) => a + b.amount, 0);
export const buyInCount = (g: Game, pid: ID) => g.buyIns.filter((b) => b.playerId === pid).length;
export const cashOutUnits = (g: Game, pid: ID) =>
  g.cashOuts.filter((c) => c.playerId === pid).reduce((a, c) => a + c.amount, 0);
export const hasCashedOut = (g: Game, pid: ID) => g.cashOuts.some((c) => c.playerId === pid);

export const totalBuyInUnits = (g: Game) => g.buyIns.reduce((a, b) => a + b.amount, 0);
export const totalCashOutUnits = (g: Game) => g.cashOuts.reduce((a, c) => a + c.amount, 0);

/** Prize pool in money for tournaments, money in play for cash. */
export function totalPotMoney(g: Game): number {
  if (g.type === 'tournament') return round2(totalBuyInUnits(g));
  return round2(totalBuyInUnits(g) * g.unitValue);
}

/** Finishing place (1 = winner) or null if still alive and not decided. */
export function tournamentPlace(g: Game, pid: ID): number | null {
  const t = g.tournament;
  if (!t) return null;
  const n = g.playerIds.length;
  const idx = t.bustOrder.indexOf(pid);
  if (idx >= 0) return n - idx;
  const alive = g.playerIds.filter((p) => !t.bustOrder.includes(p));
  if (alive.length === 1 && alive[0] === pid) return 1;
  return null;
}

export interface PlayerResult {
  playerId: ID;
  /** Money put in (buy-ins / entries). */
  in: number;
  /** Money taken out (cash-out / payout). */
  out: number;
  /** Poker result in money, before expenses. */
  net: number;
  /** Expense effect: credit for paying minus own share. */
  expenses: number;
  /** Settlement balance = net + expenses. */
  balance: number;
  inUnits: number;
  outUnits: number;
  buyIns: number;
  place: number | null;
}

export function expenseEffect(g: Game, pid: ID): number {
  let e = 0;
  for (const x of g.expenses) {
    if (x.paidBy === pid) e += x.amount;
    if (x.splitAmong.length && x.splitAmong.includes(pid)) e -= x.amount / x.splitAmong.length;
  }
  return round2(e);
}

export function playerResult(g: Game, pid: ID): PlayerResult {
  const inUnits = buyInUnits(g, pid);
  let inM: number, outM: number, outUnits = 0;
  let place: number | null = null;
  if (g.type === 'tournament') {
    inM = inUnits;
    place = tournamentPlace(g, pid);
    outM = place ? g.tournament?.payouts[place - 1] ?? 0 : 0;
  } else {
    outUnits = cashOutUnits(g, pid);
    inM = inUnits * g.unitValue;
    outM = outUnits * g.unitValue;
  }
  const net = round2(outM - inM);
  const expenses = expenseEffect(g, pid);
  return {
    playerId: pid,
    in: round2(inM),
    out: round2(outM),
    net,
    expenses,
    balance: round2(net + expenses),
    inUnits,
    outUnits,
    buyIns: buyInCount(g, pid),
    place,
  };
}

/** Results sorted best to worst: by net for cash, by finishing place for tournaments. */
export function gameResults(g: Game): PlayerResult[] {
  const rows = g.playerIds.map((p) => playerResult(g, p));
  if (g.type === 'tournament') return rows.sort((a, b) => (a.place ?? 99) - (b.place ?? 99) || b.net - a.net);
  return rows.sort((a, b) => b.net - a.net);
}

/** Cash: chips counted minus chips bought. 0 = balanced. */
export function chipDiscrepancy(g: Game): number {
  return totalCashOutUnits(g) - totalBuyInUnits(g);
}

/** Tournament: payouts minus prize pool. 0 = balanced. */
export function payoutDiscrepancy(g: Game): number {
  const paid = (g.tournament?.payouts ?? []).slice(0, g.playerIds.length).reduce((a, b) => a + b, 0);
  return round2(paid - totalPotMoney(g));
}

/** Greedy minimum-transfer settlement from balances. */
export function suggestTransfers(balances: { playerId: ID; balance: number }[]): Omit<Transfer, 'id' | 'resolved'>[] {
  const debt = balances.filter((b) => b.balance < -0.004).map((b) => ({ id: b.playerId, amt: -b.balance }));
  const cred = balances.filter((b) => b.balance > 0.004).map((b) => ({ id: b.playerId, amt: b.balance }));
  const out: Omit<Transfer, 'id' | 'resolved'>[] = [];
  while (debt.length && cred.length) {
    debt.sort((a, b) => b.amt - a.amt);
    cred.sort((a, b) => b.amt - a.amt);
    const d = debt[0], c = cred[0];
    const amt = round2(Math.min(d.amt, c.amt));
    if (amt > 0) out.push({ from: d.id, to: c.id, amount: amt });
    d.amt = round2(d.amt - amt);
    c.amt = round2(c.amt - amt);
    if (d.amt <= 0.004) debt.shift();
    if (c.amt <= 0.004) cred.shift();
  }
  return out;
}

/** Rebuild transfers, keeping resolved state for identical transfers. */
export function rebuildTransfers(g: Game): Transfer[] {
  const fresh = suggestTransfers(gameResults(g));
  const prev = [...g.transfers];
  return fresh.map((t) => {
    const i = prev.findIndex((p) => p.from === t.from && p.to === t.to && Math.abs(p.amount - t.amount) < 0.005);
    if (i >= 0) {
      const keep = prev.splice(i, 1)[0];
      return { ...keep };
    }
    return { ...t, id: uid(), resolved: false };
  });
}

export function openTransfers(g: Game) {
  return g.transfers.filter((t) => !t.resolved);
}

/* ------------------------------ hand stats ------------------------------ */

export interface GameHandStats {
  hands: number;
  totalPot: number;
  avgPot: number;
  biggest?: { handId: ID; n: number; pot: number; winners: ID[] };
  allIns: number;
  showdowns: number;
  handsWon: Record<ID, number>;
  potsWon: Record<ID, number>;
  bestShown?: { handId: ID; n: number; playerId: ID; name: string; score: number; cards: string[] };
  tagCounts: Record<string, number>;
  categoryCounts: Record<string, number>;
}

export function handStats(g: Game): GameHandStats {
  const s: GameHandStats = {
    hands: g.hands.length,
    totalPot: 0,
    avgPot: 0,
    allIns: 0,
    showdowns: 0,
    handsWon: {},
    potsWon: {},
    tagCounts: {},
    categoryCounts: {},
  };
  for (const h of g.hands) {
    s.totalPot += h.pot;
    if (!s.biggest || h.pot > s.biggest.pot)
      s.biggest = { handId: h.id, n: h.n, pot: h.pot, winners: h.winners.map((w) => w.playerId) };
    if (h.allIn) s.allIns++;
    if (h.shown.length) s.showdowns++;
    for (const w of h.winners) {
      s.handsWon[w.playerId] = (s.handsWon[w.playerId] ?? 0) + 1;
      s.potsWon[w.playerId] = (s.potsWon[w.playerId] ?? 0) + w.amount;
    }
    for (const t of h.tags) s.tagCounts[t] = (s.tagCounts[t] ?? 0) + 1;
    if (!h.boardNA && h.board.length === 5) {
      for (const sh of h.shown) {
        if (sh.cards.length !== 2) continue;
        const v = bestHand([...sh.cards, ...h.board]);
        if (!v) continue;
        if (h.winners.some((w) => w.playerId === sh.playerId))
          s.categoryCounts[v.name] = (s.categoryCounts[v.name] ?? 0) + 1;
        if (!s.bestShown || v.score > s.bestShown.score)
          s.bestShown = { handId: h.id, n: h.n, playerId: sh.playerId, name: v.name, score: v.score, cards: sh.cards };
      }
    }
  }
  s.avgPot = s.hands ? s.totalPot / s.hands : 0;
  return s;
}

/** Cumulative units bought in over time, for the live chart. */
export function buyInTimeline(g: Game): { t: number; v: number }[] {
  const pts = [{ t: g.startedAt, v: 0 }];
  let v = 0;
  for (const b of [...g.buyIns].sort((a, b) => a.at - b.at)) {
    v += b.amount;
    pts.push({ t: b.at, v });
  }
  return pts;
}

/** Suggested payout split by field size. */
export function defaultPayoutPercents(entrants: number): number[] {
  if (entrants <= 4) return [100];
  if (entrants <= 7) return [65, 35];
  if (entrants <= 10) return [50, 30, 20];
  return [45, 27, 18, 10];
}
