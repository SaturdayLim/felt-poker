import { useState } from 'react';
import { useStore, usePlayerName } from '../store';
import { go } from '../router';
import { Icon } from '../components/ui';
import { gameResults, openTransfers, totalPotMoney } from '../lib/calc';
import { dateLabel, money } from '../lib/format';
import type { GameType } from '../types';

export default function Games() {
  const games = useStore((s) => s.games);
  const name = usePlayerName();
  const [type, setType] = useState<'all' | GameType>('all');
  const list = games.filter((g) => type === 'all' || g.type === type).sort((a, b) => b.startedAt - a.startedAt);

  return (
    <div className="screen">
      <div className="page-title">
        <div className="eyebrow">History</div>
        <h1>Games</h1>
        <p>{games.length} game{games.length === 1 ? '' : 's'} recorded on this device.</p>
      </div>
      <div className="seg">
        {(['all', 'cash', 'tournament'] as const).map((t) => (
          <button key={t} className={type === t ? 'on' : ''} onClick={() => setType(t)}>
            {t === 'all' ? 'All' : t === 'cash' ? 'Cash' : 'Tournament'}
          </button>
        ))}
      </div>
      <div className="btn-row" style={{ marginTop: 12 }}>
        <button className="btn primary" onClick={() => go('new/cash')}><Icon name="plus" /> Cash game</button>
        <button className="btn" onClick={() => go('new/tournament')}><Icon name="trophy" /> Tournament</button>
      </div>
      <div className="section">
        {list.length === 0 && <div className="card flat empty"><Icon name="games" /><div>No games here yet.</div></div>}
        {list.map((g) => {
          const res = gameResults(g);
          const open = openTransfers(g).length;
          return (
            <button key={g.id} className="card tap" onClick={() => go(g.status === 'live' ? `game/${g.id}` : `game/${g.id}/close`)}>
              <div className="row between">
                <div className="row" style={{ gap: 6 }}>
                  {g.status === 'live' ? <span className="pill mint">Live</span> : <span className="pill">Closed</span>}
                  <span className={`pill ${g.type === 'cash' ? 'blue' : 'gold'}`}>{g.type}</span>
                  {open > 0 && <span className="pill red">{open} unpaid</span>}
                </div>
                <span className="small muted">{dateLabel(g.startedAt)}</span>
              </div>
              <div className="row between" style={{ marginTop: 10 }}>
                <div className="grow">
                  <div style={{ fontWeight: 700, fontSize: 16.5 }}>{g.name}</div>
                  <div className="small muted">{g.playerIds.length} players · {g.hands.length} hands · {money(totalPotMoney(g), g.currency)} {g.type === 'cash' ? 'in play' : 'pool'}</div>
                </div>
              </div>
              {g.status === 'closed' && res.length > 0 && (
                <div className="row wrap small" style={{ marginTop: 10, gap: 12 }}>
                  {res.slice(0, 3).map((r) => (
                    <span key={r.playerId}>{name(r.playerId)} <span className={r.net >= 0 ? 'pos' : 'neg'}>{money(r.net, g.currency, { sign: true })}</span></span>
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
