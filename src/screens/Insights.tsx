import { useEffect, useMemo, useState } from 'react';
import { PlayerName } from '../components/players';
import { useStore, usePlayerName } from '../store';
import { go } from '../router';
import { Avatar, Caption, Cards, Delta, Disclose, Empty, Header, Help, Icon, toast, TabPill } from '../components/ui';
import { Headline, StatRows } from '../components/statRows';
import { myHands } from '../lib/style';
import { BackToBack, CountBars, LineChart, SERIES_COLORS } from '../components/charts';
import { gameFigure, playerResult } from '../lib/calc';
import { FEATURES } from '../lib/features';
import { chipsText, dateLabel, figureDelta, money, shortDate, units } from '../lib/format';
import { cumulativeSeries, filterGames, leaderboard, playerSummary, type RangeFilter, type TypeFilter } from '../lib/stats';
import { renderStandings } from '../report/reports';
import { loadReportFonts } from '../report/canvas';
import { canvasToFile, shareFiles } from '../report/share';
import { useResolvedTheme } from '../theme';
import type { Game, ID } from '../types';

const RANGES: { k: RangeFilter; label: string; long: string }[] = [
  { k: 'all', label: 'All', long: 'All Time' },
  { k: 'cy', label: 'CYTD', long: 'CYTD' },
  { k: '30d', label: 'L30D', long: 'L30D' },
];
const gap = (n: number) => ({ ['--sat-gap' as string]: `var(--sat-space-${n})` });
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '-');
const share = (a: number, b: number) => (b ? a / b : undefined);

/** Game type as two chips that turn on and off on their own: Cash and Tournaments. Both on = all games.
    One chip stays on: turning off the last one turns on the other. */
export function TypeChips({ type, setType }: { type: TypeFilter; setType: (t: TypeFilter) => void }) {
  if (!FEATURES.tournaments) return null;
  const on = { cash: type !== 'tournament', tournament: type !== 'cash' };
  const tap = (k: 'cash' | 'tournament') => setType(on[k] ? (k === 'cash' ? 'tournament' : 'cash') : 'all');
  return (
    <div className="felt-typechips" role="group" aria-label="Game types">
      <button type="button" className="sat-chip" aria-pressed={on.cash} onClick={() => tap('cash')}>Cash</button>
      <button type="button" className="sat-chip" aria-pressed={on.tournament} onClick={() => tap('tournament')}>Tournaments</button>
    </div>
  );
}

/** The filter of the Leaderboard and Stats views: game types and the period. The Players tab holds it above the sliding views,
    so it stays still when the view under it changes. */
export function FilterBar({ type, setType, range, setRange }: { type: TypeFilter; setType: (t: TypeFilter) => void; range: RangeFilter; setRange: (r: RangeFilter) => void }) {
  return (
    <div className="felt-filterbar">
      <TypeChips type={type} setType={setType} />
      <div className="felt-period-wrap">
        <div className="sat-seg sat-seg--block felt-period" role="radiogroup" aria-label="Period">
          <TabPill />
          {RANGES.map((r) => <button key={r.k} role="radio" aria-checked={range === r.k} onClick={() => setRange(r.k)}>{r.label}</button>)}
        </div>
      </div>
    </div>
  );
}

/** Stats for players. Inside the Players tab (`embedded`) the tab picks the view (Leaderboard or Stats) and holds the filter. */
export default function Insights({ initialPlayer, embedded, mode, type: typeIn, range: rangeIn, setType: setTypeIn, setRange: setRangeIn }: {
  initialPlayer?: string; embedded?: boolean; mode?: 'player' | 'standings';
  type?: TypeFilter; range?: RangeFilter; setType?: (t: TypeFilter) => void; setRange?: (r: RangeFilter) => void;
}) {
  const allGames = useStore((s) => s.games);
  const players = useStore((s) => s.players);
  const currency = useStore((s) => s.settings.currency);
  const name = usePlayerName();
  const [own, setView] = useState<'player' | 'standings'>(initialPlayer === 'standings' ? 'standings' : 'player');
  const view = embedded && mode ? mode : own;
  const [type0, setType0] = useState<TypeFilter>('all');
  const [range0, setRange0] = useState<RangeFilter>('all');
  const type = typeIn ?? type0, range = rangeIn ?? range0;
  const setType = setTypeIn ?? setType0, setRange = setRangeIn ?? setRange0;
  const games = useMemo(() => filterGames(allGames, type, range), [allGames, type, range]);
  const board = useMemo(() => leaderboard(games, players.map((p) => p.id)), [games, players]);
  const [pid, setPid] = useState<ID | undefined>(initialPlayer && initialPlayer !== 'standings' ? initialPlayer : undefined);
  // a player opened from elsewhere (Full stats on a player card) is selected, also when this view is already open
  useEffect(() => { if (initialPlayer && initialPlayer !== 'standings') setPid(initialPlayer); }, [initialPlayer]);
  const selected = pid ?? board[0]?.playerId;
  const period = RANGES.find((r) => r.k === range)!.long;
  const typeLabel = type === 'all' ? 'All Games' : type === 'cash' ? 'Cash Games' : 'Tournaments';

  const body = (
      <div className="sat-stack">
        {!embedded && (
          <div className="sat-seg sat-seg--block" role="radiogroup" aria-label="View">
            <TabPill />
            <button role="radio" aria-checked={view === 'player'} onClick={() => setView('player')}><Icon name="chart" /> Players</button>
            <button role="radio" aria-checked={view === 'standings'} onClick={() => setView('standings')}><Icon name="trophy" /> Leaderboard</button>
          </div>
        )}
        {!embedded && <FilterBar type={type} setType={setType} range={range} setRange={setRange} />}

        {games.length === 0 ? (
          <Empty title="No games found" action={range !== 'all' || type !== 'all' ? <button className="sat-btn" onClick={() => { setRange('all'); setType('all'); }}>Show all</button> : undefined}>
            Try a wider period.
          </Empty>
        ) : view === 'player' ? (
          <PlayerStats games={games} board={board} selected={selected} setPid={setPid} currency={currency} name={name} />
        ) : (
          <Standings games={games} board={board} currency={currency} name={name} scope={`${typeLabel} (${period})`} />
        )}
      </div>
  );
  if (embedded) return body;
  return (
    <div className="felt-page">
      <Header title="Stats" sub={`${typeLabel} (${period})`} />
      {body}
    </div>
  );
}

function PlayerStats({ games, board, selected, setPid, currency, name }: {
  games: Game[]; board: ReturnType<typeof leaderboard>; selected?: ID;
  setPid: (p: ID) => void; currency: string; name: (id: ID) => string;
}) {
  const me = useStore((x) => x.settings.me);
  const showMoney = useStore((x) => x.settings.showMoney);
  if (!selected) return null;
  const s = playerSummary(games, selected);
  // chips view: cash only, so a player with a tournament in view shows money
  const chipsView = !showMoney && !s.hasTournament;
  const unit = chipsView ? 'chips' : currency;
  const pick = (m: number, c: number) => (chipsView ? c : m);
  const played = games.filter((g) => g.playerIds.includes(selected));
  const withRebuy = played.filter((g) => playerResult(g, selected).buyIns > 1);
  const noRebuy = played.filter((g) => playerResult(g, selected).buyIns <= 1);
  const netOf = (gs: Game[]) => gs.reduce((a, g) => a + pick(playerResult(g, selected).net, gameFigure(g, selected).chips ?? 0), 0);
  let cum = 0;
  const cumVals = s.history.map((h) => (cum += pick(h.net, h.chips)));
  const best = s.history.reduce<{ t: number; net: number; chips: number } | null>((b, h) => (!b || pick(h.net, h.chips) > pick(b.net, b.chips) ? h : b), null);
  const plain = (m: number, c: number) => (chipsView ? units(c, { sign: true }) : money(m, '', { sign: true }));
  const signed = (m: number, c: number) => (chipsView ? `${units(c, { sign: true })} chips` : money(m, currency, { sign: true }));
  const fmt = (a: number) => (chipsView ? chipsText(a) : money(a, currency));

  return (
    <>
      <div className="felt-scroll" role="group" aria-label="Player">
        {board.map((b) => <button key={b.playerId} className="sat-chip" aria-pressed={selected === b.playerId} onClick={() => setPid(b.playerId)}>{name(b.playerId)}</button>)}
      </div>

      <section className="sat-glass sat-card sat-stack" style={gap(2)}>
        <h2 className="sat-h2">{name(selected)}</h2>
        <div className="sat-split" style={{ alignItems: 'flex-end' }}>
          <div className="sat-stack" style={gap(1)}>
            <Caption q={unit}>Net result</Caption>
            <span className="sat-kpi">{plain(s.net, s.netChips)}</span>
          </div>
          <div className="sat-stack felt-right" style={gap(1)}>
            <Caption tip="winRate">Win rate</Caption>
            <span className="sat-kpi" style={{ fontSize: '1.75rem' }}>{Math.round(s.winRate * 100)}%</span>
          </div>
        </div>
        <p className="sat-small sat-muted">{s.wins} of {s.games} games finished up.</p>
        {s.history.length > 1 && (
          <figure style={{ marginTop: 'var(--sat-space-2)' }}>
            <LineChart height={170} yTitle={`Net (${unit})`} series={[{ name: 'net', color: 'var(--sat-accent)', values: cumVals }]} />
            <figcaption className="sat-figcaption"><b>Net = {fmt(pick(s.net, s.netChips))}</b> after {s.games} games{best ? `, best ${signed(best.net, best.chips)} on ${shortDate(best.t)}` : ''}.</figcaption>
          </figure>
        )}
      </section>

      <Headline label="Key figures" items={[
        { label: 'Best game', q: unit, value: s.biggestWin > 0 ? plain(s.biggestWin, s.biggestWinChips) : '-' },
        { label: 'Worst game', q: unit, value: s.biggestLoss < 0 ? plain(s.biggestLoss, s.biggestLossChips) : '-' },
        { label: 'Per game', q: unit, value: plain(s.avg, s.avgChips) },
      ]} />
      <StatRows title="Record" rows={[
        { label: 'Streak', tip: 'streak', value: s.streak === 0 ? '-' : `${Math.abs(s.streak)} ${s.streak > 0 ? 'up' : 'down'}`, note: s.streak === 0 ? 'No streak' : `${Math.abs(s.streak)} game${Math.abs(s.streak) === 1 ? '' : 's'} in a row` },
        { label: 'Hands won', value: s.handsWon, note: `Top pot ${s.biggestPot} chips` },
        { label: 'Buy-ins per game', value: s.games ? (s.buyIns / s.games).toFixed(1) : '-', note: `${s.buyIns} in total` },
      ]} />

      {s.logged > 0 && (
        <section className="sat-stack" style={gap(3)} aria-label="Playing style">
          <div className="sat-split"><h2 className="sat-h2">Playing style</h2><span className="sat-small sat-muted">{s.logged} hands logged street by street</span></div>
          <Headline label="How this player plays" items={[
            { label: 'VPIP', tip: 'vpip', value: pct(s.vpip, s.logged) },
            { label: 'PFR', tip: 'pfr', value: pct(s.pfr, s.logged) },
            { label: 'Aggression', tip: 'aggression', value: s.style.calls ? (s.style.betsRaises / s.style.calls).toFixed(1) : s.style.betsRaises ? 'All in' : '-' },
          ]} />
          <StatRows title="Before the flop" rows={[
            { label: '3-bet', tip: 'threeBet', value: pct(s.style.threeBet, s.style.threeBetOpp), share: share(s.style.threeBet, s.style.threeBetOpp), note: `${s.style.threeBet} of ${s.style.threeBetOpp} chances` },
            { label: 'Fold to 3-bet', tip: 'fold3Bet', value: pct(s.style.fold3Bet, s.style.fold3BetOpp), share: share(s.style.fold3Bet, s.style.fold3BetOpp), note: `${s.style.fold3Bet} of ${s.style.fold3BetOpp} times 3-bet` },
            { label: 'Steal', tip: 'steal', value: pct(s.style.steal, s.style.stealOpp), share: share(s.style.steal, s.style.stealOpp), note: `${s.style.steal} of ${s.style.stealOpp} chances` },
            { label: 'BB defend', tip: 'bbDefend', value: pct(s.style.bbDefend, s.style.bbDefendOpp), share: share(s.style.bbDefend, s.style.bbDefendOpp), note: `${s.style.bbDefend} of ${s.style.bbDefendOpp} raises faced` },
          ]} />
          <StatRows title="After the flop" rows={[
            { label: 'Saw flop', value: pct(s.sawFlop, s.logged), share: share(s.sawFlop, s.logged), note: `${s.sawFlop} of ${s.logged} hands` },
            { label: 'C-bet', tip: 'cbet', value: pct(s.style.cbet, s.style.cbetOpp), share: share(s.style.cbet, s.style.cbetOpp), note: `${s.style.cbet} of ${s.style.cbetOpp} chances` },
            { label: 'Fold to c-bet', tip: 'foldCbet', value: pct(s.style.foldCbet, s.style.foldCbetOpp), share: share(s.style.foldCbet, s.style.foldCbetOpp), note: `${s.style.foldCbet} of ${s.style.foldCbetOpp} c-bets faced` },
          ]} />
          <StatRows title="Showdown" rows={[
            { label: 'Went to showdown', tip: 'wtsd', value: pct(s.wtsd, s.sawFlop), share: share(s.wtsd, s.sawFlop), note: `${s.wtsd} of ${s.sawFlop} flops` },
            { label: 'Won at showdown', tip: 'wsd', value: pct(s.wsd, s.wtsd), share: share(s.wsd, s.wtsd), note: `${s.wsd} of ${s.wtsd} showdowns` },
          ]} />
        </section>
      )}

      {s.logged > 0 && (
        <section className="sat-glass sat-card sat-stack" style={gap(3)}>
          <div className="sat-split"><h2 className="sat-h3">Where hands were won</h2><Help k="wonAt" /></div>
          <CountBars unit="hands" title="Stage" rows={[
            { label: 'Pre-flop', value: s.wonAt.preflop }, { label: 'Flop', value: s.wonAt.flop }, { label: 'Turn', value: s.wonAt.turn },
            { label: 'River', value: s.wonAt.river }, { label: 'Showdown', value: s.wonAt.showdown },
          ]} />
          <p className="sat-small"><b>Showdown = {s.wonAt.showdown} of {Object.values(s.wonAt).reduce((a, b) => a + b, 0)} hands won.</b> All other players folded in the rest.</p>
        </section>
      )}

      {(s.flow.winFold + s.flow.winShowdown + s.flow.winOther + s.flow.lossFold + s.flow.lossShowdown + s.flow.lossOther) > 0 && (() => {
        const f = s.flow;
        const net = f.winFold + f.winShowdown + f.winOther - f.lossFold - f.lossShowdown - f.lossOther;
        return (
          <section className="sat-glass sat-card sat-stack" style={gap(3)}>
            <div className="sat-split"><h2 className="sat-h3">Chips won and lost</h2><Help k="flow" /></div>
            <BackToBack unit="chips" format={(v) => units(v)} rows={[
              { label: 'Folds', win: f.winFold, loss: f.lossFold },
              { label: 'Showdown', win: f.winShowdown, loss: f.lossShowdown },
              { label: 'Others', win: f.winOther, loss: f.lossOther },
            ]} />
            <p className="sat-small"><b>Net = {net > 0 ? '+' : ''}{units(net)} chips</b> (logged hands, 7-2 bounties, chip moves).</p>
          </section>
        );
      })()}

      {me === selected && <YourHands games={games} me={selected} />}

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
                <Delta {...figureDelta(gameFigure(g, selected), showMoney)} />
              </button>
            );
          })}
        </div>
      </section>

    </>
  );
}

function Standings({ games, board, currency, name, scope }: {
  games: Game[]; board: ReturnType<typeof leaderboard>; currency: string; name: (id: ID) => string; scope: string;
}) {
  const pref = useStore((s) => s.settings.theme);
  const showMoney = useStore((s) => s.settings.showMoney);
  const look = useResolvedTheme(pref);
  const [showAll, setShowAll] = useState(false);
  const [cmp, setCmp] = useState<ID[]>(() => board.slice(0, 3).map((b) => b.playerId));
  const [editing, setEditing] = useState(false);
  // chips view: cash only, so any tournament in view keeps the whole table in money
  const chipsView = !showMoney && !games.some((g) => g.type === 'tournament');
  const unit = chipsView ? 'chips' : currency;
  const series = cumulativeSeries(games, cmp, chipsView);
  const lastVals = series[series.length - 1]?.values ?? {};
  const leader = [...cmp].sort((a, b) => (lastVals[b] ?? 0) - (lastVals[a] ?? 0))[0];
  const fmt = (a: number) => (chipsView ? chipsText(a) : money(a, currency));
  const signed = (a: number) => (chipsView ? `${units(a, { sign: true })} chips` : money(a, currency, { sign: true }));
  const row = (b: (typeof board)[number], i: number) => (
    <tr key={b.playerId} onClick={() => go(`players/stats/${b.playerId}`)} style={{ cursor: 'pointer' }}>
      <td><span className="sat-cluster" style={gap(2)}><span className="sat-mono sat-muted" style={{ width: 14 }}>{i + 1}</span><Avatar name={name(b.playerId)} size="sm" /><span style={{ fontWeight: 600 }}><PlayerName id={b.playerId} /></span></span></td>
      <td className="n">{b.games}</td>
      <td className="n"><Delta value={chipsView ? b.netChips : b.net} format={(a) => (chipsView ? chipsText(a) : money(a, ''))} /></td>
    </tr>
  );

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
          <table className="sat-table felt-board-table">
            <colgroup><col /><col className="is-games" /><col className="is-net" /></colgroup>
            <thead><tr><th>Player</th><th className="n">Games</th><th className="n">Net <span className="sat-qual">({unit})</span></th></tr></thead>
            <tbody>{board.slice(0, 5).map(row)}</tbody>
          </table>
          {/* the rest open out of the table, row by row, instead of appearing */}
          <Disclose open={showAll}>
            <table className="sat-table felt-board-table felt-board-table--more">
              <colgroup><col /><col className="is-games" /><col className="is-net" /></colgroup>
              <tbody>{board.slice(5).map((b, i) => row(b, i + 5))}</tbody>
            </table>
          </Disclose>
        </div>
        {board.length > 5 && (
          <button className="sat-btn sat-btn--ghost felt-board-more" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>
            {showAll ? 'Show top 5' : `Show ${board.length} players`}
            <span className="felt-board-arrow" aria-hidden="true"><Icon name="chevron" size={18} /></span>
          </button>
        )}
      </section>

      <section className="sat-glass sat-card sat-stack" style={gap(3)}>
        <div className="sat-card-head" style={{ marginBottom: 0 }}>
          <h2 className="sat-h2">Over time</h2>
          <button className="sat-btn sat-btn--ghost sat-btn--sm" onClick={() => setEditing(!editing)}>{editing ? 'Done' : 'Choose players'}</button>
        </div>
        <Disclose open={editing}>
          <div className="sat-cluster" style={gap(2)}>
            {board.map((b) => <button key={b.playerId} className="sat-chip" aria-pressed={cmp.includes(b.playerId)} onClick={() => setCmp(cmp.includes(b.playerId) ? cmp.filter((x) => x !== b.playerId) : [...cmp, b.playerId])}>{name(b.playerId)}</button>)}
          </div>
        </Disclose>
        <figure>
          <LineChart yTitle={`Net (${unit})`} series={cmp.map((p, i) => ({ name: p, color: SERIES_COLORS[i % SERIES_COLORS.length], values: series.map((s) => s.values[p] ?? 0) }))} />
          <div className="sat-cluster sat-small" style={{ ...gap(4), marginTop: 'var(--sat-space-3)' }}>
            {cmp.map((p, i) => (
              <span key={p} className="sat-cluster" style={gap(2)}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: SERIES_COLORS[i % SERIES_COLORS.length] }} />{name(p)}
                <Delta value={lastVals[p] ?? 0} format={fmt} />
              </span>
            ))}
          </div>
          {leader && <figcaption className="sat-figcaption"><b>Leader = <PlayerName id={leader} /> ({signed(lastVals[leader] ?? 0)})</b> over {series.length} games{series.length > 1 ? `, ${shortDate(series[0].t)} to ${shortDate(series[series.length - 1].t)}` : ''}.</figcaption>}
        </figure>
      </section>
    </>
  );
}

/** The phone owner's own hands (My cards), shown or not: bluff rate and a list to review each decision. */
function YourHands({ games, me }: { games: Game[]; me: ID }) {
  const check = useStore((s) => s.settings.checkCards !== false);
  const list = myHands(games, me, check);
  if (!list.length) {
    return (
      <section className="sat-flat sat-card sat-stack" style={gap(2)}>
        <div className="sat-split"><h2 className="sat-h3">Your hands</h2><Help k="myHands" /></div>
        <p className="sat-small sat-muted">No hands with My cards yet. In the recorder, tap My cards at any point in a hand.</p>
      </section>
    );
  }
  const n = (f: (h: (typeof list)[number]) => boolean) => list.filter(f).length;
  const bluffs = n((h) => h.bluff), aggr = n((h) => h.aggressive), semis = n((h) => h.semi);
  return (
    <section className="sat-stack" style={gap(3)} aria-label="Your hands">
      <div className="sat-split"><h2 className="sat-h2">Your hands</h2><Help k="myHands" /></div>
      <Headline label="Your hands" items={[
        { label: 'Bluff rate', value: pct(bluffs, aggr), note: `${bluffs} of ${aggr} hands with a bet or raise` },
        { label: 'Bluffs won', value: pct(n((h) => h.bluff && h.won), bluffs), note: `${n((h) => h.bluff && h.won)} of ${bluffs} bluffs` },
        { label: 'Net', q: 'chips', value: units(list.reduce((a, h) => a + h.net, 0), { sign: true }), note: `${list.length} hands tracked` },
      ]} />
      <p className="sat-small sat-muted">{n((h) => h.vpip)} played, {n((h) => h.won)} won{semis > 0 ? `. ${semis} more ${semis === 1 ? 'was a semi-bluff (a bet or raise with a strong draw)' : 'were semi-bluffs (bets or raises with a strong draw)'}, not counted.` : '.'}</p>
      <div className="sat-glass-2 felt-list">
        {[...list].reverse().slice(0, 40).map((h) => (
          <button key={h.handId} className="felt-row" onClick={() => go(`game/${h.gameId}/hand/${h.handId}`)}>
            <span className="sat-mono sat-small sat-muted" style={{ width: 24 }}>{h.n}</span>
            <Cards cards={h.cards} size="sm" />
            <div className="felt-row-main">
              <div className="felt-row-sub">{[h.pfr ? 'Raised pre-flop' : h.vpip ? 'Played' : 'Folded pre-flop', h.bluff ? 'Bluff' : h.aggressive ? 'Bet with a hand' : '', h.showdown ? 'Showdown' : ''].filter(Boolean).join(', ')}</div>
            </div>
            <Delta value={h.net} format={(a) => units(a)} />
          </button>
        ))}
      </div>
    </section>
  );
}
