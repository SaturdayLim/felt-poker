import { useState } from 'react';
import { PlayerName } from '../components/players';
import { useStore } from '../store';
import { back, backTo, go } from '../router';
import { Caption, Delta, Empty, Header, Help, Icon, Sheet, toast, withUndo } from '../components/ui';
import { openTransfers, round2, suggestTransfers } from '../lib/calc';
import { dateLabel, gameCaption, money, shortDate } from '../lib/format';
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

/** The id of the automatic group that holds every game that belongs to no group. */
export const OTHERS = 'others';

/** A game belongs to a group when it was started under that group, or when everyone who played it is a member of the group
    (a game of a part of the group counts for the group too). */
export const inGroup = (g: Game, grp: G): boolean =>
  g.groupId === grp.id || (g.playerIds.length >= 2 && g.playerIds.every((p) => grp.playerIds.includes(p)));

/** The games of a group, newest first. */
export const gamesOfGroup = (games: Game[], grp: G): Game[] => games.filter((g) => inGroup(g, grp)).sort((a, b) => b.startedAt - a.startedAt);

/** Others: the games that belong to no group. It is not a group anyone made: it has no edit and no member list. */
export function othersGroup(groups: G[], games: Game[]): { grp: G; games: Game[] } {
  const rest = games.filter((g) => !groups.some((x) => inGroup(g, x))).sort((a, b) => b.startedAt - a.startedAt);
  return { grp: { id: OTHERS, name: 'Others', playerIds: [...new Set(rest.flatMap((g) => g.playerIds))], createdAt: 0 }, games: rest };
}

export default function Group({ groupId }: { groupId: string }) {
  const groups = useStore((s) => s.groups);
  const allGames = useStore((s) => s.games);
  const isOthers = groupId === OTHERS;
  const others = othersGroup(groups, allGames);
  const grp = isOthers ? others.grp : groups.find((x) => x.id === groupId);
  const settleGroup = useStore((s) => s.settleGroup);
  const [edit, setEdit] = useState(false);
  if (!grp) return <div className="felt-page"><Header back={() => back('players')} title="Group" /><Empty title="Group not found">It may have been deleted.</Empty></div>;

  const games = isOthers ? others.games : gamesOfGroup(allGames, grp);
  const closed = games.filter((g) => g.status === 'closed');
  const currency = closed[0]?.currency ?? useStore.getState().settings.currency;
  const settle = groupSettlement(closed);
  const board = leaderboard([...closed].sort((a, b) => a.startedAt - b.startedAt), grp.playerIds);

  return (
    <div className="felt-page">
      <Header back={() => back('players')} title={grp.name} sub={`${grp.playerIds.length} players, ${games.length} games`}
        right={isOthers ? undefined : <button className="sat-btn sat-btn--ghost sat-iconbtn" onClick={() => setEdit(true)} aria-label="Edit group"><Icon name="edit" /></button>} />
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
                    <span className="felt-row-main felt-row-title"><PlayerName id={t.from} /> pays <PlayerName id={t.to} /></span>
                    <span className="sat-num" style={{ fontWeight: 600 }}>{money(t.amount, currency)}</span>
                  </div>
                ))}
              </div>
              <button className="sat-btn" onClick={() => withUndo('Every payment in the group marked paid.', () => settleGroup(grp.id, closed.map((g) => g.id)))}><Icon name="check" /> Mark all paid</button>
            </>
          )}
        </section>

        <section className="felt-section">
          <h2 className="sat-h3">Leaderboard</h2>
          {board.length === 0 ? <p className="sat-small sat-muted">Closed games of this group appear here.</p> : (
            <div className="sat-glass-2 felt-list">
              {board.map((s, i) => (
                <button key={s.playerId} className="felt-row felt-row--slim" onClick={() => go(`players/stats/${s.playerId}`)}>
                  <span className="sat-mono sat-muted" style={{ width: 16 }}>{i + 1}</span>
                  <div className="felt-row-main"><div className="felt-row-title"><PlayerName id={s.playerId} /></div><div className="felt-row-sub">{s.games} games</div></div>
                  <Delta value={s.net} format={(a) => money(a, currency)} />
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="felt-section">
          <h2 className="sat-h3">Games</h2>
          {games.length === 0 ? <p className="sat-small sat-muted">{isOthers ? 'Every game belongs to a group.' : 'Pick this group when you start a game, or under Game settings.'}</p> : (
            <div className="sat-flat felt-list">
              {games.map((g) => (
                <button key={g.id} className="felt-row felt-row--slim" onClick={() => go(g.status === 'live' ? `game/${g.id}` : `game/${g.id}/hands`)}>
                  <div className="felt-row-main"><div className="felt-row-title felt-ellipsis"><span data-game-title={g.id} style={{ display: 'inline-block', verticalAlign: 'bottom', maxWidth: '100%' }}>{g.name}</span>{` (${dateLabel(g.startedAt)})`}</div><div className="felt-row-sub">{gameCaption(g)}</div></div>
                  {g.status === 'live' ? <span className="sat-badge"><span className="felt-dot" />Live</span> : openTransfers(g).length ? <span className="sat-badge sat-badge--muted">{openTransfers(g).length} unpaid</span> : <span className="sat-small sat-muted">{shortDate(g.endedAt ?? g.startedAt)}</span>}
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
      {edit && !isOthers && <GroupSheet grp={grp} onClose={() => setEdit(false)} />}
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
          withUndo('Group deleted. Games are kept.', () => deleteGroup(grp.id));
          onClose();
          backTo('players');
        }}><Icon name="trash" /> Delete group</button>
      )}
    </Sheet>
  );
}
