import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useStore } from '../store';
import { go } from '../router';
import { PlayerName } from '../components/players';
import { Delta, Empty, Header, Icon, SlidePane, withUndo } from '../components/ui';
import { SearchGap, setSearch, useSearch } from '../components/searchHost';
import { toTop } from '../components/navRail';
import { Headline, StatRows } from '../components/statRows';
import { TypeChips } from './Insights';
import { gameFigure, gameResults, handStats, openTransfers, playerStatus } from '../lib/calc';
import { gameCaption, figureDelta, oneDecimal, pct, runningLabel, runningMs, share } from '../lib/format';
import { groupTotals, handPace, type TypeFilter } from '../lib/stats';
import { shrinkAway } from '../lib/motion';
import { haptic } from '../lib/haptics';
import type { Game } from '../types';

/* Live games sit in their own section as solid glass cards with a pulsing dot.
   Closed games are flat, quieter rows underneath, so the two never read alike. */
/** `player`: show only the games of this player (from the player card), with a chip to clear it.
    `player` = "stats" opens the Stats view: figures for the whole table across games. */
export default function Games({ player: arg }: { player?: string }) {
  const stats = arg === 'stats';
  const player = stats ? undefined : arg;
  const games = useStore((s) => s.games);
  const who = useStore((s) => s.players.find((p) => p.id === player));
  const groups = useStore((s) => s.groups);
  const showMoney = useStore((s) => s.settings.showMoney);
  const allPlayers = useStore((s) => s.players);
  const [type, setType] = useState<TypeFilter>('all');
  // the search bar is shared with Players (searchHost.tsx): its text and mode live there
  const { text: boxValue, mode } = useSearch();
  // a player filter from the player card shows in the bar as that name, in player mode
  useEffect(() => { if (who) setSearch({ mode: 'person', text: who.name }); }, [player, who?.name]); // eslint-disable-line react-hooks/exhaustive-deps
  // typing something else drops the player filter
  const lastText = useRef(boxValue);
  useEffect(() => { if (lastText.current !== boxValue && who && boxValue !== who.name) go('games', true); lastText.current = boxValue; }, [boxValue]); // eslint-disable-line react-hooks/exhaustive-deps
  const byPlayer = !!who && boxValue === who.name;
  const needle = byPlayer ? '' : norm(boxValue);
  const nameOf = (id: string) => allPlayers.find((p) => p.id === id)?.name ?? '';
  const hit = (g: Game) => !needle || (mode === 'person' ? g.playerIds.some((id) => norm(nameOf(id)).includes(needle))
    : mode === 'game' ? norm(g.name).includes(needle) : dateWords(g.startedAt).some((w) => ` ${w}`.includes(` ${needle}`)));
  const list = games.filter((g) => (type === 'all' || g.type === type) && (!byPlayer || g.playerIds.includes(who!.id)) && hit(g)).sort((a, b) => b.startedAt - a.startedAt);
  const searching = !!boxValue;
  const liveNow = list.filter((g) => g.status === 'live');
  const closedNow = list.filter((g) => g.status === 'closed');
  // rows that leave stay mounted while they shrink away; rows that arrive grow in
  const live = useRows(liveNow), closed = useRows(closedNow);
  const showEmpty = useHold(list.length === 0);
  const emptyNode = useRef<ReactNode>(null);
  if (list.length === 0) emptyNode.current = searching ? <Empty title="No matches">{`No game matches "${boxValue}". Try another word or search mode.`}</Empty> : <Empty title="No games">Games you start appear here.</Empty>;
  const groupName = (g: Game) => groups.find((x) => x.id === g.groupId)?.name;

  return (
    <div className="felt-page">
      <Header banner="Games" tabs={[{ label: 'Game list', icon: 'lines', on: !stats, go: () => (stats ? go('games', true) : toTop()) }, { label: 'Stats', icon: 'sigma', on: stats, go: () => (stats ? toTop() : go('games/stats', true)) }]} />
      <div className="sat-stack">
        <SearchGap />
        <TypeChips type={type} setType={setType} />
        <SlidePane k={stats ? 'stats' : 'list'} i={stats ? 1 : 0}>
        {stats ? <GameStats games={closedNow} /> : <div className="sat-stack">
        {showEmpty && <Grow open={list.length === 0}>{emptyNode.current}</Grow>}

        {live.rows.length > 0 && (
          <Grow open={liveNow.length > 0}><section className="felt-section">
            <h2 className="sat-caption felt-section-cap"><span className="felt-dot felt-dot--pulse" />Live now</h2>
            {live.rows.map(({ g, open: rowOpen }) => {
              const seated = g.playerIds.filter((p) => playerStatus(g, p) !== 'out').length;
              return (
                <Grow key={g.id} open={rowOpen} initial={live.first}><button className="sat-glass sat-card felt-live-card" onClick={() => go(`game/${g.id}`)}>
                  <span className="felt-live-name">{g.name}</span>
                  <span className="sat-small sat-muted">{g.type === 'cash' ? `${g.sb}/${g.bb} Cash` : 'Tournament'}{runningMs(g) === null ? '' : `, ${runningLabel(g)}`}, {seated} playing, {g.hands.length} hand{g.hands.length === 1 ? '' : 's'}{groupName(g) ? `, ${groupName(g)}` : ''}</span>
                  <span className="felt-live-go" aria-hidden="true"><Icon name="back" /></span>
                </button></Grow>
              );
            })}
          </section></Grow>
        )}

        {closed.rows.length > 0 && (
          <Grow open={closedNow.length > 0}><section className="felt-section">
            <h2 className="sat-caption felt-section-cap">Closed</h2>
            <div className="sat-flat felt-list felt-closed-list">
              {closed.rows.map(({ g, open: rowOpen }) => {
                const res = gameResults(g);
                const open = openTransfers(g).length;
                return (
                  <Grow key={g.id} open={rowOpen} initial={closed.first}><SwipeDelete label={`Delete ${g.name}`} onDelete={(row) => shrinkAway(row, () => { closed.drop(g.id); withUndo(`${g.name} deleted.`, () => useStore.getState().deleteGame(g.id)); })}>
                  <button className="felt-row" onClick={() => go(`game/${g.id}/hands`)}>
                    <div className="felt-row-main">
                      <div className="felt-row-title felt-ellipsis" data-game-title={g.id}>{g.name}</div>
                      <div className="felt-row-sub">{gameCaption(g, groupName(g))}</div>
                    </div>
                    {res[0] && (
                      <div className="felt-right">
                        <div className="sat-small felt-ellipsis" style={{ maxWidth: 96 }}><PlayerName id={res[0].playerId} /></div>
                        <Delta {...figureDelta(gameFigure(g, res[0].playerId), showMoney)} />
                        {open > 0 && <div className="sat-small sat-muted">{open} unpaid</div>}
                      </div>
                    )}
                  </button>
                  </SwipeDelete></Grow>
                );
              })}
            </div>
          </section></Grow>
        )}
        </div>}
        </SlidePane>
      </div>
    </div>
  );
}

const GROW_MS = 300;
/** True while `flag` is true and for a moment after, so a leaving block can finish its exit. */
function useHold(flag: boolean): boolean {
  const [held, setHeld] = useState(flag);
  useEffect(() => {
    if (flag) { setHeld(true); return; }
    const t = window.setTimeout(() => setHeld(false), GROW_MS);
    return () => window.clearTimeout(t);
  }, [flag]);
  return flag || held;
}
/** The games of a list plus the ones that just left, which stay mounted until their exit has played. `first` is true on the first render: those rows do not animate in. */
function useRows(items: Game[]) {
  const kept = useRef(new Map<string, Game>());
  const timers = useRef(new Map<string, number>());
  const [, bump] = useState(0);
  const first = useRef(true);
  useEffect(() => { first.current = false; }, []);
  const ids = new Set(items.map((g) => g.id));
  items.forEach((g) => { kept.current.set(g.id, g); });
  useEffect(() => {
    for (const id of ids) { const t = timers.current.get(id); if (t) { clearTimeout(t); timers.current.delete(id); } }
    for (const id of kept.current.keys()) {
      if (ids.has(id) || timers.current.has(id)) continue;
      timers.current.set(id, window.setTimeout(() => { timers.current.delete(id); kept.current.delete(id); bump((n) => n + 1); }, GROW_MS + 40));
    }
  });
  useEffect(() => () => timers.current.forEach((t) => clearTimeout(t)), []);
  const rows = [...kept.current.values()].sort((a, b) => b.startedAt - a.startedAt).map((g) => ({ g, open: ids.has(g.id) }));
  const drop = (id: string) => { kept.current.delete(id); bump((n) => n + 1); };
  return { rows, drop, first: first.current };
}
/** Grows open from zero height (and fades in), and closes the same way. `initial`: start open, no entry. */
function Grow({ open, initial = false, children }: { open: boolean; initial?: boolean; children: ReactNode }) {
  const [on, setOn] = useState(initial ? open : false);
  useEffect(() => {
    const r = requestAnimationFrame(() => requestAnimationFrame(() => setOn(open)));
    return () => cancelAnimationFrame(r);
  }, [open]);
  return <div className="felt-rowgrow" data-open={on} {...(on ? {} : { inert: '' })}><div className="felt-rowgrow-in">{children}</div></div>;
}

const norm = (t: string) => t.toLowerCase().replace(/[’']/g, ' ').replace(/\s+/g, ' ').trim();
/** The date as the list shows it (9 Nov'26), in the ways a person types it: 9 Nov, Nov 2026, 2026. */
function dateWords(at: number): string[] {
  const d = new Date(at);
  const day = d.getDate(), y = d.getFullYear();
  const mon = d.toLocaleDateString('en-GB', { month: 'short' }), long = d.toLocaleDateString('en-GB', { month: 'long' });
  return [`${day} ${mon} ${String(y).slice(2)}`, `${day} ${mon} ${y}`, `${day} ${long} ${y}`, `${day} ${mon}`, `${day} ${long}`, `${mon} ${y}`, `${long} ${y}`, `${y}`].map(norm);
}

/** A row that slides left to show Delete. A long swipe deletes at once; Undo puts the game back. */
export function SwipeDelete({ children, label, onDelete }: { children: ReactNode; label: string; onDelete: (row: HTMLElement) => void }) {
  const row = useRef<HTMLDivElement>(null);
  const [x, setX] = useState(0);
  const [drag, setDrag] = useState(false);
  const s = useRef<{ x: number; y: number; from: number; live: boolean } | null>(null);
  const OPEN = -88;
  const done = () => { if (row.current) { haptic(12); onDelete(row.current); } };
  return (
    <div ref={row} className="felt-swipe" onTouchStart={(e) => { s.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, from: x, live: false }; }}
      onTouchMove={(e) => {
        const t = s.current;
        if (!t) return;
        const dx = e.touches[0].clientX - t.x, dy = e.touches[0].clientY - t.y;
        if (!t.live) { if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) { s.current = null; return; } if (Math.abs(dx) < 8) return; t.live = true; setDrag(true); }
        setX(Math.min(0, t.from + dx));
      }}
      onTouchEnd={() => {
        const t = s.current;
        s.current = null;
        setDrag(false);
        if (!t?.live) return;
        const w = row.current?.offsetWidth ?? 320;
        if (x < -w * 0.6) { setX(-w); done(); return; }
        setX(x < OPEN / 2 ? OPEN : 0);
      }}>
      {(x < 0 || drag) && <button type="button" className="felt-swipe-del" aria-label={label} onClick={done}><Icon name="trash" size={20} /> Delete</button>}
      <div className="felt-swipe-row" style={{ transform: `translateX(${x}px)`, transition: drag ? 'none' : undefined }}
        onClickCapture={(e) => { if (x) { e.stopPropagation(); e.preventDefault(); setX(0); } }}>{children}</div>
    </div>
  );
}

/** Figures for the whole table across the closed games of this type: game-level, not per player. */
function GameStats({ games }: { games: Game[] }) {
  if (!games.length) return <Empty title="No closed games">Close a game to see table stats here.</Empty>;
  const t = groupTotals(games);
  const pace = handPace(games);
  const hs = games.map((g) => handStats(g));
  const pots = hs.reduce((a, h) => a + h.totalPot, 0);
  const showdowns = hs.reduce((a, h) => a + h.showdowns, 0);
  const allIns = hs.reduce((a, h) => a + h.allIns, 0);
  const lengths = games.map((g) => runningMs(g)).filter((m): m is number => m !== null);
  const avgMin = lengths.length ? Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length / 60000) : null;
  const buyIns = games.reduce((a, g) => a + g.buyIns.length, 0);
  const seats = games.reduce((a, g) => a + g.playerIds.length, 0);
  const len = avgMin === null ? '-' : `${Math.floor(avgMin / 60)}h ${avgMin % 60}m`;
  return (
    <div className="sat-stack">
      <Headline label="Table totals" items={[
        { label: 'Games', value: t.games, note: `${oneDecimal(seats / games.length)} players each` },
        { label: 'Hands', value: t.hands, note: `${(t.hands / games.length).toFixed(0)} per game` },
        { label: 'Average pot', q: 'chips', value: t.hands ? Math.round(pots / t.hands) : '-', note: `Top pot ${t.biggestPot}` },
      ]} />
      <StatRows title="Pace" rows={[
        { label: 'Game length', value: len, note: 'Average' },
        { label: 'Per hand', value: pace.hands ? `${Math.floor(pace.medianSec / 60)}m ${pace.medianSec % 60}s` : '-', note: 'Median' },
        { label: 'Buy-ins per game', value: oneDecimal(buyIns / games.length), note: `${buyIns} in total` },
      ]} />
      <StatRows title="Pots" rows={[
        { label: 'Showdowns', value: pct(showdowns, t.hands), share: share(showdowns, t.hands), note: `${showdowns} of ${t.hands} hands` },
        { label: 'All-ins', value: pct(allIns, t.hands), share: share(allIns, t.hands), note: `${allIns} hands` },
      ]} />
    </div>
  );
}
