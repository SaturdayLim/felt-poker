import { describe, expect, it } from 'vitest';
import { codeMatches, newCode, showCode } from './codes';

describe('player codes', () => {
  it('makes 6 characters from the clear alphabet only', () => {
    for (let i = 0; i < 200; i++) expect(newCode()).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/);
  });
  it('matches whatever the case, spaces or dashes', () => {
    expect(codeMatches('K7M2QX', 'k7m 2qx')).toBe(true);
    expect(codeMatches('K7M2QX', 'K7M-2QX')).toBe(true);
    expect(codeMatches('K7M2QX', 'K7M2QY')).toBe(false);
    expect(codeMatches(undefined, '')).toBe(false);
  });
  it('shows in 2 groups of 3', () => {
    expect(showCode('K7M2QX')).toBe('K7M 2QX');
  });
});

describe('palette text', () => {
  it('picks white on a dark fill and the base on a light fill', async () => {
    const { textOn } = await import('./palette');
    expect(textOn('#0052CC', '#1C1E21')).toBe('#FFFFFF');
    expect(textOn('#C9A227', '#1C1E21')).toBe('#1C1E21');
  });
});
