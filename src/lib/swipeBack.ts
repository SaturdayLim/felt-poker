/* Swipe back from the hand page into the Log hand button (owner pick B, 5 Nov 2026).
   A drag from the left edge closes the page around the button shape as the finger moves: a clip, never a squash.
   Let go past a third of the screen: the page closes into the button, the blue comes in over it, then the text,
   and the game page takes over with no second move. Let go earlier: the page springs back. */

import { haptic } from './haptics';
import { SPRING, calm, spring } from './motion';

/** Where the Log hand button sat last time the game page drew it, and what it said. */
let lastButton: { rect: DOMRect; text: string; font: string; radius: string } | null = null;
export function rememberLogButton(el: HTMLElement | null) {
  if (!el) return;
  const cs = getComputedStyle(el);
  lastButton = { rect: el.getBoundingClientRect(), text: el.textContent ?? '', font: cs.font, radius: cs.borderRadius };
}

const EDGE = 32, DONE = 1 / 3, FOLLOW = 0.7;
type Box = { top: number; right: number; bottom: number; left: number };

/** The button box, or a plain stand-in at the bottom right if the game page has not drawn one yet. */
function target(): Box & { text: string; font?: string; radius?: string } {
  const W = window.innerWidth, H = window.innerHeight;
  const r = lastButton?.rect;
  if (r && r.width > 0) return { top: r.top, right: r.right, bottom: r.bottom, left: r.left, text: lastButton!.text, font: lastButton!.font, radius: lastButton!.radius };
  return { top: H - 72, right: W - 16, bottom: H - 20, left: W * 0.35, text: '' };
}
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
/** The page clipped to a box between the screen and the button, `k` of the way. */
function clipAt(page: HTMLElement, k: number, t: Box): string {
  const R = page.getBoundingClientRect();
  const W = window.innerWidth, H = window.innerHeight;
  const c = { top: lerp(0, t.top, k), right: lerp(W, t.right, k), bottom: lerp(H, t.bottom, k), left: lerp(0, t.left, k) };
  const radius = lerp(0, (t.bottom - t.top) / 2, k);
  return `inset(${c.top - R.top}px ${R.right - c.right}px ${R.bottom - c.bottom}px ${c.left - R.left}px round ${radius}px)`;
}

/** Turns on the edge swipe for a page. `leave` goes back with no view transition. Returns the clean-up. */
export function installSwipeBack(page: HTMLElement, leave: () => void): () => void {
  let s: { x: number; y: number; dx: number; live: boolean; t: ReturnType<typeof target> } | null = null;
  let face: HTMLElement | null = null;
  const reset = () => { page.style.clipPath = ''; page.classList.remove('is-swiping'); face?.remove(); face = null; };
  // the button that appears in the page's place as it closes: blue first, then its text
  const showFace = (t: ReturnType<typeof target>) => {
    face = document.createElement('div');
    face.className = 'felt-swipe-face';
    Object.assign(face.style, { top: `${t.top}px`, left: `${t.left}px`, width: `${t.right - t.left}px`, height: `${t.bottom - t.top}px` });
    // the same face and corners as the real button, so the hand-over shows no jump
    if (t.font) face.style.font = t.font;
    if (t.radius) face.style.borderRadius = t.radius;
    const label = document.createElement('span');
    label.textContent = t.text;
    face.append(label);
    document.body.append(face);
    face.animate({ opacity: [0, 1] }, { duration: 160, delay: 140, easing: 'ease-out', fill: 'both' });
    label.animate({ opacity: [0, 1] }, { duration: 160, delay: 220, easing: 'ease-out', fill: 'both' });
  };
  const start = (x: number, y: number) => {
    if (x > EDGE || calm()) return;
    s = { x, y, dx: 0, live: false, t: target() };
  };
  const move = (x: number, y: number, e: Event) => {
    if (!s) return;
    const dx = x - s.x, dy = y - s.y;
    if (!s.live) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { s = null; return; }
      if (dx < 10) return;
      s.live = true;
      page.classList.add('is-swiping');
    }
    if (e.cancelable) e.preventDefault();
    s.dx = Math.max(0, dx);
    page.style.clipPath = clipAt(page, (s.dx / window.innerWidth) * FOLLOW, s.t);
  };
  const end = () => {
    if (!s?.live) { s = null; return; }
    const { dx, t } = s;
    s = null;
    const k0 = (dx / window.innerWidth) * FOLLOW;
    if (dx / window.innerWidth < DONE) {
      spring(page, (p) => ({ clipPath: clipAt(page, k0 * (1 - Math.min(p, 1)), t) }), SPRING.settle, { fill: 'forwards' })!.onfinish = () => { page.getAnimations().forEach((a) => a.cancel()); reset(); };
      return;
    }
    haptic(10);
    showFace(t);
    const a = spring(page, (p) => ({ clipPath: clipAt(page, k0 + (1 - k0) * Math.min(p, 1), t) }), SPRING.grow, { fill: 'forwards', near: 0.02 });
    const go = () => {
      const f = face;
      face = null;
      leave();
      // the game page draws its own blue button in the same place: the stand-in goes once it is there
      window.setTimeout(() => f?.remove(), 120);
    };
    if (a) a.onfinish = go; else go();
  };
  const ts = (e: TouchEvent) => { if (e.touches.length === 1) start(e.touches[0].clientX, e.touches[0].clientY); };
  const tm = (e: TouchEvent) => move(e.touches[0].clientX, e.touches[0].clientY, e);
  const md = (e: PointerEvent) => { if (e.pointerType === 'mouse') start(e.clientX, e.clientY); };
  const mm = (e: PointerEvent) => { if (e.pointerType === 'mouse' && s) move(e.clientX, e.clientY, e); };
  const mu = (e: PointerEvent) => { if (e.pointerType === 'mouse') end(); };
  document.addEventListener('touchstart', ts, { passive: true });
  document.addEventListener('touchmove', tm, { passive: false });
  document.addEventListener('touchend', end);
  document.addEventListener('touchcancel', end);
  document.addEventListener('pointerdown', md);
  document.addEventListener('pointermove', mm);
  document.addEventListener('pointerup', mu);
  return () => {
    document.removeEventListener('touchstart', ts);
    document.removeEventListener('touchmove', tm);
    document.removeEventListener('touchend', end);
    document.removeEventListener('touchcancel', end);
    document.removeEventListener('pointerdown', md);
    document.removeEventListener('pointermove', mm);
    document.removeEventListener('pointerup', mu);
    face?.remove();
  };
}
