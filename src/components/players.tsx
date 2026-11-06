import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePlayerName, useStore } from '../store';
import { Delta, Help, HoldButton, Icon, Sheet, toast, WordButton } from './ui';
import { showCode } from '../lib/codes';
import { haptic } from '../lib/haptics';
import { filterGames, playerSummary } from '../lib/stats';
import { gameResults } from '../lib/calc';
import { contributions } from '../lib/hand';
import { money, shortDate } from '../lib/format';
import { go } from '../router';
import type { Game, ID, Player } from '../types';

/* ---------------------------- name autocorrect ---------------------------- */

export function titleCase(s: string): string {
  return s.trim().replace(/\s+/g, ' ').replace(/(^|[\s-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());
}

function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** Closest saved player to what was typed: exact, then start of name, then up to 1 typo (2 for longer names). */
export function matchPlayer(input: string, players: Player[]): Player | null {
  const q = input.trim().toLowerCase();
  if (!q) return null;
  const list = players.filter((p) => !p.archived);
  const exact = list.find((p) => p.name.toLowerCase() === q);
  if (exact) return exact;
  const prefix = list.filter((p) => p.name.toLowerCase().startsWith(q));
  if (prefix.length) return prefix.sort((a, b) => a.name.length - b.name.length)[0];
  const limit = q.length <= 4 ? 1 : 2;
  let best: Player | null = null, bestD = Infinity;
  for (const p of list) {
    const dd = distance(q, p.name.toLowerCase());
    if (dd <= limit && dd < bestD) { best = p; bestD = dd; }
  }
  return best;
}

/** Name field that corrects to a saved player on Enter, with an explicit option to add a new name instead. */
export function NameEntry({ onPick, exclude = [], placeholder = 'Player name (e.g. Keven)' }: {
  onPick: (p: Player) => void; exclude?: string[]; placeholder?: string;
}) {
  const players = useStore((s) => s.players);
  const addPlayer = useStore((s) => s.addPlayer);
  const [v, setV] = useState('');
  const pool = players.filter((p) => !exclude.includes(p.id));
  const match = matchPlayer(v, pool);
  const typed = titleCase(v);
  const isExact = !!match && match.name.toLowerCase() === v.trim().toLowerCase();
  const takenElsewhere = players.some((p) => p.name.toLowerCase() === typed.toLowerCase());

  const pick = (p: Player) => { onPick(p); setV(''); };
  const addNew = () => {
    if (!typed) return;
    const existing = players.find((p) => p.name.toLowerCase() === typed.toLowerCase());
    if (existing) { pick(existing); return; }
    const p = addPlayer(typed);
    toast(`${p.name} saved to players`);
    pick(p);
  };
  const enter = () => { if (match) pick(match); else addNew(); };

  return (
    <div className="sat-stack" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)' }}>
      <div className="sat-cluster" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)', flexWrap: 'nowrap' }}>
        <input className="sat-input" aria-label="Player name" placeholder={placeholder} value={v} autoCapitalize="words" autoComplete="off" autoCorrect="off" spellCheck={false}
          onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); enter(); } }} enterKeyHint="done" />
        <button className="sat-btn sat-iconbtn" onClick={enter} aria-disabled={!v.trim()} aria-label={match ? `Add ${match.name}` : 'Add new player'}><Icon name="plus" /></button>
      </div>
      {v.trim() && (
        <div className="sat-cluster sat-small" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)' }}>
          {match ? (
            <>
              <span className="sat-muted">Enter adds</span>
              <button className="sat-chip" aria-pressed="true" onClick={() => pick(match)}>{match.name}</button>
              {!isExact && !takenElsewhere && <button className="sat-btn sat-btn--ghost sat-btn--sm" onClick={addNew}>Save "{typed}" as new</button>}
            </>
          ) : (
            <span className="sat-muted">Enter saves {typed} as a new player.</span>
          )}
        </div>
      )}
    </div>
  );
}

/** Seat someone mid-game: saved players come first, one tap each. A new name that is already saved is flagged,
    and the user is asked for a different name. */
export function SeatPicker({ inGame, onPick }: { inGame: ID[]; onPick: (p: Player) => void }) {
  const players = useStore((s) => s.players);
  const addPlayer = useStore((s) => s.addPlayer);
  const [v, setV] = useState('');
  const typed = titleCase(v);
  const q = typed.toLowerCase();
  const same = q ? players.find((p) => p.name.toLowerCase() === q) : undefined;
  const pool = players
    .filter((p) => !inGame.includes(p.id) && (!p.archived || p === same) && (!q || p.name.toLowerCase().includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name));
  const flag = !same ? '' : inGame.includes(same.id) ? `${same.name} is already in this game. Enter a different name.` : `${same.name} is already saved. Tap the name above, or enter a different name.`;
  const addNew = () => {
    if (!typed || same) return;
    const p = addPlayer(typed);
    toast(`${p.name} saved to players`);
    onPick(p);
    setV('');
  };
  return (
    <div className="sat-stack" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)' }}>
      {pool.length > 0 && (
        <div className="sat-cluster" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)' }}>
          {pool.map((p) => <button key={p.id} type="button" className="sat-chip" onClick={() => { onPick(p); setV(''); }}>{p.name}</button>)}
        </div>
      )}
      <div className="sat-cluster" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)', flexWrap: 'nowrap' }}>
        <input className="sat-input" aria-label="New player name" aria-invalid={!!flag} placeholder="New player name" value={v} autoCapitalize="words" autoComplete="off" autoCorrect="off" spellCheck={false}
          onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addNew(); } }} enterKeyHint="done" />
        <button type="button" className="sat-btn sat-iconbtn" onClick={addNew} aria-disabled={!typed || !!same} aria-label={typed ? `Add ${typed}` : 'Add new player'}><Icon name="plus" /></button>
      </div>
      {flag && <span className="sat-error" role="alert">{flag}</span>}
    </div>
  );
}

/* ---------------------------- press and hold ---------------------------- */

/** Tap runs onTap; press and hold for 500ms runs onHold (with a short vibration where supported). */
export function useHold(onTap: () => void, onHold: () => void, ms = 500) {
  const timer = useRef<number | undefined>(undefined);
  const held = useRef(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const clear = () => { window.clearTimeout(timer.current); start.current = null; };
  return {
    onPointerDown: (e: React.PointerEvent) => {
      held.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      timer.current = window.setTimeout(() => { held.current = true; haptic(12); onHold(); }, ms);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) clear();
    },
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    onClick: () => { if (held.current) { held.current = false; return; } onTap(); },
  };
}

/** Player chip: tap to pick, press and hold to edit or delete the saved name. */
export function PlayerChip({ player, pressed, onTap, children }: { player: Player; pressed: boolean; onTap: () => void; children?: ReactNode }) {
  const [editing, setEditing] = useState(false);
  const hold = useHold(onTap, () => setEditing(true));
  return (
    <>
      <button className="sat-chip felt-hold" aria-pressed={pressed} aria-description="Press and hold to edit" {...hold}>{children ?? player.name}</button>
      {editing && <PlayerEditSheet p={player} onClose={() => setEditing(false)} />}
    </>
  );
}

/* ---------------------------- edit sheet ---------------------------- */

export function PlayerEditSheet({ p, onClose }: { p: Player; onClose: () => void }) {
  const st = useStore();
  const [nm, setNm] = useState(p.name);
  const [confirm, setConfirm] = useState(false);
  const inGames = st.games.filter((g) => g.playerIds.includes(p.id)).length;
  const save = () => {
    const n = titleCase(nm);
    if (!n) { toast('Enter a name (e.g. Keven).'); return; }
    if (st.players.some((x) => x.id !== p.id && x.name.toLowerCase() === n.toLowerCase())) { toast(`${n} is already saved. Use a different name.`); return; }
    st.renamePlayer(p.id, n);
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title="Edit player" sub={inGames ? `In ${inGames} game${inGames === 1 ? '' : 's'}.` : 'Not in any games yet.'}>
      <div className="sat-field">
        <label htmlFor="pe-name">Name</label>
        <input id="pe-name" className="sat-input" value={nm} autoCapitalize="words" onChange={(e) => setNm(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
      </div>
      <WordButton word="Saved" ready={!!titleCase(nm)} className="sat-btn sat-btn--primary sat-btn--block" run={save}>Save name</WordButton>
      {inGames ? (
        <div className="sat-stack" style={{ ['--sat-gap' as string]: 'var(--sat-space-1)' }}>
          <button className="sat-btn sat-btn--block" onClick={() => { st.setPlayerArchived(p.id, !p.archived); toast(p.archived ? `${p.name} restored to the list` : `${p.name} removed from the list`); onClose(); }}>
            {p.archived ? 'Restore to the list' : 'Remove from the list'}
          </button>
          <p className="sat-small sat-muted">Their past games and stats stay. They no longer show when you start a game.</p>
        </div>
      ) : (
        <button className="sat-btn sat-btn--ghost sat-btn--block" style={{ color: 'var(--sat-neg)' }}
          onClick={() => { if (!confirm) { setConfirm(true); return; } st.deletePlayer(p.id); toast(`${p.name} deleted`); onClose(); }}>
          <Icon name="trash" /> {confirm ? 'Tap again to delete' : 'Delete player'}
        </button>
      )}
    </Sheet>
  );
}

/* ---------------------------- player code ---------------------------- */

/** The code icon. Grey shut eye: no code, the player has no game yet. Shut eye: a code is ready, tap shows it. Open eye: the code is
    on screen, tap hides it. Refresh: the code was seen, holding it replaces the code, and the old code stops working. */
export function CodeControl({ pid, label }: { pid: ID; label?: boolean }) {
  const p = useStore((s) => s.players.find((x) => x.id === pid));
  const inGame = useStore((s) => s.games.some((g) => g.playerIds.includes(pid)));
  const issueCode = useStore((s) => s.issueCode);
  const revealCode = useStore((s) => s.revealCode);
  const [shown, setShown] = useState<string | null>(null);
  if (!p) return null;
  const ready = !!p.code && inGame;
  const replace = () => { const c = issueCode(pid); setShown(c); toast('Code replaced'); };
  const tap = () => {
    if (!ready) { toast('A code starts when this player joins a game.'); return; }
    if (shown) { setShown(null); return; }
    revealCode(pid);
    setShown(p.code!);
  };
  const copy = () => {
    if (!shown) return;
    navigator.clipboard?.writeText(`${p.name}, your Felt player code is ${showCode(shown)}. Keep it private.`)
      .then(() => toast(`Message for ${p.name} copied.`), () => toast('Copy was blocked.'));
  };
  const icon = !ready ? 'dark' : shown ? 'eye' : p.codeIssued ? 'refresh' : 'dark';
  const what = !ready ? 'No code yet' : shown ? 'Hide the code' : p.codeIssued ? 'Replace the code' : 'Show the code';
  return (
    <span className={`felt-codectl ${ready ? '' : 'is-none'}`}>
      {label && <span className="felt-codectl-label">Player code<Help k="playerCode" /></span>}
      {shown && <b className="felt-codectl-shown sat-num felt-selectable" aria-label={`Code ${shown}`}>{showCode(shown)}</b>}
      {label && shown && <button type="button" className="sat-btn sat-btn--ghost sat-iconbtn" aria-label={`Copy a message with the code for ${p.name}`} onClick={copy}><Icon name="file" /></button>}
      {ready && !shown && p.codeIssued
        ? <HoldButton label={`${what}: ${p.name}`} hint="Tap and hold to replace code" onDone={replace}><Icon name={icon} /></HoldButton>
        : <button type="button" className="sat-btn sat-btn--ghost sat-iconbtn felt-codectl-btn" aria-label={`${what}: ${p.name}`} aria-pressed={!!shown} onClick={tap}><Icon name={icon} /></button>}
    </span>
  );
}

/** The name at the top of the player card, edited in place: plain text only. Enter or leaving the field saves it;
    Escape puts it back. A name already saved for another player is refused. */
function NameField({ p }: { p: Player }) {
  const st = useStore();
  const [nm, setNm] = useState(p.name);
  useEffect(() => setNm(p.name), [p.name]);
  const save = () => {
    const n = titleCase(nm);
    if (n === p.name) { setNm(p.name); return; }
    if (!n) { toast('Enter a name (e.g. Keven).'); setNm(p.name); return; }
    if (st.players.some((x) => x.id !== p.id && x.name.toLowerCase() === n.toLowerCase())) { toast(`${n} is already saved. Use a different name.`); setNm(p.name); return; }
    st.renamePlayer(p.id, n);
    setNm(n);
    toast(`Name saved: ${n}`);
  };
  return (
    <input className="felt-name-edit sat-h3" aria-label={`Name of ${p.name}. Edit to change it`} value={nm} maxLength={40} autoCapitalize="words" autoComplete="off" spellCheck={false}
      onChange={(e) => setNm(e.target.value.replace(/[\r\n\t]/g, ' '))} onBlur={save}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setNm(p.name); e.currentTarget.blur(); } }} />
  );
}

/** Hands a player won (took chips from a pot) and lost (put chips in, took none) in one game. */
function handTally(g: Game, p: ID) {
  let won = 0, lost = 0;
  for (const h of g.hands) {
    if (h.missed) continue;
    if (h.winners.some((w) => w.playerId === p && w.amount > 0)) won++;
    else if (h.log && (contributions(g, h.log, h.log.button)[p] ?? 0) > 0) lost++;
  }
  return { won, lost };
}

/** The player pop-up, top to bottom: the name (edit in place), the code, Net, Win rate and Games, then Full stats.
    Net lists each game's buy-in, end and result. Win rate lists hands won and lost in each game. Games opens the
    Games page for this player. A swipe down or a tap outside closes it. */
export function PlayerSheet({ p, onClose }: { p: Player; onClose: () => void }) {
  const games = useStore((s) => s.games);
  const currency = useStore((s) => s.settings.currency);
  const [view, setView] = useState<'card' | 'net' | 'rate'>('card');
  const s = playerSummary(filterGames(games, 'all', 'all'), p.id);
  const played = games.filter((g) => g.playerIds.includes(p.id)).sort((a, b) => b.startedAt - a.startedAt);
  const closed = played.filter((g) => g.status === 'closed');
  const stats = () => { onClose(); go(`players/stats/${p.id}`); };
  const open = (g: Game) => { onClose(); go(g.status === 'live' ? `game/${g.id}` : `game/${g.id}/close`); };
  const back = <button className="sat-btn sat-btn--block" onClick={() => setView('card')}>Back to {p.name}</button>;
  if (view === 'net') {
    return (
      <Sheet open noClose onClose={onClose} title={`${p.name}: Net`}>
        {closed.length === 0 && <p className="sat-small sat-muted">No closed games yet.</p>}
        {closed.length > 0 && (
          <div className="sat-flat felt-list">
            {closed.map((g) => {
              const r = gameResults(g).find((x) => x.playerId === p.id)!;
              return (
                <button key={g.id} className="felt-row" onClick={() => open(g)}>
                  <span className="felt-row-main">
                    <span className="felt-row-title felt-ellipsis">{g.name}</span>
                    <span className="felt-row-sub sat-num">{shortDate(g.startedAt)}: in {money(r.in, g.currency)}, out {money(r.out, g.currency)}</span>
                  </span>
                  <Delta value={r.net} format={(a) => money(a, g.currency)} />
                </button>
              );
            })}
          </div>
        )}
        {back}
      </Sheet>
    );
  }
  if (view === 'rate') {
    return (
      <Sheet open noClose onClose={onClose} title={`${p.name}: Hands won and lost`}>
        {played.length === 0 && <p className="sat-small sat-muted">Not in any games yet.</p>}
        {played.length > 0 && (
          <div className="sat-flat felt-list">
            {played.map((g) => {
              const t = handTally(g, p.id);
              return (
                <button key={g.id} className="felt-row" onClick={() => open(g)}>
                  <span className="felt-row-main">
                    <span className="felt-row-title felt-ellipsis">{g.name}</span>
                    <span className="felt-row-sub">{g.status === 'live' ? 'Live' : shortDate(g.startedAt)}</span>
                  </span>
                  <span className="felt-row-end sat-num"><b className="felt-up">{t.won} won</b><br /><span className="felt-down">{t.lost} lost</span></span>
                </button>
              );
            })}
          </div>
        )}
        {back}
      </Sheet>
    );
  }
  return (
    <Sheet open noClose onClose={onClose} title={p.name} head={<NameField p={p} />}>
      <CodeControl pid={p.id} label />
      <div className="felt-tiles">
        <button type="button" className="sat-flat sat-card felt-fig" onClick={() => setView('net')}><span className="sat-caption">Net</span><b className="sat-num">{s.games ? money(s.net, currency, { sign: true }) : '-'}</b></button>
        <button type="button" className="sat-flat sat-card felt-fig" onClick={() => setView('rate')}><span className="sat-caption">Win rate</span><b className="sat-num">{s.games ? `${Math.round(s.winRate * 100)}%` : '-'}</b></button>
        <button type="button" className="sat-flat sat-card felt-fig" onClick={() => { onClose(); go(`games/${p.id}`); }}><span className="sat-caption">Games</span><b className="sat-num">{played.length}</b></button>
      </div>
      <button className="sat-btn sat-btn--primary sat-btn--block" onClick={stats}>Full stats</button>
    </Sheet>
  );
}

/* ---------------------------- a name opens the player card ---------------------------- */

let showPlayer: ((id: ID) => void) | null = null;
export const openPlayer = (id: ID) => showPlayer?.(id);

/** Sits once at the top of the app and shows the player card that a name asks for. */
export function PlayerHost() {
  const [id, setId] = useState<ID | null>(null);
  const p = useStore((s) => s.players.find((x) => x.id === id));
  useEffect(() => { showPlayer = setId; return () => { showPlayer = null; }; }, []);
  return p ? <PlayerSheet key={p.id} p={p} onClose={() => setId(null)} /> : null;
}

/** A player's name anywhere outside logging. A tap opens the player card, even inside a row that opens something else. */
export function PlayerName({ id }: { id: ID }) {
  const name = usePlayerName();
  const open = (e: { stopPropagation: () => void; preventDefault: () => void }) => { e.stopPropagation(); e.preventDefault(); openPlayer(id); };
  return <span role="button" tabIndex={0} className="felt-name" data-player={id} data-press="name" aria-label={`Open the player card of ${name(id)}`} onClick={open} onKeyDown={(e) => { if (e.key === 'Enter') open(e); }}>{name(id)}</span>;
}
