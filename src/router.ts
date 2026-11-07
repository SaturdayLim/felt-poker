import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { calm } from './lib/motion';

const hashPath = (h: string) => h.replace(/^[^#]*#?\/?/, '');
/** The main tabs in bar order: a change between two of them slides in that direction. */
export const NAV_TABS = ['', 'games', 'players', 'settings'];

/* The routes behind the current one, oldest first, so a screen can tell whether Back leads to a given
   screen. A replace keeps the stack; a hash change to the route on top of the stack counts as Back. */
const trail: string[] = [];
let replacing = false;
/** The next route change runs with no view transition: a back swipe already moved the page. */
let plainNext = false;
/** The last route change was a step Back: the screen comes back at the scroll position it had. */
let wentBack = false;
/** Where each screen was scrolled to when it was left, so Back returns to the same place. */
const scrollAt = new Map<string, number>();
/** A drag from the left edge is under way, or ended at this time: the phone may be doing its own back swipe. */
let edge: { x: number; y: number; moved: boolean } | null = null;
let edgeEnd = 0;
if (typeof window !== 'undefined') {
  // the app puts the scroll back itself (Back returns to the same place); the browser must not move it as well
  try { window.history.scrollRestoration = 'manual'; } catch { /* old browser */ }
  // the phone's own back swipe already slid the page: the morph must not play on top of it.
  // Phones without hasUAVisualTransition: a Back while (or just after) a finger drags from the left edge counts too
  window.addEventListener('popstate', (e) => {
    const ua = (e as PopStateEvent & { hasUAVisualTransition?: boolean }).hasUAVisualTransition;
    if (ua || edge?.moved || Date.now() - edgeEnd < 800) plainNext = true;
  });
  window.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    edge = e.touches.length === 1 && t.clientX <= 24 ? { x: t.clientX, y: t.clientY, moved: false } : null;
  }, { passive: true, capture: true });
  window.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    if (edge && t && t.clientX - edge.x > 10 && Math.abs(t.clientX - edge.x) > Math.abs(t.clientY - edge.y)) edge.moved = true;
  }, { passive: true, capture: true });
  const lift = () => { if (edge?.moved) edgeEnd = Date.now(); edge = null; };
  window.addEventListener('touchend', lift, { passive: true, capture: true });
  window.addEventListener('touchcancel', lift, { passive: true, capture: true });
  window.addEventListener('hashchange', (e) => {
    const from = hashPath(e.oldURL), to = hashPath(e.newURL);
    wentBack = false;
    if (replacing) replacing = false;
    else if (trail[trail.length - 1] === to) { trail.pop(); wentBack = true; }
    else trail.push(from);
  });
}

/** The route Back leads to, if known. */
export function previous(): string | undefined {
  return trail[trail.length - 1];
}

/** The scroll position for the screen just opened: where it was left on a step Back, else the top. */
const scrollFor = () => (wentBack ? scrollAt.get(hashPath(window.location.hash)) ?? 0 : 0);

export function useRoute(): string[] {
  const read = () => (window.location.hash.replace(/^#\/?/, '') || '').split('/').filter(Boolean);
  const [parts, setParts] = useState(read);
  useEffect(() => {
    const on = (e: HashChangeEvent) => {
      const top = (u?: string) => hashPath(u ?? '').split('/')[0];
      const a = NAV_TABS.indexOf(top(e.oldURL)), b = NAV_TABS.indexOf(top(e.newURL));
      // between main tabs the screen slides (SlidePane in App.tsx)
      if (a >= 0 && b >= 0 && a !== b) { plainNext = false; flushSync(() => setParts(read())); window.scrollTo(0, 0); return; }
      // a view inside the same tab (Players, Leaderboard, Stats) slides inside the tab
      if (a >= 0 && a === b) { plainNext = false; flushSync(() => setParts(read())); return; }
      const y = scrollFor();
      const apply = () => { flushSync(() => setParts(read())); window.scrollTo(0, y); };
      if (plainNext) { plainNext = false; apply(); return; }
      if (document.startViewTransition && !calm()) {
        // the Log hand morph runs in steps, and the order depends on the way: into the hand page, or back out of it
        const hand = (u?: string) => /(^|\/)hand(\/|$)/.test(hashPath(u ?? ''));
        const way = hand(e.newURL) && !hand(e.oldURL) ? 'open' : hand(e.oldURL) && !hand(e.newURL) ? 'close' : '';
        const root = document.documentElement;
        if (way) root.dataset.vt = way; else delete root.dataset.vt;
        const t = document.startViewTransition(apply);
        t.ready.catch(() => undefined);
        t.finished.finally(() => { if (root.dataset.vt === way) delete root.dataset.vt; }).catch(() => undefined);
      } else apply();
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return parts;
}

export function go(path: string, replace = false) {
  const h = '#/' + path.replace(/^\/+/, '');
  // keep this screen's place: a step Back to it scrolls there again
  scrollAt.set(hashPath(window.location.hash), window.scrollY);
  if (replace) {
    if (hashPath(h) !== hashPath(window.location.hash)) replacing = true;
    window.location.replace(h);
  }
  else window.location.hash = h;
}

/** Changes the address of the screen in view, with no page change: no transition, no new step in the history.
    A view inside a screen (the Hands tab of a game) uses it, so Back from a page opened there comes back to that view. */
export function setPath(path: string) {
  const h = '#/' + path.replace(/^\/+/, '');
  if (hashPath(h) === hashPath(window.location.hash)) return;
  window.history.replaceState(window.history.state, '', h);
}

/** Back, with no view transition: the swipe back on the hand page has already closed it into the button. */
export function backPlain(fallback = '') {
  plainNext = true;
  back(fallback);
}

export function back(fallback = '') {
  if (window.history.length > 1) window.history.back();
  else go(fallback, true);
}

/** A game page is one screen in either view: game/<id> (Players) and game/<id>/hands (Hands). */
const screenOf = (p: string) => p.replace(/^(game\/[^/]+)\/hands$/, '$1');

/** Open `path`: step Back when Back leads there, so no screen is stacked twice; else replace this screen.
    Back to a game page keeps the view it was left on. */
export function backTo(path: string) {
  const p = previous();
  if (p !== undefined && screenOf(p) === screenOf(path.replace(/^\/+/, ''))) window.history.back();
  else go(path, true);
}
