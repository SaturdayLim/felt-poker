import { useMemo, useState } from 'react';
import { useStore, usePlayerName } from '../store';
import { go } from '../router';
import { Avatar, Empty, Help, Icon, toast } from '../components/ui';
import { LineChart, SERIES_COLORS } from '../components/charts';
import { playerResult } from '../lib/calc';
import { money, shortDate, tone } from '../lib/format';
import { cumulativeSeries, filterGames, groupTotals, leaderboard, playerSummary, type RangeFilter, type TypeFilter } from '../lib/stats';
import { renderStandings } from '../report/reports';
import { loadReportFonts } from '../report/canvas';
import { canvasToFile, shareFiles } from '../report/share';
import { useResolvedTheme } from '../theme';
import type { ID } from '../types';

const RANGES: { k: RangeFilter; label: string }[] = [
  { k: 'all', label: 'All time' }, { k: 'year', label: 'This year' }, { k: '90d', label: 'Last 90 days' }, { k: '30d', label: 'Last 30 days' },
];

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
  const rangeLabel = RANGES.find((r) => r.k === range)!.label;

  return (
    <div className="screen plain">
      <div className="page-title">
        <h1>Stats</h1>
        <p>From {games.length} closed game{games.length === 1 ? '' : 's'}.</p>
      </div>

      <div className="seg" role="tablist">
        <button role="tab" aria-selected={view === 'player'} onClick={() => setView('player')}><Icon name="chart" /> Players</button>
        <button role="tab" aria-selected={view === 'standings'} onClick={() => setView('standings')}><Icon name="trophy" /> Leaderboard</button>
      </div>
      <div className="row" style={{ marginTop: 14, gap: 12 }}>
        <div className="chips" style={{ flex: 1, gap: 8, flexWrap: 'nowrap' }}>
          {(['all', 'cash', 'tournament'] as const).map((t) => (
            <button key={t} className="chip sm" aria-pressed={type === t} onClick={() => setType(t)}>{t === 'all' ? 'All' : t === 'cash' ? 'Cash' : 'Tournaments'}</button>
          ))}
        </div>
      </div>
      <div className="input-wrap" style={{ marginTop: 12, width: 190 }}>
        <span className="prefix"><Icon name="calendar" size={16} /></span>
        <select className="input" style={{ minHeight: 42, fontSize: 15 }} value={range} onChange={(e) => setRange(e.target.value as RangeFilter)} aria-label="Date range">
          {RANGES.map((r) => <option key={r.k} value={r.k}>{r.label}</option>)}
        </select>
      </div>

      {games.length === 0 ? (
        <div className="section"><Empty icon="chart">No closed games in this range yet.</Empty></div>
      ) : view === 'player' ? (
        <PlayerStats games={games} board={board} selected={selected} setPid={setPid} currency={currency} rangeLabel={rangeLabel} name={name} />
      ) : (
        <Standings games={games} board={board} currency={currency} name={name} rangeLabel={rangeLabel} type={type} />
      )}
    </div>
  );
}

function PlayerStats({ games, board, selected, setPid, currency, rangeLabel, name }: {
  games: ReturnType<typeof filterGames>; board: ReturnType<typeof leaderboard>; selected?: ID;
  setPid: (p: ID) => void; currency: string; rangeLabel: string; name: (id: ID) => string;
}) {
  if (!selected) return null;
  const s = playerSummary(games, selected);
  const played = games.filter((g) => g.playerIds.includes(selected));
  const withRebuy = played.filter((g) => playerResult(g, selected).buyIns > 1);
  const noRebuy = played.filter((g) => playerResult(g, selected).buyIns <= 1);
  const netOf = (gs: typeof games) => gs.reduce((a, g) => a + playerResult(g, selected).net, 0);
  const totals = groupTotals(games);
  let cum = 0;
  const cumVals = s.history.map((h) => (cum += h.net));
  const signed = (v: number) => money(v, currency, { sign: true });

  return (
    <>
      <div className="chips scroll" style={{ marginTop: 18 }}>
        {board.map((b) => (
          <button key={b.playerId} className="chip" aria-pressed={selected === b.playerId} onClick={() => setPid(b.playerId)}>{name(b.playerId)}</button>
        ))}
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="row between" style={{ alignItems: 'flex-start' }}>
          <div>
            <div className="label">{name(selected)}, {rangeLabel.toLowerCase()}</div>
            <div className={`hero-num ${tone(s.net)}`} style={{ fontSize: 40 }}>{signed(s.net)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="big-num" style={{ fontSize: 22 }}>{s.wins} of {s.games}</div>
            <div className="tiny faint">games up</div>
          </div>
        </div>
        <div className="kpis" style={{ marginTop: 14 }}>
          <div><div className="v">{s.games}</div><div className="tiny faint">Games</div></div>
          <div><div className="v">{s.wins}</div><div className="tiny faint">Finished up</div></div>
          <div><div className="v">{Math.round(s.winRate * 100)}%</div><div className="tiny faint row" style={{ justifyContent: 'center', gap: 2 }}>Win rate <Help k="winRate" /></div></div>
        </div>
        {s.history.length > 1 && <div style={{ marginTop: 14 }}><LineChart height={110} series={[{ name: 'net', color: s.net >= 0 ? 'var(--up)' : 'var(--down)', values: cumVals }]} /></div>}
      </div>

      <div className="stat-grid" style={{ marginTop: 12 }}>
        <div className="stat"><div className="k">Best game</div><div className="v up">{s.biggestWin > 0 ? signed(s.biggestWin) : '—'}</div></div>
        <div className="stat"><div className="k">Worst game</div><div className="v down">{s.biggestLoss < 0 ? signed(s.biggestLoss) : '—'}</div></div>
        <div className="stat"><div className="k">Per game <Help k="avg" /></div><div className={`v ${tone(s.avg)}`}>{signed(s.avg)}</div></div>
        <div className="stat"><div className="k">Streak <Help k="streak" /></div><div className="v">{s.streak === 0 ? '—' : `${Math.abs(s.streak)} ${s.streak > 0 ? 'up' : 'down'}`}</div></div>
        <div className="stat"><div className="k">Hands won</div><div className="v">{s.handsWon}</div><div className="d">Biggest pot {s.biggestPot} units</div></div>
        <div className="stat"><div className="k">Buy-ins per game</div><div className="v">{s.games ? (s.buyIns / s.games).toFixed(1) : '—'}</div><div className="d">{s.buyIns} in all</div></div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="row" style={{ gap: 2 }}><span className="label">Rebuys</span><Help k="rebuys" /></div>
        <div className="grid2" style={{ marginTop: 10 }}>
          <div><div className="tiny faint">Rebought, {withRebuy.length} games</div><div className={`big-num ${tone(netOf(withRebuy))}`} style={{ fontSize: 21 }}>{signed(netOf(withRebuy))}</div></div>
          <div><div className="tiny faint">One buy-in, {noRebuy.length} games</div><div className={`big-num ${tone(netOf(noRebuy))}`} style={{ fontSize: 21 }}>{signed(netOf(noRebuy))}</div></div>
        </div>
      </div>

      <div className="section">
        <div className="section-head"><h2>Games<span className="count">{played.length}</span></h2></div>
        <div className="card list">
          {[...played].reverse().map((g) => {
            const r = playerResult(g, selected);
            return (
              <button key={g.id} className="list-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => go(`game/${g.id}/close`)}>
                <div className="grow"><div style={{ fontWeight: 700 }}>{g.name}</div><div className="tiny faint">{shortDate(g.startedAt)} · {r.buyIns} buy-in{r.buyIns === 1 ? '' : 's'}{r.place ? ` · place ${r.place}` : ''}</div></div>
                <span className={`num ${tone(r.net)}`}>{money(r.net, g.currency, { sign: true })}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="section">
        <div className="section-head"><h2>Whole group</h2></div>
        <div className="stat-grid">
          <div className="stat"><div className="k">Games</div><div className="v">{totals.games}</div></div>
          <div className="stat"><div className="k">Hands</div><div className="v">{totals.hands}</div></div>
          <div className="stat"><div className="k">Biggest pot</div><div className="v">{totals.biggestPot}</div><div className="d">units</div></div>
          <div className="stat"><div className="k">Changed hands</div><div className="v">{money(totals.moneyMoved, currency)}</div><div className="d">All winning results added up</div></div>
        </div>
      </div>
    </>
  );
}

function Standings({ games, board, currency, name, rangeLabel, type }: {
  games: ReturnType<typeof filterGames>; board: ReturnType<typeof leaderboard>; currency: string;
  name: (id: ID) => string; rangeLabel: string; type: TypeFilter;
}) {
  const pref = useStore((s) => s.settings.theme);
  const look = useResolvedTheme(pref);
  const [showAll, setShowAll] = useState(false);
  const [cmp, setCmp] = useState<ID[]>(() => board.slice(0, 3).map((b) => b.playerId));
  const [editing, setEditing] = useState(false);
  const shown = showAll ? board : board.slice(0, 5);
  const series = cumulativeSeries(games, cmp);

  const share = async () => {
    try {
      await loadReportFonts();
      const scope = `${rangeLabel}${type === 'all' ? '' : type === 'cash' ? ', cash' : ', tournaments'}`;
      const canvases = renderStandings(games, board, name, currency, scope, look);
      const files = await Promise.all(canvases.map((c, i) => canvasToFile(c, `standings-${new Date().toLocaleDateString('en-CA')}${canvases.length > 1 ? `-${i + 1}` : ''}.png`)));
      const r = await shareFiles(files, 'Leaderboard');
      if (r === 'downloaded') toast('Saved to your downloads');
    } catch (e) {
      toast(`Couldn't share: ${(e as Error).message}`);
    }
  };

  return (
    <>
      <div className="section" style={{ marginTop: 20 }}>
        <div className="section-head"><h2>Leaderboard <Help k="leaderboard" /></h2><span className="small muted">{board.length} players</span></div>
        <div className="card" style={{ padding: '0 10px' }}>
          <table className="table">
            <thead><tr><th>Player</th><th className="r">Games</th><th className="r">Net</th></tr></thead>
            <tbody>
              {shown.map((b, i) => (
                <tr key={b.playerId} onClick={() => go(`insights/${b.playerId}`)} style={{ cursor: 'pointer' }}>
                  <td><div className="row" style={{ gap: 8 }}><span className="num faint" style={{ width: 16 }}>{i + 1}</span><Avatar name={name(b.playerId)} size="sm" /><span style={{ fontWeight: 700 }}>{name(b.playerId)}</span></div></td>
                  <td className="r num muted">{b.games}</td>
                  <td className={`r num ${tone(b.net)}`}>{money(b.net, currency, { sign: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {board.length > 5 && <button className="btn block sm" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show fewer' : `Show ${board.length - 5} more`}</button>}
        </div>
        <button className="btn block" style={{ marginTop: 14 }} onClick={share}><Icon name="share" /> Share as an image</button>
      </div>

      <div className="section">
        <div className="section-head"><h2>Over time</h2><button className="btn xs" onClick={() => setEditing(!editing)}>{editing ? 'Done' : 'Choose players'}</button></div>
        {editing && (
          <div className="chips" style={{ marginBottom: 14 }}>
            {board.map((b) => <button key={b.playerId} className="chip sm" aria-pressed={cmp.includes(b.playerId)} onClick={() => setCmp(cmp.includes(b.playerId) ? cmp.filter((x) => x !== b.playerId) : [...cmp, b.playerId])}>{name(b.playerId)}</button>)}
          </div>
        )}
        <div className="card">
          <div className="tiny faint" style={{ marginBottom: 10 }}>Running total after each game</div>
          <LineChart series={cmp.map((p, i) => ({ name: p, color: SERIES_COLORS[i % SERIES_COLORS.length], values: series.map((s) => s.values[p] ?? 0) }))} />
          <div className="row wrap" style={{ gap: 14, marginTop: 12 }}>
            {cmp.map((p, i) => (
              <span key={p} className="small row" style={{ gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: SERIES_COLORS[i % SERIES_COLORS.length] }} />{name(p)}
                <b className={`num ${tone(series[series.length - 1]?.values[p] ?? 0)}`}>{money(series[series.length - 1]?.values[p] ?? 0, currency, { sign: true })}</b>
              </span>
            ))}
          </div>
          {series.length > 1 && <div className="row between tiny faint" style={{ marginTop: 8 }}><span>{shortDate(series[0].t)}</span><span>{shortDate(series[series.length - 1].t)}</span></div>}
        </div>
      </div>
    </>
  );
}
