import { useStore, usePlayerName } from '../store';
import { go } from '../router';
import { Caption, Delta, Empty, Header, Help, Icon, ThemeCycle, useTick } from '../components/ui';
import { gameResults, openTransfers, playerStatus, totalBuyInUnits, totalPotMoney } from '../lib/calc';
import { buyInsEquivalent, duration, money, shortDate, stakesLabel } from '../lib/format';
import { filterGames, leaderboard } from '../lib/stats';

export default function Home() {
  useTick();
  const games = useStore((s) => s.games);
  const players = useStore((s) => s.players);
  const currency = useStore((s) => s.settings.currency);
  const name = usePlayerName();
  const live = games.filter((g) => g.status === 'live');
  const closed = games.filter((g) => g.status === 'closed').sort((a, b) => b.startedAt - a.startedAt);
  const open = closed.flatMap((g) => openTransfers(g).map((t) => ({ g, t })));
  const openTotal = open.reduce((a, x) => a + x.t.amount, 0);
  const allClosed = filterGames(games, 'all', 'all');
  const board = leaderboard(allClosed, players.map((p) => p.id)).slice(0, 3);
  const fmt = (c: string) => (a: number) => money(a, c);

  return (
    <div className="felt-page">
      <Header brand sub="Home Game Tracker" right={<ThemeCycle />} />
      <div className="sat-stack">
        {live.map((g) => {
          const seated = g.playerIds.filter((p) => playerStatus(g, p) !== 'out').length;
          return (
            <button key={g.id} className="sat-glass sat-card sat-stack" style={{ textAlign: 'left', ['--sat-gap' as string]: 'var(--sat-space-2)' }} onClick={() => go(`game/${g.id}`)}>
              <Caption q={duration(Date.now() - g.startedAt)}><span className="felt-dot" />Live</Caption>
              <h2 className="sat-h2">{g.name}</h2>
              <p className="sat-small sat-muted">{stakesLabel(g)}</p>
              <div className="sat-split" style={{ alignItems: 'flex-end', marginTop: 4 }}>
                <div className="sat-stack" style={{ ['--sat-gap' as string]: 'var(--sat-space-1)' }}>
                  {g.type === 'cash' ? <Caption q="buy-ins">In play</Caption> : <Caption q={g.currency}>Prize pool</Caption>}
                  <span className="sat-kpi">{g.type === 'cash' ? buyInsEquivalent(g, totalBuyInUnits(g)) : money(totalPotMoney(g), '')}</span>
                </div>
                <span className="sat-small sat-muted">{seated} playing, {g.hands.length} hands</span>
              </div>
            </button>
          );
        })}

        <div className="sat-cluster" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)' }}>
          <button className="sat-btn sat-btn--primary sat-btn--lg felt-grow" onClick={() => go('new/cash')}><Icon name="plus" /> Start cash game</button>
          <button className="sat-btn sat-btn--lg felt-grow" onClick={() => go('new/tournament')}><Icon name="trophy" /> Start tournament</button>
        </div>

        {open.length > 0 && (
          <section className="sat-stack" style={{ ['--sat-gap' as string]: 'var(--sat-space-3)', marginTop: 'var(--sat-space-4)' }}>
            <div className="sat-split">
              <h2 className="sat-h2">Unpaid <Help k="payments" /></h2>
              <span className="sat-num" style={{ fontWeight: 600 }}>{money(openTotal, currency)}</span>
            </div>
            <div className="sat-glass-2 felt-list">
              {open.slice(0, 5).map(({ g, t }) => (
                <button key={t.id} className="felt-row" onClick={() => go(`game/${g.id}/close`)}>
                  <div className="felt-row-main">
                    <div className="felt-row-title">{name(t.from)} pays {name(t.to)}</div>
                    <div className="felt-row-sub">{g.name}, {shortDate(g.startedAt)}</div>
                  </div>
                  <span className="sat-num">{money(t.amount, g.currency)}</span>
                </button>
              ))}
            </div>
            {open.length > 5 && <p className="sat-small sat-muted">{open.length - 5} more in Games.</p>}
          </section>
        )}

        {board.length > 0 && (
          <section className="sat-stack" style={{ ['--sat-gap' as string]: 'var(--sat-space-3)', marginTop: 'var(--sat-space-4)' }}>
            <div className="sat-split">
              <h2 className="sat-h2">Leaderboard</h2>
              <a className="sat-small" href="#/insights/standings">Show all</a>
            </div>
            <div className="sat-glass-2 felt-list">
              {board.map((s, i) => (
                <div key={s.playerId} className="felt-row">
                  <span className="sat-mono sat-muted" style={{ width: 16 }}>{i + 1}</span>
                  <div className="felt-row-main">
                    <div className="felt-row-title">{name(s.playerId)}</div>
                    <div className="felt-row-sub">{s.games} games</div>
                  </div>
                  <Delta value={s.net} format={fmt(currency)} />
                </div>
              ))}
            </div>
            <p className="sat-source">Source: Felt game log ({allClosed.length} closed games). Net result in {currency}.</p>
          </section>
        )}

        <section className="sat-stack" style={{ ['--sat-gap' as string]: 'var(--sat-space-3)', marginTop: 'var(--sat-space-4)' }}>
          <div className="sat-split">
            <h2 className="sat-h2">Recent games</h2>
            {closed.length > 0 && <a className="sat-small" href="#/games">Show all</a>}
          </div>
          {closed.length === 0 && <Empty title="No games yet">Start a cash game or tournament to begin the record.</Empty>}
          {closed.slice(0, 4).map((g) => {
            const top = gameResults(g)[0];
            return (
              <button key={g.id} className="sat-glass sat-card" style={{ textAlign: 'left' }} onClick={() => go(`game/${g.id}/close`)}>
                <div className="sat-split">
                  <div style={{ minWidth: 0 }}>
                    <h3 className="sat-h3">{g.name}</h3>
                    <p className="sat-small sat-muted">{shortDate(g.startedAt)}, {g.playerIds.length} players, {g.hands.length} hands</p>
                  </div>
                  {top && (
                    <div className="felt-right">
                      <div className="sat-small" style={{ fontWeight: 600 }}>{name(top.playerId)}</div>
                      <Delta value={top.net} format={fmt(g.currency)} />
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </section>
      </div>
    </div>
  );
}
