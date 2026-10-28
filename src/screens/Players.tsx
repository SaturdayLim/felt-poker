import { useState } from 'react';
import { useStore } from '../store';
import { go } from '../router';
import { Avatar, Caption, Delta, Empty, Header, Icon, toast, SourceTip } from '../components/ui';
import { PlayerEditSheet, titleCase } from '../components/players';
import { filterGames, playerSummary } from '../lib/stats';
import { GroupSheet, groupSettlement } from './Group';
import { money } from '../lib/format';
import type { Player } from '../types';

export default function Players() {
  const players = useStore((s) => s.players);
  const games = useStore((s) => s.games);
  const currency = useStore((s) => s.settings.currency);
  const addPlayer = useStore((s) => s.addPlayer);
  const groups = useStore((s) => s.groups);
  const [newGroup, setNewGroup] = useState(false);
  const [nm, setNm] = useState('');
  const [edit, setEdit] = useState<Player | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const closed = filterGames(games, 'all', 'all');
  const list = players.filter((p) => showArchived || !p.archived).sort((a, b) => a.name.localeCompare(b.name));

  const add = () => {
    const n = titleCase(nm);
    if (!n) return;
    if (players.some((p) => p.name.toLowerCase() === n.toLowerCase())) { toast(`${n} is already on the list. Use a different name.`); return; }
    addPlayer(n);
    setNm('');
    toast(`${n} added to players`);
  };

  return (
    <div className="felt-page">
      <Header title="Players" sub={`${list.length} ${list.length === 1 ? 'Player' : 'Players'}`} />
      <div className="sat-stack">
        <div className="sat-cluster" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)', flexWrap: 'nowrap' }}>
          <input className="sat-input" aria-label="New player name" placeholder="New player (e.g. Dani)" value={nm} onChange={(e) => setNm(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} enterKeyHint="done" />
          <button className="sat-btn sat-btn--primary" onClick={add} aria-disabled={!nm.trim()}><Icon name="plus" /> Add</button>
        </div>
        {players.some((p) => p.archived) && (
          <div className="sat-switch-row">
            <span>Show archived players</span>
            <button className="sat-switch" role="switch" aria-checked={showArchived} aria-label="Show archived players" onClick={() => setShowArchived(!showArchived)} />
          </div>
        )}
        <section className="felt-section">
          <div className="sat-split">
            <Caption tip="groups">Groups</Caption>
            <button className="sat-btn sat-btn--ghost sat-btn--sm" onClick={() => setNewGroup(true)}><Icon name="plus" /> New group</button>
          </div>
          {groups.length === 0 ? (
            <p className="sat-small sat-muted">Group the people you play with often. Their games settle together in the fewest payments.</p>
          ) : (
            <div className="sat-glass-2 felt-list">
              {groups.map((grp) => {
                const gs = games.filter((g) => g.groupId === grp.id && g.status === 'closed');
                const owed = groupSettlement(gs).transfers.length;
                return (
                  <button key={grp.id} className="felt-row felt-row--slim" onClick={() => go(`group/${grp.id}`)}>
                    <div className="felt-row-main">
                      <div className="felt-row-title">{grp.name}</div>
                      <div className="felt-row-sub felt-ellipsis">{grp.playerIds.length} players, {gs.length} games</div>
                    </div>
                    {owed > 0 ? <span className="sat-badge sat-badge--muted">{owed} to pay</span> : <span className="sat-small sat-muted">Square</span>}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <Caption>Everyone</Caption>
        {list.length === 0 && <Empty title="No players">Add the people you play with. They are saved for every game.</Empty>}
        {list.length > 0 && (
          <div className="sat-glass-2 felt-list">
            {list.map((p) => {
              const s = playerSummary(closed, p.id);
              return (
                <div key={p.id} className="felt-row">
                  <Avatar name={p.name} />
                  <button className="felt-row-main" style={{ textAlign: 'left', minHeight: 44 }} onClick={() => go(`insights/${p.id}`)}>
                    <div className="felt-row-title">{p.name} {p.archived && <span className="sat-badge sat-badge--muted">Archived</span>}</div>
                    <div className="felt-row-sub">{s.games} games, {s.handsWon} hands won</div>
                  </button>
                  {s.games ? <Delta value={s.net} format={(a) => money(a, currency)} /> : <span className="sat-muted">-</span>}
                  <button className="sat-btn sat-btn--ghost sat-iconbtn" onClick={() => setEdit(p)} aria-label={`Edit ${p.name}`}><Icon name="edit" /></button>
                </div>
              );
            })}
          </div>
        )}
        {list.length > 0 && <div className="felt-source"><SourceTip>Felt game log ({closed.length} closed games). Net result in {currency}.</SourceTip></div>}
      </div>
      {edit && <PlayerEditSheet p={edit} onClose={() => setEdit(null)} />}
      {newGroup && <GroupSheet onClose={() => setNewGroup(false)} />}
    </div>
  );
}
