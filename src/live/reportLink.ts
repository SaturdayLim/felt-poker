/* Report links: chat apps on iPhone cannot run an HTML file, so a report can also live online, encrypted, for 30 days.
   The key stays in the link fragment and never reaches the server. Player pages keep their own code locks inside. */
import type { Game, ID, Player, Settings } from '../types';
import { buildReport, type ReportFile } from '../report/htmlReport';
import { newRoomId, newRoomKey, open, seal } from './crypto';
import { pickDriver } from './host';

export const REPORT_DAYS = 30;
const DAY = 86400000;
const LS = 'felt-report-links';
type Kept = Record<ID, { id: string; key: string; expiresAt: number }>;
const load = (): Kept => { try { return JSON.parse(localStorage.getItem(LS) ?? '{}'); } catch { return {}; } };
const save = (k: Kept) => { try { localStorage.setItem(LS, JSON.stringify(k)); } catch { /* private mode */ } };

const linkFor = (id: string, key: string) => `${location.origin}${location.pathname}#/r/${id}/${key}`;

export const reportLinkOf = (gameId: ID): { link: string; expiresAt: number } | null => {
  const k = load()[gameId];
  return k && k.expiresAt > Date.now() ? { link: linkFor(k.id, k.key), expiresAt: k.expiresAt } : null;
};

/** Puts the report online, or refreshes it under the same link and restarts the 30 days. */
export async function publishReport(g: Game, players: Player[], settings: Settings): Promise<string> {
  const driver = pickDriver();
  if (!driver) throw new Error('The live link is not set up yet.');
  const uid = await driver.signIn();
  const kept = load();
  const live = kept[g.id] && kept[g.id].expiresAt > Date.now() ? kept[g.id] : null;
  const id = live?.id ?? newRoomId(), key = live?.key ?? newRoomKey();
  const { report } = await buildReport(g, players, settings);
  const expiresAt = Date.now() + REPORT_DAYS * DAY;
  await driver.putReport(id, { owner: uid, createdAt: Date.now(), expiresAt, title: await seal(g.name, key), data: await seal(report, key) });
  kept[g.id] = { id, key, expiresAt };
  save(kept);
  return linkFor(id, key);
}

export async function fetchReport(id: string, key: string): Promise<{ report: ReportFile; title: string } | null> {
  const driver = pickDriver();
  if (!driver) throw new Error('The live link is not set up yet.');
  await driver.signIn();
  const tree = await driver.getReport(id);
  if (!tree || (tree.expiresAt as number) < Date.now()) return null;
  return { report: await open<ReportFile>(tree.data as string, key), title: await open<string>(tree.title as string, key) };
}

/** On the host phone at start: expired reports leave the server. */
export async function cleanReports() {
  const kept = load();
  const old = Object.entries(kept).filter(([, k]) => k.expiresAt < Date.now());
  if (!old.length) return;
  const driver = pickDriver();
  if (!driver) return;
  await driver.signIn();
  for (const [g, k] of old) {
    try { await driver.removeReport(k.id); delete kept[g]; } catch { /* offline: try again on the next start */ }
  }
  save(kept);
}
