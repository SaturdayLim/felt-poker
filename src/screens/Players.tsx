import { useState, type ReactNode } from 'react';
import { useStore } from '../store';
import { go } from '../router';
import { Avatar, Caption, Delta, Header, Icon, SlidePane, toast } from '../components/ui';
import Insights from './Insights';
import { PlayerSheet, titleCase } from '../components/players';
import { filterGames, playerSummary } from '../lib/stats';
import { GroupSheet, groupSettlement } from './Group';
import { figureDelta } from '../lib/format';
import { summaryFigure } from '../lib/stats';
import type { Player } from '../types';

export type PlayersView = 'list' | 'board' | 'stats';
const VIEWS: { k: PlayersView; label: string; path: string }[] = [
  { k: 'list', label: 'Players', path: 'players' }, { k: 'board', label: 'Leaderboard', path: 'players/board' }, { k: 'stats', label: 'Stats', path: 'players/stats' },
];

/** The Players tab: the saved players, the leaderboard and each player's stats, which are all about players. */
export default function Players({ view = 'list', pid }: { view?: PlayersView; pid?: string }) {
  return (
    <div className="felt-page">
      <Header banner="Players" tabs={VIEWS.map((v) => ({ label: v.label, on: view === v.k, go: () => go(v.path, true) }))} />
      <div className="sat-stack">
        <SlidePane k={view} i={VIEWS.findIndex((v) => v.k === view)}>
          {view === 'list' ? <PlayerList /> : <Insights embedded mode={view === 'board' ? 'standings' : 'player'} initialPlayer={pid} />}
        </SlidePane>
      </div>
    </div>
  );
}

/** The body of a list that opens and closes: the rows slide down as it opens and back up as it closes.
    The rows mount on the first open and then stay, so a close can slide them away. A closed body is inert. */
function FoldBody({ open, children }: { open: boolean; children: ReactNode }) {
  const [seen, setSeen] = useState(open);
  if (open && !seen) setSeen(true);
  return (
    <div className="felt-fold-wrap" data-open={open} {...(open ? {} : { inert: '' })}>
      <div className="felt-fold-inner">{seen && children}</div>
    </div>
  );
}

function PlayerList() {
  const players = useStore((s) => s.players);
  const games = useStore((s) => s.games);
  const currency = useStore((s) => s.settings.currency);
  const showMoney = useStore((s) => s.settings.showMoney);
  const addPlayer = useStore((s) => s.addPlayer);
  const groups = useStore((s) => s.groups);
  const [newGroup, setNewGroup] = useState(false);
  const [nm, setNm] = useState('');
  const [edit, setEdit] = useState<Player | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const saveGroup = useStore((s) => s.saveGroup);
  // which lists are open: one tap opens or closes a list. Kept on this phone
  const [opened, setOpened] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('felt-players-open') ?? '[]'); } catch { return []; } });
  const isOpen = (k: string) => opened.includes(k);
  const toggle = (k: string) => setOpened((o) => {
    const next = o.includes(k) ? o.filter((x) => x !== k) : [...o, k];
    try { localStorage.setItem('felt-players-open', JSON.stringify(next)); } catch { /* private mode */ }
    return next;
  });
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
    <>
      <div className="sat-stack">
        <div className="sat-cluster" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)', flexWrap: 'nowrap' }}>
          <input className="sat-input" aria-label="New player name" placeholder="New player (e.g. Dani)" value={nm} onChange={(e) => setNm(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} enterKeyHint="done" />
          <button className="sat-btn sat-btn--primary" onClick={add} aria-disabled={!nm.trim()}><Icon name="plus" /> Add</button>
        </div>
        {players.some((p) => p.archived) && (
          <div className="sat-switch-row">
            <span>Show hidden players ({players.filter((p) => p.archived).length})</span>
            <button className="sat-switch" role="switch" aria-checked={showArchived} aria-label="Show hidden players" onClick={() => setShowArchived(!showArchived)} />
          </div>
        )}
        <section className="felt-section">
          <div className="sat-split">
            <Caption tip="groups">Groups</Caption>
            <button className="sat-btn sat-btn--ghost sat-btn--sm" onClick={() => setNewGroup(true)}><Icon name="plus" /> New group</button>
          </div>
          {groups.map((grp) => {
            const gs = games.filter((g) => g.groupId === grp.id && g.status === 'closed');
            const owed = groupSettlement(gs).transfers.length;
            const open = isOpen(`g:${grp.id}`);
            return (
              <div key={grp.id} className="sat-glass-2 felt-fold">
                <button type="button" className="felt-row felt-fold-head" aria-expanded={open} onClick={() => toggle(`g:${grp.id}`)}>
                  <span className="felt-row-main">
                    <span className="felt-row-title">{grp.name}</span>
                    <span className="felt-row-sub">{grp.playerIds.length} players, {gs.length} games{owed > 0 ? `, ${owed} to pay` : ''}</span>
                  </span>
                  <span className="felt-fold-chev" aria-hidden="true"><Icon name="chevron" size={18} /></span>
                </button>
                <FoldBody open={open}>
                  <div className="felt-fold-body">
                    {/* tap a name to add it to the group or take it out */}
                    <div className="sat-cluster" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)' }}>
                      {players.filter((p) => !p.archived || grp.playerIds.includes(p.id)).sort((a, b) => a.name.localeCompare(b.name)).map((p) => {
                        const inGroup = grp.playerIds.includes(p.id);
                        return <button key={p.id} type="button" className="sat-chip" aria-pressed={inGroup}
                          onClick={() => saveGroup({ ...grp, playerIds: inGroup ? grp.playerIds.filter((x) => x !== p.id) : [...grp.playerIds, p.id] })}>{p.name}</button>;
                      })}
                    </div>
                    <button className="sat-btn sat-btn--sm" onClick={() => go(`group/${grp.id}`)}>Open {grp.name}</button>
                  </div>
                </FoldBody>
              </div>
            );
          })}
        </section>

        <div className="sat-glass-2 felt-fold">
          <button type="button" className="felt-row felt-fold-head" aria-expanded={isOpen('all')} onClick={() => toggle('all')}>
            <span className="felt-row-main"><span className="felt-row-title">Everyone</span><span className="felt-row-sub">{list.length} players</span></span>
            <span className="felt-fold-chev" aria-hidden="true"><Icon name="chevron" size={18} /></span>
          </button>
          <FoldBody open={isOpen('all')}>{list.length === 0
            ? <div className="felt-fold-body sat-small sat-muted">Add the people you play with. They are saved for every game.</div>
            : list.map((p) => {
              const s = playerSummary(closed, p.id);
              return (
                <button key={p.id} type="button" className={`felt-row ${p.archived ? 'is-hidden' : ''}`} onClick={() => setEdit(p)}>
                  <Avatar name={p.name} />
                  <span className="felt-row-main">
                    <span className="felt-row-title">{p.name}</span>
                    <span className="felt-row-sub">{s.games} games, {s.handsWon} hands won{p.archived ? ', hidden' : ''}</span>
                  </span>
                  {s.games ? <Delta {...figureDelta(summaryFigure(s, currency), showMoney)} /> : <span className="sat-muted">-</span>}
                </button>
              );
            })}
          </FoldBody>
        </div>
      </div>
      {edit && <PlayerSheet p={edit} onClose={() => setEdit(null)} />}
      {newGroup && <GroupSheet onClose={() => setNewGroup(false)} />}
    </>
  );
}
