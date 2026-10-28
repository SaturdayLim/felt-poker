import { useState } from 'react';
import { useStore, usePlayerName } from '../store';
import { go } from '../router';
import { Delta, Empty, Header, Icon } from '../components/ui';
import { gameResults, openTransfers, playerStatus, totalPotMoney } from '../lib/calc';
import { dateLabel, duration, money } from '../lib/format';
import type { Game, GameType } from '../types';

/* Live games sit in their own section as solid glass cards with a pulsing dot.
   Closed games are flat, quieter rows underneath, so the two never read alike. */
export default function Games() {
  const games = useStore((s) => s.games);
  const groups = useStore((s) => s.groups);
  const name = usePlayerName();
  const [type, setType] = useState<'all' | GameType>('all');
  const list = games.filter((g) => type === 'all' || g.type === type).sort((a, b) => b.startedAt - a.startedAt);
  const live = list.filter((g) => g.status === 'live');
  const closed = list.filter((g) => g.status === 'closed');
  const groupName = (g: Game) => groups.find((x) => x.id === g.groupId)?.name;

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
        <div className="felt-start">
          <button className="sat-btn sat-btn--primary" onClick={() => go('new/cash')}><Icon name="plus" /> Cash game</button>
          <button className="sat-btn" onClick={() => go('new/tournament')}><Icon name="trophy" /> Tournament</button>
        </div>
        {list.length === 0 && <Empty title="No games">Games you start appear here.</Empty>}

        {live.length > 0 && (
          <section className="felt-section">
            <h2 className="sat-caption felt-section-cap"><span className="felt-dot felt-dot--pulse" />Live now</h2>
            {live.map((g) => {
              const seated = g.playerIds.filter((p) => playerStatus(g, p) !== 'out').length;
              return (
                <button key={g.id} className="sat-glass sat-card felt-live-card" onClick={() => go(`game/${g.id}`)}>
                  <span className="felt-live-tag">{g.type === 'cash' ? `${g.sb}/${g.bb} cash` : 'Tournament'}, {duration(Date.now() - g.startedAt)}</span>
                  <span className="felt-live-name">{g.name}</span>
                  <span className="sat-small sat-muted">{seated} playing, {g.hands.length} hands{groupName(g) ? `, ${groupName(g)}` : ''}</span>
                  <span className="felt-live-go" aria-hidden="true"><Icon name="back" /></span>
                </button>
              );
            })}
          </section>
        )}

        {closed.length > 0 && (
          <section className="felt-section">
            <h2 className="sat-caption felt-section-cap">Closed</h2>
            <div className="sat-flat felt-list felt-closed-list">
              {closed.map((g) => {
                const res = gameResults(g);
                const open = openTransfers(g).length;
                return (
                  <button key={g.id} className="felt-row" onClick={() => go(`game/${g.id}/close`)}>
                    <div className="felt-row-main">
                      <div className="felt-row-title felt-ellipsis">{g.name}</div>
                      <div className="felt-row-sub">
                        {dateLabel(g.startedAt)}, {g.playerIds.length} players, {money(totalPotMoney(g), g.currency)}{groupName(g) ? `, ${groupName(g)}` : ''}
                        {open > 0 ? `, ${open} unpaid` : ''}
                      </div>
                    </div>
                    {res[0] && (
                      <div className="felt-right">
                        <div className="sat-small felt-ellipsis" style={{ maxWidth: 96 }}>{name(res[0].playerId)}</div>
                        <Delta value={res[0].net} format={(a) => money(a, g.currency)} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
