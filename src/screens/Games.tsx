import { useState } from 'react';
import { useStore, usePlayerName } from '../store';
import { go } from '../router';
import { Icon } from '../components/ui';
import { gameResults, openTransfers, totalPotMoney } from '../lib/calc';
import { dateLabel, money, tone } from '../lib/format';
import type { GameType } from '../types';

export default function Games() {
  const games = useStore((s) => s.games);
  const name = usePlayerName();
  const [type, setType] = useState<'all' | GameType>('all');
  const list = games.filter((g) => type === 'all' || g.type === type).sort((a, b) => b.startedAt - a.startedAt);

  return (
    <div className="screen plain">
      <div className="page-title">
        <h1>Games</h1>
        <p>{games.length} {games.length === 1 ? 'game' : 'games'}</p>
      </div>
      <div className="seg" role="tablist">
        {(['all', 'cash', 'tournament'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={type === t} onClick={() => setType(t)}>
            {t === 'all' ? 'All' : t === 'cash' ? 'Cash' : 'Tournaments'}
          </button>
        ))}
      </div>
      <div className="btn-row" style={{ marginTop: 16 }}>
        <button className="btn primary" onClick={() => go('new/cash')}><Icon name="plus" /> Cash game</button>
        <button className="btn" onClick={() => go('new/tournament')}><Icon name="trophy" /> Tournament</button>
      </div>
      <div className="section">
        {list.length === 0 && <div className="card empty"><Icon name="games" /><div>No games here yet.</div></div>}
        {list.map((g) => {
          const res = gameResults(g);
          const open = openTransfers(g).length;
          return (
            <button key={g.id} className="card tap" onClick={() => go(g.status === 'live' ? `game/${g.id}` : `game/${g.id}/close`)}>
              <div className="row between">
                <div className="row" style={{ gap: 6 }}>
                  {g.status === 'live' ? <span className="tag up">Live</span> : <span className="tag">Closed</span>}
                  <span className="tag">{g.type === 'cash' ? 'Cash' : 'Tournament'}</span>
                  {open > 0 && <span className="tag amber">{open} unpaid</span>}
                </div>
                <span className="tiny faint">{dateLabel(g.startedAt)}</span>
              </div>
              <div style={{ marginTop: 10 }}>
                <div style={{ font: '600 18px var(--font-display)' }}>{g.name}</div>
                <div className="tiny muted">{g.playerIds.length} players · {g.hands.length} hands · {money(totalPotMoney(g), g.currency)} {g.type === 'cash' ? 'in play' : 'prize pool'}</div>
              </div>
              {g.status === 'closed' && res.length > 0 && (
                <div className="row wrap small" style={{ marginTop: 10, gap: 14 }}>
                  {res.slice(0, 3).map((r) => (
                    <span key={r.playerId}>{name(r.playerId)} <span className={`num ${tone(r.net)}`}>{money(r.net, g.currency, { sign: true })}</span></span>
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
