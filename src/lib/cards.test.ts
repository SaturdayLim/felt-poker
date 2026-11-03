import { describe, expect, it } from 'vitest';
import { DEFAULT_LOOK, cleanLook, lookColor } from './cards';

describe('card look', () => {
  it('falls back to the default look', () => {
    expect(cleanLook(undefined)).toEqual(DEFAULT_LOOK);
  });
  it('keeps a saved order and fills missing suits at the end', () => {
    expect(cleanLook({ order: ['d', 'c'] }).order).toEqual(['d', 'c', 's', 'h']);
  });
  it('ignores repeated or unknown suits', () => {
    expect(cleanLook({ order: ['d', 'd', 'x' as never] }).order).toEqual(['d', 's', 'h', 'c']);
  });
  it('maps a colour name to its hex, with hearts and diamonds red by default', () => {
    expect(lookColor(undefined, 'h')).toBe(lookColor(undefined, 'd'));
    expect(lookColor({ ...DEFAULT_LOOK, custom: true, colors: { ...DEFAULT_LOOK.colors, c: 'green' } }, 'c')).toBe('#1b8a4b');
  });
});
