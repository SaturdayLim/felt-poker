import { useMemo, useState } from 'react';
import { useStore, usePlayerName } from '../store';
import { go } from '../router';
import { Avatar, Caption, Delta, Empty, Header, Help, Icon, toast } from '../components/ui';
import { LineChart, SERIES_COLORS } from '../components/charts';
import { playerResult } from '../lib/calc';
import { dateLabel, money, shortDate } from '../lib/format';
import { cumulativeSeries, filterGames, groupTotals, handPace, leaderboard, playerSummary, type RangeFilter, type TypeFilter } from '../lib/stats';
import { renderStandings } from '../report/reports';
import { loadReportFonts } from '../report/canvas';
import { canvasToFile, shareFiles } from '../report/share';
import { useResolvedTheme } from '../theme';
import type { Game, ID } from '../types';

const RANGES: { k: RangeFilter; label: string; long: string }[] = [
  { k: 'all', label: 'All', long: 'All Time' },
  { k: 'fy', label: 'FYTD', long: 'FYTD' },
  { k: 'cy', label: 'CYTD', long: 'CYTD' },
  { k: '90d', label: 'L90D', long: 'L90D' },
  { k: '30d', label: 'L30D', long: 'L30D' },
];
const gap = (n: number) => ({ ['--sat-gap' as string]: `var(--sat-space-${n})` });
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '-');

export default function Insights({ initialPlayer }: { initialPlayer?: string }) {
  const allGames = useStore((s) => s.games);
  const players = useStore((s) => s.players);
  const currency = useStore((s) => s.settings.currency);
  const name = usePlayerName();
  const [view, setView] = useState<'player' | 'standings'>(initialPlayer === 'standings' ? 'standings' : 'player');
  const [type, setType] = useState<TypeFilter>('all');
  const [range, setRange] = useState<RangeFilter>('all');
  const games = useMemo(() => filterGames(allGames, type, range), [allGames, type, range]);
  const board = useMemo(() => leaderboard(games, players.map((p) => p.id)), [games, players]);
  const [pid, setPid] = useState<ID | undefined>(initialPlayer && initialPlayer !== 'standings' ? initialPlayer : undefined);
  const selected = pid ?? board[0]?.playerId;
  const period = RANGES.find((r) => r.k === range)!.long;
  const typeLabel = type === 'all' ? 'All Games' : type === 'cash' ? 'Cash Games' : 'Tournaments';

  return (
    <div className="felt-page">
      <Header title="Stats" sub={`${typeLabel} (${period})`} />
      <div className="sat-stack">
        <div className="sat-seg sat-seg--block" role="radiogroup" aria-label="View">
          <button role="radio" aria-checked={view === 'player'} onClick={() => setView('player')}><Icon name="chart" /> Players</button>
          <button role="radio" aria-checked={view === 'standings'} onClick={() => setView('standings')}><Icon name="trophy" /> Leaderboard</button>
        </div>
        <div className="sat-seg sat-seg--block" role="radiogroup" aria-label="Game type">
          {(['all', 'cash', 'tournament'] as const).map((t) => (
            <button key={t} role="radio" aria-checked={type === t} onClick={() => setType(t)}>{t === 'all' ? 'All' : t === 'cash' ? 'Cash' : 'Tournaments'}</button>
          ))}
        </div>
        <div className="sat-cluster" style={gap(2)}>
          <div className="sat-seg" role="radiogroup" aria-label="Period">
            {RANGES.map((r) => <button key={r.k} role="radio" aria-checked={range === r.k} onClick={() => setRange(r.k)}>{r.label}</button>)}
          </div>
          <Help k="periods" />
        </div>

        {games.length === 0 ? (
          <Empty title="No games in this period" action={range !== 'all' || type !== 'all' ? <button className="sat-btn" onClick={() => { setRange('all'); setType('all'); }}>Show all</button> : undefined}>
            Try a wider period or switch the game type to All.
          </Empty>
        ) : view === 'player' ? (
          <PlayerStats games={games} board={board} selected={selected} setPid={setPid} currency={currency} name={name} />
        ) : (
          <Standings games={games} board={board} currency={currency} name={name} scope={`${typeLabel} (${period})`} />
        )}
      </div>
    </div>
  );
}

function sourceLine(games: Game[]) {
  const last = games[games.length - 1];
  return `Source: Felt game log (${games.length} closed games${last ? `, latest ${dateLabel(last.startedAt)}` : ''}).`;
}

function PlayerStats({ games, board, selected, setPid, currency, name }: {
  games: Game[]; board: ReturnType<typeof leaderboard>; selected?: ID;
  setPid: (p: ID) => void; currency: string; name: (id: ID) => string;
}) {
  if (!selected) return null;
  const s = playerSummary(games, selected);
  const played = games.filter((g) => g.playerIds.includes(selected));
  const withRebuy = played.filter((g) => playerResult(g, selected).buyIns > 1);
  const noRebuy = played.filter((g) => playerResult(g, selected).buyIns <= 1);
  const netOf = (gs: Game[]) => gs.reduce((a, g) => a + playerResult(g, selected).net, 0);
  const totals = groupTotals(games);
  const pace = handPace(games);
  let cum = 0;
  const cumVals = s.history.map((h) => (cum += h.net));
  const best = s.history.reduce<{ t: number; net: number } | null>((b, h) => (!b || h.net > b.net ? h : b), null);
  const plain = (v: number) => money(v, '', { sign: true });
  const fmt = (a: number) => money(a, currency);

  return (
    <>
      <div className="felt-scroll" role="group" aria-label="Player">
        {board.map((b) => <button key={b.playerId} className="sat-chip" aria-pressed={selected === b.playerId} onClick={() => setPid(b.playerId)}>{name(b.playerId)}</button>)}
      </div>

      <section className="sat-glass sat-card sat-stack" style={gap(2)}>
        <h2 className="sat-h2">{name(selected)}</h2>
        <div className="sat-split" style={{ alignItems: 'flex-end' }}>
          <div className="sat-stack" style={gap(1)}>
            <Caption q={currency}>Net result</Caption>
            <span className="sat-kpi">{plain(s.net)}</span>
          </div>
          <div className="sat-stack felt-right" style={gap(1)}>
            <Caption tip="winRate">Win rate</Caption>
            <span className="sat-kpi" style={{ fontSize: '1.75rem' }}>{Math.round(s.winRate * 100)}%</span>
          </div>
        </div>
        <p className="sat-small sat-muted">{s.wins} of {s.games} games finished up.</p>
        {s.history.length > 1 && (
          <figure style={{ marginTop: 'var(--sat-space-2)' }}>
            <LineChart height={110} series={[{ name: 'net', color: 'var(--sat-accent)', values: cumVals }]} />
            <figcaption className="sat-figcaption"><b>Net = {fmt(s.net)}</b> after {s.games} games{best ? `, best ${money(best.net, currency, { sign: true })} on ${shortDate(best.t)}` : ''}.</figcaption>
            <p className="sat-source" style={{ marginTop: 'var(--sat-space-1)' }}>{sourceLine(played)} Running total in {currency}.</p>
          </figure>
        )}
      </section>

      <section className="sat-grid" style={{ ['--sat-min' as string]: '150px', ...gap(3) }} aria-label="Key figures">
        <div className="sat-glass sat-stat"><Caption q={currency}>Best game</Caption><span className="sat-kpi">{s.biggestWin > 0 ? plain(s.biggestWin) : '-'}</span></div>
        <div className="sat-glass sat-stat"><Caption q={currency}>Worst game</Caption><span className="sat-kpi">{s.biggestLoss < 0 ? plain(s.biggestLoss) : '-'}</span></div>
        <div className="sat-glass sat-stat"><Caption q={currency} tip="avg">Per game</Caption><span className="sat-kpi">{plain(s.avg)}</span></div>
        <div className="sat-glass sat-stat"><Caption q="games" tip="streak">Streak</Caption><span className="sat-kpi">{s.streak === 0 ? '-' : Math.abs(s.streak)}</span><span className="sat-note">{s.streak > 0 ? 'Up in a row' : s.streak < 0 ? 'Down in a row' : 'No streak'}</span></div>
        <div className="sat-glass sat-stat"><Caption>Hands won</Caption><span className="sat-kpi">{s.handsWon}</span><span className="sat-note">Top pot {s.biggestPot} units</span></div>
        <div className="sat-glass sat-stat"><Caption>Buy-ins per game</Caption><span className="sat-kpi">{s.games ? (s.buyIns / s.games).toFixed(1) : '-'}</span><span className="sat-note">{s.buyIns} in total</span></div>
      </section>

      {s.logged > 0 && (
        <section className="sat-stack" style={gap(3)} aria-label="Playing style">
          <div className="sat-split"><h2 className="sat-h2">Playing style</h2><span className="sat-small sat-muted">{s.logged} hands logged street by street</span></div>
          <div className="sat-grid" style={{ ['--sat-min' as string]: '150px', ...gap(3) }}>
            <div className="sat-glass sat-stat"><Caption tip="vpip">VPIP</Caption><span className="sat-kpi">{pct(s.vpip, s.logged)}</span><span className="sat-note">{s.vpip} of {s.logged} hands</span></div>
            <div className="sat-glass sat-stat"><Caption tip="pfr">PFR</Caption><span className="sat-kpi">{pct(s.pfr, s.logged)}</span><span className="sat-note">{s.pfr} of {s.logged} hands</span></div>
            <div className="sat-glass sat-stat"><Caption>Saw flop</Caption><span className="sat-kpi">{pct(s.sawFlop, s.logged)}</span><span className="sat-note">{s.sawFlop} of {s.logged} hands</span></div>
            <div className="sat-glass sat-stat"><Caption tip="wtsd">WTSD</Caption><span className="sat-kpi">{pct(s.wtsd, s.sawFlop)}</span><span className="sat-note">{s.wtsd} of {s.sawFlop} flops</span></div>
            <div className="sat-glass sat-stat"><Caption tip="wsd">W$SD</Caption><span className="sat-kpi">{pct(s.wsd, s.wtsd)}</span><span className="sat-note">{s.wsd} of {s.wtsd} showdowns</span></div>
          </div>
          <p className="sat-source">{sourceLine(played)} Rates use hands logged street by street only.</p>
        </section>
      )}

      <section className="sat-glass sat-card sat-stack" style={gap(3)}>
        <div className="sat-split"><h2 className="sat-h3">Rebuys</h2><Help k="rebuys" /></div>
        <div className="sat-grid" style={{ ['--sat-min' as string]: '130px', ...gap(3) }}>
          <div className="sat-stack" style={gap(1)}><Caption q={`${withRebuy.length} games`}>Rebought</Caption><Delta value={netOf(withRebuy)} format={fmt} /></div>
          <div className="sat-stack" style={gap(1)}><Caption q={`${noRebuy.length} games`}>One buy-in</Caption><Delta value={netOf(noRebuy)} format={fmt} /></div>
        </div>
      </section>

      <section className="sat-stack" style={gap(3)}>
        <h2 className="sat-h2">Games ({played.length})</h2>
        <div className="sat-glass-2 felt-list">
          {[...played].reverse().map((g) => {
            const r = playerResult(g, selected);
            return (
              <button key={g.id} className="felt-row" onClick={() => go(`game/${g.id}/close`)}>
                <div className="felt-row-main"><div className="felt-row-title">{g.name}</div><div className="felt-row-sub">{dateLabel(g.startedAt)}, {r.buyIns} buy-in{r.buyIns === 1 ? '' : 's'}{r.place ? `, place ${r.place}` : ''}</div></div>
                <Delta value={r.net} format={(a) => money(a, g.currency)} />
              </button>
            );
          })}
        </div>
        <p className="sat-source">{sourceLine(played)}</p>
      </section>

      <section className="sat-stack" style={gap(3)}>
        <h2 className="sat-h2">Whole group</h2>
        <div className="sat-grid" style={{ ['--sat-min' as string]: '150px', ...gap(3) }}>
          <div className="sat-glass sat-stat"><Caption>Games</Caption><span className="sat-kpi">{totals.games}</span></div>
          <div className="sat-glass sat-stat"><Caption>Hands</Caption><span className="sat-kpi">{totals.hands}</span>{pace.hands > 0 && <span className="sat-note">Median {Math.floor(pace.medianSec / 60)}m {pace.medianSec % 60}s per hand</span>}</div>
          <div className="sat-glass sat-stat"><Caption q="units">Top pot</Caption><span className="sat-kpi">{totals.biggestPot}</span></div>
          <div className="sat-glass sat-stat"><Caption q={currency}>Won in total</Caption><span className="sat-kpi">{money(totals.moneyMoved, '')}</span><span className="sat-note">All winning results added up</span></div>
        </div>
      </section>
    </>
  );
}

function Standings({ games, board, currency, name, scope }: {
  games: Game[]; board: ReturnType<typeof leaderboard>; currency: string; name: (id: ID) => string; scope: string;
}) {
  const pref = useStore((s) => s.settings.theme);
  const look = useResolvedTheme(pref);
  const [showAll, setShowAll] = useState(false);
  const [cmp, setCmp] = useState<ID[]>(() => board.slice(0, 3).map((b) => b.playerId));
  const [editing, setEditing] = useState(false);
  const shown = showAll ? board : board.slice(0, 5);
  const series = cumulativeSeries(games, cmp);
  const lastVals = series[series.length - 1]?.values ?? {};
  const leader = [...cmp].sort((a, b) => (lastVals[b] ?? 0) - (lastVals[a] ?? 0))[0];
  const fmt = (a: number) => money(a, currency);

  const share = async () => {
    try {
      await loadReportFonts();
      const canvases = renderStandings(games, board, name, currency, scope, look);
      const files = await Promise.all(canvases.map((c, i) => canvasToFile(c, `leaderboard-${new Date().toLocaleDateString('en-CA')}${canvases.length > 1 ? `-${i + 1}` : ''}.png`)));
      const r = await shareFiles(files, 'Leaderboard');
      if (r === 'downloaded') toast('Leaderboard exported to Downloads');
    } catch (e) {
      toast(`Image unable to build (${(e as Error).message}). Try again.`);
    }
  };

  return (
    <>
      <section className="sat-glass-2 sat-card sat-stack" style={gap(3)}>
        <div className="sat-card-head" style={{ marginBottom: 0 }}>
          <h2 className="sat-h3">Leaderboard <Help k="leaderboard" /></h2>
          <button className="sat-btn sat-btn--sm" onClick={share}><Icon name="share" /> Share image</button>
        </div>
        <div className="sat-table-wrap">
          <table className="sat-table">
            <thead><tr><th>Player</th><th className="n">Games</th><th className="n">Net <span className="sat-qual">({currency})</span></th></tr></thead>
            <tbody>
              {shown.map((b, i) => (
                <tr key={b.playerId} onClick={() => go(`insights/${b.playerId}`)} style={{ cursor: 'pointer' }}>
                  <td><span className="sat-cluster" style={gap(2)}><span className="sat-mono sat-muted" style={{ width: 14 }}>{i + 1}</span><Avatar name={name(b.playerId)} size="sm" /><span style={{ fontWeight: 600 }}>{name(b.playerId)}</span></span></td>
                  <td className="n">{b.games}</td>
                  <td className="n"><Delta value={b.net} format={(a) => money(a, '')} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {board.length > 5 && <button className="sat-btn sat-btn--ghost" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show top 5' : `Show ${board.length} players`}</button>}
        <p className="sat-source">{sourceLine(games)} Net in {currency}.</p>
      </section>

      <section className="sat-glass sat-card sat-stack" style={gap(3)}>
        <div className="sat-card-head" style={{ marginBottom: 0 }}>
          <h2 className="sat-h2">Over time</h2>
          <button className="sat-btn sat-btn--ghost sat-btn--sm" onClick={() => setEditing(!editing)}>{editing ? 'Done' : 'Choose players'}</button>
        </div>
        {editing && (
          <div className="sat-cluster" style={gap(2)}>
            {board.map((b) => <button key={b.playerId} className="sat-chip" aria-pressed={cmp.includes(b.playerId)} onClick={() => setCmp(cmp.includes(b.playerId) ? cmp.filter((x) => x !== b.playerId) : [...cmp, b.playerId])}>{name(b.playerId)}</button>)}
          </div>
        )}
        <figure>
          <LineChart series={cmp.map((p, i) => ({ name: p, color: SERIES_COLORS[i % SERIES_COLORS.length], values: series.map((s) => s.values[p] ?? 0) }))} />
          <div className="sat-cluster sat-small" style={{ ...gap(4), marginTop: 'var(--sat-space-3)' }}>
            {cmp.map((p, i) => (
              <span key={p} className="sat-cluster" style={gap(2)}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: SERIES_COLORS[i % SERIES_COLORS.length] }} />{name(p)}
                <Delta value={lastVals[p] ?? 0} format={fmt} />
              </span>
            ))}
          </div>
          {leader && <figcaption className="sat-figcaption"><b>Leader = {name(leader)} ({money(lastVals[leader] ?? 0, currency, { sign: true })})</b> over {series.length} games{series.length > 1 ? `, ${shortDate(series[0].t)} to ${shortDate(series[series.length - 1].t)}` : ''}.</figcaption>}
          <p className="sat-source" style={{ marginTop: 'var(--sat-space-1)' }}>{sourceLine(games)} Running total after each game, in {currency}.</p>
        </figure>
      </section>
    </>
  );
}
