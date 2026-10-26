import { useState } from 'react';
import { useStore } from '../store';
import { go } from '../router';
import { Avatar, Delta, Empty, Header, Icon, Sheet, toast } from '../components/ui';
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
        {list.length > 0 && <p className="sat-source">Source: Felt game log ({closed.length} closed games). Net result in {currency}.</p>}
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
    <Sheet open onClose={onClose} title={p.name} sub={inGames ? `In ${inGames} game${inGames === 1 ? '' : 's'}.` : 'Not in any games yet.'}>
      <div className="sat-field"><label htmlFor="pn">Name</label><input id="pn" className="sat-input" value={nm} onChange={(e) => setNm(e.target.value)} /></div>
      <button className="sat-btn sat-btn--primary sat-btn--block" aria-disabled={!nm.trim()} onClick={() => { if (!nm.trim()) return; st.renamePlayer(p.id, nm); toast('Name saved'); onClose(); }}>Save name</button>
      <div className="sat-stack" style={{ ['--sat-gap' as string]: 'var(--sat-space-1)' }}>
        <button className="sat-btn sat-btn--block" onClick={() => { st.setPlayerArchived(p.id, !p.archived); onClose(); }}>{p.archived ? 'Restore player' : 'Archive player'}</button>
        {!p.archived && <p className="sat-small sat-muted">Archived players keep their history but are left out of new games.</p>}
      </div>
      {!inGames && (
        <button className="sat-btn sat-btn--ghost sat-btn--block" style={{ color: 'var(--sat-neg)' }} onClick={() => { if (!confirm) { setConfirm(true); return; } st.deletePlayer(p.id); onClose(); }}>
          <Icon name="trash" /> {confirm ? 'Tap again to delete' : 'Delete player'}
        </button>
      )}
    </Sheet>
  );
}
