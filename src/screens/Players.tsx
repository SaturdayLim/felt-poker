import { useState } from 'react';
import { useStore } from '../store';
import { go } from '../router';
import { Avatar, Empty, Icon, Sheet, toast } from '../components/ui';
import { filterGames, playerSummary } from '../lib/stats';
import { money } from '../lib/format';
import type { Player } from '../types';

export default function Players() {
  const players = useStore((s) => s.players);
  const games = useStore((s) => s.games);
  const currency = useStore((s) => s.settings.currency);
  const addPlayer = useStore((s) => s.addPlayer);
  const [nm, setNm] = useState('');
  const [edit, setEdit] = useState<Player | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const closed = filterGames(games, 'all', 'all');
  const list = players.filter((p) => showArchived || !p.archived).sort((a, b) => a.name.localeCompare(b.name));

  const add = () => {
    const n = nm.trim();
    if (!n) return;
    if (players.some((p) => p.name.toLowerCase() === n.toLowerCase())) { toast(`${n} is already on the roster`); return; }
    addPlayer(n);
    setNm('');
  };

  return (
    <div className="screen">
      <div className="page-title">
        <div className="eyebrow">Roster</div>
        <h1>Players</h1>
        <p>Your regulars, saved across games.</p>
      </div>
      <div className="row">
        <input className="input grow" placeholder="Add a player" value={nm} onChange={(e) => setNm(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} enterKeyHint="done" />
        <button className="btn primary" style={{ height: 48 }} onClick={add} disabled={!nm.trim()}><Icon name="plus" /></button>
      </div>

      <div className="section">
        <div className="section-head">
          <h2>{list.length} player{list.length === 1 ? '' : 's'}</h2>
          {players.some((p) => p.archived) && <button className="btn xs" onClick={() => setShowArchived(!showArchived)}>{showArchived ? 'Hide archived' : 'Show archived'}</button>}
        </div>
        {list.length === 0 && <Empty icon="users">No players yet. Add your regulars above.</Empty>}
        {list.length > 0 && (
          <div className="card flat" style={{ padding: '4px 14px' }}>
            {list.map((p) => {
              const s = playerSummary(closed, p.id);
              return (
                <div key={p.id} className="list-row">
                  <Avatar name={p.name} />
                  <button className="grow" style={{ textAlign: 'left' }} onClick={() => go(`insights/${p.id}`)}>
                    <div style={{ fontWeight: 650 }}>{p.name} {p.archived && <span className="pill">Archived</span>}</div>
                    <div className="tiny muted">{s.games} games · {s.wins} wins · {s.handsWon} hands won</div>
                  </button>
                  <span className={s.net >= 0 ? 'pos' : 'neg'} style={{ fontWeight: 700 }}>{s.games ? money(s.net, currency, { sign: true }) : '—'}</span>
                  <button className="icon-btn ghost" onClick={() => setEdit(p)} aria-label={`Edit ${p.name}`}><Icon name="edit" /></button>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {edit && <EditPlayer p={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function EditPlayer({ p, onClose }: { p: Player; onClose: () => void }) {
  const st = useStore();
  const [nm, setNm] = useState(p.name);
  const inGames = st.games.filter((g) => g.playerIds.includes(p.id)).length;
  return (
    <Sheet open onClose={onClose} title="Edit player" sub={inGames ? `Played in ${inGames} game${inGames === 1 ? '' : 's'}.` : 'Not in any games yet.'}>
      <input className="input" value={nm} onChange={(e) => setNm(e.target.value)} />
      <button className="btn primary block" style={{ marginTop: 12 }} disabled={!nm.trim()} onClick={() => { st.renamePlayer(p.id, nm); onClose(); }}>Save name</button>
      <button className="btn block" style={{ marginTop: 10 }} onClick={() => { st.setPlayerArchived(p.id, !p.archived); onClose(); }}>
        {p.archived ? 'Restore to roster' : 'Archive (hide from new games)'}
      </button>
      {!inGames && <button className="btn danger block" style={{ marginTop: 10 }} onClick={() => { st.deletePlayer(p.id); onClose(); }}><Icon name="trash" /> Delete player</button>}
    </Sheet>
  );
}
