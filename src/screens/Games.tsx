import { useRef, useState, type ReactNode } from 'react';
import { useStore } from '../store';
import { go } from '../router';
import { PlayerName } from '../components/players';
import { Caption, Delta, Empty, Header, Icon, SlidePane, SourceTip, TabPill, withUndo, reopenGame } from '../components/ui';
import { gameResults, handStats, openTransfers, playerStatus, totalPotMoney } from '../lib/calc';
import { dateLabel, gameLength, money, playMs } from '../lib/format';
import { groupTotals, handPace } from '../lib/stats';
import { shrinkAway } from '../lib/motion';
import { haptic } from '../lib/haptics';
import type { Game, GameType } from '../types';

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
  const [type, setType] = useState<'all' | GameType>('all');
  const list = games.filter((g) => (type === 'all' || g.type === type) && (!who || g.playerIds.includes(who.id))).sort((a, b) => b.startedAt - a.startedAt);
  const live = list.filter((g) => g.status === 'live');
  const closed = list.filter((g) => g.status === 'closed');
  const groupName = (g: Game) => groups.find((x) => x.id === g.groupId)?.name;

  return (
    <div className="felt-page">
      <Header title="Games" tabs={[{ label: 'Games', on: !stats, go: () => go('games', true) }, { label: 'Stats', on: stats, go: () => go('games/stats', true) }]} />
      <div className="sat-stack">
        <div className="sat-seg sat-seg--block" role="radiogroup" aria-label="Game type">
          <TabPill />
          {(['all', 'cash', 'tournament'] as const).map((t) => (
            <button key={t} role="radio" aria-checked={type === t} onClick={() => setType(t)}>
              {t === 'all' ? 'All' : t === 'cash' ? 'Cash' : 'Tournaments'}
            </button>
          ))}
        </div>
        {who && (
          <div className="sat-cluster">
            <button className="sat-chip" aria-pressed="true" aria-label={`Showing games of ${who.name}. Tap to show all games`} onClick={() => go('games', true)}>{who.name} <Icon name="close" size={14} stroke={2.4} /></button>
          </div>
        )}
        <SlidePane k={stats ? 'stats' : 'list'} i={stats ? 1 : 0}>
        {stats ? <GameStats games={closed} /> : <div className="sat-stack">
        <div className="felt-start">
          <button className="sat-btn sat-btn--primary" onClick={() => go('new/cash')}><Icon name="plus" /> Cash game</button>
          <button className="sat-btn" onClick={() => go('new/tournament')}><Icon name="trophy" /> Tournament</button>
        </div>
        {list.length === 0 && <Empty title="No games">Games you start appear here.</Empty>}

        {live.length > 0 && (
          <section className="felt-section">
            <h2 className="sat-caption felt-section-cap"><span className="felt-dot felt-dot--pulse" />Live now</h2>
            {live.map((g) => {
              const seated = g.playerIds.filter((p) => playerStatus(g, p) !== 'out').length;
              return (
                <button key={g.id} className="sat-glass sat-card felt-live-card" onClick={() => go(`game/${g.id}`)}>
                  <span className="felt-live-name">{g.name}</span>
                  <span className="sat-small sat-muted">{g.type === 'cash' ? `${g.sb}/${g.bb} cash` : 'Tournament'}{playMs(g) === null ? '' : `, ${gameLength(g)}`}, {seated} playing, {g.hands.length} hands{groupName(g) ? `, ${groupName(g)}` : ''}</span>
                  <span className="felt-live-go" aria-hidden="true"><Icon name="back" /></span>
                </button>
              );
            })}
          </section>
        )}

        {closed.length > 0 && (
          <section className="felt-section">
            <h2 className="sat-caption felt-section-cap">Closed</h2>
            <div className="sat-flat felt-list felt-closed-list">
              {closed.map((g) => {
                const res = gameResults(g);
                const open = openTransfers(g).length;
                return (
                  <SwipeDelete key={g.id} label={`Delete ${g.name}`} onDelete={(row) => shrinkAway(row, () => withUndo(`${g.name} deleted.`, () => useStore.getState().deleteGame(g.id)))}>
                  <button className="felt-row" onClick={() => reopenGame(g)}>
                    <div className="felt-row-main">
                      <div className="felt-row-title felt-ellipsis">{g.name}</div>
                      <div className="felt-row-sub">
                        {dateLabel(g.startedAt)}, {g.playerIds.length} players, {money(totalPotMoney(g), g.currency)}{groupName(g) ? `, ${groupName(g)}` : ''}
                        {open > 0 ? `, ${open} unpaid` : ''}
                      </div>
                    </div>
                    {res[0] && (
                      <div className="felt-right">
                        <div className="sat-small felt-ellipsis" style={{ maxWidth: 96 }}><PlayerName id={res[0].playerId} /></div>
                        <Delta value={res[0].net} format={(a) => money(a, g.currency)} />
                      </div>
                    )}
                  </button>
                  </SwipeDelete>
                );
              })}
            </div>
          </section>
        )}
        </div>}
        </SlidePane>
      </div>
    </div>
  );
}

/** A row that slides left to show Delete. A long swipe deletes at once; Undo puts the game back. */
function SwipeDelete({ children, label, onDelete }: { children: ReactNode; label: string; onDelete: (row: HTMLElement) => void }) {
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
  const currency = useStore((s) => s.settings.currency);
  if (!games.length) return <Empty title="No closed games">Close a game to see table stats here.</Empty>;
  const t = groupTotals(games);
  const pace = handPace(games);
  const hs = games.map((g) => handStats(g));
  const pots = hs.reduce((a, h) => a + h.totalPot, 0);
  const showdowns = hs.reduce((a, h) => a + h.showdowns, 0);
  const allIns = hs.reduce((a, h) => a + h.allIns, 0);
  const lengths = games.map((g) => playMs(g)).filter((m): m is number => m !== null);
  const avgMin = lengths.length ? Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length / 60000) : null;
  const buyIns = games.reduce((a, g) => a + g.buyIns.length, 0);
  const seats = games.reduce((a, g) => a + g.playerIds.length, 0);
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '-');
  const tile = (label: string, value: string | number, note?: string) => (
    <div className="sat-glass sat-stat"><Caption>{label}</Caption><span className="sat-kpi">{value}</span>{note && <span className="sat-note">{note}</span>}</div>
  );
  return (
    <div className="sat-stack">
      <div className="sat-grid" style={{ ['--sat-min' as string]: '150px', ['--sat-gap' as string]: 'var(--sat-space-3)' }}>
        {tile('Games', t.games, `${(seats / games.length).toFixed(1)} players each`)}
        {tile('Game length', avgMin === null ? '-' : `${Math.floor(avgMin / 60)}h ${avgMin % 60}m`, 'Average')}
        {tile('Hands', t.hands, `${(t.hands / games.length).toFixed(0)} per game`)}
        {tile('Pace', pace.hands ? `${Math.floor(pace.medianSec / 60)}m ${pace.medianSec % 60}s` : '-', 'Median per hand')}
        {tile('Average pot', t.hands ? Math.round(pots / t.hands) : '-', 'Chips')}
        {tile('Top pot', t.biggestPot, 'Chips')}
        {tile('Showdowns', pct(showdowns, t.hands), `${showdowns} of ${t.hands} hands`)}
        {tile('All-ins', pct(allIns, t.hands), `${allIns} hands`)}
        {tile('Buy-ins per game', (buyIns / games.length).toFixed(1), `${buyIns} in total`)}
        {tile('Won in total', money(t.moneyMoved, games[0]?.currency ?? currency), 'All winning results added up')}
      </div>
      <div className="felt-source"><SourceTip>Felt game log ({games.length} closed games of this type).</SourceTip></div>
    </div>
  );
}
