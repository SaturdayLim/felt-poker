/* Live link encryption. Firebase holds ciphertext only.
   - Room key: 128 random bits. In an open game it travels in the link after "#", which no server sees.
     In a locked game it comes from a passphrase the host sets (PBKDF2, salted with the room id).
   - The room key seals the public data (pub, now) and the flags viewers send.
   - A player's code seals that player's identity box and card entries (see src/report/lock.ts). */

const enc = new TextEncoder();
const dec = new TextDecoder();

const toB64 = (u: Uint8Array) => { let t = ''; for (let i = 0; i < u.length; i += 8192) t += String.fromCharCode(...u.subarray(i, i + 8192)); return btoa(t); };
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)) as Uint8Array<ArrayBuffer>;
/** URL-safe base64 without padding, for ids and keys that travel in a link. */
export const toB64Url = (u: Uint8Array) => toB64(u).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const fromB64Url = (s: string) => fromB64(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));

const rand = (n: number) => crypto.getRandomValues(new Uint8Array(n));
/** A new room id: 128 random bits, so nobody can guess one. */
export const newRoomId = () => toB64Url(rand(16));
/** A new room key (for an open game). */
export const newRoomKey = () => toB64Url(rand(16));

const PASS_ROUNDS = 150000;

/** The room key of a locked game, from the host's passphrase. */
export async function keyFromPassphrase(passphrase: string, room: string): Promise<string> {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase.trim().toLowerCase()), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(`felt-live:${room}`), iterations: PASS_ROUNDS, hash: 'SHA-256' }, base, 128);
  return toB64Url(new Uint8Array(bits));
}

const aesKey = (k: string) => crypto.subtle.importKey('raw', fromB64Url(k), 'AES-GCM', false, ['encrypt', 'decrypt']);

/** Seals a value with a room key. The result is one string: "iv.data" in base64. */
export async function seal(value: unknown, k: string): Promise<string> {
  const iv = rand(12);
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(k), enc.encode(JSON.stringify(value))));
  return `${toB64(iv)}.${toB64(data)}`;
}

/** Opens a sealed value. A wrong key throws. */
export async function open<T>(sealed: string, k: string): Promise<T> {
  const [iv, data] = sealed.split('.');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv) }, await aesKey(k), fromB64(data));
  return JSON.parse(dec.decode(plain)) as T;
}

/** What a locked game stores so a viewer can tell a right passphrase from a wrong one. */
export const CHECK_TEXT = 'felt';
