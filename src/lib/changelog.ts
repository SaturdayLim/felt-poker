/** Version history shown in Settings. Newest first. Add an entry and bump package.json "version" for each release. */
export const CHANGELOG: { version: string; date: string; notes: string[] }[] = [
  { version: '1.0.1', date: '2 Nov 2026', notes: [
    'Eye icon on a player: show a new code once, or copy it without showing it.',
    'Player cards: write-only entry after a hand. Nobody can see saved cards.',
    'Hands with clashing private cards are left out of the report.',
    'Settings, Cards: suit colours and row order in the card picker.',
    'Player codes card removed from Download or Share.',
  ] },
  { version: '1.0.0', date: '2 Nov 2026', notes: [
    'Game report: one HTML file to share, made on the phone (Download or Share).',
    'Report pages: awards, charts, stats, house rules and a short who-pays-whom list with a copy button.',
    'Each player page opens with that player code. Copy a message with the code for each player.',
    'Back button no longer loops between Settle Up and Hands.',
  ] },
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
