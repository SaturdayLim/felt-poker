/* The five base colours. Every other colour of the app comes from these when the phone owner picks their own
   (Settings, Colours, Custom): see the html[data-palette="custom"] block in styles.css. With Default, the hand-tuned
   tokens in tokens.json apply as they are. The palette belongs to the phone: a backup restore never changes it. */
import type { Palette } from '../types';

export const DEFAULT_PALETTE: Palette = { base: '#1C1E21', main: '#0052CC', accent: '#FF5722', up: '#2F9E62', down: '#D64545' };
export const PALETTE_KEYS = ['base', 'main', 'accent', 'up', 'down'] as const;
export const PALETTE_NAME: Record<(typeof PALETTE_KEYS)[number], string> = { base: 'Base', main: 'Main', accent: 'Accent', up: 'Up', down: 'Down' };

const hex = (v: unknown, d: string) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : d);
export const cleanPalette = (p?: Partial<Palette> | null): Palette => ({
  custom: !!p?.custom,
  base: hex(p?.base, DEFAULT_PALETTE.base), main: hex(p?.main, DEFAULT_PALETTE.main), accent: hex(p?.accent, DEFAULT_PALETTE.accent),
  up: hex(p?.up, DEFAULT_PALETTE.up), down: hex(p?.down, DEFAULT_PALETTE.down),
});

/** Puts the five colours on <html>; the custom block in styles.css derives the rest from them. */
export function applyPalette(p: Palette) {
  const root = document.documentElement;
  if (!p.custom) { root.removeAttribute('data-palette'); return; }
  root.setAttribute('data-palette', 'custom');
  for (const k of PALETTE_KEYS) root.style.setProperty(`--felt-${k}`, p[k]);
  // text on a Main or Accent fill: whichever of white and Base reads better on it
  root.style.setProperty('--felt-on-main', textOn(p.main, p.base));
  root.style.setProperty('--felt-on-accent', textOn(p.accent, p.base));
  const meta = document.querySelector('meta[name="theme-color"]');
  const bg = getComputedStyle(root).getPropertyValue('--sat-bg').trim();
  if (meta && bg) meta.setAttribute('content', bg);
}

const lum = (h: string) => {
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a: string, b: string) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
/** White or Base on a fill, whichever has more contrast. */
export const textOn = (fill: string, base: string) => (ratio(fill, '#FFFFFF') >= ratio(fill, base) ? '#FFFFFF' : base);
