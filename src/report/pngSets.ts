/* PNG sets: each part of a set is its own image (one per segment, one per hand). The Export screen calls `renderPngParts`. */
import type { Game, ID, Player, Settings } from '../types';
import { buildModel } from './model';
import { composeImage, logBlocks, segmentBlocks, SEGMENTS, setImageTheme, type SegmentKey } from './segments';
import { spacer, type ReportTheme } from './canvas';

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

type Opts = { players: Player[]; settings: Settings; name: (id: ID) => string; theme: ReportTheme; hands?: ID[] };

/** The images of a set, one per part: Summary, Details and Playstyle give one image per segment (3 each) and the
    Full Action Log gives one image per picked hand. `part` says what is in the image, for the file name. */
export async function renderPngParts(g: Game, k: PngSet, o: Opts): Promise<{ canvas: HTMLCanvasElement; part: string }[]> {
  const m = buildModel({ players: o.players, games: [g], settings: o.settings }, 0, { gameLog: k === 'log' });
  setImageTheme(o.theme);
  if (k === 'log') {
    const ns = o.hands ? g.hands.filter((h) => !h.missed && h.log && o.hands!.includes(h.id)).map((h) => h.n) : (m.log ?? []).map((v) => v.n);
    return ns.map((n) => ({ canvas: composeImage(m, logBlocks(m, [n]), o.theme), part: `hand ${n}` }));
  }
  return SETS[k].map((s) => ({
    canvas: composeImage(m, [...segmentBlocks(m, s), spacer(12)], o.theme),
    part: (SEGMENTS.find((x) => x.k === s)?.label ?? s).toLowerCase(),
  }));
}
