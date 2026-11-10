/* The five base colours. Every other colour of the app comes from these when the phone owner picks their own
   (Settings, Colours, Custom): see the html[data-palette="custom"] block in styles.css. With Default, the hand-tuned
   tokens in tokens.json apply as they are. The palette belongs to the phone: a backup restore never changes it. */
import type { Palette } from '../types';
import { resolveTheme } from '../theme';

/** One set of five colours. */
export type Colours = Pick<Palette, 'base' | 'main' | 'accent' | 'up' | 'down'>;
/** Base is the background colour of the theme. Light and dark each keep their own set. */
export const DEFAULT_LIGHT: Colours = { base: '#EBF1F5', main: '#0052CC', accent: '#FF5722', up: '#2F9E62', down: '#D64545' };
export const DEFAULT_DARK: Colours = { base: '#1C1E21', main: '#0052CC', accent: '#FF5722', up: '#2F9E62', down: '#D64545' };
export const DEFAULT_PALETTE = DEFAULT_DARK;
export const PALETTE_KEYS = ['base', 'main', 'accent', 'up', 'down'] as const;
export const PALETTE_NAME: Record<(typeof PALETTE_KEYS)[number], string> = { base: 'Base', main: 'Main', accent: 'Accent', up: 'Up', down: 'Down' };
export const defaultsFor = (theme: 'light' | 'dark'): Colours => (theme === 'dark' ? DEFAULT_DARK : DEFAULT_LIGHT);

const hex = (v: unknown, d: string) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : d);
const cleanColours = (p: Partial<Colours> | null | undefined, d: Colours): Colours => ({
  base: hex(p?.base, d.base), main: hex(p?.main, d.main), accent: hex(p?.accent, d.accent), up: hex(p?.up, d.up), down: hex(p?.down, d.down),
});
/** The saved palette: the top level holds the light-theme colours, `dark` the dark-theme colours.
    A palette saved before the split had one set (its Base was the dark ground): it becomes the dark set,
    and the light set takes its other four colours with the default light Base. */
export const cleanPalette = (p?: Partial<Palette> | null): Palette => {
  const dark = cleanColours(p?.dark ?? p, DEFAULT_DARK);
  const light = p?.dark ? cleanColours(p, DEFAULT_LIGHT) : cleanColours({ ...dark, base: DEFAULT_LIGHT.base }, DEFAULT_LIGHT);
  return { custom: !!p?.custom, ...light, dark };
};
/** The colours for one theme out of a saved palette. */
export const coloursFor = (p: Palette, theme: 'light' | 'dark'): Colours => {
  if (theme === 'dark') return p.dark ?? DEFAULT_DARK;
  const { base, main, accent, up, down } = p;
  return { base, main, accent, up, down };
};
/** A palette with one theme's colours replaced. */
export const withColours = (p: Palette, theme: 'light' | 'dark', c: Colours): Palette => (theme === 'dark' ? { ...p, dark: c } : { ...p, ...c, dark: p.dark });

/** Puts the five colours of the open theme on <html>; the custom block in styles.css derives the rest from them. */
export function applyPalette(full: Palette) {
  const root = document.documentElement;
  const theme = resolveTheme(root.getAttribute('data-theme') === 'dark' ? 'dark' : root.getAttribute('data-theme') === 'light' ? 'light' : 'auto');
  const p = { custom: full.custom, ...coloursFor(full, theme) };
  if (!p.custom) { root.removeAttribute('data-palette'); return; }
  root.setAttribute('data-palette', 'custom');
  for (const k of PALETTE_KEYS) root.style.setProperty(`--felt-${k}`, p[k]);
  // text on a Main or Accent fill: whichever of white and the dark colour reads better on it (dark theme: Base; light
  // theme: ink, since a light Base would never win against white)
  const dark = theme === 'dark' ? p.base : '#1C1E21';
  root.style.setProperty('--felt-on-main', textOn(p.main, dark));
  root.style.setProperty('--felt-on-accent', textOn(p.accent, dark));
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
