/* Swipe between the main tabs. A drag across the page moves it a little with the finger. Let go past about a quarter of the
   screen, or with a quick flick, and the neighbouring tab slides in (the same slide as a tap on the bar). A drag toward a side with
   no tab (Home on the left, Settings on the right) pulls against a rubber band and springs back. Drags that start on a
   control that scrolls or drags by itself, in a sheet, or at the very edge of the screen (the phone's own back swipe) are left alone. */

import { NAV_TABS, goTab } from '../router';
import { haptic } from './haptics';
import { SPRING, calm, spring } from './motion';

const LOCK = 14, EDGE = 22, FAR = 0.25, FLICK = 0.45;
const BLOCK = 'input, textarea, select, [contenteditable], .felt-swipe, .felt-scroll, .felt-detents, .felt-suit-list, .felt-keypad, .felt-picker, .felt-fold-body, [data-noswipe]';

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

/** The neighbouring tab for a drag of `dx` px (a drag to the right goes on to the next tab, as the phone's back swipe does), or undefined at the ends. */
export const neighbour = (tab: string, dx: number): string | undefined => NAV_TABS[NAV_TABS.indexOf(tab) + (dx > 0 ? 1 : -1)];

/** The way a drag lands, given its distance, speed (px per ms) and screen width. */
export function swipeCommits(dx: number, v: number, width: number): boolean {
  return Math.abs(dx) > width * FAR || (Math.abs(v) > FLICK && Math.abs(dx) > 36);
}

export function installTabSwipe(): () => void {
  let s: { x: number; y: number; t: number; live: boolean; tab: string; page: HTMLElement } | null = null;
  let shown = 0;
  const page = () => document.querySelector<HTMLElement>('.felt-app > .felt-slide');
  const paint = (x: number) => { shown = x; const p = s?.page; if (p) p.style.translate = x ? `${x}px 0` : ''; };

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
    s = { x: t.clientX, y: t.clientY, t: performance.now(), live: false, tab, page: p };
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
    // a tab on that side: the page follows the finger part of the way. None: a band that stiffens
    const room = neighbour(s.tab, dx) !== undefined;
    paint(room ? dx * 0.3 : Math.sign(dx) * Math.min(44, Math.abs(dx) * 0.2));
  };
  const end = (e?: Event) => {
    const g = s; s = null;
    if (!g?.live) return;
    const cancelled = e?.type === 'touchcancel';
    const was = shown;
    const dx = (shown / (neighbour(g.tab, shown) !== undefined ? 0.3 : 0.2)) || 0;
    const v = dx / Math.max(1, performance.now() - g.t);
    const next = neighbour(g.tab, dx);
    if (!cancelled && next !== undefined && swipeCommits(dx, v, window.innerWidth)) {
      g.page.style.translate = '';
      shown = 0;
      haptic(6);
      goTab(next);
      return;
    }
    if (next === undefined && Math.abs(dx) > 40) haptic(6);
    // not far enough, or nowhere to go: the page springs back
    if (calm()) { g.page.style.translate = ''; shown = 0; return; }
    g.page.style.translate = '';
    shown = 0;
    spring(g.page, (p) => ({ translate: `${was * (1 - p)}px 0` }), SPRING.settle, { fill: 'none' });
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
