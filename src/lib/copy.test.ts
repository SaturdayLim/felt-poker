import { describe, expect, it } from 'vitest';

/* A guard for UI copy: phrases the project has already ruled out (CLAUDE.md, UI copy). It catches only what is
   on this list. It does not judge new sentences, so copy still needs a read against ASD-STE100. */
const BANNED = [/an entry exists/i, /new cards replace/i, /no entry yet/i, /not entered/i, /the usual rule/i, /\bsimply\b/i, /small blind/i, /big blind/i];
const sources = { ...import.meta.glob('/src/{screens,components}/**/*.tsx', { query: '?raw', import: 'default', eager: true }), ...import.meta.glob('/src/lib/help.ts', { query: '?raw', import: 'default', eager: true }) } as Record<string, string>;
const strings = (src: string) => [...src.matchAll(/'[^'\n]*'|"[^"\n]*"|`[^`\n]*`|>[^<>{}\n]+</g)].map((m) => m[0]);

describe('UI copy', () => {
  it('has none of the ruled-out phrases', () => {
    const hits = Object.entries(sources).flatMap(([f, src]) => strings(src).filter((s) => BANNED.some((b) => b.test(s))).map((s) => `${f}: ${s}`));
    expect(Object.keys(sources).length).toBeGreaterThan(20);
    expect(hits).toEqual([]);
  });
});
