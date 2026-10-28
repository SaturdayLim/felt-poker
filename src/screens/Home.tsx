import { useStore, usePlayerName } from '../store';
import { go } from '../router';
import { Delta, Empty, Header, Icon, SourceTip, ThemeCycle, useTick } from '../components/ui';
import { gameResults, playerStatus } from '../lib/calc';
import { duration, money, shortDate } from '../lib/format';
import { filterGames, leaderboard } from '../lib/stats';

/* Home: what is happening now (live games), how to start one, and a short look back.
   Payments live with each game and each group, not here. */
export default function Home() {
  useTick();
  const games = useStore((s) => s.games);
  const players = useStore((s) => s.players);
  const currency = useStore((s) => s.settings.currency);
  const name = usePlayerName();
  const live = games.filter((g) => g.status === 'live');
  const closed = games.filter((g) => g.status === 'closed').sort((a, b) => b.startedAt - a.startedAt);
  const allClosed = filterGames(games, 'all', 'all');
  const board = leaderboard(allClosed, players.map((p) => p.id)).slice(0, 3);

  return (
    <div className="felt-page">
      <Header brand sub="Home Game Tracker" right={<ThemeCycle />} />
      <div className="sat-stack">
        {live.map((g) => {
          const seated = g.playerIds.filter((p) => playerStatus(g, p) !== 'out').length;
          return (
            <button key={g.id} className="sat-glass sat-card felt-live-card" onClick={() => go(`game/${g.id}`)}>
              <span className="felt-live-tag"><span className="felt-dot felt-dot--pulse" />Live, {duration(Date.now() - g.startedAt)}</span>
              <span className="felt-live-name">{g.name}</span>
              <span className="sat-small sat-muted">{seated} playing, {g.hands.length} hands</span>
              <span className="felt-live-go" aria-hidden="true"><Icon name="back" /></span>
            </button>
          );
        })}

        <div className="felt-start">
          <button className={`sat-btn ${live.length ? '' : 'sat-btn--primary'}`} onClick={() => go('new/cash')}><Icon name="plus" /> Cash game</button>
          <button className="sat-btn" onClick={() => go('new/tournament')}><Icon name="trophy" /> Tournament</button>
        </div>

        {board.length > 0 && (
          <section className="felt-section">
            <div className="sat-split">
              <h2 className="sat-h3">Leaderboard <SourceTip>Felt game log ({allClosed.length} closed games). Net result in {currency}.</SourceTip></h2>
              <a className="sat-small" href="#/insights/standings">Show all</a>
            </div>
            <div className="sat-glass-2 felt-list">
              {board.map((s, i) => (
                <button key={s.playerId} className="felt-row felt-row--slim" onClick={() => go(`insights/${s.playerId}`)}>
                  <span className="sat-mono sat-muted" style={{ width: 16 }}>{i + 1}</span>
                  <span className="felt-row-main felt-row-title">{name(s.playerId)}</span>
                  <Delta value={s.net} format={(a) => money(a, currency)} />
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="felt-section">
          <div className="sat-split">
            <h2 className="sat-h3">Recent games</h2>
            {closed.length > 3 && <a className="sat-small" href="#/games">Show all</a>}
          </div>
          {closed.length === 0 && live.length === 0 && <Empty title="No games yet">Start a cash game or tournament to begin the record.</Empty>}
          {closed.length === 0 && live.length > 0 && <p className="sat-small sat-muted">Closed games appear here.</p>}
          {closed.length > 0 && (
            <div className="sat-glass-2 felt-list">
              {closed.slice(0, 3).map((g) => {
                const top = gameResults(g)[0];
                return (
                  <button key={g.id} className="felt-row felt-row--slim" onClick={() => go(`game/${g.id}/close`)}>
                    <div className="felt-row-main">
                      <div className="felt-row-title felt-ellipsis">{g.name}</div>
                      <div className="felt-row-sub">{shortDate(g.startedAt)}{top ? `, top: ${name(top.playerId)}` : ''}</div>
                    </div>
                    {top && <Delta value={top.net} format={(a) => money(a, g.currency)} />}
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
