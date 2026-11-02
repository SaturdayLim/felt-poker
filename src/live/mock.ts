import type { LiveDriver } from './driver';

/** A driver that needs no network: rooms live in memory, and in localStorage so a second tab on the same device
    sees them too. Used by tests and by "?live=mock" in the app. It does not enforce the owner rules. */
export function mockDriver(opts: { shared?: boolean; uid?: string } = {}): LiveDriver {
  const mem = new Map<string, Record<string, unknown>>();
  const listeners = new Set<() => void>();
  const store = opts.shared && typeof localStorage !== 'undefined' ? localStorage : null;
  const key = (room: string) => `felt-mock-room:${room}`;
  const read = (room: string): Record<string, unknown> | undefined => {
    if (store) { const t = store.getItem(key(room)); return t ? JSON.parse(t) : undefined; }
    return mem.get(room);
  };
  const write = (room: string, tree: Record<string, unknown> | undefined) => {
    if (store) { if (tree) store.setItem(key(room), JSON.stringify(tree)); else store.removeItem(key(room)); }
    else if (tree) mem.set(room, tree); else mem.delete(room);
    listeners.forEach((l) => l());
  };
  if (store && typeof window !== 'undefined') window.addEventListener('storage', () => listeners.forEach((l) => l()));
  const at = (tree: unknown, path: string): unknown => path.split('/').filter(Boolean).reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), tree);

  return {
    async signIn() { return opts.uid ?? 'mock-user'; },
    async create(room, tree) {
      if (read(room)) throw new Error('Room id taken');
      write(room, JSON.parse(JSON.stringify(tree)));
    },
    async set(room, path, value) {
      const tree = read(room);
      if (!tree) throw new Error('Room not found');
      const parts = path.split('/').filter(Boolean);
      let o: Record<string, unknown> = tree;
      parts.slice(0, -1).forEach((k) => { o = (o[k] && typeof o[k] === 'object' ? o[k] : (o[k] = {})) as Record<string, unknown>; });
      const last = parts[parts.length - 1];
      if (value === null || value === undefined) delete o[last]; else o[last] = JSON.parse(JSON.stringify(value));
      write(room, tree);
    },
    async remove(room) { write(room, undefined); },
    watch(room, path, cb) {
      let last = '';
      const fire = () => {
        const v = at(read(room), path);
        const s = JSON.stringify(v ?? null);
        if (s !== last) { last = s; cb(v === undefined ? null : JSON.parse(s)); }
      };
      listeners.add(fire);
      queueMicrotask(fire);
      return () => { listeners.delete(fire); };
    },
  };
}
