import { useStore, usePlayerName } from '../store';
import { go } from '../router';
import { Help, Icon, useTick } from '../components/ui';
import { gameResults, openTransfers, playerStatus, totalPotMoney } from '../lib/calc';
import { duration, money, shortDate, stakesLabel, tone } from '../lib/format';
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
  const board = leaderboard(filterGames(games, 'all', 'all'), players.map((p) => p.id)).slice(0, 3);
  const today = new Date().toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="screen plain">
      <div className="page-title">
        <h1>Felt</h1>
        <p>{today}</p>
      </div>

      {live.map((g) => {
        const seated = g.playerIds.filter((p) => playerStatus(g, p) !== 'out').length;
        return (
          <button key={g.id} className="card tap" onClick={() => go(`game/${g.id}`)}>
            <div className="row between">
              <span className="label up"><span className="live-dot" />Live for {duration(Date.now() - g.startedAt)}</span>
              <span className="tiny faint">{seated} playing · {g.hands.length} hands</span>
            </div>
            <div className="row between" style={{ marginTop: 10, alignItems: 'flex-end' }}>
              <div className="grow">
                <div style={{ font: '600 19px var(--font-display)' }}>{g.name}</div>
                <div className="tiny muted">{stakesLabel(g)}</div>
              </div>
              <div className="big-num">{money(totalPotMoney(g), g.currency)}</div>
            </div>
          </button>
        );
      })}

      <div className="btn-row" style={{ marginTop: live.length ? 16 : 0 }}>
        <button className="btn primary lg" onClick={() => go('new/cash')}><Icon name="plus" /> Cash game</button>
        <button className="btn lg" onClick={() => go('new/tournament')}><Icon name="trophy" /> Tournament</button>
      </div>

      {open.length > 0 && (
        <div className="section">
          <div className="section-head"><h2>Unpaid <Help k="payments" /></h2><span className="num amber">{money(openTotal, currency)}</span></div>
          <div className="card list">
            {open.slice(0, 5).map(({ g, t }) => (
              <button key={t.id} className="list-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => go(`game/${g.id}/close`)}>
                <div className="grow">
                  <div style={{ fontWeight: 700 }}>{name(t.from)} pays {name(t.to)}</div>
                  <div className="tiny faint">{g.name} · {shortDate(g.startedAt)}</div>
                </div>
                <span className="num">{money(t.amount, g.currency)}</span>
              </button>
            ))}
            {open.length > 5 && <div className="tiny faint center" style={{ padding: '8px 0 10px' }}>{open.length - 5} more</div>}
          </div>
        </div>
      )}

      {board.length > 0 && (
        <div className="section">
          <div className="section-head"><h2>Leaderboard</h2><a className="small accent" href="#/insights/standings">All players</a></div>
          <div className="card list">
            {board.map((s, i) => (
              <div key={s.playerId} className="list-row">
                <span className="num faint" style={{ width: 16 }}>{i + 1}</span>
                <span className="grow" style={{ fontWeight: 700 }}>{name(s.playerId)}</span>
                <span className="tiny faint">{s.games} games</span>
                <span className={`num ${tone(s.net)}`} style={{ minWidth: 84, textAlign: 'right' }}>{money(s.net, currency, { sign: true })}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="section">
        <div className="section-head"><h2>Recent games</h2>{closed.length > 0 && <a className="small accent" href="#/games">All games</a>}</div>
        {closed.length === 0 && (
          <div className="card empty">
            <Icon name="cards" />
            <div>No finished games yet.</div>
          </div>
        )}
        {closed.slice(0, 4).map((g) => {
          const top = gameResults(g)[0];
          return (
            <button key={g.id} className="card tap" onClick={() => go(`game/${g.id}/close`)}>
              <div className="row between">
                <div className="grow">
                  <div style={{ fontWeight: 700 }}>{g.name}</div>
                  <div className="tiny faint">{shortDate(g.startedAt)} · {g.playerIds.length} players · {g.hands.length} hands</div>
                </div>
                {top && (
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700 }}>{name(top.playerId)}</div>
                    <div className={`num small ${tone(top.net)}`}>{money(top.net, g.currency, { sign: true })}</div>
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
