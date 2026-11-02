/* Builds the shared report: one HTML file that anyone can open (Game Summary and Compare), with each
   player's page locked by that player's code. Writes, in trial/ (git-ignored):
   - <game>-report.html : the file to share
   - <game>-codes.txt   : one code per player, for the host to send each player privately
   Run: npm run trial:report -- trial/potato-backup.json
   (steps: build the data here, bundle the page with vite.trial.config.ts, then inline it into one file) */
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildModel, publicPlayer } from './trial-model';
import { lock } from './trial-lock';
import { newCode } from '../src/lib/codes';

const src = process.argv[2] ?? 'trial/potato-backup.json';
const backup = JSON.parse(readFileSync(src, 'utf-8'));
const model = buildModel(backup);
const stored = new Map<string, string | undefined>(backup.players.map((p: { id: string; code?: string }) => [p.id, p.code]));
const slug = model.game.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'game';

const codes: string[] = [];
const locks: Record<string, Awaited<ReturnType<typeof lock>>> = {};
for (const p of model.players) {
  const code = stored.get(p.id) ?? newCode();
  codes.push(`${p.name}: ${code}${stored.get(p.id) ? '' : ' (new: this backup has no code for this player)'}`);
  locks[p.id] = await lock(p, code);
}
const report = { model: { ...model, players: model.players.map(publicPlayer) }, locks };

// bundle the page, then inline its script, styles and the report data into one file
execSync('npx vite build -c vite.trial.config.ts --logLevel warn', { stdio: 'inherit' });
const dist = 'trial/dist';
let html = readFileSync(join(dist, 'trial-report.html'), 'utf-8');
const assets = readdirSync(join(dist, 'assets'));
for (const f of assets.filter((x) => x.endsWith('.css'))) {
  html = html.replace(new RegExp(`<link[^>]+href="[^"]*${f}"[^>]*>`), () => `<style>${readFileSync(join(dist, 'assets', f), 'utf-8')}</style>`);
}
for (const f of assets.filter((x) => x.endsWith('.js'))) {
  const js = readFileSync(join(dist, 'assets', f), 'utf-8').replace(/<\/script/gi, '<\\/script');
  html = html.replace(new RegExp(`<script[^>]+src="[^"]*${f}"[^>]*></script>`), () => `<script type="module">${js}</script>`);
}
const data = JSON.stringify(report).replace(/</g, '\\u003c');
html = html.replace('<div id="root"></div>', () => `<script id="felt-report" type="application/json">${data}</script>\n    <div id="root"></div>`);
html = html.replace(/<title>[^<]*<\/title>/, `<title>${model.game} Report</title>`);

writeFileSync(`trial/${slug}-report.html`, html);
writeFileSync(`trial/${slug}-codes.txt`, `${model.game}, ${model.date}\nSend each player only their own code.\n\n${codes.join('\n')}\n`);
console.log(`trial/${slug}-report.html (${Math.round(html.length / 1024)} KB)`);
console.log(`trial/${slug}-codes.txt`);
