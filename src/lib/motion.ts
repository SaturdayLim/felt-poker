/* Motion for Felt: the choices are in docs/MOTION-LIST.md. Springs use the same maths as the Motion library
   (visual duration and bounce), played as Web Animations keyframes, so they need no library and run on every phone
   Felt supports. CSS transitions that must retarget use the same curves through --felt-* custom properties. */

export const DRAWER = 'cubic-bezier(0.32, 0.72, 0, 1)';
export const calm = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** The picked springs: visual duration in seconds, then bounce. */
export const SPRING = {
  pill: [0.32, 0.3], grow: [0.35, 0.08], sheetUp: [0.5, 0], sheetDown: [0.36, 0], dock: [0.28, 0.1], qr: [0.3, 0.15],
  toast: [0.3, 0.15], settle: [0.3, 0.3], fill: [0.22, 0.45], deal: [0.42, 0.14], log: [0.16, 0.2], select: [0.24, 0.4],
  toggle: [0.24, 0.35], remove: [0.3, 0.12],
} as const satisfies Record<string, readonly [number, number]>;
export type Spring = readonly [number, number];

/** Progress of a spring from 0 to 1, one value per step, and its length in ms. */
export function springCurve([visual, bounce]: Spring, stepMs = 16, near = 0.002): { p: number[]; ms: number } {
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

/** Sets the curves that CSS transitions and the Log hand morph read. Phones without linear() keep the CSS fallback. */
export function installMotion() {
  if (typeof CSS === 'undefined' || !CSS.supports?.('transition-timing-function', 'linear(0, 1)')) return;
  const root = document.documentElement.style;
  const set = (name: string, s: Spring) => {
    const { p, ms } = springCurve(s, 24);
    root.setProperty(`--felt-${name}`, `linear(${p.map((x) => +x.toFixed(4)).join(', ')})`);
    root.setProperty(`--felt-${name}-ms`, `${ms}ms`);
  };
  set('pill', SPRING.pill);
  set('grow', SPRING.grow);
  set('settle', SPRING.settle);
}

/* ------------------------------- button presses ------------------------------- */

type PressClass = 'log' | 'commit' | 'forward' | 'dismiss' | 'select' | 'toggle' | 'open' | 'none';

const DISMISS = /^(close|done|cancel|back)$/i;

/** What a press does, from where the button sits. A button can name its class with data-press. */
function classOf(b: HTMLElement): PressClass {
  const named = b.dataset.press as PressClass | undefined;
  if (named) return named;
  if (b.matches('.felt-hold, .felt-toast-act, .felt-grip, button.felt-acts-name')) return 'none';
  if (b.matches('.felt-keypad-dark, .felt-mini, .felt-livepass-eye, .felt-codectl-btn, .felt-liveswitch, [role="switch"], .sat-switch')) return 'toggle';
  if (b.matches('.felt-keypad button, .felt-picker button, button.felt-box')) return 'log';
  if (b.matches('.sat-chip, [role="tab"], [role="radio"], .felt-pickwin-btn, .felt-nav a')) return 'select';
  if (b.matches('.felt-fab, .felt-row, [aria-label="Show the QR code"], .felt-hand, .felt-showbar-btn')) return 'open';
  if (b.matches('[aria-label="Back"]') || DISMISS.test(b.textContent?.trim() ?? '')) return 'dismiss';
  if (b.matches('.sat-btn, .felt-addbar')) return 'forward';
  return 'none';
}

const DOWN: Partial<Record<PressClass, number>> = { log: 0.93, commit: 0.96, forward: 0.97, dismiss: 0.98, open: 0.96 };

/** Light that spreads from the finger, clipped to the button. */
function ripple(b: HTMLElement, e: PointerEvent) {
  if (getComputedStyle(b).position === 'static') b.style.position = 'relative';
  const r = b.getBoundingClientRect();
  const wrap = document.createElement('span');
  wrap.className = 'felt-ink';
  wrap.setAttribute('aria-hidden', 'true');
  const ink = document.createElement('i');
  ink.style.left = `${e.clientX - r.left}px`;
  ink.style.top = `${e.clientY - r.top}px`;
  wrap.append(ink);
  b.append(wrap);
  ink.animate({ scale: [0, (2 * Math.max(r.width, r.height)) / 16 + 1], opacity: [1, 0] }, { duration: 450, easing: 'ease-out', fill: 'forwards' });
  window.setTimeout(() => wrap.remove(), 470);
}

/** One listener for the whole app, so every button gets the feedback of its class without its own code. */
export function installPresses() {
  let down: { b: HTMLElement; c: PressClass } | null = null;
  const find = (t: EventTarget | null) => (t as Element | null)?.closest?.<HTMLElement>('button, a[href], .felt-nav a');
  document.addEventListener('pointerdown', (e) => {
    if (calm()) return;
    const b = find(e.target);
    if (!b || (b as HTMLButtonElement).disabled || b.getAttribute('aria-disabled') === 'true') return;
    const c = classOf(b);
    down = { b, c };
    const s = DOWN[c];
    if (s) b.animate({ scale: [1, s] }, { duration: 90, easing: 'ease-out', fill: 'forwards' });
    if (c === 'forward' || c === 'dismiss' || c === 'open') ripple(b, e);
    if (c === 'toggle') b.animate({ translate: ['0 0', '0 3px'] }, { duration: 70, easing: 'ease-out', fill: 'forwards' });
  }, true);
  const up = () => {
    if (!down) return;
    const { b, c } = down;
    down = null;
    b.getAnimations().forEach((a) => { if ((a as Animation & { effect: KeyframeEffect }).effect?.getKeyframes?.().some((k) => 'scale' in k || 'translate' in k)) a.cancel(); });
    const s = DOWN[c];
    if (s) spring(b, (p) => ({ scale: String(s + (1 - s) * p) }), SPRING.log);
    if (c === 'select') spring(b, (p) => ({ scale: String(0.86 + 0.14 * p) }), SPRING.select);
    if (c === 'toggle') spring(b, (p) => ({ translate: `0 ${3 * (1 - p)}px` }), SPRING.toggle);
  };
  document.addEventListener('pointerup', up, true);
  document.addEventListener('pointercancel', up, true);
}

/** A row leaves by shrinking, and the rows below close up. Then `run` removes it for real. */
export function shrinkAway(el: Element | null | undefined, run: () => void) {
  if (!el || calm() || !el.animate) { run(); return; }
  const h = (el as HTMLElement).offsetHeight;
  spring(el, (p) => ({ scale: String(1 - 0.1 * Math.min(p, 1)), opacity: String(1 - Math.min(p, 1)) }), SPRING.remove, { fill: 'forwards' });
  const gap = el.animate({ height: [`${h}px`, '0px'], marginBottom: ['0px', `-${parseFloat(getComputedStyle(el.parentElement ?? el).rowGap) || 0}px`] }, { duration: 200, delay: 60, easing: DRAWER, fill: 'forwards' });
  (el as HTMLElement).style.overflow = 'hidden';
  let done = false;
  const finish = () => { if (!done) { done = true; run(); } };
  gap.onfinish = finish;
  window.setTimeout(finish, 320);
}
