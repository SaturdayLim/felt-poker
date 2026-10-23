import { useMemo, useState } from 'react';
import { useStore, usePlayerName } from '../store';
import { go } from '../router';
import { Avatar, Empty, Icon, toast } from '../components/ui';
import { LineChart, SERIES_COLORS } from '../components/charts';
import { playerResult } from '../lib/calc';
import { money, shortDate } from '../lib/format';
import { cumulativeSeries, filterGames, groupTotals, leaderboard, playerSummary, type RangeFilter, type TypeFilter } from '../lib/stats';
import { renderStandings } from '../report/reports';
import { canvasToFile, shareFiles } from '../report/share';
import type { ID } from '../types';

const RANGES: { k: RangeFilter; label: string }[] = [
  { k: 'all', label: 'All time' }, { k: 'year', label: 'This year' }, { k: '90d', label: 'Last 90 days' }, { k: '30d', label: 'Last 30 days' },
];

export default function Insights({ initialPlayer }: { initialPlayer?: string }) {
  const allGames = useStore((s) => s.games);
  const players = useStore((s) => s.players);
  const currency = useStore((s) => s.settings.currency);
  const name = usePlayerName();
  const [view, setView] = useState<'insights' | 'standings'>(initialPlayer === 'standings' ? 'standings' : 'insights');
  const [type, setType] = useState<TypeFilter>('all');
  const [range, setRange] = useState<RangeFilter>('all');
  const games = useMemo(() => filterGames(allGames, type, range), [allGames, type, range]);
  const board = useMemo(() => leaderboard(games, players.map((p) => p.id)), [games, players]);
  const [pid, setPid] = useState<ID | undefined>(initialPlayer && initialPlayer !== 'standings' ? initialPlayer : undefined);
  const selected = pid ?? board[0]?.playerId;
  const rangeLabel = RANGES.find((r) => r.k === range)!.label;

  return (
    <div className="screen">
      <div className="page-title" style={{ paddingBottom: 10 }}>
        <div className="eyebrow">Performance</div>
        <h1>Insights</h1>
        <p>Stats and trends across every closed game.</p>
      </div>

      <div className="seg">
        <button className={view === 'insights' ? 'on' : ''} onClick={() => setView('insights')}><Icon name="chart" /> Insights</button>
        <button className={view === 'standings' ? 'on' : ''} onClick={() => setView('standings')}><Icon name="trophy" /> All-time standings</button>
      </div>
      <div className="seg" style={{ marginTop: 10 }}>
        {(['all', 'cash', 'tournament'] as const).map((t) => (
          <button key={t} className={type === t ? 'on' : ''} onClick={() => setType(t)}>{t === 'all' ? 'All' : t === 'cash' ? 'Cash' : 'Tournament'}</button>
        ))}
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <div className="input-wrap" style={{ width: 170 }}>
          <span className="prefix" style={{ display: 'inline-flex' }}><Icon name="calendar" size={16} /></span>
          <select className="input" style={{ height: 40, fontSize: 14, paddingLeft: 38 }} value={range} onChange={(e) => setRange(e.target.value as RangeFilter)}>
            {RANGES.map((r) => <option key={r.k} value={r.k}>{r.label}</option>)}
          </select>
        </div>
        <span className="small muted">{games.length} game{games.length === 1 ? '' : 's'}</span>
      </div>

      {games.length === 0 ? (
        <div className="section"><Empty icon="chart">No closed games in this range yet.</Empty></div>
      ) : view === 'insights' ? (
        <PlayerInsights games={games} board={board} selected={selected} setPid={setPid} currency={currency} rangeLabel={rangeLabel} name={name} />
      ) : (
        <Standings games={games} board={board} currency={currency} name={name} rangeLabel={rangeLabel} type={type} />
      )}
    </div>
  );
}

function PlayerInsights({ games, board, selected, setPid, currency, rangeLabel, name }: {
  games: ReturnType<typeof filterGames>; board: ReturnType<typeof leaderboard>; selected?: ID;
  setPid: (p: ID) => void; currency: string; rangeLabel: string; name: (id: ID) => string;
}) {
  if (!selected) return null;
  const s = playerSummary(games, selected);
  const played = games.filter((g) => g.playerIds.includes(selected));
  // How rebuys play out: compare games with rebuys to games without
  const withRebuy = played.filter((g) => playerResult(g, selected).buyIns > 1);
  const noRebuy = played.filter((g) => playerResult(g, selected).buyIns <= 1);
  const netOf = (gs: typeof games) => gs.reduce((a, g) => a + playerResult(g, selected).net, 0);
  const totals = groupTotals(games);
  let cum = 0;
  const cumVals = s.history.map((h) => (cum += h.net));

  return (
    <>
      <div className="chips" style={{ flexWrap: 'nowrap', overflowX: 'auto', marginTop: 14, paddingBottom: 2 }}>
        {board.map((b) => (
          <button key={b.playerId} className={`chip ${selected === b.playerId ? 'on' : ''}`} style={{ flex: 'none' }} onClick={() => setPid(b.playerId)}>{name(b.playerId)}</button>
        ))}
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="row between" style={{ alignItems: 'flex-start' }}>
          <div>
            <div className="label">{name(selected)} · net · {rangeLabel}</div>
            <div className={`hero-num ${s.net >= 0 ? 'pos' : 'neg'}`} style={{ fontSize: 44 }}>{money(s.net, currency, { sign: true })}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="big-num" style={{ fontSize: 24 }}>{s.wins}-{s.games - s.wins}</div>
            <div className="tiny muted">wins - non-wins</div>
          </div>
        </div>
        <div className="kpis" style={{ marginTop: 14 }}>
          <div><div className="v">{s.games}</div><div className="label">Games</div></div>
          <div><div className="v">{s.wins}</div><div className="label">Wins</div></div>
          <div><div className="v">{Math.round(s.winRate * 100)}%</div><div className="label">Win rate</div></div>
        </div>
        <div className="tiny muted center" style={{ marginTop: 10 }}>A win is a game you finished up: you left with more than you put in.</div>
        {s.history.length > 1 && <div style={{ marginTop: 12 }}><LineChart height={110} series={[{ name: 'net', color: s.net >= 0 ? '#5ee3a1' : '#f0616d', values: cumVals }]} /></div>}
      </div>

      <div className="stat-grid" style={{ marginTop: 12 }}>
        <div className="stat"><div className="label pos row" style={{ gap: 5 }}><Icon name="up" size={13} />Biggest win</div><div className="v pos">{s.biggestWin > 0 ? money(s.biggestWin, currency, { sign: true }) : '—'}</div><div className="d">Best single game</div></div>
        <div className="stat"><div className="label neg row" style={{ gap: 5 }}><Icon name="down" size={13} />Biggest loss</div><div className="v neg">{s.biggestLoss < 0 ? money(s.biggestLoss, currency, { sign: true }) : '—'}</div><div className="d">Worst single game</div></div>
        <div className="stat"><div className="label">Avg per game</div><div className={`v ${s.avg >= 0 ? 'pos' : 'neg'}`}>{money(s.avg, currency, { sign: true })}</div><div className="d">Total result ÷ games played</div></div>
        <div className="stat"><div className="label row" style={{ gap: 5 }}><Icon name="flame" size={13} />Current streak</div><div className="v">{s.streak === 0 ? '—' : `${Math.abs(s.streak)} ${s.streak > 0 ? 'win' : 'loss'}${Math.abs(s.streak) === 1 ? '' : s.streak > 0 ? 's' : 'es'}`}</div><div className="d">Games in a row up or down, up to the latest</div></div>
        <div className="stat"><div className="label">Hands won</div><div className="v">{s.handsWon}</div><div className="d">Biggest pot won: {s.biggestPot} u</div></div>
        <div className="stat"><div className="label">Buy-ins / game</div><div className="v">{s.games ? (s.buyIns / s.games).toFixed(1) : '—'}</div><div className="d">{s.buyIns} total buy-ins or entries</div></div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="label">How rebuys play out</div>
        <div className="grid2" style={{ marginTop: 10 }}>
          <div><div className="tiny muted">Games with a rebuy · {withRebuy.length}</div><div className={`big-num ${netOf(withRebuy) >= 0 ? 'pos' : 'neg'}`} style={{ fontSize: 22 }}>{money(netOf(withRebuy), currency, { sign: true })}</div></div>
          <div><div className="tiny muted">Single buy-in · {noRebuy.length}</div><div className={`big-num ${netOf(noRebuy) >= 0 ? 'pos' : 'neg'}`} style={{ fontSize: 22 }}>{money(netOf(noRebuy), currency, { sign: true })}</div></div>
        </div>
      </div>

      <div className="section">
        <div className="section-head"><h2>Game log</h2><span className="small muted">{played.length}</span></div>
        <div className="card flat" style={{ padding: '4px 14px' }}>
          {[...played].reverse().map((g) => {
            const r = playerResult(g, selected);
            return (
              <button key={g.id} className="list-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => go(`game/${g.id}/close`)}>
                <div className="grow"><div style={{ fontWeight: 600 }}>{g.name}</div><div className="tiny muted">{shortDate(g.startedAt)} · {r.buyIns} buy-in{r.buyIns === 1 ? '' : 's'}{r.place ? ` · #${r.place}` : ''}</div></div>
                <span className={r.net >= 0 ? 'pos' : 'neg'} style={{ fontWeight: 700 }}>{money(r.net, g.currency, { sign: true })}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="section">
        <div className="section-head"><h2>Group totals</h2></div>
        <div className="stat-grid">
          <div className="stat"><div className="label">Games</div><div className="v">{totals.games}</div></div>
          <div className="stat"><div className="label">Hands logged</div><div className="v">{totals.hands}</div></div>
          <div className="stat"><div className="label">Biggest pot</div><div className="v">{totals.biggestPot} u</div></div>
          <div className="stat"><div className="label">Money won</div><div className="v">{money(totals.moneyMoved, currency)}</div><div className="d">Sum of all winning results</div></div>
        </div>
      </div>
    </>
  );
}

function Standings({ games, board, currency, name, rangeLabel, type }: {
  games: ReturnType<typeof filterGames>; board: ReturnType<typeof leaderboard>; currency: string;
  name: (id: ID) => string; rangeLabel: string; type: TypeFilter;
}) {
  const [showAll, setShowAll] = useState(false);
  const [cmp, setCmp] = useState<ID[]>(() => board.slice(0, 3).map((b) => b.playerId));
  const [editing, setEditing] = useState(false);
  const shown = showAll ? board : board.slice(0, 5);
  const series = cumulativeSeries(games, cmp);

  const share = async () => {
    try {
      const canvases = renderStandings(games, board, name, currency, `${rangeLabel}${type === 'all' ? '' : ` · ${type}`}`);
      const files = await Promise.all(canvases.map((c, i) => canvasToFile(c, `standings-${new Date().toLocaleDateString('en-CA')}${canvases.length > 1 ? `-${i + 1}` : ''}.png`)));
      const r = await shareFiles(files, 'All-time standings');
      if (r === 'downloaded') toast('Saved to downloads');
    } catch (e) {
      toast(`Could not share: ${(e as Error).message}`);
    }
  };

  return (
    <>
      <button className="card tap row" style={{ display: 'flex', marginTop: 14, borderColor: 'rgba(94,227,161,.35)' }} onClick={share}>
        <span className="avatar" style={{ background: 'var(--mint)', color: 'var(--mint-ink)', borderRadius: 10 }}><Icon name="share" size={18} /></span>
        <div className="grow"><div style={{ fontWeight: 700 }}>Share standings</div><div className="tiny muted">Send the group leaderboard as an image</div></div>
        <span style={{ display: 'inline-flex', transform: 'rotate(180deg)' }}><Icon name="back" size={16} /></span>
      </button>

      <div className="section">
        <div className="tiny muted">Season leaders · {rangeLabel}</div>
        <div className="section-head"><h2>Leaderboard</h2><span className="small muted">{board.length} players</span></div>
        <div className="card flat" style={{ padding: '0 10px' }}>
          <table className="table">
            <thead><tr><th>Player</th><th className="r">Games</th><th className="r">Profit</th></tr></thead>
            <tbody>
              {shown.map((b, i) => (
                <tr key={b.playerId} onClick={() => go(`insights/${b.playerId}`)}>
                  <td><div className="row" style={{ gap: 8 }}><span className="mono muted" style={{ width: 16 }}>{i + 1}</span><Avatar name={name(b.playerId)} size="sm" /><span style={{ fontWeight: 650 }}>{name(b.playerId)}</span></div></td>
                  <td className="r muted">{b.games}</td>
                  <td className={`r ${b.net >= 0 ? 'pos' : 'neg'}`} style={{ fontWeight: 700 }}>{money(b.net, currency, { sign: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {board.length > 5 && <button className="btn ghost block sm" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show less' : `Show ${board.length - 5} more`}</button>}
        </div>
      </div>

      <div className="section">
        <div className="section-head"><h2>Performance comparison</h2></div>
        <div className="small muted" style={{ marginTop: -4, marginBottom: 10 }}>Cumulative results over time for selected players.</div>
        <div className="card flat">
          <div className="row between">
            <div><div className="small" style={{ fontWeight: 600 }}>Players in chart</div><div className="tiny muted">{cmp.map(name).join(', ') || 'None'}</div></div>
            <button className="btn xs" onClick={() => setEditing(!editing)}>{editing ? 'Done' : 'Edit'}</button>
          </div>
          {editing && (
            <div className="chips" style={{ marginTop: 10 }}>
              {board.map((b) => <button key={b.playerId} className={`chip ${cmp.includes(b.playerId) ? 'on' : ''}`} onClick={() => setCmp(cmp.includes(b.playerId) ? cmp.filter((x) => x !== b.playerId) : [...cmp, b.playerId])}>{name(b.playerId)}</button>)}
            </div>
          )}
          <div style={{ marginTop: 14 }}>
            <LineChart series={cmp.map((p, i) => ({ name: p, color: SERIES_COLORS[i % SERIES_COLORS.length], values: series.map((s) => s.values[p] ?? 0) }))} />
          </div>
          <div className="row wrap" style={{ gap: 12, marginTop: 10 }}>
            {cmp.map((p, i) => (
              <span key={p} className="small row" style={{ gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: SERIES_COLORS[i % SERIES_COLORS.length] }} />{name(p)}
                <b className={(series[series.length - 1]?.values[p] ?? 0) >= 0 ? 'pos' : 'neg'}>{money(series[series.length - 1]?.values[p] ?? 0, currency, { sign: true })}</b>
              </span>
            ))}
          </div>
          {series.length > 1 && <div className="row between tiny faint" style={{ marginTop: 8 }}><span>{shortDate(series[0].t)}</span><span>{shortDate(series[series.length - 1].t)}</span></div>}
        </div>
      </div>
    </>
  );
}
