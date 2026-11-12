import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Avatar, Icon, toast } from './ui';
import { titleCase } from './players';
import { useStore } from '../store';
import { navMs } from '../lib/motion';
import { playersMatching, type SearchMode } from '../lib/searchFilter';
import type { Player } from '../types';

/* One search bar for the Players list and the Games list. It is drawn once in App.tsx, outside the sliding pages, like the New Game
   button: it holds still while the two pages swap, and it grows in or shrinks away when another tab or view opens. The typed text is
   one value shared by both pages (not saved), and so is the mode. The bar is the same on both pages: the mode icon at the left cycles
   player, game name and date, and nothing in it moves when the page changes. Players lists the players of the matching games in
   game name and date mode (src/lib/searchFilter.ts); the plus that adds a player shows in player mode only. */

export type SearchPage = 'games' | 'players' | null;
const MODES: { id: SearchMode; icon: string; label: string; holder: string }[] = [
  { id: 'person', icon: 'person', label: 'Search by player name', holder: 'Player Name' },
  { id: 'game', icon: 'book', label: 'Search by game name', holder: 'Game Name' },
  { id: 'date', icon: 'calendar', label: 'Search by date', holder: 'Date' },
];

interface SearchState { text: string; mode: SearchMode }
let state: SearchState = { text: '', mode: 'person' };
const subs = new Set<() => void>();
export const setSearch = (p: Partial<SearchState>) => { state = { ...state, ...p }; subs.forEach((f) => f()); };
export const useSearch = (): SearchState => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => state);

/** What the Players list does with a pick from the bar. The list registers while it is on screen. */
interface PlayersApi { pick: (p: Player) => void }
let playersApi: PlayersApi | null = null;
export function usePlayersBar(api: PlayersApi) {
  const ref = useRef(api);
  ref.current = api;
  useEffect(() => {
    const mine: PlayersApi = { pick: (p) => ref.current.pick(p) };
    playersApi = mine;
    return () => { if (playersApi === mine) playersApi = null; };
  }, []);
}

/** The room the pages leave for the bar, at the top of their body. The bar sits on it. */
export function SearchGap() { return <div className="felt-sbar-gap" aria-hidden="true" data-sbar-gap />; }

export function SearchHost({ page }: { page: SearchPage }) {
  const show = page !== null;
  const { text, mode } = useSearch();
  const players = useStore((s) => s.players);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  // the player list stays mounted for 220 ms after it closes, so it can fade out
  const [listKept, setListKept] = useState(false);
  const blurT = useRef<number>();
  const onPlayers = page === 'players';
  const cur = MODES.find((m) => m.id === mode)!;
  const next = MODES[(MODES.indexOf(cur) + 1) % MODES.length];
  const term = text.trim().toLowerCase();
  const matches = playersMatching(players, [], 'person', text);
  // the plus adds a player, in player mode only, when no player has the typed name
  const adding = mode === 'person' && term !== '' && matches.length === 0;

  // the pages leave the room while the bar is there
  useEffect(() => { document.documentElement.classList.toggle('felt-has-sb', show); return () => document.documentElement.classList.remove('felt-has-sb'); }, [show]);
  useEffect(() => { if (!show) setOpen(false); }, [show]);
  useEffect(() => {
    if (open) { setListKept(true); return; }
    const t = window.setTimeout(() => setListKept(false), 220);
    return () => window.clearTimeout(t);
  }, [open]);
  useEffect(() => () => window.clearTimeout(blurT.current), []);

  // the bar sits on the room the open page leaves for it
  useLayoutEffect(() => {
    const el = root.current;
    if (!el || !show) return;
    const place = () => {
      const gap = document.querySelector<HTMLElement>('.felt-app > .felt-slide [data-sbar-gap]');
      if (!gap) return;
      let top = 0;
      for (let n: HTMLElement | null = gap; n; n = n.offsetParent as HTMLElement | null) top += n.offsetTop;
      el.style.top = `${top}px`;
    };
    place();
    const t = [60, 350, 900].map((ms) => window.setTimeout(place, ms));
    window.addEventListener('resize', place);
    return () => { t.forEach((x) => window.clearTimeout(x)); window.removeEventListener('resize', place); };
  }, [show, page]);

  const pick = (p: Player) => { setOpen(false); setSearch({ text: '' }); input.current?.blur(); playersApi?.pick(p); };
  const add = () => {
    const n = titleCase(text);
    if (!n) return;
    if (players.some((p) => p.name.toLowerCase() === n.toLowerCase())) { toast(`${n} is already on the list. Use a different name.`); return; }
    useStore.getState().addPlayer(n);
    setSearch({ text: '' });
    toast(`${n} added to players.`);
    input.current?.focus();
  };
  const clear = () => { setSearch({ text: '' }); input.current?.focus(); };

  return (
    <div ref={root} className="felt-sbar" data-open={show} style={{ ['--sbar-ms' as string]: `${navMs()}ms` }} aria-hidden={!show} {...({ inert: show ? undefined : '' } as object)}>
      <div className="felt-sbar-field" role="search">
        <button type="button" className="felt-sbar-mode" data-press="select" aria-label={`${cur.label}. Tap for ${next.label.toLowerCase()}`}
          onClick={() => setSearch({ mode: next.id, text: '' })}>
          {MODES.map((m) => <span key={m.id} className="felt-sbar-ico" data-on={m.id === mode}><Icon name={m.icon} size={20} /></span>)}
        </button>
        <div className="felt-sbar-text">
          <input ref={input} className="felt-sbar-input" type="search" inputMode="search" enterKeyHint="search" autoComplete="off" role={onPlayers && mode === 'person' ? 'combobox' : undefined}
            aria-expanded={onPlayers && mode === 'person' ? open : undefined} aria-label={cur.holder} value={text}
            onChange={(e) => { setSearch({ text: e.target.value }); setOpen(true); }} onFocus={() => { window.clearTimeout(blurT.current); setOpen(true); }} onBlur={() => { blurT.current = window.setTimeout(() => setOpen(false), 120); }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { setOpen(false); input.current?.blur(); return; }
              if (e.key !== 'Enter') return;
              e.preventDefault();
              if (adding) { add(); return; } // the plus is showing, on Players or Games alike
              if (!onPlayers || mode !== 'person') { input.current?.blur(); return; }
              const exact = matches.find((p) => p.name.toLowerCase() === term) ?? (matches.length === 1 ? matches[0] : undefined);
              if (exact) pick(exact);
            }} />
          {/* the ghost text cross-fades with the mode icon */}
          <span className="felt-sbar-ghost" data-hide={!!text} aria-hidden="true">
            {MODES.map((m) => <span key={m.id} data-on={m.id === mode}>{m.holder}</span>)}
          </span>
        </div>
        <button type="button" className="felt-sbar-clear" data-press="none" data-on={!!text} tabIndex={text ? 0 : -1} aria-label="Clear search" onMouseDown={(e) => e.preventDefault()} onClick={clear}><Icon name="close" size={14} stroke={2.4} /></button>
        <button type="button" className="felt-sbar-add" data-on={adding} tabIndex={adding ? 0 : -1} aria-label={adding ? `Add ${titleCase(text)}` : 'Add player'} onMouseDown={(e) => e.preventDefault()} onClick={add}><Icon name="plus" size={18} /></button>
      </div>
      {onPlayers && mode === 'person' && (open || listKept) && !adding && matches.length > 0 && (
        <div className="felt-sbar-list" data-open={open} role="listbox" onMouseDown={(e) => e.preventDefault()}>
          {matches.map((p) => (
            <button key={p.id} type="button" role="option" aria-selected="false" className={`felt-finder-item ${p.archived ? 'is-hidden' : ''}`} onClick={() => pick(p)}>
              <Avatar name={p.name} size="sm" /><span>{p.name}{p.archived ? ' (hidden)' : ''}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
