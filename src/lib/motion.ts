/* Motion for Felt: the choices are in docs/MOTION-LIST.md. Springs use the same maths as the Motion library
   (visual duration and bounce), played as Web Animations keyframes, so they need no library and run on every phone
   Felt supports. CSS transitions that must retarget use the same curves through --felt-* custom properties. */

import { haptic } from './haptics';

export const DRAWER = 'cubic-bezier(0.32, 0.72, 0, 1)';
/** A tab change: the content swipe and the chip roll start and end together, so they share this one length. */
export const NAV_MS = 600;
/** Navigation speed, set in Settings, Animation speed: Off, Quick, Standard or Relaxed scale the tab change and the chip roll. Off takes 0 ms. */
export type NavSpeed = 'off' | 'quick' | 'standard' | 'relaxed';
const NAV_KEY = 'felt-nav-speed';
const NAV_SCALE: Record<NavSpeed, number> = { off: 0, quick: 0.65, standard: 1, relaxed: 1.5 };
export const navSpeed = (): NavSpeed => { try { const v = localStorage.getItem(NAV_KEY); return v === 'off' || v === 'quick' || v === 'relaxed' ? v : 'standard'; } catch { return 'standard'; } };
export const setNavSpeed = (v: NavSpeed) => { try { if (v === 'standard') localStorage.removeItem(NAV_KEY); else localStorage.setItem(NAV_KEY, v); } catch { /* private mode */ } markMotionOff(); window.dispatchEvent(new Event('felt-nav-speed')); };
/** Animation speed Off: every animation is an instant cut (owner, 10 Nov 2026). html[data-motion-off] stops the CSS
    transitions and animations (motion.css), and every Web Animation plays at 0 ms, so it lands on its end state and its
    finish callbacks still run. */
export const motionOff = () => navSpeed() === 'off';
function markMotionOff() { if (typeof document !== 'undefined') document.documentElement.toggleAttribute('data-motion-off', motionOff()); }
if (typeof Element !== 'undefined' && Element.prototype.animate) {
  const play = Element.prototype.animate;
  Element.prototype.animate = function (frames: Keyframe[] | PropertyIndexedKeyframes | null, opts?: number | KeyframeAnimationOptions) {
    if (motionOff()) opts = typeof opts === 'number' ? 0 : { ...opts, duration: 0, delay: 0, endDelay: 0 };
    return play.call(this, frames, opts);
  };
  markMotionOff();
}
export const navMs = () => Math.round(NAV_MS * NAV_SCALE[navSpeed()]);
/** Reduced motion on this phone: the phone's setting unless the toggle in Settings overrules it. */
export const reducedNow = () => { const p = motionPref(); return p === 'calm' || (p === 'phone' && phoneAsksCalm()); };
/** Reduced motion, decided before the first paint by the script at the top of index.html and app/index.html. */
export const calm = () => document.documentElement.hasAttribute('data-calm');

/** Reduced: no motion. Phone: follow the phone's Reduce Motion. Full: always play it. */
export type MotionPref = 'calm' | 'phone' | 'full';
const MOTION_KEY = 'felt-motion';
export const phoneAsksCalm = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
export const motionPref = (): MotionPref => { try { const v = localStorage.getItem(MOTION_KEY); return v === 'full' || v === 'calm' ? v : 'phone'; } catch { return 'phone'; } };
/** Belongs to the phone, like the theme: a backup restore does not touch it. */
export function setMotionPref(p: MotionPref) {
  try { if (p === 'phone') localStorage.removeItem(MOTION_KEY); else localStorage.setItem(MOTION_KEY, p); } catch { /* private mode */ }
  document.documentElement.toggleAttribute('data-calm', p === 'calm' || (p === 'phone' && phoneAsksCalm()));
}

/** The picked springs: visual duration in seconds, then bounce. Each sits in the band of its kind
    (docs/MOTION-LIST.md): press 0.1 to 0.2, standard 0.2 to 0.3, screen 0.3 to 0.4, loader 0.5 and more. */
export const SPRING = {
  // press
  log: [0.16, 0.2], select: [0.18, 0.4], toggle: [0.18, 0.35], fill: [0.18, 0.45],
  // standard: a panel, a pop-up, a row that moves
  pill: [0.28, 0.3], dock: [0.28, 0.1], qr: [0.28, 0.15], toast: [0.26, 0.15], settle: [0.28, 0.3], deal: [0.3, 0.14],
  remove: [0.26, 0.12],
  // screen: a sheet, a page that opens or closes
  grow: [0.35, 0.08], sheetUp: [0.36, 0], sheetDown: [0.3, 0],
} as const satisfies Record<string, readonly [number, number]>;
/** Fixed lengths in ms, in the same bands. */
export const MS = { pressDown: 100, ink: 200, inkClear: 160, rowGap: 220 } as const;
export type Spring = readonly [number, number];

/** Progress of a spring from 0 to 1, one value per step, and its length in ms. */
export function springCurve([visual, bounce]: Spring, stepMs = 16, near = 0.002): { p: number[]; ms: number } {
  // Reduced motion takes out the extra motion: a spring settles with no bounce (owner, 10 Nov 2026)
  if (typeof document !== 'undefined' && calm()) bounce = 0;
  const w0 = (2 * Math.PI) / (visual * 1.2);
  const z = Math.min(1, Math.max(0.05, 1 - bounce));
  const wd = w0 * Math.sqrt(1 - z * z);
  const at = (t: number) => (z < 1
    ? 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + ((z * w0) / wd) * Math.sin(wd * t))
    : 1 - Math.exp(-w0 * t) * (1 + w0 * t));
  const p: number[] = [0];
  for (let ms = stepMs; ms < 2000; ms += stepMs) {
    const v = at(ms / 1000);
    p.push(v);
    if (Math.abs(1 - v) < near && Math.abs(1 - at((ms + stepMs) / 1000)) < near) break;
  }
  p[p.length - 1] = 1;
  return { p, ms: (p.length - 1) * stepMs };
}

/** Plays a spring on an element. `frame` turns progress (0 to 1, with overshoot) into one keyframe. */
export function spring(el: Element, frame: (p: number) => Keyframe, s: Spring, opts: { delay?: number; fill?: FillMode; near?: number } = {}): Animation | null {
  if (!el.animate) return null;
  const { p, ms } = springCurve(s, 16, opts.near);
  return el.animate(p.map(frame), { duration: ms, easing: 'linear', delay: opts.delay, fill: opts.fill ?? 'backwards' });
}

/** The page pushes 28 px towards the swipe and springs back, like a rubber band: there is no page behind it. */
export function bounceBack(way: 1 | -1 = 1) {
  const page = document.querySelector<HTMLElement>('.felt-slide');
  if (!page || calm()) return;
  spring(page, (p) => ({ transform: `translateX(${28 * way * (1 - p)}px)` }), SPRING.settle, { fill: 'none' });
}

/** Like `spring`, from stiffness, damping and mass (the numbers of the interior.dev components). */
export function physSpring(el: Element, frame: (p: number) => Keyframe, s: readonly [number, number, number], opts: { delay?: number; fill?: FillMode } = {}): Animation | null {
  if (!el.animate) return null;
  const { p, ms } = physCurve(s);
  return el.animate(p.map(frame), { duration: ms, easing: 'linear', delay: opts.delay, fill: opts.fill ?? 'both' });
}
export const DISCLOSE = [380, 38, 0.7] as const;
export const ARRIVE = [540, 34, 0.5] as const;
export const ACCORDION = [480, 40, 0.6] as const;

/** Sets the curves that CSS transitions and the Log hand morph read. Phones without linear() keep the CSS fallback. */
export function installMotion() {
  if (typeof CSS === 'undefined' || !CSS.supports?.('transition-timing-function', 'linear(0, 1)')) return;
  const root = document.documentElement.style;
  const set = (name: string, s: Spring) => {
    const { p, ms } = springCurve(s, 24);
    root.setProperty(`--felt-${name}`, `linear(${p.map((x) => +x.toFixed(4)).join(', ')})`);
    root.setProperty(`--felt-${name}-ms`, `${ms}ms`);
  };
  // the highlight of tabs and segments: the tabs spring of interior.dev (stiffness 620, damping 42, mass 0.35). It is over-damped,
  // so the highlight never passes its tab and never leaves the frame
  const tabs = physCurve([620, 42, 0.35]);
  root.setProperty('--felt-pill', `linear(${tabs.p.map((x) => +x.toFixed(4)).join(', ')})`);
  root.setProperty('--felt-pill-ms', `${tabs.ms}ms`);
  set('grow', SPRING.grow);
  set('settle', SPRING.settle);
  // the cross-fade of a button's faces (Save, Saving, Saved) uses the interior.dev spring: stiffness 260, damping 34, mass 0.8
  const { p, ms } = physCurve(CROSSFADE);
  root.setProperty('--felt-cross', `linear(${p.map((x) => +x.toFixed(4)).join(', ')})`);
  root.setProperty('--felt-cross-ms', `${ms}ms`);
  // the cell spring (stiffness 520, damping 34, mass 0.45): reorder, small moves
  const cell = physCurve(CELL);
  root.setProperty('--felt-cell', `linear(${cell.p.map((x) => +x.toFixed(4)).join(', ')})`);
  root.setProperty('--felt-cell-ms', `${cell.ms}ms`);
}

/** A spring from stiffness, damping and mass, sampled every 16 ms (the form the Motion library uses). */
export const CROSSFADE = [260, 34, 0.8] as const;
export const CELL = [520, 34, 0.45] as const;
export function physCurve([k, c, m]: readonly [number, number, number]): { p: number[]; ms: number } {
  const dt = 1 / 480;
  let x = 0, v = 0;
  const p: number[] = [0];
  for (let i = 1; i < 1920; i++) {
    v += ((-k * (x - 1) - c * v) / m) * dt;
    x += v * dt;
    if (i % 8 === 0) { p.push(x); if (Math.abs(x - 1) < 0.002 && Math.abs(v) < 0.02) break; }
  }
  p[p.length - 1] = 1;
  return { p, ms: (p.length - 1) * 16 };
}

/* ------------------------------- button presses ------------------------------- */

type PressClass = 'log' | 'commit' | 'forward' | 'dismiss' | 'select' | 'toggle' | 'open' | 'name' | 'plain' | 'none';

const DISMISS = /^(close|done|cancel|back)$/i;

/** What a press does, from where the button sits. A button can name its class with data-press. */
function classOf(b: HTMLElement): PressClass {
  const named = b.dataset.press as PressClass | undefined;
  if (named) return named;
  if (b.matches('.felt-hold, .felt-toast-act, .felt-grip, button.felt-acts-name')) return 'none';
  // a name glows around its letters: no box lights up around it
  if (b.matches('.felt-pcard-name, .felt-name, [data-player]')) return 'name';
  if (b.matches('.felt-keypad-dark, .felt-mini, .felt-livepass-eye, .felt-codectl-btn, .felt-liveswitch, [role="switch"], .sat-switch')) return 'toggle';
  if (b.matches('.felt-keypad button, .felt-picker button, button.felt-box')) return 'log';
  if (b.matches('.sat-chip, [role="tab"], [role="radio"], .felt-pickwin-btn, .felt-nav a')) return 'select';
  if (b.matches('.felt-fab, .felt-row, .felt-live-card, .felt-pcard-name, .felt-fig, [aria-label="Show the QR code"], .felt-hand, .felt-showbar-btn')) return 'open';
  if (b.matches('[aria-label="Back"]') || DISMISS.test(b.textContent?.trim() ?? '')) return 'dismiss';
  if (b.matches('.sat-btn, .felt-addbar')) return 'forward';
  return 'plain';
}

/** The depth each class sinks to. Every press sinks, except a hold control and a name (it glows instead). */
const DOWN: Partial<Record<PressClass, number>> = { log: 0.93, commit: 0.96, forward: 0.97, dismiss: 0.98, open: 0.96, select: 0.96, toggle: 0.97, plain: 0.97 };
/** The spring back to full size when the finger lifts. */
const BACK: Partial<Record<PressClass, Spring>> = { select: SPRING.select, toggle: SPRING.toggle };
/** The light spreads this fast from the finger. A press never waits for it: the action runs at once. */
const INK_MS = MS.ink;

/** The pulse colour around the letters of a name: the blue of the theme. */
const glow = () => getComputedStyle(document.documentElement).getPropertyValue('--sat-accent').trim() || '#0052cc';

/** The frame that reacts: the button, the list around it when the button is the only row in that list,
    or the swipe row that carries it (so the row and its background contract together). */
function frameOf(b: HTMLElement): HTMLElement {
  const p = b.parentElement;
  if (p?.matches('.felt-swipe-row')) return p;
  return p?.matches('.felt-list') && p.children.length === 1 ? p : b;
}

/** A square-cornered row has soft corners while it contracts, so the shrinking field never shows a sharp rectangle. */
function roundFrame(frame: HTMLElement): boolean {
  if (parseFloat(getComputedStyle(frame).borderTopLeftRadius) > 0) return false;
  frame.style.borderRadius = 'var(--sat-radius-md)';
  return true;
}

/** Light that spreads from the finger across the frame, clipped to its corners. */
function startInk(frame: HTMLElement, e: PointerEvent) {
  if (getComputedStyle(frame).position === 'static') frame.style.position = 'relative';
  const r = frame.getBoundingClientRect();
  const wrap = document.createElement('span');
  wrap.className = 'felt-ink';
  wrap.setAttribute('aria-hidden', 'true');
  const ink = document.createElement('i');
  ink.style.left = `${e.clientX - r.left}px`;
  ink.style.top = `${e.clientY - r.top}px`;
  wrap.append(ink);
  frame.append(wrap);
  ink.animate({ scale: [0, (2 * Math.hypot(r.width, r.height)) / 16] }, { duration: INK_MS, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)', fill: 'forwards' });
  return { wrap, ink };
}
type Ink = ReturnType<typeof startInk>;

/** The light clears as soon as the finger lifts. */
function endInk({ wrap, ink }: Ink) {
  ink.animate({ opacity: [0.16, 0] }, { duration: MS.inkClear, easing: 'ease-out', fill: 'both' });
  window.setTimeout(() => wrap.remove(), MS.inkClear + 40);
}

/** The last pressed button and where it sat, so a panel it opens can pull out of it. */
let pressed: { el: HTMLElement; rect: DOMRect; at: number } | null = null;
/** The button pressed in the last `ms` milliseconds, if any. */
export function recentPress(ms = 600): { el: HTMLElement; rect: DOMRect } | null {
  return pressed && Date.now() - pressed.at < ms && pressed.el.isConnected ? pressed : null;
}

/** One listener for the whole app, so every button gets the feedback of its class without its own code.
    A press has one look, however long the finger stays down, and the action runs on release with no wait.
    A long press only does something on controls that say so (.felt-hold, the recorder names). */
export function installPresses() {
  let down: { b: HTMLElement; frame: HTMLElement; c: PressClass; sink?: Animation; lift?: Animation; ink?: Ink; rounded?: boolean } | null = null;
  const find = (t: EventTarget | null) => (t as Element | null)?.closest?.<HTMLElement>('[data-player], button, a[href], .felt-nav a');
  document.addEventListener('click', (e) => {
    const b = find(e.target);
    if (!b || (b as HTMLButtonElement).disabled || b.getAttribute('aria-disabled') === 'true') return;
    pressed = { el: b, rect: b.getBoundingClientRect(), at: Date.now() };
    // every press gives a tick. It runs in the click, because iOS allows a tick only inside a press
    if (e.detail !== 0) haptic(8);
  }, true);
  document.addEventListener('pointerdown', (e) => {
    if (calm()) return;
    const b = find(e.target);
    if (!b || (b as HTMLButtonElement).disabled || b.getAttribute('aria-disabled') === 'true') return;
    const c = classOf(b);
    const frame = frameOf(b);
    down = { b, frame, c };
    const s = DOWN[c];
    // straight to the press depth, and it stays there: a longer press looks the same
    if (s) down.sink = frame.animate([{ scale: 1 }, { scale: s }], { duration: MS.pressDown, easing: 'ease-out', fill: 'forwards' });
    // a row, card or game row contracts as a whole field: no light spreads over it (that was the sharp rectangle)
    if (c === 'forward' || c === 'dismiss') down.ink = startInk(frame, e);
    if (c === 'open' && roundFrame(frame)) down.rounded = true;
    // a toggle also goes down with weight
    if (c === 'toggle') down.lift = b.animate({ translate: ['0 0', '0 3px'] }, { duration: MS.pressDown, easing: 'ease-out', fill: 'forwards' });
    if (c === 'name') down.lift = b.animate({ textShadow: ['0 0 0 transparent', `0 0 10px ${glow()}`] }, { duration: MS.pressDown, easing: 'ease-out', fill: 'forwards' });
  }, true);
  const up = () => {
    if (!down) return;
    const { b, frame, c, sink, lift, ink, rounded } = down;
    down = null;
    if (rounded) window.setTimeout(() => { frame.style.borderRadius = ''; }, 320);
    const now = sink && DOWN[c] ? parseFloat(getComputedStyle(frame).scale) || DOWN[c]! : 1;
    const dy = lift && c === 'toggle' ? parseFloat(getComputedStyle(b).translate.split(' ')[1] ?? '') || 3 : 0;
    sink?.cancel();
    lift?.cancel();
    // a quick spring back to full size; a select and a toggle overshoot a little (clear pop, with weight)
    if (DOWN[c]) spring(frame, (p) => ({ scale: String(now + (1 - now) * p) }), BACK[c] ?? SPRING.log);
    if (c === 'toggle') spring(b, (p) => ({ translate: `0 ${dy * (1 - p)}px` }), SPRING.toggle);
    if (c === 'name') b.animate({ textShadow: [`0 0 10px ${glow()}`, `0 0 14px transparent`] }, { duration: 200, easing: 'ease-out' });
    if (ink) endInk(ink);
  };
  document.addEventListener('pointerup', up, true);
  document.addEventListener('pointercancel', up, true);
}

/** A row leaves by fading as its space closes from the bottom (a clip, never a squash), and the rows below close up.
    Then `run` removes it for real. */
export function shrinkAway(el: Element | null | undefined, run: () => void) {
  if (!el || calm() || !el.animate) { run(); return; }
  const h = (el as HTMLElement).offsetHeight;
  spring(el, (p) => ({ opacity: String(1 - Math.min(p, 1)) }), SPRING.remove, { fill: 'forwards' });
  const gap = el.animate({ height: [`${h}px`, '0px'], marginBottom: ['0px', `-${parseFloat(getComputedStyle(el.parentElement ?? el).rowGap) || 0}px`] }, { duration: MS.rowGap, delay: 40, easing: DRAWER, fill: 'forwards' });
  (el as HTMLElement).style.overflow = 'hidden';
  let done = false;
  const finish = () => { if (!done) { done = true; run(); } };
  gap.onfinish = finish;
  window.setTimeout(finish, 320);
}
