import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

const hashPath = (h: string) => h.replace(/^[^#]*#?\/?/, '');
/** The main tabs in bar order: a change between two of them slides in that direction. */
export const NAV_TABS = ['', 'games', 'insights', 'players', 'settings'];
const calm = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/* The routes behind the current one, oldest first, so a screen can tell whether Back leads to a given
   screen. A replace keeps the stack; a hash change to the route on top of the stack counts as Back. */
const trail: string[] = [];
let replacing = false;
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', (e) => {
    const from = hashPath(e.oldURL), to = hashPath(e.newURL);
    if (replacing) replacing = false;
    else if (trail[trail.length - 1] === to) trail.pop();
    else trail.push(from);
  });
}

/** The route Back leads to, if known. */
export function previous(): string | undefined {
  return trail[trail.length - 1];
}

export function useRoute(): string[] {
  const read = () => (window.location.hash.replace(/^#\/?/, '') || '').split('/').filter(Boolean);
  const [parts, setParts] = useState(read);
  useEffect(() => {
    const on = (e: HashChangeEvent) => {
      const top = (u?: string) => hashPath(u ?? '').split('/')[0];
      const a = NAV_TABS.indexOf(top(e.oldURL)), b = NAV_TABS.indexOf(top(e.newURL));
      // between main tabs the screen slides (SlidePane in App.tsx)
      if (a >= 0 && b >= 0 && a !== b) { flushSync(() => setParts(read())); window.scrollTo(0, 0); return; }
      const apply = () => { flushSync(() => setParts(read())); window.scrollTo(0, 0); };
      if (document.startViewTransition && !calm()) document.startViewTransition(apply).ready.catch(() => undefined);
      else apply();
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return parts;
}

export function go(path: string, replace = false) {
  const h = '#/' + path.replace(/^\/+/, '');
  if (replace) {
    if (hashPath(h) !== hashPath(window.location.hash)) replacing = true;
    window.location.replace(h);
  }
  else window.location.hash = h;
}

export function back(fallback = '') {
  if (window.history.length > 1) window.history.back();
  else go(fallback, true);
}

/** Open `path`: step Back when Back leads there, so no screen is stacked twice; else replace this screen. */
export function backTo(path: string) {
  if (previous() === path.replace(/^\/+/, '')) window.history.back();
  else go(path, true);
}
