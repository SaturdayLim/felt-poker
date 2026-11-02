/** Version history shown in Settings. Newest first. Add an entry and bump package.json "version" for each release. */
export const CHANGELOG: { version: string; date: string; notes: string[] }[] = [
  { version: '0.2.0', date: '2 Nov 2026', notes: [
    'Check for update button in Settings.',
    'Player codes and private cards.',
    'Hand review for closed games.',
    'Chip moves, 2-7 bounty and per-game house rules.',
    'Narrow phone screens fit.',
  ] },
  { version: '0.1.0', date: '31 Oct 2026', notes: [
    'Hand recorder with action boxes.',
    'Player groups, stats and settle-up.',
    'Copy and design pass.',
  ] },
];
