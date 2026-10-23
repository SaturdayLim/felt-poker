import type { Game, GameType, ID } from '../types';
import { handStats, playerResult, round2 } from './calc';

export type TypeFilter = 'all' | GameType;
export type RangeFilter = 'all' | 'year' | '90d' | '30d';

export function filterGames(games: Game[], type: TypeFilter, range: RangeFilter, now = Date.now()): Game[] {
  const since =
    range === 'all' ? 0
    : range === 'year' ? new Date(new Date(now).getFullYear(), 0, 1).getTime()
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
}

export function playerSummary(games: Game[], pid: ID): PlayerSummary {
  const s: PlayerSummary = {
    playerId: pid, games: 0, net: 0, wins: 0, winRate: 0, biggestWin: 0, biggestLoss: 0,
    avg: 0, streak: 0, buyIns: 0, handsWon: 0, biggestPot: 0, history: [],
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
