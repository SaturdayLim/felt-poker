/* PNG sets: each set is ONE image made of several report segments. The Export screen calls `renderPngSet`. */
import type { Game, ID, Player, Settings } from '../types';
import { buildModel } from './model';
import { composeImage, logBlocks, segmentBlocks, setImageTheme, type SegmentKey } from './segments';
import { spacer, W, type Block, type ReportTheme } from './canvas';

export type PngSet = 'summary' | 'detailed' | 'playstyle' | 'log';
export const PNG_SETS: { k: PngSet; label: string; desc: string }[] = [
  { k: 'summary', label: 'Summary', desc: 'Ranked results with swing and awards, biggest pots and settle up.' },
  { k: 'detailed', label: 'Detailed', desc: 'Awards, stack size and pot sizes by street.' },
  { k: 'playstyle', label: 'Playstyle', desc: 'Style map, hand progression and pot sizes by winner.' },
  { k: 'log', label: 'Full Action Log', desc: 'Every action of the picked hands.' },
];

const SETS: Record<Exclude<PngSet, 'log'>, SegmentKey[]> = {
  summary: ['results', 'biggest', 'settle'],
  detailed: ['awards', 'stack', 'pots'],
  playstyle: ['style', 'progress', 'potsWinner'],
};

/** iOS Safari draws a canvas up to about 16.7 MP and 32767 px tall; a page of the log stays under 16 MP at scale 1.5 or more. */
const PAGE_SCALE = 1.5;
const PAGE_MAX_H = Math.floor(16e6 / (W * PAGE_SCALE * PAGE_SCALE));
/** Header, footer and spacers around the blocks of one image (css px). */
const PAGE_FRAME = 580;

type PageArgs = [Game, PngSet, { players: Player[]; settings: Settings; name: (id: ID) => string; theme: ReportTheme; hands?: ID[] }];

/** The images of the set. Every set gives one image, except 'log', which splits into pages so no canvas passes the phone limits. */
export async function renderPngSetPages(...[g, k, o]: PageArgs): Promise<HTMLCanvasElement[]> {
  if (k !== 'log') return [await renderPngSet(g, k, o)];
  const m = buildModel({ players: o.players, games: [g], settings: o.settings }, 0, { gameLog: true });
  setImageTheme(o.theme);
  const ns = o.hands ? g.hands.filter((h) => o.hands!.includes(h.id)).map((h) => h.n) : undefined;
  const picked = (m.log ?? []).filter((v) => !ns || ns.includes(v.n)).map((v) => v.n);
  const blocks = logBlocks(m, picked).slice(1); // the first block is the section title
  // the owner asked for the log as ONE image: keep it whole while it stays readable (scale 0.8 or more inside the
  // 16 MP canvas limit); only a very long game is split into pages
  const total = PAGE_FRAME + blocks.reduce((a, b) => a + b.h, 0);
  if (Math.sqrt(16e6 / (W * total)) >= 0.8) return [composeImage(m, logBlocks(m, ns), o.theme)];
  const pages: number[][] = [];
  let cur: number[] = [];
  let h = PAGE_FRAME;
  blocks.forEach((b, i) => {
    if (cur.length && h + b.h > PAGE_MAX_H) { pages.push(cur); cur = []; h = PAGE_FRAME; }
    cur.push(picked[i]);
    h += b.h;
  });
  if (cur.length) pages.push(cur);
  if (pages.length <= 1) return [composeImage(m, logBlocks(m, ns), o.theme)];
  return pages.map((p) => composeImage(m, logBlocks(m, p), o.theme));
}

/** One image for the set. `hands` (hand ids) picks the hands for 'log'; omitted = every hand. */
export async function renderPngSet(g: Game, k: PngSet, o: { players: Player[]; settings: Settings; name: (id: ID) => string; theme: ReportTheme; hands?: ID[] }): Promise<HTMLCanvasElement> {
  const m = buildModel({ players: o.players, games: [g], settings: o.settings }, 0, { gameLog: k === 'log' });
  setImageTheme(o.theme);
  if (k === 'log') {
    const ns = o.hands ? g.hands.filter((h) => o.hands!.includes(h.id)).map((h) => h.n) : undefined;
    return composeImage(m, logBlocks(m, ns), o.theme);
  }
  const blocks: Block[] = SETS[k].flatMap((s) => [...segmentBlocks(m, s), spacer(12)]);
  return composeImage(m, blocks, o.theme);
}
