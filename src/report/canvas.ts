import { rankLabel, SUIT_COLOR, SUIT_SYMBOL } from '../lib/cards';

export const W = 1080;
export const PAD = 56;
export const INNER = W - PAD * 2;

/** Report palettes, taken from the Vaela tokens (src/design/tokens.css). */
const LIGHT = {
  ground: '#DCE1DE', groundDeep: '#C8D0CB', paper: '#F8F7F3', edge: '#D6DAD4', edgeStrong: '#6F7B76',
  ink: '#1D2327', inkSoft: '#47525A', inkFaint: '#56626A',
  accent: '#335E9E', up: '#2A6E40', down: '#A8322A', amber: '#7A5512', amberFill: '#B98226', onAmber: '#1D2327',
  line: 'rgba(58, 102, 168, 0.10)', glow: 'rgba(116, 87, 168, 0.12)',
};
const DARK: typeof LIGHT = {
  ground: '#1E2326', groundDeep: '#15191B', paper: '#272D31', edge: '#343C41', edgeStrong: '#6E7B76',
  ink: '#E5E9E7', inkSoft: '#B5BEBA', inkFaint: '#97A29D',
  accent: '#86A9DE', up: '#6CC08A', down: '#EE7B70', amber: '#E0B060', amberFill: '#E0B060', onAmber: '#15191B',
  line: 'rgba(134, 169, 222, 0.08)', glow: 'rgba(180, 155, 221, 0.10)',
};
export type ReportTheme = 'light' | 'dark';
export let C = DARK;
export function setReportTheme(t: ReportTheme) { C = t === 'light' ? LIGHT : DARK; }

const UI = '"Atkinson Hyperlegible", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const DISPLAY = 'Fraunces, "Iowan Old Style", Georgia, serif';
const DATA = '"IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace';

/** kind: false/'ui' = Atkinson, true/'data' = Plex Mono (numbers), 'display' = Fraunces (titles). */
export const font = (weight: number, size: number, kind: boolean | 'ui' | 'data' | 'display' = false) => {
  if (kind === true || kind === 'data') return `${Math.min(600, Math.max(400, weight))} ${size}px ${DATA}`;
  if (kind === 'display') return `${Math.min(700, weight)} ${size}px ${DISPLAY}`;
  return `${weight >= 600 ? 700 : 400} ${size}px ${UI}`;
};

/** Canvas only uses a web font once it has loaded, so load the report faces first. */
export async function loadReportFonts() {
  if (!document.fonts?.load) return;
  await Promise.all([
    document.fonts.load(`600 40px ${DISPLAY}`),
    document.fonts.load(`400 20px ${UI}`),
    document.fonts.load(`700 20px ${UI}`),
    document.fonts.load(`500 20px ${DATA}`),
    document.fonts.load(`600 20px ${DATA}`),
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

export function rrect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, fill?: string | CanvasGradient, stroke?: string, lw = 2) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}

/** Paper card (radius scaled from --r-paper). */
export function panel(ctx: Ctx, x: number, y: number, w: number, h: number) {
  rrect(ctx, x, y, w, h, 12, C.paper, C.edge, 2);
}

export function playingCard(ctx: Ctx, x: number, y: number, card: string, w = 52) {
  const h = Math.round(w * 1.36);
  rrect(ctx, x, y, w, h, w * 0.16, '#FBFBF8', 'rgba(29,35,39,0.18)', 1.5);
  const col = SUIT_COLOR[card[1]];
  text(ctx, rankLabel(card), x + w / 2, y + h * 0.48, font(700, Math.round(w * 0.46)), col, 'center');
  text(ctx, SUIT_SYMBOL[card[1]], x + w / 2, y + h * 0.86, `${Math.round(w * 0.38)}px system-ui, sans-serif`, col, 'center');
  return w;
}

export function cardsRow(ctx: Ctx, x: number, y: number, cards: string[], w = 52, gap = 8) {
  cards.forEach((c, i) => playingCard(ctx, x + i * (w + gap), y, c, w));
  return cards.length ? cards.length * (w + gap) - gap : 0;
}

export function avatar(ctx: Ctx, cx: number, cy: number, r: number, name: string, color?: string) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = C.edge;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.textBaseline = 'middle';
  ctx.font = font(600, Math.round(r * 0.95), 'display');
  ctx.fillStyle = color ?? C.inkSoft;
  ctx.textAlign = 'center';
  ctx.fillText((name.trim()[0] ?? '?').toUpperCase(), cx, cy + 1);
  ctx.textBaseline = 'alphabetic';
}

export function pill(ctx: Ctx, x: number, y: number, label: string, color: string, size = 20): number {
  const f = font(700, size);
  const w = textWidth(label.toUpperCase(), f) + size * 1.4;
  const h = size * 1.7;
  rrect(ctx, x, y, w, h, h / 2, undefined, C.edge, 2);
  text(ctx, label.toUpperCase(), x + w / 2, y + h * 0.68, f, color, 'center');
  return w;
}

export function hexA(hex: string, a: number): string {
  if (!hex.startsWith('#')) return hex;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export function dealerChip(ctx: Ctx, cx: number, cy: number, r = 14) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#FBFBF8';
  ctx.fill();
  ctx.strokeStyle = 'rgba(29,35,39,0.3)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.textBaseline = 'middle';
  text(ctx, 'D', cx, cy + 1, font(700, r * 1.1), '#1D2327', 'center');
  ctx.textBaseline = 'alphabetic';
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
    const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
    bg.addColorStop(0, C.ground);
    bg.addColorStop(1, C.groundDeep);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, canvas.height);
    const glow = ctx.createRadialGradient(W * 0.85, 0, 10, W * 0.85, 0, 760);
    glow.addColorStop(0, C.glow);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, Math.min(canvas.height, 800));
    // the faint diagonal lines from the ground pattern
    ctx.save();
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 2;
    const step = 92, slope = Math.tan((25 * Math.PI) / 180);
    for (let x0 = -canvas.height * slope; x0 < W; x0 += step) {
      ctx.beginPath();
      ctx.moveTo(x0, canvas.height);
      ctx.lineTo(x0 + canvas.height * slope, 0);
      ctx.stroke();
    }
    ctx.restore();
    let y = 0;
    for (const b of page) { b.draw(ctx, y); y += b.h; }
    foot.draw(ctx, y);
    return canvas;
  });
}

export const spacer = (h: number): Block => ({ h, draw: () => {} });

export function sectionTitle(label: string, right?: string): Block {
  return {
    h: 84,
    keepWithNext: true,
    draw: (ctx, y) => {
      text(ctx, label, PAD, y + 54, font(600, 34, 'display'), C.ink);
      if (right) text(ctx, right, W - PAD, y + 54, font(400, 23), C.inkFaint, 'right');
    },
  };
}
