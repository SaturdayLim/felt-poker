/* The shareable HTML report, made on the phone. The page itself is a ready-built template
   (public/report-template.html, made by scripts/report-template.ts). This file works out the figures from
   the game, locks each player's page with that player's code, and puts both into the template. */
import type { Game, Player, Settings } from '../types';
import { newCode } from '../lib/codes';
import { buildModel, publicPlayer, type TrialModel } from './model';
import { lock, type LockBox } from './lock';
import { slug } from './csv';

/** A game needs this many recorded hands before the report has anything to show. */
export const MIN_REPORT_HANDS = 3;
export const DATA_MARKER = '<!--FELT_REPORT_DATA-->';

export interface ReportFile { model: TrialModel; locks: Record<string, LockBox> }
export interface PlayerCode { id: string; name: string; code: string }

export const recordedHands = (g: Game) => g.hands.filter((h) => !h.missed && h.log).length;
export const reportReady = (g: Game) => g.status === 'closed' && recordedHands(g) >= MIN_REPORT_HANDS;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Puts the report data and the title into the template. */
export function fillTemplate(template: string, report: ReportFile, title: string): string {
  if (!template.includes(DATA_MARKER)) throw new Error('Report template is out of date');
  const json = JSON.stringify(report).replace(/</g, '\\u003c');
  return template
    .replace(DATA_MARKER, () => `<script id="felt-report" type="application/json">${json}</script>`)
    .replace(/<title>[^<]*<\/title>/, () => `<title>${esc(title)} Report</title>`);
}

/** The model for one game, with every player page locked by that player's code. A player without a code gets a new one. */
export async function buildReport(g: Game, players: Player[], settings?: Settings): Promise<{ report: ReportFile; codes: PlayerCode[] }> {
  const model = buildModel({ players, games: [g], settings });
  const codes: PlayerCode[] = [];
  const locks: ReportFile['locks'] = {};
  for (const p of model.players) {
    const code = players.find((x) => x.id === p.id)?.code ?? newCode();
    codes.push({ id: p.id, name: p.name, code });
    locks[p.id] = await lock(p, code);
  }
  return { report: { model: { ...model, players: model.players.map(publicPlayer) }, locks }, codes };
}

export const reportFileName = (g: Game) => `${slug(g.name)}-${new Date(g.startedAt).toLocaleDateString('en-CA')}-report.html`;

/** The template is part of the app (cached for offline use). */
export async function loadTemplate(): Promise<string> {
  const res = await fetch(new URL('../report-template.html', window.location.href).href);
  if (!res.ok) throw new Error('Report template not found. Update the app and try again.');
  return res.text();
}

export async function makeHtmlReport(g: Game, players: Player[], settings: Settings): Promise<{ file: File; codes: PlayerCode[] }> {
  const [template, built] = await Promise.all([loadTemplate(), buildReport(g, players, settings)]);
  const html = fillTemplate(template, built.report, g.name);
  return { file: new File([html], reportFileName(g), { type: 'text/html' }), codes: built.codes };
}
