/* Player codes for the shared report. Each player's private page is encrypted with a key made from that
   player's code (PBKDF2, SHA-256, 150 000 rounds, AES-GCM 256), so the report file holds nothing readable
   without the code. Runs the same in Node (building the report) and in the browser (opening it). */

import { normalCode } from '../lib/codes';

export interface LockBox { salt: string; iv: string; data: string; iter: number }

const ITER = 150000;
const enc = new TextEncoder();
const dec = new TextDecoder();
// built in chunks: spreading a large array into fromCharCode can overflow the call stack
const b64 = (u: Uint8Array) => { let t = ''; for (let i = 0; i < u.length; i += 8192) t += String.fromCharCode(...u.subarray(i, i + 8192)); return btoa(t); };
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)) as Uint8Array<ArrayBuffer>;

async function keyFrom(code: string, salt: Uint8Array<ArrayBuffer>, iter: number) {
  const base = await crypto.subtle.importKey('raw', enc.encode(normalCode(code)), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function lock(value: unknown, code: string): Promise<LockBox> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFrom(code, salt, ITER);
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(value))));
  return { salt: b64(salt), iv: b64(iv), data: b64(data), iter: ITER };
}

/** Opens a box with a code. A wrong code throws (AES-GCM checks the data). */
export async function unlock<T>(box: LockBox, code: string): Promise<T> {
  const key = await keyFrom(code, unb64(box.salt), box.iter);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.data));
  return JSON.parse(dec.decode(plain)) as T;
}
