/* The host side of the live link: opens a room for a game, keeps it up to date, takes in the cards that players
   enter and the flags they send, and deletes the room when sharing stops. Runs on the host phone only. */
import type { Card, Game, ID } from '../types';
import { useStore } from '../store';
import { lock, unlock, type LockBox } from '../report/lock';
import { CHECK_TEXT, keyFromPassphrase, newRoomId, newRoomKey, open, seal } from './crypto';
import { getDriver, setDriver, type LiveDriver } from './driver';
import { firebaseDriver, isLiveConfigured } from './firebase';
import { mockDriver } from './mock';
import { buildPub, type NowSnapshot } from './snapshot';

export interface Flag { id: string; n: number; text: string; at: number }
interface Session {
  gameId: ID; room: string; key: string; locked: boolean; driver: LiveDriver;
  stops: (() => void)[]; flags: Flag[]; failed: Set<string>; identCodes: Record<ID, string>; inbox: Record<string, unknown>; nowN?: number; timer?: ReturnType<typeof setTimeout>;
}

const sessions = new Map<ID, Session>();
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((l) => l());
/** The screen re-reads the live state when this fires. */
export const onLiveChange = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };

const LS = (g: ID) => `felt-live:${g}`;
const load = (g: ID): { room: string; key: string; locked: boolean; flags: Flag[] } | null => {
  try { const t = localStorage.getItem(LS(g)); return t ? JSON.parse(t) : null; } catch { return null; }
};
const save = (s: Session) => {
  try { localStorage.setItem(LS(s.gameId), JSON.stringify({ room: s.room, key: s.key, locked: s.locked, flags: s.flags })); } catch { /* private mode */ }
};

/** The driver in use: the test driver when asked ("?live=mock" or the felt-live-mock flag), else Firebase when set up. */
export function pickDriver(): LiveDriver | null {
  if (getDriver()) return getDriver();
  let wantMock = false;
  try { wantMock = location.href.includes('live=mock') || localStorage.getItem('felt-live-mock') === '1'; } catch { /* ignore */ }
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
  return s ? { on: true as const, locked: s.locked, room: s.room, link: linkFor(s.room, s.key, s.locked), flags: s.flags } : { on: false as const };
}

const handCount = (g: Game) => g.hands.filter((h) => !h.missed && h.log).length;

/** One identity box per player: it holds the name and proves a code. Rebuilt only when the code or name changed. */
async function syncIdent(s: Session, g: Game) {
  const players = useStore.getState().players.filter((p) => g.playerIds.includes(p.id));
  for (const p of players) {
    const stamp = `${p.code}:${p.name}`;
    if (!p.code || s.identCodes[p.id] === stamp) continue;
    const box = await lock({ id: p.id, name: p.name }, p.code);
    await s.driver.set(s.room, `ident/${p.id}`, box);
    s.identCodes[p.id] = stamp;
  }
}

export async function publishPub(gameId: ID) {
  const s = sessions.get(gameId), g = game(gameId);
  if (!s || !g) return;
  const st = useStore.getState();
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
  s.nowN = now?.n;
  await s.driver.set(s.room, 'now', now ? await seal(now, s.key) : null);
}

const CARD = /^[AKQJT98765432][shdc]$/;

async function applyInbox(s: Session) {
  const g = game(s.gameId);
  if (!g) return;
  const players = useStore.getState().players;
  for (const [pid, byHand] of Object.entries(s.inbox)) {
    for (const [n, box] of Object.entries((byHand ?? {}) as Record<string, LockBox>)) {
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

async function takeFlags(s: Session, tree: Record<string, string> | null) {
  for (const [fid, sealed] of Object.entries(tree ?? {})) {
    if (s.flags.some((f) => f.id === fid)) continue;
    try {
      const v = await open<{ n: number; text: string }>(sealed, s.key);
      s.flags.push({ id: fid, n: Number(v.n) || 0, text: String(v.text ?? '').slice(0, 200), at: Date.now() });
    } catch { /* not ours */ }
    await s.driver.set(s.room, `flags/${fid}`, null);
  }
  save(s);
  changed();
}

function attach(s: Session) {
  s.stops.push(s.driver.watch(s.room, 'inbox', (v) => { s.inbox = (v ?? {}) as Record<string, unknown>; applyInbox(s); }));
  s.stops.push(s.driver.watch(s.room, 'flags', (v) => { takeFlags(s, v as Record<string, string> | null); }));
}

/** Opens a room for a game and returns its link. A passphrase locks the game. */
export async function startSharing(gameId: ID, passphrase?: string): Promise<string> {
  const driver = pickDriver();
  const g = game(gameId);
  if (!driver) throw new Error('The live link is not set up yet.');
  if (!g) throw new Error('Game not found.');
  if (sessions.has(gameId)) await stopSharing(gameId);
  const uid = await driver.signIn();
  const room = newRoomId();
  const locked = !!passphrase?.trim();
  const key = locked ? await keyFromPassphrase(passphrase!, room) : newRoomKey();
  const st = useStore.getState();
  const s: Session = { gameId, room, key, locked, driver, stops: [], flags: [], failed: new Set(), identCodes: {}, inbox: {} };
  await driver.create(room, {
    owner: uid, createdAt: Date.now(),
    meta: { v: 1, locked, check: locked ? await seal(CHECK_TEXT, key) : null, updatedAt: Date.now(), handCount: handCount(g) },
    pub: await seal(buildPub(g, st.players, st.settings), key),
  });
  sessions.set(gameId, s);
  await syncIdent(s, g);
  save(s);
  attach(s);
  changed();
  return linkFor(room, key, locked);
}

/** Closes the room. Viewers see that the host stopped sharing. */
export async function stopSharing(gameId: ID) {
  const s = sessions.get(gameId);
  try { localStorage.removeItem(LS(gameId)); } catch { /* ignore */ }
  if (!s) return;
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
      const s: Session = { gameId: g.id, room: saved.room, key: saved.key, locked: saved.locked, driver, stops: [], flags: saved.flags ?? [], failed: new Set(), identCodes: {}, inbox: {} };
      sessions.set(g.id, s);
      attach(s);
      publishPub(g.id);
    } catch { /* offline: try again on the next start */ }
  }
  changed();
}

/** Publishes after changes to a shared game or to a player (debounced), so viewers see closed hands, new settings and new codes. */
export function watchGames() {
  let last = useStore.getState().games;
  let lastPlayers = useStore.getState().players;
  return useStore.subscribe((state) => {
    if (state.games === last && state.players === lastPlayers) return;
    const prev = last, playersChanged = state.players !== lastPlayers;
    last = state.games;
    lastPlayers = state.players;
    for (const [id, s] of sessions) {
      const a = prev.find((g) => g.id === id), b = state.games.find((g) => g.id === id);
      if (!b || (a === b && !playersChanged)) continue;
      clearTimeout(s.timer);
      s.timer = setTimeout(() => { publishPub(id).catch(() => undefined); }, 1500);
    }
  });
}
