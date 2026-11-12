import { useStore, usePlayerName } from '../store';
import { go } from '../router';
import { PlayerName, openPlayer } from '../components/players';
import { Delta, Empty, Header, Icon, useTick } from '../components/ui';
import { gameResults, playerStatus } from '../lib/calc';
import { figureDelta, gameCaptionNarrow, runningLabel, runningMs } from '../lib/format';
import { filterGames, leaderboard, summaryFigure } from '../lib/stats';
import { gameFigure } from '../lib/calc';
import { FEATURES } from '../lib/features';

/* Home: what is happening now (live games), how to start one, and a short look back.
   Payments live with each game and each group, not here. */
export default function Home() {
  useTick();
  const games = useStore((s) => s.games);
  const players = useStore((s) => s.players);
  const groups = useStore((s) => s.groups);
  const currency = useStore((s) => s.settings.currency);
  const showMoney = useStore((s) => s.settings.showMoney);
  const name = usePlayerName();
  const live = games.filter((g) => g.status === 'live');
  const closed = games.filter((g) => g.status === 'closed').sort((a, b) => b.startedAt - a.startedAt);
  const allClosed = filterGames(games, 'all', 'all');
  const board = leaderboard(allClosed, players.map((p) => p.id)).slice(0, 3);

  return (
    <div className="felt-page">
      <Header brand banner="Felt" right={<><button type="button" className="felt-joinbtn" data-press="select" onClick={() => go('join')} aria-label="Join a game with the camera"><Icon name="qr" /></button></>} />
      <div className="sat-stack">
        {live.map((g) => {
          const seated = g.playerIds.filter((p) => playerStatus(g, p) !== 'out').length;
          return (
            <button key={g.id} className="sat-glass sat-card felt-live-card" onClick={() => go(`game/${g.id}`)}>
              <span className="felt-live-name"><span className="felt-dot felt-dot--pulse" />{g.name}</span>
              <span className="sat-small sat-muted">Live{runningMs(g) === null ? '' : `, ${runningLabel(g)}`}, {seated} playing, {g.hands.length} hand{g.hands.length === 1 ? '' : 's'}</span>
              <span className="felt-live-go" aria-hidden="true"><Icon name="back" /></span>
            </button>
          );
        })}

        {board.length > 0 && (
          <section className="felt-section">
            <div className="sat-split">
              <h2 className="sat-h3">Leaderboard</h2>
              <a className="sat-small" href="#/players/board">Show all</a>
            </div>
            <div className="sat-glass-2 felt-list">
              {board.map((s, i) => (
                <button key={s.playerId} className="felt-row felt-row--slim" onClick={() => openPlayer(s.playerId)}>
                  <span className="sat-mono sat-muted" style={{ width: 16 }}>{i + 1}</span>
                  <span className="felt-row-main felt-row-title">{name(s.playerId)}</span>
                  <Delta {...figureDelta(summaryFigure(s, currency), showMoney)} />
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
          {closed.length === 0 && live.length === 0 && <Empty title="No games yet">{FEATURES.tournaments ? 'Start a cash game or tournament to begin the record.' : 'Start a cash game to begin the record.'}</Empty>}
          {closed.length === 0 && live.length > 0 && <p className="sat-small sat-muted">Closed games appear here.</p>}
          {closed.length > 0 && (
            <div className="sat-glass-2 felt-list">
              {closed.slice(0, 3).map((g) => {
                const top = gameResults(g)[0];
                return (
                  <button key={g.id} className="felt-row felt-row--slim" onClick={() => go(`game/${g.id}/hands`)}>
                    <div className="felt-row-main">
                      <div className="felt-row-title felt-ellipsis"><span data-game-title={g.id} style={{ display: 'inline-block', verticalAlign: 'bottom', maxWidth: '100%' }}>{g.name}</span></div>
                      <div className="felt-row-sub felt-ellipsis">{gameCaptionNarrow(g, groups.find((x) => x.id === g.groupId)?.name)}</div>
                    </div>
                    {top && <div className="felt-right"><div className="sat-small felt-ellipsis" style={{ maxWidth: 96 }}><PlayerName id={top.playerId} /></div><Delta {...figureDelta(gameFigure(g, top.playerId), showMoney)} /></div>}
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
