/* Builds the shared report from a backup file on the computer. Same output as the app's HTML report:
   - trial/<game>-report.html : the file to share
   - trial/<game>-codes.txt   : one code per player, for the host to send each player privately
   Run: npm run trial:report -- trial/potato-backup.json */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { buildReport, fillTemplate } from '../src/report/htmlReport';

const src = process.argv[2] ?? 'trial/potato-backup.json';
const backup = JSON.parse(readFileSync(src, 'utf-8'));
const { report, codes } = await buildReport(backup.games[0], backup.players, backup.settings);
const stored = new Map<string, string | undefined>(backup.players.map((p: { id: string; code?: string }) => [p.id, p.code]));
const slug = report.model.game.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'game';

execSync('npx vite-node scripts/report-template.ts', { stdio: 'inherit' });
const html = fillTemplate(readFileSync('public/report-template.html', 'utf-8'), report, report.model.game);
writeFileSync(`trial/${slug}-report.html`, html);
const lines = codes.map((c) => `${c.name}: ${c.code}${stored.get(c.id) ? '' : ' (new: this backup has no code for this player)'}`);
writeFileSync(`trial/${slug}-codes.txt`, `${report.model.game}, ${report.model.date}\nSend each player only their own code.\n\n${lines.join('\n')}\n`);
console.log(`trial/${slug}-report.html (${Math.round(html.length / 1024)} KB)`);
console.log(`trial/${slug}-codes.txt`);
