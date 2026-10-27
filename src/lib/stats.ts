import type { Game, GameType, ID } from '../types';
import { handStats, playerResult, round2 } from './calc';
import { finalists, inAtEnd, pfr, vpip } from './hand';

export type TypeFilter = 'all' | GameType;
/** all, FYTD (financial year from 1 July), CYTD (from 1 January), L90D, L30D. */
export type RangeFilter = 'all' | 'fy' | 'cy' | '90d' | '30d';

/** Start of the financial year (July to June) that contains t. */
export function fyStart(t: number): number {
  const d = new Date(t);
  const y = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
  return new Date(y, 6, 1).getTime();
}

export function filterGames(games: Game[], type: TypeFilter, range: RangeFilter, now = Date.now()): Game[] {
  const since =
    range === 'all' ? 0
    : range === 'fy' ? fyStart(now)
    : range === 'cy' ? new Date(new Date(now).getFullYear(), 0, 1).getTime()
    : now - (range === '90d' ? 90 : 30) * 86400000;
  return games
    .filter((g) => g.status === 'closed' && (type === 'all' || g.type === type) && g.startedAt >= since)
    .sort((a, b) => a.startedAt - b.startedAt);
}

export interface PlayerSummary {
  playerId: ID;
  games: number;
  net: number;
  wins: number;
  winRate: number;
  biggestWin: number;
  biggestLoss: number;
  avg: number;
  /** Positive = winning streak length, negative = losing streak length. */
  streak: number;
  buyIns: number;
  handsWon: number;
  biggestPot: number;
  /** Per-game net in chronological order. */
  history: { gameId: ID; t: number; net: number }[];
  /** Hands logged street by street that this player was dealt into (the base for the rates below). */
  logged: number;
  vpip: number;
  pfr: number;
  sawFlop: number;
  /** Went to showdown (counted among hands where they saw the flop). */
  wtsd: number;
  /** Won all or part of a showdown. */
  wsd: number;
}

export function playerSummary(games: Game[], pid: ID): PlayerSummary {
  const s: PlayerSummary = {
    playerId: pid, games: 0, net: 0, wins: 0, winRate: 0, biggestWin: 0, biggestLoss: 0,
    avg: 0, streak: 0, buyIns: 0, handsWon: 0, biggestPot: 0, history: [],
    logged: 0, vpip: 0, pfr: 0, sawFlop: 0, wtsd: 0, wsd: 0,
  };
  for (const g of games) {
    if (!g.playerIds.includes(pid)) continue;
    const r = playerResult(g, pid);
    s.games++;
    s.net = round2(s.net + r.net);
    if (r.net > 0) s.wins++;
    s.biggestWin = Math.max(s.biggestWin, r.net);
    s.biggestLoss = Math.min(s.biggestLoss, r.net);
    s.buyIns += r.buyIns;
    s.history.push({ gameId: g.id, t: g.startedAt, net: r.net });
    for (const h of g.hands) {
      const L = h.log;
      if (L?.dealt.includes(pid)) {
        s.logged++;
        if (vpip(g, L, pid, L.button)) s.vpip++;
        if (pfr(L, pid)) s.pfr++;
        if (L.streets.flop && inAtEnd(L, 'preflop').includes(pid)) s.sawFlop++;
        const fin = finalists(L);
        if (fin.length > 1 && fin.includes(pid)) {
          s.wtsd++;
          if (h.winners.some((x) => x.playerId === pid)) s.wsd++;
        }
      }
      const w = h.winners.find((x) => x.playerId === pid);
      if (w) {
        s.handsWon++;
        s.biggestPot = Math.max(s.biggestPot, h.pot);
      }
    }
  }
  s.winRate = s.games ? s.wins / s.games : 0;
  s.avg = s.games ? round2(s.net / s.games) : 0;
  // streak counted back from the latest game; a 0 result breaks the streak
  for (let i = s.history.length - 1; i >= 0; i--) {
    const n = s.history[i].net;
    if (n > 0 && s.streak >= 0) s.streak++;
    else if (n < 0 && s.streak <= 0) s.streak--;
    else break;
  }
  return s;
}

export function leaderboard(games: Game[], playerIds: ID[]): PlayerSummary[] {
  return playerIds
    .map((p) => playerSummary(games, p))
    .filter((s) => s.games > 0)
    .sort((a, b) => b.net - a.net);
}

/** Cumulative net per player at each game in the list. */
export function cumulativeSeries(games: Game[], playerIds: ID[]) {
  const totals: Record<ID, number> = Object.fromEntries(playerIds.map((p) => [p, 0]));
  const points = games.map((g) => {
    for (const p of playerIds) if (g.playerIds.includes(p)) totals[p] = round2(totals[p] + playerResult(g, p).net);
    return { t: g.startedAt, gameId: g.id, values: { ...totals } };
  });
  return points;
}

export function groupTotals(games: Game[]) {
  let hands = 0, biggestPot = 0, moneyMoved = 0;
  for (const g of games) {
    const hs = handStats(g);
    hands += hs.hands;
    biggestPot = Math.max(biggestPot, hs.biggest?.pot ?? 0);
    for (const p of g.playerIds) {
      const r = playerResult(g, p);
      if (r.net > 0) moneyMoved += r.net;
    }
  }
  return { games: games.length, hands, biggestPot, moneyMoved: round2(moneyMoved) };
}

/** Median seconds per hand, for hands logged with start and end times. */
export function handPace(games: Game[]): { hands: number; medianSec: number } {
  const secs = games.flatMap((g) => g.hands).filter((h) => h.endedAt && h.log).map((h) => (h.endedAt! - h.at) / 1000).sort((a, b) => a - b);
  if (!secs.length) return { hands: 0, medianSec: 0 };
  const m = secs.length % 2 ? secs[(secs.length - 1) / 2] : (secs[secs.length / 2 - 1] + secs[secs.length / 2]) / 2;
  return { hands: secs.length, medianSec: Math.round(m) };
}
