import { useEffect, useState } from 'react';
import type { ThemePref } from './types';

const KEY = 'felt-theme';
const META_COLOR = { light: '#DCE1DE', dark: '#1E2326' } as const;

export type Resolved = 'light' | 'dark';

const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

export function resolveTheme(pref: ThemePref): Resolved {
  return pref === 'system' ? (systemDark() ? 'dark' : 'light') : pref;
}

/** Set data-theme (none = follow the system), remember it for first paint, and tint the browser chrome. */
export function applyTheme(pref: ThemePref) {
  const root = document.documentElement;
  if (pref === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', pref);
  try { localStorage.setItem(KEY, pref); } catch { /* private mode */ }
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', META_COLOR[resolveTheme(pref)]);
}

/** Current light/dark, following system changes when the preference is "system". */
export function useResolvedTheme(pref: ThemePref): Resolved {
  const [r, setR] = useState<Resolved>(() => resolveTheme(pref));
  useEffect(() => {
    setR(resolveTheme(pref));
    if (pref !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => { setR(resolveTheme('system')); applyTheme('system'); };
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [pref]);
  return r;
}
