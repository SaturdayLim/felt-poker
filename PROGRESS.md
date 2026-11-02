# Felt: progress

## Done (29 Oct 2026, commit b292e3e on main, pushed)
- 2-7 bounty: per-game rule (New Game and game settings), on for cash and off for tournaments by default, copied from the last game of the same type. Win conditions: Revealed, Winning, Best hand. Busted payers are exempt, short stacks pay what they have (`Bounty.short`).
- Pay bounty tag on a shown 2-7 at the result, with a tip. Pressed when the rule is met; can be pressed by hand.
- Minimum raise moved to per-game rules (`Game.rules`); app Settings keeps the old values only as a fallback for older games.
- Partly recorded is worked out from the log (`partlyRecorded`, `unknownBoxes` in `src/lib/hand.ts`).
- Tap a player name on any street to enter shown cards.
- Keypad: rest of the screen greyed; an outside tap only closes it.
- Close-street button names the outcome; Undo toast after defaults fill boxes.
- Stacks: missed hand (Setup tab), stack count (tap Stack on a player card), typed all-in anchors a range stack, All-in asks for the amount when the stack is a range.
- Chip moves (side game, tip, other): `Game.moves`, dashed rows in the hand list, counted in stacks and in the final chip count.
- Player stats: 3-bet, fold to 3-bet, c-bet, fold to c-bet, BB defend, steal, aggression; Where hands were won chart; Chips won and lost back-to-back chart (`src/lib/style.ts`).
- Tests: 40 pass (`npx vitest run`). Checked in the browser at 375px on port 5174.

## Done (31 Oct 2026): copy and design pass
- Setup and settings screens: explanations moved from captions into info tips, one tip per field. 2-7 bounty split into 4 tips (what it is, win condition, hand, amount).
- All help copy rewritten to ASD-STE100 (rule added to CLAUDE.md).
- Info tips render on <body> (portal, fixed position), so no card covers them. One tip open at a time; a tip follows its button on scroll.
- End game replaces Count chips / Finish; count screen titled End Game, button Close game.
- Design review (ui-ux-pro-max + impeccable lenses), all 15 findings applied: dark-theme contrast on accent buttons, 40-44px tap targets in keypad and stage tabs, stronger next-box cue, Save, next hand as primary, stack shown before cards in row labels, term fixes (Dealt in, Mark hand missed, No cards, Buy-in), players first on New Game, Enter-to-next on the chip count, finding-first chart captions.

## Done (2 Nov 2026, not committed): after the first live test (Potato Day)
- Exports: ledger CSV now has chip moves, stack counts, bounties and missed hands. Players CSV adds chips put in, bounty net, chip-move net, estimate and count minus estimate. Hands CSV adds chips in by player, missed, partly recorded.
- End game count shows each player's estimate and flags a mismatch. Chip move also on the Players tab.
- Closed games: Settle Up has Hands; hands open read-only with Previous and Next hand.
- My cards (Settings, You): private hole cards at any point; Show my cards at showdown; Your hands in stats (bluff rate, bluffs won, net, list).
- Downloads renamed (Download or Share screen, list of 4 options with file type).
- Fix: stack estimate before a hand ignored later cash-outs (review showed 0 stacks).
- Tests: 43 pass.

## Trial reports (2 Nov 2026)
- `scripts/trial-model.ts` builds every report figure from a Felt backup with the app logic; `scripts/trial-data.ts` prints it (`npx vite-node scripts/trial-data.ts trial/<backup>.json`).
- `scripts/trial-report.html` + `.tsx` + `.css`: 3 trial pages (The night, Players, Compare) with app CSS and charts. Open with the felt-test server: http://localhost:5174/scripts/trial-report.html (reads `/trial/potato-backup.json`).
- Data in `trial/` is git-ignored. Waiting on the user's review before any of it goes into the app.
- Round 3 (2 Nov): felt table (pill, rail, cloth), award sentences, par chart with rebuy dots, target as a grey dot, funnel labels "Flop (33)", tips one line each, coaching advice per strength or weakness.
- Shared report: `npm run trial:report -- trial/<backup>.json` writes `trial/<game>-report.html` (one file, fonts inlined) and `trial/<game>-codes.txt`. Game Summary and Compare are open; each player page is AES-GCM encrypted with that player's 6-character code (`scripts/trial-lock.ts`).

## Done (2 Nov 2026, round 4)
- Player codes in the app (`src/lib/codes.ts`, `Player.code`, player settings: Show, New code). Codes made for older players on load and saved at once.
- Private cards: `Hand.private` per player (old `Hand.mine` moves there on load). Review of a closed game: Player cards, pick player, enter code, add cards; saves without reopening.
- Report: uses each player's stored code; rebuy circles on the line with a running count; Your Cards section in the locked page; award list with minimums; lock text.
- Tests: 46 pass.

## Next
- Export a new backup from the phone once this version is on it: the app then gives every player a code, and the report must be rebuilt from that backup so its codes match the app.
- Build the trial report into the app (Download or Share: Interactive report).
- Bounties and chip moves are not in the image report or the CSV ledger yet.
- Check on the iPhone.

## Key decisions
- Felt records what the table agreed; it never decides who pays.
- Test in the browser on port 5174 (`felt-test` in `.claude/launch.json`). Port 5173 on localhost holds the user's real data.
