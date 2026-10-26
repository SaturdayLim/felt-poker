import { useEffect, useState } from 'react';
import type { ThemePref } from './types';

/* Theme handling, matching saturday/js/saturday.js: same storage key ('sat-theme'), same values,
   data-theme on <html> (none = follow the OS), theme-color meta from --sat-theme-color.
   We drive it from React state instead of loading saturday.js, so the kit's click handlers
   never fight React over aria attributes. */
const KEY = 'sat-theme';

export type Resolved = 'light' | 'dark';

const media = () => window.matchMedia('(prefers-color-scheme: dark)');

export function resolveTheme(pref: ThemePref): Resolved {
  return pref === 'auto' ? (media().matches ? 'dark' : 'light') : pref;
}

export function applyTheme(pref: ThemePref) {
  const root = document.documentElement;
  if (pref === 'light' || pref === 'dark') root.setAttribute('data-theme', pref);
  else root.removeAttribute('data-theme');
  try { localStorage.setItem(KEY, pref); } catch { /* private mode: still applies for this page */ }
  const meta = document.querySelector('meta[name="theme-color"]');
  const color = getComputedStyle(root).getPropertyValue('--sat-theme-color').trim();
  if (meta && color) meta.setAttribute('content', color);
}

export const NEXT_THEME: Record<ThemePref, ThemePref> = { auto: 'light', light: 'dark', dark: 'auto' };

/** Current light or dark, following OS changes while the preference is auto. */
export function useResolvedTheme(pref: ThemePref): Resolved {
  const [r, setR] = useState<Resolved>(() => resolveTheme(pref));
  useEffect(() => {
    setR(resolveTheme(pref));
    if (pref !== 'auto') return;
    const mq = media();
    const on = () => { setR(resolveTheme('auto')); applyTheme('auto'); };
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [pref]);
  return r;
}
