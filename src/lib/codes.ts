/* Player codes: 6 characters a player keeps, to open their own stats in a shared report and their private
   cards in the app. Letters and digits that read alike (0/O, 1/I/L) are left out. Two players could get
   the same code, but with 31^6 (about 887 million) codes it is very unlikely. */

export const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** A new random code, for example "K7M2QX". Every character is equally likely. */
export function newCode(len = 6): string {
  const out: string[] = [];
  const cap = 256 - (256 % ALPHABET.length);
  while (out.length < len) for (const x of crypto.getRandomValues(new Uint8Array(len * 2))) if (x < cap && out.length < len) out.push(ALPHABET[x % ALPHABET.length]);
  return out.join('');
}

/** Codes are case-blind and ignore spaces and dashes. */
export const normalCode = (code: string) => code.toUpperCase().replace(/[\s-]/g, '');

export const codeMatches = (code: string | undefined, typed: string) => !!code && normalCode(code) === normalCode(typed);

/** Shown in 2 groups of 3 so it reads aloud easily: "K7M 2QX". */
export const showCode = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;
