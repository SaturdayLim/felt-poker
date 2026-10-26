import { rankLabel, SUIT_COLOR, SUIT_SYMBOL } from '../lib/cards';

/* Canvas drawing for the shareable report images, in the Saturday Signature style:
   mesh background, glass-2 panels, Instrument Serif titles and KPIs (never bold), Geist text,
   Geist Mono for deltas and times, uppercase tracked captions. Colours mirror
   src/saturday/tokens/tokens.json (skins.saturday.light / .dark); keep them in step. */

export const W = 1080;
export const PAD = 56;
export const INNER = W - PAD * 2;

const LIGHT = {
  bg: '#EEF2F1', mesh1: 'rgba(143,216,203,0.6)', mesh2: 'rgba(141,180,232,0.6)', mesh3: 'rgba(183,228,218,0.6)',
  text: '#10201F', muted: '#4A5B59', line: 'rgba(16,32,31,0.12)', lineStrong: 'rgba(16,32,31,0.22)',
  glass: 'rgba(255,255,255,0.78)', glassEdge: 'rgba(255,255,255,0.75)', well: 'rgba(16,32,31,0.06)',
  accent: '#1F8A84', accentText: '#11625D', accentSoft: 'rgba(31,138,132,0.14)', mark: '#8C7440',
  pos: '#17663D', neg: '#A3342A', shadow: 'rgba(16,32,31,0.14)',
};
const DARK: typeof LIGHT = {
  bg: '#0A0F12', mesh1: 'rgba(31,138,132,0.32)', mesh2: 'rgba(35,70,127,0.32)', mesh3: 'rgba(43,168,159,0.32)',
  text: '#ECF3F2', muted: '#A3B4B2', line: 'rgba(236,243,242,0.10)', lineStrong: 'rgba(236,243,242,0.20)',
  glass: 'rgba(18,26,31,0.84)', glassEdge: 'rgba(255,255,255,0.09)', well: 'rgba(0,0,0,0.28)',
  accent: '#4FC1B8', accentText: '#5CC8BE', accentSoft: 'rgba(79,193,184,0.16)', mark: '#CDB98A',
  pos: '#6FD39A', neg: '#FF8F80', shadow: 'rgba(0,0,0,0.5)',
};
export type ReportTheme = 'light' | 'dark';
export let C = DARK;
export function setReportTheme(t: ReportTheme) { C = t === 'light' ? LIGHT : DARK; }

const UI = 'Geist, "Segoe UI", system-ui, -apple-system, sans-serif';
const DISPLAY = '"Instrument Serif", "Iowan Old Style", Georgia, serif';
const MONO = '"Geist Mono", ui-monospace, Consolas, monospace';

/** kind: 'ui' (Geist), 'mono' (Geist Mono), 'display' (Instrument Serif, always 400). */
export const font = (weight: number, size: number, kind: 'ui' | 'mono' | 'display' = 'ui') =>
  kind === 'display' ? `400 ${size}px ${DISPLAY}` : `${weight} ${size}px ${kind === 'mono' ? MONO : UI}`;

/** Canvas only uses a web font once it has loaded, so load the report faces first. */
export async function loadReportFonts() {
  if (!document.fonts?.load) return;
  await Promise.all([
    document.fonts.load(`400 40px ${DISPLAY}`),
    document.fonts.load(`400 20px ${UI}`),
    document.fonts.load(`600 20px ${UI}`),
    document.fonts.load(`500 20px ${MONO}`),
  ]).catch(() => {});
}

export type Ctx = CanvasRenderingContext2D;

export interface Block {
  h: number;
  draw: (ctx: Ctx, y: number) => void;
  /** Keep with next block when paginating (e.g. section titles). */
  keepWithNext?: boolean;
}

let measureCtx: Ctx | null = null;
export function measure(): Ctx {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')!;
  return measureCtx;
}

export function text(ctx: Ctx, s: string, x: number, y: number, f: string, color: string, align: CanvasTextAlign = 'left', maxW?: number) {
  ctx.font = f;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(maxW ? ellipsize(ctx, s, maxW) : s, x, y);
}

export function ellipsize(ctx: Ctx, s: string, maxW: number): string {
  if (ctx.measureText(s).width <= maxW) return s;
  let lo = 0, hi = s.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(s.slice(0, mid) + '…').width <= maxW) lo = mid; else hi = mid - 1;
  }
  return s.slice(0, lo) + '…';
}

export function wrap(s: string, f: string, maxW: number): string[] {
  const ctx = measure();
  ctx.font = f;
  const out: string[] = [];
  for (const para of s.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      const t = line ? `${line} ${word}` : word;
      if (ctx.measureText(t).width > maxW && line) { out.push(line); line = word; }
      else line = t;
    }
    out.push(line);
  }
  return out;
}

export function textWidth(s: string, f: string): number {
  const ctx = measure();
  ctx.font = f;
  return ctx.measureText(s).width;
}

/** Tracked text (letter-spacing) drawn glyph by glyph, so it works where ctx.letterSpacing does not. */
function tracked(ctx: Ctx, s: string, x: number, y: number, f: string, color: string, track: number, align: 'left' | 'right') {
  ctx.font = f;
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const width = [...s].reduce((a, ch) => a + ctx.measureText(ch).width + track, -track);
  let cx = align === 'right' ? x - width : x;
  for (const ch of s) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + track; }
  return width;
}

/** Kit caption: Geist 600 uppercase, 0.14em tracking, muted; the bracketed qualifier keeps its case. */
export function caption(ctx: Ctx, label: string, x: number, y: number, opts: { q?: string; size?: number; color?: string; align?: 'left' | 'right' } = {}) {
  const size = opts.size ?? 22;
  const color = opts.color ?? C.muted;
  const f = font(600, size);
  const q = opts.q ? `(${opts.q})` : '';
  const space = size * 0.4;
  if (opts.align === 'right') {
    const qw = q ? tracked(ctx, q, x, y, f, color, size * 0.02, 'right') + space : 0;
    tracked(ctx, label.toUpperCase(), x - qw, y, f, color, size * 0.14, 'right');
  } else {
    const w = tracked(ctx, label.toUpperCase(), x, y, f, color, size * 0.14, 'left');
    if (q) tracked(ctx, q, x + w + space, y, f, color, size * 0.02, 'left');
  }
}

/** Kit delta: arrow + value + colour. Flat is grey 0. Returns the colour used. */
export function deltaText(n: number, fmt: (abs: number) => string): { s: string; color: string } {
  if (n > 0.004) return { s: `▲ ${fmt(n)}`, color: C.pos };
  if (n < -0.004) return { s: `▼ ${fmt(-n)}`, color: C.neg };
  return { s: fmt(0), color: C.muted };
}

export function rrect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, fill?: string | CanvasGradient, stroke?: string, lw = 2) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}

/** Glass-2 panel (data sits on glass-2): tint, light edge, soft shadow. Radius 22 (cards) scaled to 2x. */
export function panel(ctx: Ctx, x: number, y: number, w: number, h: number, r = 36) {
  ctx.save();
  ctx.shadowColor = C.shadow;
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 14;
  rrect(ctx, x, y, w, h, r, C.glass);
  ctx.restore();
  rrect(ctx, x, y, w, h, r, undefined, C.glassEdge, 2);
}

export function playingCard(ctx: Ctx, x: number, y: number, card: string, w = 52) {
  const h = Math.round(w * 1.36);
  rrect(ctx, x, y, w, h, w * 0.16, '#FBFCFC', 'rgba(16,32,31,0.18)', 1.5);
  const col = SUIT_COLOR[card[1]];
  text(ctx, rankLabel(card), x + w / 2, y + h * 0.48, font(600, Math.round(w * 0.46)), col, 'center');
  text(ctx, SUIT_SYMBOL[card[1]], x + w / 2, y + h * 0.86, `${Math.round(w * 0.38)}px system-ui, sans-serif`, col, 'center');
  return w;
}

export function cardsRow(ctx: Ctx, x: number, y: number, cards: string[], w = 52, gap = 8) {
  cards.forEach((c, i) => playingCard(ctx, x + i * (w + gap), y, c, w));
  return cards.length ? cards.length * (w + gap) - gap : 0;
}

export function avatar(ctx: Ctx, cx: number, cy: number, r: number, name: string) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = C.lineStrong;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.textBaseline = 'middle';
  ctx.font = font(400, Math.round(r * 1.05), 'display');
  ctx.fillStyle = C.muted;
  ctx.textAlign = 'center';
  ctx.fillText((name.trim()[0] ?? '?').toUpperCase(), cx, cy + 2);
  ctx.textBaseline = 'alphabetic';
}

/** Kit badge: pill, accent-soft fill and accent text (or muted on a well). */
export function badge(ctx: Ctx, x: number, y: number, label: string, muted = false, size = 20): number {
  const f = font(600, size);
  const w = textWidth(label, f) + size * 1.2;
  const h = size * 1.6;
  rrect(ctx, x, y, w, h, h / 2, muted ? C.well : C.accentSoft);
  text(ctx, label, x + w / 2, y + h * 0.7, f, muted ? C.muted : C.accentText, 'center');
  return w;
}

export function dealerChip(ctx: Ctx, cx: number, cy: number, r = 14) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#FBFCFC';
  ctx.fill();
  ctx.strokeStyle = 'rgba(16,32,31,0.3)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.textBaseline = 'middle';
  text(ctx, 'D', cx, cy + 1, font(600, r * 1.1), '#10201F', 'center');
  ctx.textBaseline = 'alphabetic';
}

/** Felt mark (two stacked chips) at (x, y) with the given height, in the mark colour. */
export function feltMark(ctx: Ctx, x: number, y: number, h: number) {
  const s = h / 104;
  ctx.save();
  ctx.translate(x + 2 * s, y + 2 * s);
  ctx.scale(s, s);
  ctx.strokeStyle = C.mark;
  ctx.lineWidth = 2.6;
  ctx.lineCap = 'round';
  for (const cy of [26, 74]) {
    for (const r of [24, 15]) { ctx.beginPath(); ctx.arc(32, cy, r, 0, Math.PI * 2); ctx.stroke(); }
    for (const a of [45, 135, 225, 315]) {
      const t = (a * Math.PI) / 180;
      ctx.beginPath();
      ctx.moveTo(32 + 18.6 * Math.cos(t), cy + 18.6 * Math.sin(t));
      ctx.lineTo(32 + 22.4 * Math.cos(t), cy + 22.4 * Math.sin(t));
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Lay blocks onto one or more canvases no taller than maxH. */
export function paginate(blocks: Block[], opts: { maxH: number; top: (page: number) => Block; footer: (page: number, pages: number) => Block }): HTMLCanvasElement[] {
  const pages: Block[][] = [];
  let cur: Block[] = [];
  let h = 0;
  const topH = opts.top(0).h;
  const footH = opts.footer(0, 1).h;
  const limit = opts.maxH - footH;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    let need = b.h;
    if (b.keepWithNext && blocks[i + 1]) need += blocks[i + 1].h;
    const base = cur.length === 0 && pages.length > 0 ? topH : 0;
    if (h + base + need > limit && cur.length) {
      pages.push(cur);
      cur = [];
      h = 0;
    }
    if (cur.length === 0 && pages.length > 0) { cur.push(opts.top(pages.length)); h += topH; }
    cur.push(b);
    h += b.h;
  }
  if (cur.length) pages.push(cur);

  return pages.map((page, pi) => {
    const foot = opts.footer(pi, pages.length);
    const total = page.reduce((a, b) => a + b.h, 0) + foot.h;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = Math.ceil(total);
    const ctx = canvas.getContext('2d')!;
    // The mesh: three soft colour fields, as body.sat::before in the kit
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, canvas.height);
    const vmax = Math.max(W, Math.min(canvas.height, 1920));
    const field = (fx: number, fy: number, r: number, color: string) => {
      const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, r);
      g.addColorStop(0, color);
      g.addColorStop(0.7, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, canvas.height);
    };
    field(W * 0.08, Math.min(canvas.height, 1920) * 0.04, 0.42 * vmax * 1.4, C.mesh1);
    field(W * 0.96, canvas.height * 0.92, 0.46 * vmax * 1.4, C.mesh2);
    field(W * 0.7, Math.min(canvas.height, 1920) * 0.18, 0.3 * vmax * 1.4, C.mesh3);
    let y = 0;
    for (const b of page) { b.draw(ctx, y); y += b.h; }
    foot.draw(ctx, y);
    return canvas;
  });
}

export const spacer = (h: number): Block => ({ h, draw: () => {} });

/** Section title: H2 in Instrument Serif, sentence case, with an optional muted note on the right. */
export function sectionTitle(label: string, right?: string): Block {
  return {
    h: 92,
    keepWithNext: true,
    draw: (ctx, y) => {
      text(ctx, label, PAD, y + 62, font(400, 48, 'display'), C.text);
      if (right) text(ctx, right, W - PAD, y + 60, font(400, 24), C.muted, 'right');
    },
  };
}
