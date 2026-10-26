import { useState } from 'react';
import { useStore, usePlayerName } from '../store';
import { go } from '../router';
import { Delta, Empty, Header, Icon } from '../components/ui';
import { gameResults, openTransfers, totalPotMoney } from '../lib/calc';
import { dateLabel, money } from '../lib/format';
import type { GameType } from '../types';

export default function Games() {
  const games = useStore((s) => s.games);
  const name = usePlayerName();
  const [type, setType] = useState<'all' | GameType>('all');
  const list = games.filter((g) => type === 'all' || g.type === type).sort((a, b) => b.startedAt - a.startedAt);

  return (
    <div className="felt-page">
      <Header title="Games" sub={`${games.length} ${games.length === 1 ? 'Game' : 'Games'} Recorded`} />
      <div className="sat-stack">
        <div className="sat-seg sat-seg--block" role="radiogroup" aria-label="Game type">
          {(['all', 'cash', 'tournament'] as const).map((t) => (
            <button key={t} role="radio" aria-checked={type === t} onClick={() => setType(t)}>
              {t === 'all' ? 'All' : t === 'cash' ? 'Cash' : 'Tournaments'}
            </button>
          ))}
        </div>
        <div className="sat-cluster" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)' }}>
          <button className="sat-btn sat-btn--primary felt-grow" onClick={() => go('new/cash')}><Icon name="plus" /> Start cash game</button>
          <button className="sat-btn felt-grow" onClick={() => go('new/tournament')}><Icon name="trophy" /> Start tournament</button>
        </div>
        {list.length === 0 && <Empty title="No games">Games you start appear here.</Empty>}
        {list.map((g) => {
          const res = gameResults(g);
          const open = openTransfers(g).length;
          return (
            <button key={g.id} className="sat-glass sat-card sat-stack" style={{ textAlign: 'left', ['--sat-gap' as string]: 'var(--sat-space-2)' }}
              onClick={() => go(g.status === 'live' ? `game/${g.id}` : `game/${g.id}/close`)}>
              <div className="sat-split">
                <div className="sat-cluster" style={{ ['--sat-gap' as string]: 'var(--sat-space-1)' }}>
                  <span className={g.status === 'live' ? 'sat-badge' : 'sat-badge sat-badge--muted'}>{g.status === 'live' ? 'Live' : 'Closed'}</span>
                  <span className="sat-badge sat-badge--muted">{g.type === 'cash' ? 'Cash' : 'Tournament'}</span>
                  {open > 0 && <span className="sat-badge sat-badge--muted">{open} unpaid</span>}
                </div>
                <span className="sat-small sat-muted">{dateLabel(g.startedAt)}</span>
              </div>
              <h3 className="sat-h3">{g.name}</h3>
              <p className="sat-small sat-muted">{g.playerIds.length} players, {g.hands.length} hands, {money(totalPotMoney(g), g.currency)} {g.type === 'cash' ? 'in play' : 'prize pool'}</p>
              {g.status === 'closed' && res.length > 0 && (
                <div className="sat-cluster sat-small" style={{ ['--sat-gap' as string]: 'var(--sat-space-4)' }}>
                  {res.slice(0, 3).map((r) => (
                    <span key={r.playerId} className="sat-cluster" style={{ ['--sat-gap' as string]: '6px' }}>{name(r.playerId)} <Delta value={r.net} format={(a) => money(a, g.currency)} /></span>
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
