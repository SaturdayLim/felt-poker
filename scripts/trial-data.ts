/* Prints the trial report model for a Felt backup, for a quick check in the terminal.
   Run: npx vite-node scripts/trial-data.ts trial/potato-backup.json */
import { readFileSync } from 'node:fs';
import { AWARD_LIST, buildModel } from '../src/report/model';

const [, , src = 'trial/potato-backup.json'] = process.argv;
const m = buildModel(JSON.parse(readFileSync(src, 'utf-8')));
console.log(m.game, m.date, `${m.hands} hands, ${m.minutes} min, median ${m.medianSec}s`, JSON.stringify(m.reach), 'target', JSON.stringify(m.target));
for (const r of AWARD_LIST) console.log(`List: ${r.title} = ${r.best} (minimum ${r.min})`);
for (const a of m.awards) console.log(`Award ${a.title}: ${a.to.map((id) => m.players.find((p) => p.id === id)?.name).join(', ')}. ${a.detail}`);
for (const p of m.players) {
  console.log(`\n${p.name}: ${p.net > 0 ? '+' : ''}${p.net}. VPIP ${p.vpip.toFixed(0)}%, AF ${p.af.toFixed(1)}. High ${p.high} after ${p.highAt}, low ${p.low} after ${p.lowAt}. Count ${p.count} vs ${p.estimate}.`);
  for (const n of p.notes) console.log(`  ${n.kind === 'strength' ? 'Strength' : 'Weakness'}: ${n.title} - ${n.stat}. ${n.advice}`);
}
