/* Swipe between the main tabs. The page follows the finger one to one: a thumb moving right shows the tab on the left, a thumb
   moving left shows the tab on the right. The header and the tab bar stay still. While the page moves, the chip on the rail rolls
   in step (navRail.tsx listens to NAV_DRAG). Let go at half the screen or more, or with a quick flick, and the change completes:
   the page and the chip carry on from where the finger left them (SlidePane reads `takeCarry`). Less than that, both go back.
   A drag toward a side with no tab (Home on the left, Settings on the right) pulls against a rubber band and springs back.
   Drags that start on a control that scrolls or drags by itself, in a sheet, or at the very edge of the screen (the phone's own
   back swipe) are left alone. */

import { NAV_TABS, goTab } from '../router';
import { haptic } from './haptics';
import { SPRING, calm, spring } from './motion';

const LOCK = 14, EDGE = 22, FAR = 0.5, FLICK = 0.45;
const BLOCK = 'input, textarea, select, [contenteditable], .felt-swipe, .felt-scroll, .felt-detents, .felt-suit-list, .felt-keypad, .felt-picker, .felt-fold-body, [data-noswipe]';

/** The event the chip on the rail listens to: `p` is the drag progress (0 to 1) toward the tab on side `dir` (-1 left, 1 right).
    `end` says how a drag ended: 'back' (the chip returns) or 'commit' (the tab change follows at once). */
export const NAV_DRAG = 'felt-nav-drag';
export interface NavDrag { p: number; dir: -1 | 1; end?: 'back' | 'commit' }
const tell = (d: NavDrag) => window.dispatchEvent(new CustomEvent<NavDrag>(NAV_DRAG, { detail: d }));

/** Where a committed swipe left the page: SlidePane starts its slide from there (offset in px, share of the width). */
let carry: { x: number; p: number } | null = null;
export const takeCarry = () => { const c = carry; carry = null; return c; };

const topOf = () => {
  const t = window.location.hash.replace(/^#\/?/, '').split('/')[0] ?? '';
  return t === 'insights' ? 'players' : t;
};
/** An ancestor that scrolls sideways takes the drag itself. */
const scrollsSideways = (el: Element | null) => {
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    const o = getComputedStyle(n).overflowX;
    if ((o === 'auto' || o === 'scroll') && n.scrollWidth > n.clientWidth + 2) return true;
  }
  return false;
};

/** The parts of a page that move with the finger: everything under the header (the bars stay). */
export const bodyOf = (page: HTMLElement): HTMLElement[] => {
  const items = [...page.querySelectorAll<HTMLElement>(':scope > .felt-page > :not(.felt-header)')];
  return items.length ? items : [page];
};

/** The neighbouring tab for a drag of `dx` px (a drag to the right shows the tab on the left, as the page follows the finger), or undefined at the ends. */
export const neighbour = (tab: string, dx: number): string | undefined => NAV_TABS[NAV_TABS.indexOf(tab) + (dx > 0 ? -1 : 1)];

/** The way a drag lands, given its distance, speed (px per ms) and screen width: half the screen, or a quick flick. */
export function swipeCommits(dx: number, v: number, width: number): boolean {
  return Math.abs(dx) >= width * FAR || (Math.abs(v) > FLICK && Math.abs(dx) > 36);
}

export function installTabSwipe(): () => void {
  let s: { x: number; y: number; t: number; live: boolean; tab: string; page: HTMLElement; items: HTMLElement[] } | null = null;
  let shown = 0;
  const page = () => document.querySelector<HTMLElement>('.felt-app > .felt-slide');
  const paint = (x: number) => { shown = x; s?.items.forEach((n) => { n.style.translate = x ? `${x}px 0` : ''; }); };
  const clear = (g: { items: HTMLElement[] }) => g.items.forEach((n) => { n.style.translate = ''; });

  const start = (e: TouchEvent) => {
    s = null;
    if (e.touches.length !== 1 || !document.querySelector('.felt-nav')) return;
    const root = document.documentElement;
    if (document.querySelector('dialog[open]') || root.classList.contains('felt-typing') || root.classList.contains('felt-sheet-open')) return;
    const tab = topOf();
    const p = page();
    const t = e.touches[0];
    const el = e.target as Element | null;
    if (!p || !NAV_TABS.includes(tab) || t.clientX <= EDGE || t.clientX >= window.innerWidth - EDGE) return;
    if (el?.closest(BLOCK) || scrollsSideways(el)) return;
    s = { x: t.clientX, y: t.clientY, t: performance.now(), live: false, tab, page: p, items: bodyOf(p) };
  };
  const move = (e: TouchEvent) => {
    if (!s) return;
    const t = e.touches[0];
    const dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (!s.live) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { s = null; return; }
      if (Math.abs(dx) < LOCK || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      s.live = true;
    }
    if (e.cancelable) e.preventDefault();
    const w = window.innerWidth;
    // a tab on that side: the page follows the finger. None: a band that stiffens
    const room = neighbour(s.tab, dx) !== undefined;
    paint(room ? Math.sign(dx) * Math.min(w, Math.abs(dx)) : Math.sign(dx) * Math.min(44, Math.abs(dx) * 0.2));
    if (room) tell({ p: Math.abs(shown) / w, dir: dx > 0 ? -1 : 1 });
  };
  const end = (e?: Event) => {
    const g = s; s = null;
    if (!g?.live) return;
    const cancelled = e?.type === 'touchcancel';
    const was = shown;
    const w = window.innerWidth;
    const room = neighbour(g.tab, was) !== undefined;
    const dx = room ? was : was / 0.2;
    const v = dx / Math.max(1, performance.now() - g.t);
    const next = neighbour(g.tab, dx);
    const dir: -1 | 1 = dx > 0 ? -1 : 1;
    if (!cancelled && next !== undefined && swipeCommits(dx, v, w)) {
      // the page stays where the finger left it: SlidePane carries on from there, and the chip from where it is
      carry = { x: was, p: Math.min(1, Math.abs(was) / w) };
      shown = 0;
      haptic(6);
      tell({ p: carry.p, dir, end: 'commit' });
      goTab(next);
      // a change that did not happen must not leave the page off to one side
      window.setTimeout(() => { if (carry) { carry = null; clear(g); tell({ p: 0, dir, end: 'back' }); } }, 400);
      return;
    }
    if (next === undefined && Math.abs(dx) > 40) haptic(6);
    // not far enough, or nowhere to go: the page and the chip go back
    tell({ p: Math.min(1, Math.abs(was) / w), dir, end: 'back' });
    shown = 0;
    clear(g);
    // Reduced motion: a short linear return, not a jump (nothing cuts)
    if (calm()) { g.items.forEach((n) => n.animate?.({ translate: [`${was}px 0`, '0 0'] }, { duration: 150, easing: 'linear' })); return; }
    g.items.forEach((n) => spring(n, (p) => ({ translate: `${was * (1 - p)}px 0` }), SPRING.settle, { fill: 'none' }));
  };

  document.addEventListener('touchstart', start, { passive: true });
  document.addEventListener('touchmove', move, { passive: false });
  document.addEventListener('touchend', end, { passive: true });
  document.addEventListener('touchcancel', end, { passive: true });
  return () => {
    document.removeEventListener('touchstart', start); document.removeEventListener('touchmove', move);
    document.removeEventListener('touchend', end); document.removeEventListener('touchcancel', end);
  };
}
