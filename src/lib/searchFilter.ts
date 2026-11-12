import type { Game, Player } from '../types';

/** The three things the shared search bar can look for (Players and Games use the same bar). */
export type SearchMode = 'person' | 'game' | 'date';

/** Lower case, quotes and runs of spaces folded, so "9 Nov'26" and "9 nov 26" match. */
export const norm = (t: string) => t.toLowerCase().replace(/[’']/g, ' ').replace(/\s+/g, ' ').trim();

/** The date as the list shows it (1 Nov 2026), in the ways a person types it: 9 Nov, Nov 2026, 2026. */
export function dateWords(at: number): string[] {
  const d = new Date(at);
  const day = d.getDate(), y = d.getFullYear();
  const mon = d.toLocaleDateString('en-GB', { month: 'short' }), long = d.toLocaleDateString('en-GB', { month: 'long' });
  return [`${day} ${mon} ${String(y).slice(2)}`, `${day} ${mon} ${y}`, `${day} ${long} ${y}`, `${day} ${mon}`, `${day} ${long}`, `${mon} ${y}`, `${long} ${y}`, `${y}`].map(norm);
}

/** The one rule for "does this game match the typed text in this mode". Empty text matches every game. */
export function gameMatches(g: Game, mode: SearchMode, text: string, players: Pick<Player, 'id' | 'name'>[]): boolean {
  const needle = norm(text);
  if (!needle) return true;
  if (mode === 'person') return g.playerIds.some((id) => norm(players.find((p) => p.id === id)?.name ?? '').includes(needle));
  if (mode === 'game') return norm(g.name).includes(needle);
  return dateWords(g.startedAt).some((w) => ` ${w}`.includes(` ${needle}`));
}

/** The players the Players list shows for the bar. Player mode: names that contain the text. Game name and date mode: the players of
    the games that match. Empty text lists every player. A to Z. */
export function playersMatching(players: Player[], games: Game[], mode: SearchMode, text: string): Player[] {
  const sorted = [...players].sort((a, b) => a.name.localeCompare(b.name));
  if (!norm(text)) return sorted;
  if (mode === 'person') { const t = text.trim().toLowerCase(); return sorted.filter((p) => p.name.toLowerCase().includes(t)); }
  const inGames = new Set<string>();
  for (const g of games) if (gameMatches(g, mode, text, players)) g.playerIds.forEach((id) => inGames.add(id));
  return sorted.filter((p) => inGames.has(p.id));
}
