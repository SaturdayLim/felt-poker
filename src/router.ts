import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { calm } from './lib/motion';

const hashPath = (h: string) => h.replace(/^[^#]*#?\/?/, '');
/** The main tabs in bar order: a change between two of them slides in that direction. */
export const NAV_TABS = ['', 'games', 'players', 'settings'];
/** Where a screen sits along the slide: the main tabs in bar order, and a group page just after Players, so opening one pushes in
    from the right and Back slides it away again. -1 means the screen has no place (a game, the hand recorder). */
export const tabPos = (top: string): number => {
  const k = top === 'insights' ? 'players' : top;
  return k === 'group' ? NAV_TABS.indexOf('players') + 0.5 : NAV_TABS.indexOf(k);
};

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
/** The address of the screen in view, kept so a step Back onto the spare history entry can put it back. */
let curHash = typeof window !== 'undefined' ? window.location.hash : '';
/** Hash changes caused by a step onto the spare entry. They are not navigation: the screen stays where it is. */
let guarding: string | null = null;
const guardEvents = new WeakSet<Event>();
/** True for the hash change a step onto the spare history entry causes. */
export const isGuardEvent = (e: Event) => guardEvents.has(e);
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
    if (guarding !== null && hashPath(e.oldURL) === hashPath(guarding)) { guarding = null; guardEvents.add(e); return; }
    curHash = window.location.hash;
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
      if (isGuardEvent(e)) return;
      const top = (u?: string) => hashPath(u ?? '').split('/')[0];
      const a = tabPos(top(e.oldURL)), b = tabPos(top(e.newURL));
      // between main tabs the screen slides (SlidePane in App.tsx)
      if (a >= 0 && b >= 0 && a !== b) { plainNext = false; const y = scrollFor(); flushSync(() => setParts(read())); window.scrollTo(0, y); return; }
      // a view inside the same tab (Players, Leaderboard, Stats, Settings views) slides inside the tab and opens at the top; a step Back returns to the old place
      if (a >= 0 && a === b) { plainNext = false; const y = scrollFor(); flushSync(() => setParts(read())); window.scrollTo(0, y); return; }
      const y = scrollFor();
      const apply = () => { flushSync(() => setParts(read())); window.scrollTo(0, y); };
      if (plainNext) { plainNext = false; apply(); return; }
      if (document.startViewTransition) {
        // the Log hand morph runs in steps, and the order depends on the way: into the hand page, or back out of it
        const hand = (u?: string) => /(^|\/)hand(\/|$)/.test(hashPath(u ?? ''));
        const way = hand(e.newURL) && !hand(e.oldURL) ? 'open' : hand(e.oldURL) && !hand(e.newURL) ? 'close' : '';
        const root = document.documentElement;
        // a game's name in a list and the title of its page are one element: the row carries the shared name while the page changes
        const gid = (u?: string) => /^game\/([^/]+)/.exec(hashPath(u ?? ''))?.[1];
        const shared = gid(e.newURL) ?? gid(e.oldURL);
        const mark = () => { if (shared && !calm()) document.querySelectorAll<HTMLElement>(`[data-game-title="${shared}"]`).forEach((n) => { n.style.viewTransitionName = 'felt-game'; }); };
        const unmark = () => document.querySelectorAll<HTMLElement>('[data-game-title]').forEach((n) => { n.style.viewTransitionName = ''; });
        mark();
        if (way) root.dataset.vt = way; else delete root.dataset.vt;
        // review of a closed game has no Log hand button to close into: the hand list shows at once
        const t = document.startViewTransition(() => { apply(); mark(); if (way === 'close' && !document.querySelector('.felt-logbtn')) root.dataset.vt = 'none'; });
        t.ready.catch(() => undefined);
        // a transition that never ends leaves a faded copy of the old page over the new one (seen on iOS): end it
        window.setTimeout(() => { try { t.skipTransition(); } catch { /* already done */ } }, 1200);
        t.updateCallbackDone.catch(() => undefined);
        t.finished.finally(() => { unmark(); if (root.dataset.vt === way || root.dataset.vt === 'none') delete root.dataset.vt; }).catch(() => undefined);
      } else apply();
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return parts;
}

/** Open a main tab (or a view of one) from the bar or a swipe. It replaces the screen in view: tabs do not pile up in the history,
    so a swipe back from the first screen never lands on an empty one. */
export const goTab = (path: string) => go(path, true);

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
  curHash = h;
}

/** Back, with no view transition: the swipe back on the hand page has already closed it into the button. */
export function backPlain(fallback = '') {
  plainNext = true;
  back(fallback);
}

/** Step Back when this session opened the screen from another one (the trail knows it); after a reload or a cold load the trail is
    empty and history.length lies (Nightcap keeps spare entries), so go to the logical parent instead. */
export const backWay = (trailLength: number): 'history' | 'parent' => (trailLength > 0 ? 'history' : 'parent');

/** The screen Back leads to from a sub page when the session has no trail, or undefined for a main tab. `closed` says whether
    a game is closed (its parent is the Games list and its hand review sits under Hands). */
export function parentOf(path: string, closed: (id: string) => boolean = () => false): string | undefined {
  const p = path.replace(/^#?\/?/, '').split('/').filter(Boolean);
  if (p[0] === 'group' || p[0] === 'join') return p[0] === 'group' ? 'players' : '';
  if (p[0] === 'new') return '';
  if (p[0] !== 'game' || !p[1]) return undefined;
  const id = p[1], sub = p[2];
  if (!sub || sub === 'hands') return closed(id) ? 'games' : '';
  if (sub === 'hand') return closed(id) ? `game/${id}/hands` : `game/${id}`;
  if (sub === 'report') return `game/${id}/close`;
  return `game/${id}`;
}

export function back(fallback = '') {
  if (backWay(trail.length) === 'history') window.history.back();
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

/** Nothing behind or ahead of the first screen: a swipe from either edge must not leave Nightcap for a blank page, and must not
    walk to a page that was open before. Nightcap keeps one spare history entry under the screen in view and one above it.
    A step onto either one puts the spares back, keeps the address of the screen in view (a spare carries the address it was
    made with, which would otherwise jump the page) and calls `onSwipe`: 'back' is the phone's back swipe (a finger moving
    right from the left edge), 'forward' the one from the right edge. */
export function guardHistory(onSwipe: (way: 'back' | 'forward') => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const url = () => window.location.pathname + window.location.search + curHash;
  try {
    const s = history.state;
    if (!s?.feltBase && !s?.feltTop && !s?.feltFwd) {
      history.replaceState({ feltBase: true }, '');
      history.pushState({ feltTop: true }, '');
      history.pushState({ feltFwd: true }, '');
      history.go(-1);
    }
  } catch { return () => undefined; }
  const on = (e: PopStateEvent) => {
    const st = e.state;
    if (!st?.feltBase && !st?.feltFwd) return;
    // the step moved the address to the spare entry's own: that hash change is not navigation
    if (window.location.hash !== curHash) guarding = curHash;
    window.setTimeout(() => { guarding = null; }, 400);
    plainNext = false;
    try {
      if (st.feltBase) {
        history.replaceState({ feltBase: true }, '', url());
        history.pushState({ feltTop: true }, '', url());
        history.pushState({ feltFwd: true }, '', url());
      } else history.replaceState({ feltFwd: true }, '', url());
      // the step back onto the screen in view is asynchronous: the swipe acts once it has landed, or it would replace the wrong entry
      const way = st.feltBase ? 'back' : 'forward';
      let done = false;
      const land = () => { if (done) return; done = true; window.removeEventListener('popstate', land); onSwipe(way); };
      window.addEventListener('popstate', land);
      window.setTimeout(land, 350);
      history.go(-1);
    } catch { return; }
  };
  window.addEventListener('popstate', on);
  return () => window.removeEventListener('popstate', on);
}
