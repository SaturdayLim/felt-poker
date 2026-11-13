/* The host side of the live link: opens a room for a game, keeps it up to date, takes in the cards that players
   enter and the flags they send, and deletes the room when sharing stops. Runs on the host phone only. */
import { clashHands, clashWhy, effectivePairs } from '../lib/clash';
import type { NowSnapshot as Now } from './snapshot';
import type { Card, Game, ID, PlayerLook } from '../types';
import { useStore } from '../store';
import { toast } from '../components/ui';
import { lock, unlock, type LockBox } from '../report/lock';
import { CHECK_TEXT, keyFromPassphrase, newRoomId, newRoomKey, open, seal } from './crypto';
import { getDriver, setDriver, type LiveDriver } from './driver';
import { firebaseDriver, isLiveConfigured } from './firebase';
import { mockDriver } from './mock';
import { buildPub, type NowSnapshot } from './snapshot';

export interface Flag { id: string; n: number; text: string; at: number }
/** A device with the game open. The name is the player, once that player has signed in with a code. */
export interface Viewer { id: string; name: string | null; at: number }
/** A device says hello about once a minute. After this long without one it no longer counts as active. */
const VIEWER_MS = 150000;
interface Session {
  gameId: ID; room: string; key: string; locked: boolean; driver: LiveDriver;
  stops: (() => void)[]; flags: Flag[]; failed: Set<string>; identCodes: Record<ID, string>; inbox: Record<string, unknown>; nowN?: number; nowActed?: boolean; timer?: ReturnType<typeof setTimeout>;
  connected: boolean; stopTimer?: ReturnType<typeof setTimeout>; viewers: Record<string, Viewer>;
  /** The last time the host changed the game or the hand in play. */
  lastAct: number;
}

/** A room with no action from the host for this long closes by itself. */
export const IDLE_MS = 12 * 60 * 60 * 1000;

const sessions = new Map<ID, Session>();
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((l) => l());
/** The screen re-reads the live state when this fires. */
export const onLiveChange = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };

const LS = (g: ID) => `felt-live:${g}`;
const load = (g: ID): { room: string; key: string; locked: boolean; flags: Flag[]; stopping?: boolean; lastAct?: number } | null => {
  try { const t = localStorage.getItem(LS(g)); return t ? JSON.parse(t) : null; } catch { return null; }
};
const save = (s: Session, stopping = false) => {
  try { localStorage.setItem(LS(s.gameId), JSON.stringify({ room: s.room, key: s.key, locked: s.locked, flags: s.flags, stopping, lastAct: s.lastAct })); } catch { /* private mode */ }
};
/** The last room of a game: sharing on again uses the same id and key, so nobody has to scan again. */
const KEEP = (g: ID) => `felt-live-keep:${g}`;
const kept = (g: ID): { room: string; key: string; locked: boolean } | null => {
  try { const t = localStorage.getItem(KEEP(g)); return t ? JSON.parse(t) : null; } catch { return null; }
};

/** The driver in use: the test driver when asked ("?live=mock", the felt-live-mock flag, or the `mock` Vite mode
    that the felt-test server runs in), else Firebase when set up. */
export function pickDriver(): LiveDriver | null {
  if (getDriver()) return getDriver();
  let wantMock = import.meta.env.MODE === 'mock';
  try { wantMock = wantMock || location.href.includes('live=mock') || localStorage.getItem('felt-live-mock') === '1'; } catch { /* ignore */ }
  if (wantMock) setDriver(mockDriver({ shared: true }));
  else if (isLiveConfigured()) setDriver(firebaseDriver());
  return getDriver();
}
export const liveAvailable = () => pickDriver() !== null;

const game = (id: ID): Game | undefined => useStore.getState().games.find((g) => g.id === id);

/** The link a player opens. A locked game leaves the key out: the player types the passphrase. */
export function linkFor(room: string, key: string, locked: boolean): string {
  const base = `${location.origin}${location.pathname}`;
  return `${base}#/join/${room}${locked ? '' : `/${key}`}`;
}

export function liveStatus(gameId: ID) {
  const s = sessions.get(gameId);
  return s && !s.stopTimer ? { on: true as const, connected: s.connected, locked: s.locked, room: s.room, link: linkFor(s.room, s.key, s.locked), flags: s.flags,
    viewers: Object.values(s.viewers).filter((v) => Date.now() - v.at < VIEWER_MS) } : { on: false as const };
}

const handCount = (g: Game) => g.hands.filter((h) => !h.missed && h.log).length;

/** One identity box per player: it holds the name, proves a code, and tells that player alone which hands to check
    (and why), and their own hidden cards. Rebuilt only when one of these changed. */
async function syncIdent(s: Session, g: Game) {
  const players = useStore.getState().players.filter((p) => g.playerIds.includes(p.id));
  for (const p of players) {
    // a flag shows late on purpose: only once a later hand is under way, so nobody learns about a hand in play.
    // Settings, Check hidden cards off: no flags at all
    const check = useStore.getState().settings.checkCards !== false;
    const later = (n: number) => g.hands.some((h) => h.n > n) || (s.nowN !== undefined && s.nowN > n && !!s.nowActed);
    const clash = check ? clashHands(g, p.id).filter(later) : [];
    // the player's own cards that count, by hand (shown cards override an entry): only their code opens this box
    const logged: Record<number, Card[]> = Object.fromEntries(g.hands.filter((h) => !h.missed && effectivePairs(h)[p.id]).map((h) => [h.n, effectivePairs(h)[p.id]]));
    const why: Record<number, string[]> = Object.fromEntries(clash.map((n) => [n, clashWhy(g.hands.find((h) => h.n === n)!, p.id)]));
    const stamp = JSON.stringify([p.code, p.name, clash, logged, why]);
    if (!p.code || s.identCodes[p.id] === stamp) continue;
    const box = await lock({ id: p.id, name: p.name, clash, logged, why }, p.code);
    await s.driver.set(s.room, `ident/${p.id}`, box);
    s.identCodes[p.id] = stamp;
  }
}

export async function publishPub(gameId: ID) {
  const s = sessions.get(gameId), g = game(gameId);
  if (!s || !g) return;
  const st = useStore.getState();
  s.lastAct = Date.now();
  save(s);
  await s.driver.set(s.room, 'pub', await seal(buildPub(g, st.players, st.settings), s.key));
  await s.driver.set(s.room, 'meta/updatedAt', Date.now());
  await s.driver.set(s.room, 'meta/handCount', handCount(g));
  await syncIdent(s, g);
  applyInbox(s);
  if (s.nowN !== undefined && g.hands.some((h) => h.n === s.nowN)) await publishNow(gameId, null);
}

/** The hand in progress, or null when no hand is open. */
export async function publishNow(gameId: ID, now: NowSnapshot | null) {
  const s = sessions.get(gameId);
  if (!s) return;
  const wasActed = s.nowActed, wasN = s.nowN;
  s.lastAct = Date.now();
  s.nowN = now?.n;
  s.nowActed = !!(now as Now | null)?.acted;
  await s.driver.set(s.room, 'now', now ? await seal(now, s.key) : null);
  // the next hand got under way: flags for the hand before can show now
  const g = game(gameId);
  if (g && s.nowActed && (!wasActed || wasN !== s.nowN)) await syncIdent(s, g);
}

/** Players who sent cards for this hand that the host has not applied yet. */
export function inboxFor(gameId: ID, n: number): ID[] {
  const s = sessions.get(gameId);
  return s ? Object.entries(s.inbox).filter(([, byHand]) => (byHand as Record<string, unknown> | null)?.[n]).map(([p]) => p) : [];
}

/** The host entered this player's cards: what the player sent for the hand no longer counts. */
export async function dropInbox(gameId: ID, pid: ID, n: number) {
  const s = sessions.get(gameId);
  if (s && (s.inbox[pid] as Record<string, unknown> | null)?.[n]) await s.driver.set(s.room, `inbox/${pid}/${n}`, null);
}

const CARD = /^[AKQJT98765432][shdc]$/;
/** A player photo: a small JPEG as a data URL, nothing else. */
const PHOTO = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;

async function applyInbox(s: Session) {
  const g = game(s.gameId);
  if (!g) return;
  const players = useStore.getState().players;
  for (const [pid, byHand] of Object.entries(s.inbox)) {
    for (const [n, box] of Object.entries((byHand ?? {}) as Record<string, LockBox>)) {
      // a final chip count the player sent: kept on the game, and the End game count starts from it
      if (n === 'count') {
        const fid = `${pid}/count/${(box as LockBox).data?.slice(0, 16)}`;
        if (s.failed.has(fid)) continue;
        const code = players.find((p) => p.id === pid)?.code;
        let chips: number | null = null;
        try { const v = code ? await unlock<{ count: number }>(box as LockBox, code) : null; if (v && Number.isFinite(v.count) && v.count >= 0 && v.count < 1e9) chips = Math.round(v.count); } catch { /* wrong code */ }
        if (chips === null) { s.failed.add(fid); continue; }
        useStore.getState().updateGame(s.gameId, (x) => { x.claimed = { ...(x.claimed ?? {}), [pid]: { chips: chips!, at: Date.now() } }; });
        toast(`${players.find((p) => p.id === pid)?.name ?? 'A player'} sent a chip count of ${chips}.`);
        await s.driver.set(s.room, `inbox/${pid}/count`, null);
        continue;
      }
      // the look the player chose for the Table (colour, photo): kept on the player, and the next snapshot carries it
      if (n === 'look') {
        const fid = `${pid}/look/${(box as LockBox).data?.slice(0, 16)}`;
        if (s.failed.has(fid)) continue;
        s.failed.add(fid); // each box is read once, right or wrong
        const code = players.find((p) => p.id === pid)?.code;
        try {
          const v = code ? await unlock<{ hue?: unknown; photo?: unknown }>(box as LockBox, code) : null;
          if (v) {
            const look: PlayerLook = {};
            if (typeof v.hue === 'number' && Number.isInteger(v.hue) && v.hue >= 0 && v.hue < 10) look.hue = v.hue;
            if (typeof v.photo === 'string' && PHOTO.test(v.photo) && v.photo.length <= 16000) look.photo = v.photo;
            useStore.getState().setPlayerLook(pid, look);
            await s.driver.set(s.room, `inbox/${pid}/look`, null);
          }
        } catch { /* wrong code or damaged entry */ }
        continue;
      }
      const id = `${pid}/${n}/${(box as LockBox).data?.slice(0, 16)}`;
      if (s.failed.has(id)) continue;
      const code = players.find((p) => p.id === pid)?.code;
      let cards: Card[] | null = null;
      try {
        const v = code ? await unlock<{ cards: Card[] }>(box as LockBox, code) : null;
        if (v && Array.isArray(v.cards) && v.cards.length === 2 && v.cards.every((c) => CARD.test(c)) && v.cards[0] !== v.cards[1]) cards = v.cards;
      } catch { /* wrong code or damaged entry */ }
      if (!cards) { s.failed.add(id); continue; }
      let applied = false;
      useStore.getState().updateGame(s.gameId, (x) => {
        const h = x.hands.find((y) => y.n === Number(n) && !y.missed);
        if (h) { h.private = { ...(h.private ?? {}), [pid]: cards! }; applied = true; }
      });
      if (applied) await s.driver.set(s.room, `inbox/${pid}/${n}`, null);
    }
  }
}

/** A viewer's hello: a pop-up for a new device, and again when that device turns into a named player. */
function seen(s: Session, id: string, name: string | null, bye: boolean) {
  const was = s.viewers[id];
  if (bye) { delete s.viewers[id]; return; }
  s.viewers[id] = { id, name, at: Date.now() };
  if (!was || Date.now() - was.at >= VIEWER_MS) toast(name ? `${name} is viewing the game.` : 'A device joined to view the game.');
  else if (name && was.name !== name) toast(`${name} signed in.`);
}

async function takeFlags(s: Session, tree: Record<string, string> | null) {
  for (const [fid, sealed] of Object.entries(tree ?? {})) {
    if (s.flags.some((f) => f.id === fid)) continue;
    try {
      const v = await open<{ n: number; text: string; hello?: string; name?: string | null; bye?: boolean }>(sealed, s.key);
      if (v.hello) seen(s, v.hello, v.name ?? null, !!v.bye);
      else s.flags.push({ id: fid, n: Number(v.n) || 0, text: String(v.text ?? '').slice(0, 200), at: Date.now() });
    } catch { /* not ours */ }
    await s.driver.set(s.room, `flags/${fid}`, null);
  }
  save(s);
  changed();
}

function attach(s: Session) {
  s.stops.push(s.driver.watch(s.room, 'inbox', (v) => { s.inbox = (v ?? {}) as Record<string, unknown>; applyInbox(s); }));
  s.stops.push(s.driver.watch(s.room, 'flags', (v) => { takeFlags(s, v as Record<string, string> | null); }));
  s.stops.push(s.driver.connected((on) => { s.connected = on; changed(); }));
}

/** Opens a room for a game and returns its link. A passphrase locks the game. */
export async function startSharing(gameId: ID, passphrase?: string): Promise<string> {
  const driver = pickDriver();
  const g = game(gameId);
  if (!driver) throw new Error('The live link is not set up yet.');
  if (!g) throw new Error('Game not found.');
  if (sessions.has(gameId)) await stopSharing(gameId);
  const uid = await driver.signIn();
  const before = kept(gameId);
  const room = before?.room ?? newRoomId();
  const locked = !!passphrase?.trim();
  const key = locked ? await keyFromPassphrase(passphrase!, room) : before && !before.locked ? before.key : newRoomKey();
  const st = useStore.getState();
  const s: Session = { gameId, room, key, locked, driver, stops: [], flags: [], failed: new Set(), identCodes: {}, inbox: {}, connected: true, viewers: {}, lastAct: Date.now() };
  await driver.create(room, {
    owner: uid, createdAt: Date.now(),
    meta: { v: 1, locked, check: locked ? await seal(CHECK_TEXT, key) : null, updatedAt: Date.now(), handCount: handCount(g) },
    pub: await seal(buildPub(g, st.players, st.settings), key),
  });
  sessions.set(gameId, s);
  // a locked room keeps no key (it comes from the password): reopening asks for the password again, and only the room id is reused
  try { localStorage.setItem(KEEP(gameId), JSON.stringify({ room, key: locked ? '' : key, locked })); } catch { /* private mode */ }
  await syncIdent(s, g);
  save(s);
  attach(s);
  changed();
  return linkFor(room, key, locked);
}

/** Starts the Undo window: the status shows off at once, and the room goes after 5 seconds. */
export function requestStop(gameId: ID) {
  const s = sessions.get(gameId);
  if (!s || s.stopTimer) return;
  save(s, true);
  s.stopTimer = setTimeout(() => { stopSharing(gameId); }, 5000);
  changed();
}

export function cancelStop(gameId: ID) {
  const s = sessions.get(gameId);
  if (!s?.stopTimer) return;
  clearTimeout(s.stopTimer);
  s.stopTimer = undefined;
  save(s);
  changed();
}

/** Closes the room. Viewers see that the host stopped sharing. */
export async function stopSharing(gameId: ID) {
  const s = sessions.get(gameId);
  try { localStorage.removeItem(LS(gameId)); } catch { /* ignore */ }
  if (!s) return;
  clearTimeout(s.stopTimer);
  s.stops.forEach((f) => f());
  sessions.delete(gameId);
  try { await s.driver.remove(s.room); } catch { /* offline: the room expires */ }
  changed();
}

export async function dismissFlag(gameId: ID, fid: string) {
  const s = sessions.get(gameId);
  if (!s) return;
  s.flags = s.flags.filter((f) => f.id !== fid);
  save(s);
  changed();
}

/** After the app reloads: reconnect to rooms that were open. */
export async function resumeSharing() {
  const driver = pickDriver();
  if (!driver) return;
  for (const g of useStore.getState().games) {
    const saved = load(g.id);
    if (!saved || sessions.has(g.id)) continue;
    try {
      await driver.signIn();
      // the app closed inside the Undo window: finish the stop
      // the app closed inside the Undo window, the game is closed, or the room sat idle for 12 hours: finish the stop
      const idle = Date.now() - (saved.lastAct ?? Date.now()) > IDLE_MS;
      if (saved.stopping || g.status === 'closed' || idle) { await driver.remove(saved.room); localStorage.removeItem(LS(g.id)); continue; }
      const s: Session = { gameId: g.id, room: saved.room, key: saved.key, locked: saved.locked, driver, stops: [], flags: saved.flags ?? [], failed: new Set(), identCodes: {}, inbox: {}, connected: true, viewers: {}, lastAct: saved.lastAct ?? Date.now() };
      sessions.set(g.id, s);
      attach(s);
      publishPub(g.id);
    } catch { /* offline: try again on the next start */ }
  }
  changed();
}

/** Closes rooms that need no more viewers: the game was closed, or the host did nothing for 12 hours. */
function closeStale() {
  for (const [id, s] of sessions) {
    const g = game(id);
    if (!g || g.status === 'closed' || Date.now() - s.lastAct > IDLE_MS) {
      stopSharing(id).catch(() => undefined);
      if (g) toast(g.status === 'closed' ? `${g.name}: game closed, so the room closed.` : `${g.name}: no action for 12 hours, so the room closed.`);
    }
  }
}

/** Publishes after changes to a shared game or to a player (debounced), so viewers see closed hands, new settings and new codes. */
export function watchGames() {
  let last = useStore.getState().games;
  let lastPlayers = useStore.getState().players;
  const idle = window.setInterval(closeStale, 10 * 60 * 1000);
  const unsub = useStore.subscribe((state) => {
    if (state.games === last && state.players === lastPlayers) return;
    const prev = last, playersChanged = state.players !== lastPlayers;
    last = state.games;
    lastPlayers = state.players;
    for (const [id, s] of sessions) {
      const a = prev.find((g) => g.id === id), b = state.games.find((g) => g.id === id);
      if (!b || (a === b && !playersChanged)) continue;
      // End game closed the game: the room closes at once (viewers see Room has been closed)
      if (b.status === 'closed' && a?.status !== 'closed') { closeStale(); continue; }
      clearTimeout(s.timer);
      s.timer = setTimeout(() => { publishPub(id).catch(() => undefined); }, 1500);
    }
  });
  return () => { window.clearInterval(idle); unsub(); };
}
