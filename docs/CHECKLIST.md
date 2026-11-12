# Felt: open checklist

For any agent starting work on Felt. Each line is a known gap: not built, not checked, or waiting for the owner.
Tick a line (or delete it) only when the change is built and seen working. Add new gaps here as you find them.
Sources: the Fable advisor review (11 Nov 2026, IDs A1 to A25), agent reports for 1.7.0 and 1.7.1.

## Waiting for the owner

- [ ] Players > Stats > a player (tap the name chip): two game nets with no note ("Net result +336" against "Net = +340 chips") (A23).
- [ ] Games > a closed game > Results and settle up > Export > Full Data > Data tick: the owner wrote "action log" for the third CSV file; the file is the event ledger. Add a real action log CSV?
- [ ] Any main tab > tab bar at the bottom: the small dots on the rail were not found in Chromium or WebKit (1.7.4). Do they show at rest or while the chip rolls, and on the line, in the pockets or round the chip? An iPhone screenshot settles it.

## Answered by the owner (13 Nov 2026)

- "Units" as a Settings label (A8): fine as it is.
- Results page candle rows (A19): not needed.
- Game captions (A25): built in 1.7.4.
- Banner theme switch 60 px, content switches 52 px: accepted (CLAUDE.md).
- Card back chips: 50%.

## Not built

- [ ] Game.pauses is new (1.7.1): games reopened before 1.7.1 have no pause record, so their clock still counts the closed time.
- [ ] CSS selectors still defined in two files (outside the 1.7.1 cleanup): .felt-bars-row (players.css), .felt-boxes-cell.is-next (viewer.css), .felt-header and .felt-tip-line (chrome.css), .felt-keypad family, .felt-picker, .felt-recorder (recorder.css), .felt-lamp--playing, .felt-nav and .felt-page (nav.css), .felt-banner twice in chrome.css, .felt-vlook-preview and .felt-vlook-swatches twice in viewer.css. Merge one at a time and compare computed styles on a screen that uses each: the 1.7.1 merge of .felt-grow hid every flex item until it was split again.
- [ ] Export: an orange card button stays in hand review by design (players add their own cards there).

- [ ] Sub-navigation is icons by rule, but the game page (Players / Hands), recorder stages and viewer tabs use word tabs; viewer List/Table and house rules use `sat-seg`.
- [ ] Three switch kinds: `Toggle`, `LiquidToggle`, `felt-liveswitch`. Merge onto LiquidToggle where the look allows.
- [ ] Two hand editors (`HandRecorder`, `HandEditorClassic`) and two action tables (`ActionTable`, `StepTable` in Join.tsx).
- [ ] "Hands won" means two things: "12 hands won" (Players.tsx) and "2/4 hands won" (player card, logged hands only).
- [ ] The neighbour tab's content is not drawn during a tab drag (only its name fades in). Screens are routed, not pre-rendered.
- [ ] Run cards entered only in runs 2 or 3 are dropped when the run count goes down; they do not come back.
- [ ] Closed filter text still sits in the DOM of the Players list (inert, so no focus; A12).
- [ ] Unused help keys in src/lib/help.ts (tiers removed in 1.7.1): avg, periodCYTD, periodL30D, playerRows, periods, entryMode, countEntry, potCount, archivePlayer, rankOrder, splash, and `tiers` (removed in 1.7.1; check). Help titles repeat across keys (Players, Pot count, Rebuy, Hand).
- [ ] `SourceTip` (ui.tsx) has no user, though CLAUDE.md keeps it.

## Not checked

- [ ] A real iPhone: haptics, keyboard and sheets, camera scan, Safari back swipe, clipboard copy of the link and of images, the nav bar height at launch.
- [ ] 1.7.3 on a real iPhone: nav bar after load screen and Host, native share sheet with more than 10 hand images, sheet swipes with a field focused, card back in Safari.
- [ ] 1.7.3 fade frames not watched (pane clock stalls): search player list on blur, banner rename field, trial report tab cross-fade. Trial report Reduced motion (CSS only).
- [ ] 1.7.3 card back at 31 and 54 px seen only on injected test cards.
- [ ] Report text now replays with exact stacks (handView uses exactStacks): old hands with a short all-in call now read the real amount. Spot-check an old game log.
- [ ] Two real phones on one live room (the mock driver shares one browser origin).
- [ ] Whether viewers see stacks drop to 0 while the host has the End Game count open (the count writes cash-outs as it fills).
- [ ] A rebuy-set circle on the stack graph on screen (unit test only).
- [ ] Export: preview swipe-down exit, Reduced motion close, Animation speed Off.
- [ ] Every screen at 320 and 430 px, light theme and Reduced motion (R5 in docs/PLAN-v1.7.md).
- [ ] Not reached in any review: drag to reorder seats, shuffle seats, chip move sheet, game settings sheet, missed hand, player code hold to replace, the ! clash flags, My final chip count, Flag a wrong update, locked room with a password, QR pop-up, Room closed Undo, Expenses and Mark paid, groups and Others, backup and restore, Erase, a card entered twice, New Game with 9 players, the quick editor.

## Test setup

- One dev server per agent: `felt-agent-1` to `felt-agent-6` in .claude/launch.json (ports 5181 to 5186, vite --mode mock). Never felt-dev (5173, owner data).
- Test data: `trial/potato-test-backup.json`, loaded with `__store.setState({ players, games, groups })`. Never commit trial/.
- Always pass your own `tabId` to browser tools: several agents have driven another agent's tab by mistake.
