/** Version history shown in Settings. Newest first. Add an entry and bump package.json "version" for each release. */
export const CHANGELOG: { version: string; date: string; notes: string[] }[] = [
  { version: '1.1.6', date: '3 Nov 2026', notes: [
    'Join a game: the camera fills the screen, with the paste box and Host a game instead over it. A phone with no data opens here.',
    'Report link: send the report in any chat. It works on iPhone for 30 days. The HTML download stays.',
  ] },
  { version: '1.1.5', date: '3 Nov 2026', notes: [
    'Player view: the Action tab is a scrolling log. Each hand has its own frame with a band for each street, card marks and a Copy button.',
    'Action lines show position and chips in: SB (Chuggy, 4) calls to 8.',
    'New street cards show clear, and old cards show faded.',
    'Tap a hand on the Hands tab for the play-by-play boxes.',
    'Players tab: a table with stacks on the seats, and a candle for the table and for you.',
    'Player code: 6 boxes with auto-submit, in the app and in the report. A replaced code signs the player out.',
  ] },
  { version: '1.1.4', date: '3 Nov 2026', notes: [
    'Live link: a switch with a status lamp. Green is live, amber is waiting for a connection, red is off.',
    'Sharing off has an Undo for 5 seconds. Sharing on again uses the same link.',
    'View the game report inside the app.',
    '2-7 settings now take 3 rows, each with a tip.',
  ] },
  { version: '1.1.3', date: '3 Nov 2026', notes: [
    'Hand logging: a floating card icon adds player cards on any stage. My cards and Show my cards are gone.',
    'Who acts and the pot now sit under the stage tabs. Each street tab shows that closing pot.',
    'Keypad: the minimum shows as a grey figure, and Raise with no amount logs it.',
  ] },
  { version: '1.1.2', date: '3 Nov 2026', notes: [
    'Player pop-up: tap a player for net, win rate, games and the code. Full stats and Edit name sit below.',
    'A code now starts when a player joins a first game. The icon shows the state: grey shut eye, shut eye, open eye, refresh.',
    'The code icon also sits on each player card in a game.',
    'Settings, Cards: one Default switch. Custom adds a hex box and an eyedropper for each suit. Drag a handle to reorder.',
  ] },
  { version: '1.1.1', date: '3 Nov 2026', notes: [
    'A phone that lacks a function Felt needs now shows a warning. Felt needs iOS 16.2 or Chrome 111.',
    'A code replaced during a live game now works at once.',
    'Messages now show above open sheets, for example "Code does not match".',
    'A new live link opened in the same tab now uses its own key.',
    'Players see the hand in progress after the host leaves the recorder.',
    'Players can add cards only to hands they were dealt into.',
    'Game length now runs from the close of hand 1 to the close of the last hand.',
  ] },
  { version: '1.1.0', date: '2 Nov 2026', notes: [
    'Live link: players follow a game from one link or QR and see the action, settings, hands and table.',
    'Players add their own cards from their phone with their code. Cards are write only.',
    'Players can flag a wrong update. The host sees the flags.',
    'Game data online is encrypted. A join passphrase can lock a game. Stop sharing deletes the room.',
  ] },
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
