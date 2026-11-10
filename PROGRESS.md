# Felt: progress

## Latest (10 Nov 2026): 1.7.0
- Owner spec built by six agents plus an Opus review and two fix agents: PNG sets (src/report/pngSets.ts), Export screen, player card single list and sideways sheet swipe, Games search and press contraction, tab drag that follows the finger, Settings Display section and per-theme palettes, card back logo 40%.
- Test servers: felt-agent-1 to felt-agent-6 (ports 5181 to 5186, vite --mode mock), one per agent, so data does not mix. Test data: trial/potato-test-backup.json loaded through __store.setState.
- Not seen: real iPhone (clipboard copy of link and image, haptics, back swipe), a rebuy circle on screen (unit test only).
- Open: the neighbour tab is blank page colour during a drag (screens are routed, not pre-rendered). Banner theme switch is 60 px, content switches 52 px. CSV label says event ledger, not action log (owner wrote action log).

## Earlier (10 Nov 2026): 1.6.3 to 1.6.5 from docs/PLAN-v1.7.md
- Done: revisions 1.6.3 (count gives back its cash-outs, also after an app close: rememberCountOpen/undoCountOpen in store.ts; rebuy Undo; felt-test runs vite --mode mock), 1.6.4 (closed record, one game clock from first buy-in, Results in chips, Off cuts all motion via html[data-motion-off] and a 0 ms Element.animate wrapper in motion.ts, calm springs have no bounce, toasts, live row fade), 1.6.5 (viewer Result label, closed room text, Sign in words, viewer Settings order, bar labels).
- Commits are local, not pushed: Q9 and Q10 are open (CLAUDE.md: no push while a question is open).
- Next: answers to Q9 and Q10, push, then 1.7.0 (second review R1 to R5, then D1, D2 if Q9 is yes, D3).
- Not seen in a browser: the table bar with a non-zero range (C3), sign-in with a real player code (fold checked by flipping data-words), the takedown label in the viewer (unit tests only).
- Edge: Undo on a rebuy for a player who was out leaves them seated with their old chips (addBuyIn resumes the seat; removeBuyIn does not undo that).
- Tests share one origin: agents in separate tabs overwrite each other's store. Seed and check in one tab per run.

## Earlier (10 Nov 2026): 1.6.2 and the review plan
- End-to-end review of the host flow and the viewer flow. Findings, owner questions, revisions 1.6.3 to 1.7.0 and agent roles: docs/PLAN-v1.7.md. Start there.
- Fixed in 1.6.2: the buy-in pill on the game page shared the class .felt-pill with the tab highlight (invisible and dead since 1.2.3), now .felt-buyins. The live link row says Live link off, or No password.
- Not fixed, first in the plan: End game writes cash-outs on open, and Back to game leaves every stack at 0 (F1). The rebuy + has no Undo (F21).
- The felt-test server uses the real Firebase project unless localStorage felt-live-mock is 1.

## Earlier (7 Nov 2026): 1.3.3
- Five Haiku agents, one per set. Figure helpers (format.ts: figureText, figureNumber, figureUnit, figureDelta; calc.ts gameFigure; stats summaryFigure). Header `banner` prop; FeltMark `full` matches the splash. FEATURES.tournaments in src/lib/features.ts.
- Motion catalogue for the owner to pick from: https://claude.ai/artifact/QJyKRx8wHqDoAUFj7nch1u (IDs match docs/MOTION-LIST.md; L1 and L2 are the two load-screen options).
- Still money: Settle Up, payments, share image, report and CSV exports.

## Earlier (7 Nov 2026): 1.3.2
- Done by six parallel agents, one per area; area CSS now lives in src/css/{nav,motion,players,chrome,review}.css (loaded after styles.css).
- Not checked on a real iPhone: tall-bar fix (bottom inset measured late and capped at 34 px), bar hidden while typing, Safari's own back swipe, code-replace feedback. Bar charts with axis titles not seen with real hand data.
- Left: the old tab icon draws over the chip for a moment as a roll starts.

## Earlier (6 Nov 2026): 1.3.1
- Header `tabs` prop (notebook tabs per view). NavRail draws the rail as one sampled path with a dip under the chip (rAF during the roll). Sheet exit always slides down; Log hand close fades (no tint). Start view (screens/Start.tsx, sessionStorage felt-role). Settings You by player code. PaletteEditor shows defaults on Default. reopenGame() in ui.tsx. Fixed: .felt-swipe-face name clash (Games rows lost their titles); renamed to .felt-swipe-row.

## Earlier (6 Nov 2026): 1.3.0
- Poker-made look: NavRail (components/navRail.tsx) with a rolling chip; Header is a notebook tab (.felt-ntab).
- Tabs now Home, Games, Players, Settings. Players: list, Leaderboard, Stats (Insights embedded). Games: Games and Stats (GameStats in Games.tsx). #/insights/* still opens Players.
- Streamlining: hide eye per player, SwipeDelete on closed games, Sheet `action` prop (sticky Save), global user-select none plus contextmenu block (main.tsx).
- Live: room closes on game close or 12 h idle (IDLE_MS, lastAct saved). Game.claimed holds player-sent final counts (inbox/<pid>/count); CountChips fills counts on open.
- Splash spokes are 8 lines from each chip centre (index.html), delays from the S easing. Landing now loads skin-felt.
- Palette: Settings.palette, lib/palette.ts, html[data-palette="custom"] block in styles.css.
- Not checked on a real phone: the chip roll feel, swipe delete, keyboard and Safari edge swipe.

## Earlier (4 Nov 2026): 1.2.9
- Round 4 (5 Nov): PR https://github.com/SaturdayLim/felt-poker/pull/1 opened; owner asked to push to main after each set of work (CLAUDE.md). Swipe-back B built (src/lib/swipeBack.ts, router backPlain and hasUAVisualTransition skip). iOS Safari's own edge swipe still wins near the very edge: then no morph plays. Player card reordered with Net and Win rate lists; Games accepts a player filter (#/games/<id>).
- IMPORTANT: GitHub Pages deploys from main only (.github/workflows/deploy.yml). main is still 1.2.8; the owner tested 1.2.8 on 4 Nov evening. 1.2.9 needs a merge to main to go live.
- Round 3: stepFor() in Join.tsx; CardEntrySheet `own` prop (host's own row, felt-own-open:<pid> in localStorage holds the code); clashLevel/countedPairs in clash.ts, Settings.checkCards; host sends clash only when a later hand exists or the next live hand has acted (nowActed); Check Your Cards pop-up removed. NameField in players.tsx; press class 'name' in motion.ts; --felt-vvh caps sheet height.
- Waiting: owner picks a swipe-back variant (https://claude.ai/artifact/Mh4TFnyP3BdWemtuNfv9F7). Not built in the app.
- Not reproduced: player card edges offscreen on name tap (390 px Chromium looks right).
- Round 2 (same version): light orange #EE4E1C with ink text (4.6:1, 3.2:1 on ice). Ident box carries `logged` as hand to cards and `why` per clash hand; Join reads the older number list too.
- Viewer play-by-play is StepTable (Join.tsx): one box per action, 30 px step, names column fixed. The host table is unchanged; offer it to the owner if the stepped look is liked.
- Seat drag: grip(id, true) on the whole player card; controls keep their job. Stack sheet has AddChips (cash).
- New palette in tokens.json (skins.felt), rebuilt with `node src/saturday/tools/build-tokens.js`; all 180 contrast checks pass. Dark blue text is #6BA6FF because #0052CC on ink is 2.5:1. Text on orange is ink: 4.3:1 on #E64A19 in light, under AA for small text. Ask the owner.
- Elevation: --felt-elev-1/2/3 only (styles.css). --sat-shadow and --sat-shadow-lg are levels 1 and 2.
- Card back: ink, ice border, blue S at 20%. Live cards elevation 1; empty slots etched (--felt-etch, --felt-etch-hi).
- Presses act at once (motion.ts); recentPress() lets Sheet pull out of the pressed button and go back into it.
- Log hand morph runs in steps: router sets html[data-vt=open|close], CSS times the image pair, old and new.
- Viewer: Room has been closed + Home; Password; open eye and shut eye in the cards list; ident box now carries `logged` (hands with the player's hidden cards).
- Check these cards on hand 1: root cause not found. The list now follows toCheck (clash minus Keep my cards). Waiting on the owner for a repro.
- Checked in Chromium at 393 px, both themes: game page, recorder, card sheet morph, card backs, scanner with camera off, closed room.

## Latest (4 Nov 2026): 1.2.8
- Owner confirmed motion plays after Settings, Motion: Reduce Motion was the cause.
- Double box bug: `.felt-tabs button[aria-selected]` and `.sat-seg > button[aria-checked]` beat the rule that clears the selected button, so a box painted under the moving pill. Fixed with !important.
- Presses rewritten in motion.ts. Quick vs slow is read as a visual difference, not a different action. Confirm with the owner.
- Viewer screens (Join) have names with no player id, so they do not open a card.
- UI review results: docs/UI-REVIEW.md.
- Waiting: owner picks a matte card back (https://claude.ai/artifact/J1hTUTZXtptDnkm9V3B3Xe).

## Latest (4 Nov 2026): 1.2.7
- Motion was off on the owner's iPhone, most likely Reduce Motion: it also explains the 450 ms splash. Not confirmed yet. Settings, Motion shows the phone state and can overrule it (`felt-motion` in localStorage, `data-calm` on html, set before paint).
- Tested in WebKit 26.6 on Windows: 125 animate() calls with no preference, 0 with reduce. That build crashes on document.startViewTransition, so tests delete it. No crash reported on the iPhone.
- Haptics: tick runs in the click, not a timer. Hold pulses still use timers, which iOS may refuse, so the finger coming up gives the sure pulse. Not tried on a real iPhone.
- Waiting: the owner picks a card back from the samples (https://claude.ai/artifact/J1hTUTZXtptDnkm9V3B3Xe). Then build it per `.claude/skills/card-design/SKILL.md`.

## Latest (4 Nov 2026): 1.2.6
- Motion picks applied: docs/MOTION-LIST.md, played by src/lib/motion.ts (no library). installPresses classes every button in one listener. A press can set data-press.
- Clash: clashHands travels inside each player's ident box (locked with their code), so no database rule change. Join shows the pop-up. Report page shows a line. Stats follow what each player entered.

## Earlier (4 Nov 2026): 1.2.5
- Hands never block: `used` in HandRecorder holds only board and run cards. Felt flags a card entered twice at the showdown. Read from the note "entering a hand shouldn't exclude it"; confirm with the owner if a different meaning shows up.
- Splash: app/index.html sends a launch with no route to the root once per session (`felt-splashed` in sessionStorage).
- Haptics: `src/lib/haptics.ts`. navigator.vibrate on Android; the switch-input tick on iOS 18+. Not tried on a real iPhone. A tick fired from a timer may need a user gesture there.
- Motion samples from motion.dev: review page before any motion edit to the app.

## Latest (3 Nov 2026): 1.2.2 and 1.2.3
- Tuesday cash ended 82 short. Cause: Jacod had 0 chips and stayed dealt in on hand 7, so Runty's bet came back and the folded 82 had no pot. Fixed in `finalists`. Repair for that game: Reopen, End game shows the hand, open it and save, then correct Runty's count to 777.
- Report links still need the rules published: a read probe of /reports returned Permission denied on 3 Nov.
- Motion: TabPill, slideSwap, useDockPush, useDragList, Sheet exit, Log hand morph. Feel not checked on a phone.

## Earlier (3 Nov 2026): 1.1.1 to 1.2.0
- Built from docs/PLAN-v1.2.md and the mockup review (section 0a): player code icon states, player pop-up, Cards default switch and colour picker, floating card icon, pot by street, ghost minimum raise, sharing switch and lamp with Undo, report view and report link, player view log with hand frames, play-by-play, table with candles, 6-box code, full-screen camera join, blue and coral skin, Undo toasts, swipe sheets, view transitions.
- The user must publish database.rules.json again in the Firebase console, or report links fail (docs/FIREBASE-SETUP.md).
- Not tested: real Firebase, second phone, camera scan on a device, predictive back on Android.
- Skipped: sheets closing on Back, interruptible sheet animation, leaving the report template out for players (the host needs it offline).


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

## Done (2 Nov 2026, round 5)
- Awards renamed and re-ruled (`AWARD_LIST`): Diamond Hands, King Of The Hill, Leprechaun, Apollo, Ice Cold, Comeback, Unrelenting, The Rock, Bounty Hunter, Iron Defender. Ice Cold reading: pots won / (bets + raises) under 10%. Assumption, not confirmed.
- Player report: Avg label sits under its tick; You label above the line; Target on a second row.
- Narrow phone (320px): bottom bar buttons fit; Stats period chips fit; summary values align.
- Test codes in `trial/potato-test-backup.json`: Everett 222222, Bel 333333, Nat 444444, Mike 555555. Import it into a test copy to match the report.

## Done (3 Nov 2026, v1.2.4)
- Viewer boxes match the host (snapshots replay with exact stacks). `actionClosed` counts only all-ins up to that street, which also stops a later all-in dropping streets.
- Slides no longer use view transitions: `SlidePane` and `DockPanel` copy the old content and animate it. Only the Log hand morph uses a view transition.
- Live link is `LiveRow` on the game page. `docs/MOTION-LIST.md` lists the motion examples needed from the owner.
- Not tested on a real iPhone: touch, keyboard lift, motion feel. Touch swipe was tested with simulated touch events only.

## Next
- Export a new backup from the phone once this version is on it: the app then gives every player a code, and the report must be rebuilt from that backup so its codes match the app.
- Build the trial report into the app (Download or Share: Interactive report).
- Bounties and chip moves are not in the image report or the CSV ledger yet.
- Check on the iPhone.

## Key decisions
- Felt records what the table agreed; it never decides who pays.
- Test in the browser on port 5174 (`felt-test` in `.claude/launch.json`). Port 5173 on localhost holds the user's real data.
