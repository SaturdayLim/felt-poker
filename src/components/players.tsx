import { useRef, useState, type ReactNode } from 'react';
import { useStore } from '../store';
import { Icon, Sheet, toast } from './ui';
import { showCode } from '../lib/codes';
import type { Player } from '../types';

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
      timer.current = window.setTimeout(() => { held.current = true; navigator.vibrate?.(12); onHold(); }, ms);
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
    toast('Name saved');
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title="Edit player" sub={inGames ? `In ${inGames} game${inGames === 1 ? '' : 's'}.` : 'Not in any games yet.'}>
      <div className="sat-field">
        <label htmlFor="pe-name">Name</label>
        <input id="pe-name" className="sat-input" value={nm} autoCapitalize="words" onChange={(e) => setNm(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
      </div>
      <button className="sat-btn sat-btn--primary sat-btn--block" onClick={save}>Save name</button>
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

/** Gives a player a new code. "Show" reveals it once; "Copy" puts a message on the clipboard and never shows it.
    The old code stops working at once, so a player who already has a code is asked first. */
export function PlayerCodeSheet({ p, onClose }: { p: Player; onClose: () => void }) {
  const issueCode = useStore((s) => s.issueCode);
  const issued = useStore((s) => !!s.players.find((x) => x.id === p.id)?.codeIssued);
  const [ask, setAsk] = useState<'show' | 'copy' | null>(null);
  const [shown, setShown] = useState<string | null>(null);
  const run = (how: 'show' | 'copy') => {
    if (issued && ask !== how) { setAsk(how); return; }
    const code = issueCode(p.id);
    setAsk(null);
    if (how === 'show') { setShown(code); return; }
    const msg = `${p.name}, your Felt player code is ${showCode(code)}. Keep it private.`;
    navigator.clipboard?.writeText(msg).then(() => toast(`Message for ${p.name} copied. The code stays hidden.`), () => toast('Copy was blocked. Use Show instead.'));
    onClose();
  };
  if (shown) {
    return (
      <Sheet open onClose={onClose} title={`${p.name}: player code`} sub="This code shows once. Close this and it is gone.">
        <div className="felt-code-big" aria-label={`Code ${shown}`}>{showCode(shown)}</div>
        <button className="sat-btn sat-btn--primary sat-btn--lg sat-btn--block" onClick={onClose}>Done</button>
      </Sheet>
    );
  }
  return (
    <Sheet open onClose={onClose} title={`${p.name}: player code`} sub={issued ? 'A code is in use.' : 'No code issued yet.'}>
      <div className="sat-flat sat-card sat-small">
        {issued ? 'A new code cancels the current one. Old reports keep working with the old code. A report built after this needs the new code.' : 'The player needs a code to add cards and to open their page in a report.'}
      </div>
      <div className="sat-stack" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)' }}>
        <button className="sat-btn sat-btn--primary sat-btn--block" onClick={() => run('show')}>
          <Icon name="eye" /> {ask === 'show' ? 'Tap again: cancel the current code' : 'Show new code (once)'}
        </button>
        <button className="sat-btn sat-btn--block" onClick={() => run('copy')}>
          <Icon name="file" /> {ask === 'copy' ? 'Tap again: cancel the current code' : 'Copy new code (hidden)'}
        </button>
      </div>
    </Sheet>
  );
}
