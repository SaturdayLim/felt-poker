import { useState } from 'react';
import { useStore, usePlayerName } from '../store';
import { back, go } from '../router';
import { Caption, Delta, Empty, Header, Help, Icon, Sheet, SourceTip, toast } from '../components/ui';
import { openTransfers, round2, suggestTransfers } from '../lib/calc';
import { dateLabel, money, shortDate } from '../lib/format';
import { leaderboard } from '../lib/stats';
import { uid } from '../lib/ids';
import type { Game, Group as G, ID } from '../types';

/** Net every unpaid payment across the group's closed games into the fewest payments. */
export function groupSettlement(games: Game[]) {
  const bal: Record<ID, number> = {};
  let owed = 0;
  for (const g of games) for (const t of openTransfers(g)) {
    bal[t.from] = round2((bal[t.from] ?? 0) - t.amount);
    bal[t.to] = round2((bal[t.to] ?? 0) + t.amount);
    owed = round2(owed + t.amount);
  }
  const transfers = suggestTransfers(Object.entries(bal).map(([playerId, balance]) => ({ playerId, balance })));
  return { transfers, owed, payments: games.reduce((a, g) => a + openTransfers(g).length, 0) };
}

export default function Group({ groupId }: { groupId: string }) {
  const grp = useStore((s) => s.groups.find((x) => x.id === groupId));
  const allGames = useStore((s) => s.games);
  const settleGroup = useStore((s) => s.settleGroup);
  const name = usePlayerName();
  const [edit, setEdit] = useState(false);
  const [confirm, setConfirm] = useState(false);
  if (!grp) return <div className="felt-page"><Header back={() => back('players')} title="Group" /><Empty title="Group not found">It may have been deleted.</Empty></div>;

  const games = allGames.filter((g) => g.groupId === grp.id).sort((a, b) => b.startedAt - a.startedAt);
  const closed = games.filter((g) => g.status === 'closed');
  const currency = closed[0]?.currency ?? useStore.getState().settings.currency;
  const settle = groupSettlement(closed);
  const board = leaderboard([...closed].sort((a, b) => a.startedAt - b.startedAt), grp.playerIds);

  return (
    <div className="felt-page">
      <Header back={() => back('players')} title={grp.name} sub={`${grp.playerIds.length} players, ${games.length} games`}
        right={<button className="sat-btn sat-btn--ghost sat-iconbtn" onClick={() => setEdit(true)} aria-label="Edit group"><Icon name="edit" /></button>} />
      <div className="sat-stack">
        <section className="sat-glass sat-card sat-stack" style={{ ['--sat-gap' as string]: 'var(--sat-space-3)' }}>
          <div className="sat-split"><h2 className="sat-h3">Settle up <Help k="groupPay" /></h2>{settle.transfers.length > 0 && <span className="sat-small sat-muted">{settle.transfers.length} instead of {settle.payments}</span>}</div>
          {settle.transfers.length === 0 ? (
            <p className="sat-small sat-muted">All square. No unpaid amounts in this group's games.</p>
          ) : (
            <>
              <div className="sat-glass-2 felt-list">
                {settle.transfers.map((t, i) => (
                  <div key={i} className="felt-row felt-row--slim">
                    <span className="felt-row-main felt-row-title">{name(t.from)} pays {name(t.to)}</span>
                    <span className="sat-num" style={{ fontWeight: 600 }}>{money(t.amount, currency)}</span>
                  </div>
                ))}
              </div>
              <button className={`sat-btn ${confirm ? 'sat-btn--primary' : ''}`} onClick={() => {
                if (!confirm) { setConfirm(true); return; }
                settleGroup(grp.id);
                setConfirm(false);
                toast('Every payment in the group marked paid');
              }}><Icon name="check" /> {confirm ? 'Tap again: everyone has paid' : 'Mark all paid'}</button>
            </>
          )}
        </section>

        <section className="felt-section">
          <h2 className="sat-h3">Leaderboard <SourceTip>Felt game log ({closed.length} closed games of {grp.name}). Net result in {currency}.</SourceTip></h2>
          {board.length === 0 ? <p className="sat-small sat-muted">Closed games of this group appear here.</p> : (
            <div className="sat-glass-2 felt-list">
              {board.map((s, i) => (
                <button key={s.playerId} className="felt-row felt-row--slim" onClick={() => go(`insights/${s.playerId}`)}>
                  <span className="sat-mono sat-muted" style={{ width: 16 }}>{i + 1}</span>
                  <div className="felt-row-main"><div className="felt-row-title">{name(s.playerId)}</div><div className="felt-row-sub">{s.games} games</div></div>
                  <Delta value={s.net} format={(a) => money(a, currency)} />
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="felt-section">
          <h2 className="sat-h3">Games</h2>
          {games.length === 0 ? <p className="sat-small sat-muted">Pick this group when you start a game, or under Game settings.</p> : (
            <div className="sat-flat felt-list">
              {games.map((g) => (
                <button key={g.id} className="felt-row felt-row--slim" onClick={() => go(g.status === 'live' ? `game/${g.id}` : `game/${g.id}/close`)}>
                  <div className="felt-row-main"><div className="felt-row-title felt-ellipsis">{g.name}</div><div className="felt-row-sub">{dateLabel(g.startedAt)}</div></div>
                  {g.status === 'live' ? <span className="sat-badge"><span className="felt-dot" />Live</span> : openTransfers(g).length ? <span className="sat-badge sat-badge--muted">{openTransfers(g).length} unpaid</span> : <span className="sat-small sat-muted">{shortDate(g.endedAt ?? g.startedAt)}</span>}
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
      {edit && <GroupSheet grp={grp} onClose={() => setEdit(false)} />}
    </div>
  );
}

/** Create or edit a group: name and members. */
export function GroupSheet({ grp, onClose }: { grp?: G; onClose: () => void }) {
  const players = useStore((s) => s.players).filter((p) => !p.archived || grp?.playerIds.includes(p.id));
  const saveGroup = useStore((s) => s.saveGroup);
  const deleteGroup = useStore((s) => s.deleteGroup);
  const [nm, setNm] = useState(grp?.name ?? '');
  const [sel, setSel] = useState<ID[]>(grp?.playerIds ?? []);
  const [confirm, setConfirm] = useState(false);
  const save = () => {
    if (!nm.trim()) { toast('Name the group (e.g. Friday table).'); return; }
    if (sel.length < 2) { toast('Pick at least 2 players.'); return; }
    const g: G = { id: grp?.id ?? uid(), name: nm.trim(), playerIds: sel, createdAt: grp?.createdAt ?? Date.now() };
    saveGroup(g);
    toast(grp ? 'Group saved' : `${g.name} created`);
    onClose();
    if (!grp) go(`group/${g.id}`);
  };
  return (
    <Sheet open onClose={onClose} title={grp ? 'Edit group' : 'New group'}>
      <div className="sat-field"><label htmlFor="gr-n">Group name</label><input id="gr-n" className="sat-input" placeholder="Friday table" value={nm} onChange={(e) => setNm(e.target.value)} /></div>
      <div className="sat-stack" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)' }}>
        <Caption>Players ({sel.length})</Caption>
        <div className="sat-cluster" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)' }}>
          {players.map((p) => <button key={p.id} className="sat-chip" aria-pressed={sel.includes(p.id)} onClick={() => setSel((v) => (v.includes(p.id) ? v.filter((x) => x !== p.id) : [...v, p.id]))}>{p.name}</button>)}
        </div>
      </div>
      <button className="sat-btn sat-btn--primary sat-btn--block" onClick={save}>{grp ? 'Save group' : 'Create group'}</button>
      {grp && (
        <button className="sat-btn sat-btn--ghost sat-btn--block" style={{ color: 'var(--sat-neg)' }} onClick={() => {
          if (!confirm) { setConfirm(true); return; }
          deleteGroup(grp.id);
          onClose();
          go('players', true);
        }}><Icon name="trash" /> {confirm ? 'Tap again to delete (games are kept)' : 'Delete group'}</button>
      )}
    </Sheet>
  );
}
