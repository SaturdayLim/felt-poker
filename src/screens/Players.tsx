import { useState } from 'react';
import { useStore } from '../store';
import { go } from '../router';
import { Avatar, Empty, Icon, Sheet, toast } from '../components/ui';
import { filterGames, playerSummary } from '../lib/stats';
import { money, tone } from '../lib/format';
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
    if (players.some((p) => p.name.toLowerCase() === n.toLowerCase())) { toast(`${n} is already here`); return; }
    addPlayer(n);
    setNm('');
  };

  return (
    <div className="screen plain">
      <div className="page-title">
        <h1>Players</h1>
        <p>{list.length} {list.length === 1 ? 'player' : 'players'}</p>
      </div>
      <div className="row">
        <input className="input grow" placeholder="Add a player" value={nm} onChange={(e) => setNm(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} enterKeyHint="done" />
        <button className="btn" style={{ minHeight: 48 }} onClick={add} disabled={!nm.trim()} aria-label="Add player"><Icon name="plus" /></button>
      </div>

      <div className="section">
        {players.some((p) => p.archived) && (
          <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 10 }}>
            <button className="btn xs" onClick={() => setShowArchived(!showArchived)}>{showArchived ? 'Hide archived' : 'Show archived'}</button>
          </div>
        )}
        {list.length === 0 && <Empty icon="users">No players yet.</Empty>}
        {list.length > 0 && (
          <div className="card list">
            {list.map((p) => {
              const s = playerSummary(closed, p.id);
              return (
                <div key={p.id} className="list-row">
                  <Avatar name={p.name} />
                  <button className="grow" style={{ textAlign: 'left' }} onClick={() => go(`insights/${p.id}`)}>
                    <div style={{ fontWeight: 700 }}>{p.name} {p.archived && <span className="tag">Archived</span>}</div>
                    <div className="tiny faint">{s.games} games · {s.handsWon} hands won</div>
                  </button>
                  <span className={`num ${tone(s.net)}`}>{s.games ? money(s.net, currency, { sign: true }) : '—'}</span>
                  <button className="icon-btn" onClick={() => setEdit(p)} aria-label={`Edit ${p.name}`}><Icon name="edit" /></button>
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
  const [confirm, setConfirm] = useState(false);
  const inGames = st.games.filter((g) => g.playerIds.includes(p.id)).length;
  return (
    <Sheet open onClose={onClose} title={p.name} sub={inGames ? `In ${inGames} game${inGames === 1 ? '' : 's'}` : 'Not in any games yet'}>
      <label className="field"><span className="label">Name</span><input className="input" value={nm} onChange={(e) => setNm(e.target.value)} /></label>
      <button className="btn primary block" style={{ marginTop: 16 }} disabled={!nm.trim()} onClick={() => { st.renamePlayer(p.id, nm); onClose(); }}>Save</button>
      <button className="btn block" style={{ marginTop: 12 }} onClick={() => { st.setPlayerArchived(p.id, !p.archived); onClose(); }}>
        {p.archived ? 'Bring back' : 'Archive'}
      </button>
      {!p.archived && <div className="tiny faint" style={{ marginTop: 6 }}>Archived players keep their history but don't show up when you start a game.</div>}
      {!inGames && (
        <button className="btn danger block" style={{ marginTop: 12 }} onClick={() => { if (!confirm) { setConfirm(true); return; } st.deletePlayer(p.id); onClose(); }}>
          <Icon name="trash" /> {confirm ? 'Tap again to delete' : 'Delete player'}
        </button>
      )}
    </Sheet>
  );
}
