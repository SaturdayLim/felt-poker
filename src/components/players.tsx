import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePlayerName, useStore } from '../store';
import { Delta, Disclose, Help, HoldFill, Icon, Sheet, toast, WordButton } from './ui';
import { ALPHABET, newCode, showCode } from '../lib/codes';
import { haptic } from '../lib/haptics';
import { filterGames, playerSummary, summaryFigure } from '../lib/stats';
import { gameFigure, gameResults } from '../lib/calc';
import { figureDelta, gameTitle, figureNumber, figureUnit, money, units } from '../lib/format';
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

/** One rule for both name fields. `exact`: a saved player with this name (any case). `close`: no exact match, but a saved
    name that starts with the text or is 1 typo away (2 for longer names). Close is never added silently. */
export function findSaved(input: string, players: Player[]): { exact: Player | null; close: Player | null } {
  const q = input.trim().toLowerCase();
  if (!q) return { exact: null, close: null };
  const exact = players.find((p) => p.name.toLowerCase() === q) ?? null;
  if (exact) return { exact, close: null };
  const list = players.filter((p) => !p.archived);
  const prefix = list.filter((p) => p.name.toLowerCase().startsWith(q)).sort((x, y) => x.name.length - y.name.length)[0];
  if (prefix) return { exact: null, close: prefix };
  const limit = q.length <= 4 ? 1 : 2;
  let best: Player | null = null, bestD = Infinity;
  for (const p of list) {
    const dd = distance(q, p.name.toLowerCase());
    if (dd <= limit && dd < bestD) { best = p; bestD = dd; }
  }
  return { exact: null, close: best };
}

/** Name field for New Game. Enter adds an exact saved name, or saves a new name. A new name close to a saved one is
    flagged with two plain choices and never replaced. */
export function NameEntry({ onPick, placeholder = 'Player name (e.g. Dani)' }: {
  onPick: (p: Player) => void; placeholder?: string;
}) {
  const players = useStore((s) => s.players);
  const addPlayer = useStore((s) => s.addPlayer);
  const [v, setV] = useState('');
  const typed = titleCase(v);
  const { exact, close } = findSaved(typed, players);

  const pick = (p: Player) => { onPick(p); setV(''); };
  const addNew = () => {
    if (!typed) return;
    const p = addPlayer(typed);
    toast(`${p.name} saved to players.`);
    pick(p);
  };
  // Enter never picks a close match for the user: the flag below stays until a choice is made
  const enter = () => { if (exact) pick(exact); else if (!close) addNew(); };

  return (
    <div className="sat-stack" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)' }}>
      <div className="sat-cluster" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)', flexWrap: 'nowrap' }}>
        <input className="sat-input" aria-label="Player name" aria-invalid={!!close} placeholder={placeholder} value={v} autoCapitalize="words" autoComplete="off" autoCorrect="off" spellCheck={false}
          onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); enter(); } }} enterKeyHint="done" />
        <button className="sat-btn sat-iconbtn" onClick={enter} aria-disabled={!v.trim() || (!exact && !!close)} aria-label={exact ? `Add ${exact.name}` : 'Add new player'}><Icon name="plus" /></button>
      </div>
      {close && !exact && (
        <div className="sat-stack sat-small" role="alert" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)' }}>
          <span className="sat-error">{close.name} is saved. Add {close.name}, or save {typed} as new?</span>
          <div className="sat-cluster" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)' }}>
            <button type="button" className="sat-btn sat-btn--sm" onClick={() => pick(close)}>Add {close.name}</button>
            <button type="button" className="sat-btn sat-btn--sm sat-btn--ghost" onClick={addNew}>Save {typed} as new</button>
          </div>
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
  const same = findSaved(typed, players).exact ?? undefined;
  const pool = players
    .filter((p) => !inGame.includes(p.id) && (!p.archived || p === same) && (!q || p.name.toLowerCase().includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name));
  const flag = !same ? '' : inGame.includes(same.id) ? `${same.name} is already in this game. Enter a different name.` : `${same.name} is already saved. Tap the name above, or enter a different name.`;
  const addNew = () => {
    if (!typed || same) return;
    const p = addPlayer(typed);
    toast(`${p.name} saved to players.`);
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
    if (!n) { toast('Enter a name (e.g. Dani).'); return; }
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
          <button className="sat-btn sat-btn--block" onClick={() => { st.setPlayerArchived(p.id, !p.archived); toast(p.archived ? `${p.name} restored to the list.` : `${p.name} removed from the list.`); onClose(); }}>
            {p.archived ? 'Restore to the list' : 'Remove from the list'}
          </button>
          <p className="sat-small sat-muted">Their past games and stats stay. They no longer show when you start a game.</p>
        </div>
      ) : (
        <button className="sat-btn sat-btn--ghost sat-btn--block" style={{ color: 'var(--sat-neg)' }}
          onClick={() => { if (!confirm) { setConfirm(true); return; } st.deletePlayer(p.id); toast(`${p.name} deleted.`); onClose(); }}>
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
  const revealCode = useStore((s) => s.revealCode);
  const [shown, setShown] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  if (!p) return null;
  const ready = !!p.code && inGame;
  const tap = () => {
    if (!ready) { toast('A code starts when this player joins a game.'); return; }
    if (shown) { setShown(null); return; }
    revealCode(pid);
    setShown(p.code!);
  };
  const copy = () => {
    if (!shown) return;
    navigator.clipboard?.writeText(`${p.name}: ${showCode(shown)}`)
      .then(() => toast('Code copied.'), () => toast('Copy was blocked.'));
  };
  const icon = !ready ? 'dark' : shown ? 'eye' : p.codeIssued ? 'refresh' : 'dark';
  const what = !ready ? 'No code yet' : shown ? 'Hide the code' : p.codeIssued ? 'Replace the code' : 'Show the code';
  return (
    <span className={`felt-codectl ${ready ? '' : 'is-none'}`}>
      {label && <span className="felt-codectl-label">Player code<Help k="playerCode" /></span>}
      {label && shown ? (
        // the code with its copy button beneath it
        <span className="felt-codectl-col">
          <b className="felt-codectl-shown sat-num felt-selectable" aria-label={`Code ${shown}`}>{showCode(shown)}</b>
          <button type="button" className="sat-btn sat-btn--ghost sat-btn--sm" onClick={copy}><Icon name="file" size={16} /> Copy code</button>
        </span>
      ) : shown && <b className="felt-codectl-shown sat-num felt-selectable" aria-label={`Code ${shown}`}>{showCode(shown)}</b>}
      {asking && <ReplaceCodeSheet pid={pid} name={p.name} onClose={() => setAsking(false)} onNew={(c) => setShown(c)} />}
      {ready && !shown && p.codeIssued
        ? <button type="button" className="sat-btn sat-btn--ghost sat-iconbtn felt-codectl-btn" aria-label={`${what}: ${p.name}`} onClick={() => setAsking(true)}><Icon name={icon} /></button>
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
    if (!n) { toast('Enter a name (e.g. Dani).'); setNm(p.name); return; }
    if (st.players.some((x) => x.id !== p.id && x.name.toLowerCase() === n.toLowerCase())) { toast(`${n} is already saved. Use a different name.`); setNm(p.name); return; }
    st.renamePlayer(p.id, n);
    setNm(n);
    toast(`Name saved: ${n}.`);
  };
  return (
    <input className="felt-name-edit sat-h3" aria-label={`Name of ${p.name}. Edit to change it`} value={nm} maxLength={40} autoCapitalize="words" autoComplete="off" spellCheck={false}
      onChange={(e) => setNm(e.target.value.replace(/[\r\n\t]/g, ' '))} onBlur={save}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setNm(p.name); e.currentTarget.blur(); } }} />
  );
}

/** The player pop-up, top to bottom: the name (edit in place), the code, Net, Games up and Games, then one summary list
    of the player's games, then Full stats. A tap on a blank part of the card opens or closes the list. Each row shows
    the game and date, the buy-in, the net and the hands won. A swipe down, a swipe sideways or a tap outside closes the card. */
/** Hands this player won among the hands counted as logged (same base as `playerSummary().logged`). */
const wonLogged = (g: Game, pid: ID) => g.hands.filter((h) => !h.missed && !h.excluded && h.log?.dealt.includes(pid) && h.winners.some((w) => w.playerId === pid)).length;

export function PlayerSheet({ p, onClose }: { p: Player; onClose: () => void }) {
  const games = useStore((s) => s.games);
  const currency = useStore((s) => s.settings.currency);
  const showMoney = useStore((s) => s.settings.showMoney);
  const [more, setMore] = useState(false);
  const s = playerSummary(filterGames(games, 'all', 'all'), p.id);
  const played = games.filter((g) => g.playerIds.includes(p.id)).sort((a, b) => b.startedAt - a.startedAt);
  // leaving for another page: the sheet first slides down off the screen, and only then does the page change
  const leave = useRef<((after?: () => void) => void) | null>(null);
  const goAfter = (path: string) => { if (leave.current) leave.current(() => go(path)); else { onClose(); go(path); } };
  const stats = () => goAfter(`players/stats/${p.id}`);
  const open = (g: Game) => goAfter(g.status === 'live' ? `game/${g.id}` : `game/${g.id}/hands`);
  // a tap on any blank part of the card opens or closes the list; a control keeps its own job
  const anchor = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const d = anchor.current?.closest('dialog');
    if (!d) return;
    const tap = (e: MouseEvent) => {
      if (e.target === d) return; // a tap on the backdrop closes the sheet; it must not toggle the list
      if ((e.target as HTMLElement).closest?.('button, input, a, [role="button"], .sat-tip, .felt-row, .felt-codectl')) return;
      setMore((m) => !m);
    };
    d.addEventListener('click', tap);
    return () => d.removeEventListener('click', tap);
  }, []);
  const tile = (cap: string, value: string, chev?: boolean, tip?: 'gamesUp') => {
    const inner = <><span className="sat-caption">{cap}</span><b className="sat-num">{value}</b>
      {chev && <span className="felt-fig-chev" data-open={more} aria-hidden="true"><Icon name="chevron" size={14} stroke={2.2} /></span>}</>;
    return chev
      ? <button type="button" className="sat-flat sat-card felt-fig" aria-expanded={more} onClick={() => setMore(!more)}>{inner}</button>
      : <div className="sat-flat sat-card felt-fig">{inner}{tip && <span className="felt-fig-tip"><Help k={tip} /></span>}</div>;
  };
  return (
    <Sheet open onClose={onClose} dismissRef={leave} title={p.name} head={<NameField p={p} />}>
      <span ref={anchor} hidden />
      <CodeControl pid={p.id} label />
      <div className="felt-tiles">
        {tile(`Net (${figureUnit(summaryFigure(s, currency), showMoney)})`, s.games ? figureNumber(summaryFigure(s, currency), showMoney, { sign: true }) : '-')}
        {tile('Games up', s.games ? `${Math.round(s.winRate * 100)}%` : '-', false, 'gamesUp')}
        {tile('Games', String(played.length), true)}
      </div>
      <Disclose open={more}>
        {played.length === 0 ? <p className="sat-small sat-muted">Not in any games yet.</p> : (
          <div className="sat-stack" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)' }}>
            <div className="sat-flat felt-list">
              {played.map((g) => {
                const r = gameResults(g).find((x) => x.playerId === p.id);
                const ps = playerSummary([g], p.id);
                const buyIn = r ? (g.type === 'cash' && !showMoney ? units(r.inUnits) : money(r.in, g.currency)) : '0';
                return (
                  <button key={g.id} className="felt-row" onClick={() => open(g)}>
                    <span className="felt-row-main">
                      <span className="felt-row-title felt-ellipsis">{gameTitle(g)}</span>
                      <span className="felt-row-sub sat-num">Buy-in: {buyIn}</span>
                    </span>
                    <span className="felt-row-end sat-num">
                      {g.status === 'closed' ? <Delta {...figureDelta(gameFigure(g, p.id), showMoney)} /> : <span className="sat-small sat-muted">Live</span>}
                      <br /><span className="felt-row-sub">{wonLogged(g, p.id)}/{ps.logged} hands won</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <button className="sat-btn sat-btn--block sat-btn--ghost" onClick={() => goAfter(`games/${p.id}`)}>Show these games on the game page</button>
          </div>
        )}
      </Disclose>
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
  // the name lets go of the focus once tapped: no ring stays over it after the card opens
  const open = (e: { stopPropagation: () => void; preventDefault: () => void; currentTarget: EventTarget }) => { e.stopPropagation(); e.preventDefault(); (e.currentTarget as HTMLElement).blur?.(); openPlayer(id); };
  return <span role="button" tabIndex={0} className="felt-name" data-player={id} data-press="name" aria-label={`Open the player card of ${name(id)}`} onClick={open} onKeyDown={(e) => { if (e.key === 'Enter') open(e); }}>{name(id)}</span>;
}


/** Generate a new player code: a sheet from the bottom with a hold-to-confirm button. The code is made as the button fills:
    each box rolls through random characters while the fill crosses it, then settles on its own. Letting go early keeps the old
    code, and the next hold draws a different new one. At full the old code stops working. */
function ReplaceCodeSheet({ pid, name, onClose, onNew }: { pid: ID; name: string; onClose: () => void; onNew: (code: string) => void }) {
  const issueCode = useStore((s) => s.issueCode);
  const next = useRef(newCode());
  const last = useRef(0);
  const [v, setV] = useState(0);
  const [code, setCode] = useState<string | null>(null);
  const settled = code ? 6 : Math.floor(v * 6 + 0.001);
  const shown = code ?? next.current;
  const copy = () => navigator.clipboard?.writeText(`${name}: ${showCode(shown)}`)
    .then(() => toast('Code copied.'), () => toast('Copy was blocked.'));
  const progress = (x: number) => {
    // the fill fell back before the end: the next hold makes a new code
    if (x === 0 && last.current > 0 && last.current < 1) next.current = newCode();
    last.current = x;
    setV(x);
  };
  return (
    <Sheet open onClose={onClose} title={`New code for ${name}`} sub="Old code will stop working when a new code is generated.">
      <div className="felt-boxes is-idle felt-boxes--static" role="img" aria-label={code ? `New code ${code}` : 'New code loading'}>
        {Array.from({ length: 6 }, (_, i) => {
          const rolling = !code && v > 0 && i === settled;
          // the box under the fill rolls through characters, one step for each sixtieth of the hold
          const ch = i < settled ? shown[i] : rolling ? ALPHABET[(Math.floor(v * 90) * 7 + i * 11) % ALPHABET.length] : '';
          return <span key={`${i}${i < settled ? 'on' : 'off'}`} className={`felt-boxes-cell ${i < settled ? 'is-in' : ''} ${rolling ? 'is-roll' : ''}`} aria-hidden="true">{ch}</span>;
        })}
      </div>
      <HoldFill label="Generate New Code" doneLabel="New Code Generated" onProgress={progress}
        onDone={() => { const c = issueCode(pid, next.current); setCode(c); setV(1); onNew(c); }} />
      {code && <button type="button" className="sat-btn sat-btn--block" onClick={copy}><Icon name="file" /> Copy code</button>}
    </Sheet>
  );
}
