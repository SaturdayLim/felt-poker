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

## Next
- Bounties and chip moves are not in the image report or the CSV ledger yet.
- Check on the iPhone.

## Key decisions
- Felt records what the table agreed; it never decides who pays.
- Test in the browser on port 5174 (`felt-test` in `.claude/launch.json`). Port 5173 on localhost holds the user's real data.
