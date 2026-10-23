import { useStore, usePlayerName } from '../store';
import { go } from '../router';
import { Icon, useTick } from '../components/ui';
import { gameResults, openTransfers, playerStatus, totalPotMoney } from '../lib/calc';
import { duration, money, shortDate, stakesLabel } from '../lib/format';
import { filterGames, leaderboard } from '../lib/stats';

export default function Home() {
  useTick();
  const games = useStore((s) => s.games);
  const players = useStore((s) => s.players);
  const name = usePlayerName();
  const live = games.filter((g) => g.status === 'live');
  const closed = games.filter((g) => g.status === 'closed').sort((a, b) => b.startedAt - a.startedAt);
  const open = closed.flatMap((g) => openTransfers(g).map((t) => ({ g, t })));
  const openTotal = open.reduce((a, x) => a + x.t.amount, 0);
  const board = leaderboard(filterGames(games, 'all', 'all'), players.map((p) => p.id)).slice(0, 3);
  const currency = useStore((s) => s.settings.currency);

  return (
    <div className="screen">
      <div className="page-title">
        <div className="eyebrow">Start · Settle · Finish · Track</div>
        <h1>Home game</h1>
        <p>Every buy-in, every hand, one record for the group.</p>
      </div>

      {live.map((g) => {
        const seated = g.playerIds.filter((p) => playerStatus(g, p) !== 'out').length;
        return (
          <button key={g.id} className="card tap" onClick={() => go(`game/${g.id}`)} style={{ borderColor: 'rgba(94,227,161,.35)' }}>
            <div className="row between">
              <span className="eyebrow"><span className="live-dot" />Live · {duration(Date.now() - g.startedAt)}</span>
              <span className="small muted">{seated} seated · {g.hands.length} hands</span>
            </div>
            <div className="row between" style={{ marginTop: 10, alignItems: 'flex-end' }}>
              <div className="grow">
                <div style={{ fontWeight: 700, fontSize: 18 }}>{g.name}</div>
                <div className="small muted">{stakesLabel(g)}</div>
              </div>
              <div className="big-num">{money(totalPotMoney(g), g.currency)}</div>
            </div>
          </button>
        );
      })}

      <div className="btn-row" style={{ marginTop: live.length ? 12 : 0 }}>
        <button className="btn primary lg" onClick={() => go('new/cash')}><Icon name="plus" /> Cash game</button>
        <button className="btn lg" onClick={() => go('new/tournament')}><Icon name="trophy" /> Tournament</button>
      </div>

      {open.length > 0 && (
        <div className="section">
          <div className="section-head"><h2>Open balances<span className="count">{open.length}</span></h2><span className="gold" style={{ fontWeight: 700 }}>{money(openTotal, currency)}</span></div>
          <div className="card flat">
            {open.slice(0, 5).map(({ g, t }) => (
              <button key={t.id} className="list-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => go(`game/${g.id}/close`)}>
                <div className="grow">
                  <div style={{ fontWeight: 600 }}>{name(t.from)} <span className="muted">→</span> {name(t.to)}</div>
                  <div className="tiny muted">{g.name} · {shortDate(g.startedAt)}</div>
                </div>
                <span style={{ fontWeight: 700 }}>{money(t.amount, g.currency)}</span>
              </button>
            ))}
            {open.length > 5 && <div className="small muted center" style={{ paddingTop: 8 }}>+{open.length - 5} more</div>}
          </div>
        </div>
      )}

      {board.length > 0 && (
        <div className="section">
          <div className="section-head"><h2>All-time leaders</h2><a className="small pos" href="#/insights/standings">See all</a></div>
          <div className="card flat">
            {board.map((s, i) => (
              <div key={s.playerId} className="list-row">
                <span className="mono muted" style={{ width: 16 }}>{i + 1}</span>
                <span className="grow" style={{ fontWeight: 600 }}>{name(s.playerId)}</span>
                <span className="small muted">{s.games} games</span>
                <span className={s.net >= 0 ? 'pos' : 'neg'} style={{ fontWeight: 700, minWidth: 80, textAlign: 'right' }}>{money(s.net, currency, { sign: true })}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="section">
        <div className="section-head"><h2>Recent games</h2>{closed.length > 0 && <a className="small pos" href="#/games">All games</a>}</div>
        {closed.length === 0 && (
          <div className="card flat empty">
            <Icon name="cards" />
            <div>No finished games yet.<br />Start a cash game or tournament above.</div>
          </div>
        )}
        {closed.slice(0, 4).map((g) => {
          const top = gameResults(g)[0];
          return (
            <button key={g.id} className="card tap" onClick={() => go(`game/${g.id}/close`)}>
              <div className="row between">
                <div className="grow">
                  <div style={{ fontWeight: 650 }}>{g.name}</div>
                  <div className="tiny muted">{shortDate(g.startedAt)} · {g.playerIds.length} players · {g.hands.length} hands</div>
                </div>
                {top && (
                  <div style={{ textAlign: 'right' }}>
                    <div className="tiny muted">Top</div>
                    <div style={{ fontWeight: 650 }}>{name(top.playerId)} <span className="pos">{money(top.net, g.currency, { sign: true })}</span></div>
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
