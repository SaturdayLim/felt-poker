/* The spectator window (#/watch/<game id>): a second window or tab that follows a game on this device. It only reads.
   In that window the store never writes (store.ts checks WATCH), so a tap on a shared screen cannot change the record.
   The scorer's window says "saved" on a BroadcastChannel after each write; the spectator window reads the data again. */
export const WATCH = typeof location !== 'undefined' && /^#\/?watch\//.test(location.hash);
export const STORE_CHANNEL = 'nightcap-store';

let channel: BroadcastChannel | null = null;
const open = () => {
  if (channel || typeof BroadcastChannel === 'undefined') return channel;
  try { channel = new BroadcastChannel(STORE_CHANNEL); } catch { channel = null; }
  return channel;
};

/** Tell other windows of this app that the saved data changed. */
export function sayStored() { try { open()?.postMessage('saved'); } catch { /* closed */ } }

/** Run `fn` when another window says the saved data changed. Returns the unsubscribe. */
export function onStored(fn: () => void): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => undefined;
  const c = new BroadcastChannel(STORE_CHANNEL);
  c.onmessage = () => fn();
  return () => c.close();
}
