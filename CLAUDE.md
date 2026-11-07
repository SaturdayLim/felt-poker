# Felt: project rules

Standing instructions from the user. They apply to every screen, report and tip.

## Workflow

- **Commit and push after each set of work** (user's standing order). Exception: when a question to the user is still open, do not push; list the open questions at the very end of the reply, each with the context needed to answer it.
- **Push to main whenever a set of work is completed** (user's standing order, 5 Nov 2026). GitHub Pages deploys from main only. Push the work branch first, then fast-forward main to it.
- Never commit the user's game data (backups, exports, trial reports built from them). They stay in `trial/`, which git ignores.

## UI copy

- **Chips, not units.** Amounts at the table are "chips" (1 chip = 1 small blind). Code names such as `units()` and `inUnits` stay as they are.
- **Source only as a tip.** A figure's source is never printed on the page. Use `SourceTip` (an info tip titled Source) beside the heading or block it belongs to.
- **One line per field in a tip.** When an info tip covers two or more separate fields or options (for example Bet entry and Pot count), give each its own line: write `text` as an array in `src/lib/help.ts`; `Help` renders each entry as its own paragraph.
- Saturday WRITING.md still applies: no contractions, no middle-dot chains, Title Case page titles.
- **ASD-STE100 for all copy.** Short sentences (procedures 20 words max, descriptions 25), active voice, one fact or instruction per sentence, one word per meaning. No filler or AI phrasing ("The usual rule", "simply", "just").
- **Tips, not captions.** On setup and settings screens, an explanation lives in its field's info tip, one tip per field. The page shows only labels and live figures (for example "4 players: 30 chips to the 2-7").
- **Tips sit on top.** An open info tip renders on <body> (fixed position), so no card or frame can cover it.
- **Tip button shape.** An info button is always a circle at the top-right of the element it explains (`.felt-tipped`).

## Design

- `docs/DESIGN-PRINCIPLES.md`: colour 60/30/10 (ink `#1C1E21`, blue `#0052CC`, orange `#FF5722`; ice `#EBF1F5`, subtle `#E2E8F0`), phone details, desktop details for later.
- Elevation: three shadow depths only (`--felt-elev-1/2/3`). Each is stacked soft layers, blur = 2 x offset. Details in the felt-ui skill.
- Made for a poker table, not a generic app: the tab bar is a chip tray (a straight rail with a pocket per tab; a poker chip in the Main colour rolls along the rail to the open tab, and the rail bends away under it like a soft surface, never touching it). The bar keeps one height and hides while a text field has the keyboard. The header is the tab of a notebook page (a light outlined paper tab on a line across the screen). A page with views (Players, Leaderboard, Stats; Game list, Stats) shows the views as the notebook tabs, with no page-name tab and no segmented control. Home has no tab: the Felt mark sits plain on the page.
- Theme: a 3-part icon toggle in the Home header (phone, sun, moon), no labels.
- Animation times by type: button press 100-200 ms; standard transitions (dropdown, card expansion) 200-300 ms; page or screen transitions 300-400 ms; complex loaders 500 ms or more (docs/MOTION-LIST.md).
- Every pressable control sinks a little when pressed (data-press="none" opts out).
- Colours, Settings: Default (tuned tokens) or Custom (five base colours: Base, Main, Accent, Up, Down; every other colour derives from them, `src/lib/palette.ts`). Text on a Main or Accent fill is white or Base, whichever reads better. Belongs to the phone: a restore never changes it. Default shows the true default colours (the custom ones stay saved, out of sight). Picking a colour while on Default switches to Custom, starting from the defaults. The Default knob is blank.
- Nothing in the interface is selectable or has a long-press menu, as in native apps. Only fields and `.felt-selectable` text (the player code) can be selected.

## Behaviour

- The end-of-game button says End game. It opens the final chip count (cash) or the finish screen (tournament).
- Theme and opening-screen length belong to the phone. A backup restore must never change them.
- Player status: dealt into a hand or acting in it turns the player green (playing). An away player is paused and not dealt in by default.
- Recorder: who acts sits left and the pot right, under the stage tabs and outside the box. On a street tab the pot is that street's closing pot.
- A hand never blocks anything. Only board and run cards leave the picker. A card entered twice is flagged, not refused.
- Hold actions give feedback by haptics, not an animation under the thumb. Copy: "Tap and hold to replace code".
- A press acts at once. Where a long press does nothing different, it looks and acts the same as a tap.
- Add player mid-game: saved players first. A name already saved is flagged, and the user is asked for a different name.
- Action table past 4 columns: Players and Action titles stay still; column numbers scroll with their boxes and cut off at the names.
- Showdown: one bar opens or closes the shown cards, labelled Cards shown or No cards.
- Keypad: Straddle (or Dark) sits beside Raise.
- Live link row order: button, password and tip, then link and QR flush right.
- Hand recorder rows run in time order: small blind first, button last. Columns are passes around the table, newest flush right.
- A skipped box takes the default: check, or fold when facing a bet. Defaults are there to save taps and stay editable.
- Shuffling seats does not draw a button: seat 1 has the button, seat 2 the small blind, seat 3 the big blind.
- Keypads: no betting-helper keys (half pot, pot). Never use "<" as a backspace; use the backspace-key icon.
- Action boxes: C = call or check, F = fold, a number = the street total bet or raised to. Typing an amount no higher than the bet is a C.
- Amounts are totals, never added: only a player's latest box stands, earlier boxes fade hard.
- An action answers a specific bet; if an earlier change moves that bet, the action is dropped (blank box).
- House rules (minimum raise, 2-7 bounty) belong to each game: set in New Game, changed in the game settings, copied from the last game of the same type. Not in app Settings.
- Minimum raise: Last raise (default), SB steps, Double. A smaller raise is refused with C or the minimum raise offered.
- Keypad buttons say Call (Check when nothing is owed), Fold, All-in, with no amounts under them. Only the boxes use C and F.
- Amount box: the minimum shows as ghost text. The first digit replaces it. Bet or Raise with no amount logs the minimum.
- Minimum-raise error: "Raise minimum = 14" with "Call 4" and "Raise to 14" buttons. No brackets, no "(house rule)".
- Dark actions carry a shut-eye mark; the SB and BB posts always show it. Straddle only for the first to act preflop (or the next after straddles), at the minimum raise of the house rule; it gives that player a later turn.
- A player with nobody left to answer (everyone else folded or all-in) cannot bet or raise: those keys are greyed and a stored raise counts as a call.
- Use "SB" and "BB" in labels, not "Small blind" and "Big blind".
- 2-7 bounty (per game; on by default for cash, off for tournaments): Revealed, Winning, Best hand (last hand standing counts); Offsuit only or Suited allowed; chips. Every other player dealt in pays; a player who busts in the hand is exempt, a short stack pays what it has. It moves chips between stacks, never into the pot.
- A shown 2-7 gets a Pay bounty tag at the result: pressed automatically when the rule is met, pressable by hand when it is not. Felt records what the table agreed; it never decides.
- A bought-in player with an exact stack of 0 is not dealt in by default and cannot be added until a rebuy. A player with no chips in the pot is never a finalist.
- Viewers see a new hand only after real action (check, call, bet, raise, fold). Blinds and card entry alone do not show it.
- Viewers can send their own cards for a hand. The host's entry for that player replaces them.
- Card entry shows no words: filled = two face-down cards (blue S on ink, one ice border), nil = one etched box split down the middle. Cards already shown at the table show face up.
- Cards shown at the table cannot be replaced by hidden cards (host or player): "Cards in showdown. Remove from showdown to overwrite."
- Player cards, player's phone: their own cards face up, with an open eye (shown at the table) or a shut eye (hidden). Every hand the host or the player logged shows, whenever they signed in.
- Player cards, host phone: other players carry no eye. Their hidden cards show face down; cards just saved stay face up until the sheet closes. The host's own row (Settings, You) opens with their player code (Show my cards, kept on this phone) and then shows face up with an eye.
- Hidden cards that cannot be right get a small ! on the player's own list, only after a later hand is under way. Red = contradicts a card shown at the table; the hand is left out of stats and reports. Blue = matches another hidden entry; it still counts. A tap shows the reason. Settings, Check hidden cards (default on) turns this off. No pop-up.
- Viewer play-by-play: names stay still; each action box sits one step right of the action before it (time order), not in pass columns. The step fits two passes round the table in view (small for 9 players); a box never covers the one before it in its row.
- Copy hand: plain text, no dashes or bullets, a blank line between streets.
- A device with the game open tells the host through the flags path: a pop-up on join, and again with the player name after sign-in.
- Live link off: toast "Room closed." with Undo and a 5-second countdown. Viewers of a closed room see "Room has been closed" and a Home button.
- Join a game with the camera off or blocked: the page background, never black, and a Turn on camera button that asks again.
- Viewers type a Password (not passphrase) for a locked game.
- A tapped name keeps no focus ring.
- Live link sits on the game page, no pop-up: password space with eye and censoring, copy, QR, and a switch that glows green (on) or red (off). Copy and QR exist only when on: closed, they are not on the page.
- All-in run-out is offered only when no further action is possible (the street's all-ins count, not later ones). With one all-in and 2 still able to bet, the street goes on.
- Viewers read the same boxes as the host: snapshots replay with the same stacks. More than one run shows one board per run.
- A name in the recorder needs a press and hold to enter shown cards. A tap does nothing. Run cards stop blocking the picker when the hand goes back to a street.
- Pop-ups never cover the field being filled: the keypad and picker scroll it clear, and the keyboard pushes sheets up.
- A sheet with a swipe bar always opens by sliding up and leaves by sliding down, however it is opened or closed. The orange card button opens a sheet with an orange edge.
- Log hand: closing, the page fades as it closes into the button shape, and the button with its text fades up at once (no solid block first). Opening: the text goes, then the page opens.
- Swipe back on the hand page (owner pick B): a drag from the left edge closes the page towards the Log hand button as the finger moves. Past a third it goes into the button; earlier it springs back. When the phone does its own back swipe, no morph plays on top. In hand review the swipe slides the page back to the Hands list.
- The game page keeps its tab in the address (game/<id> or game/<id>/hands), so Back from a hand returns to the same tab and scroll position.
- Morphs clip, never stretch: anything that grows or shrinks keeps its content at its own size while the frame changes shape, and the colour and text change overlaps the move (no pause, then a flip).
- Motion is set in `docs/MOTION-LIST.md`, and `src/lib/motion.ts` plays it. Springs use visual duration and bounce. Every button press follows its class.
- Private cards that match another entry or the table are flagged to that player alone (the ! above, and a line on their report page for blue). Half a pair is left out of all analysis.
- Player view: the card button signs in. Sign out sits in its sheet.
- Partly recorded follows the log: filling in every skipped box makes the hand whole again.
- Keypad open: everything else is greyed out; a tap outside only closes the keypad. Scrolling leaves it open.
- The close-street button names the outcome ("Eve wins 9") and offers Undo when empty boxes took the default.
- Tap a stack: the count sheet, with Rebuy (chips, default the game buy-in) and Add chips under it (cash).
- Drag to reorder seats: a press and hold on the grip or on any blank part of a player card lifts it. A long press never selects text on a card.
- Player card name: edit it in place (plain text). Enter or leaving the field saves; a saved name of another player is refused. No Edit name button. A name press glows around the letters; no box lights up.
- Player card order: name, player code, Net + Win rate + Games, Full stats. No Close button (the swipe bar closes it). Net lists each closed game with in, out and result. Win rate lists hands won and lost in each game. Games opens the Games page filtered to the player. Full stats opens the player page.
- A field in a sheet: the sheet rises by the keyboard height only, and never grows taller than the space above the keyboard.
- Stacks: a missed hand turns them into ranges; a count (tap the stack) or a typed all-in makes one exact again. With a range, All-in asks for the amount.
- Chip moves (side game, tip, other) change stacks, not pots or hand stats, and show as dashed rows between hands.
- Chip move sits on both the Players tab and the Hands tab. The End game count shows each player's estimate and flags a count that differs (a missing chip move).
- A closed game's hands open read-only for review (every stage, Previous and Next hand). No reopening needed.
- Player codes: a player gets a random 6-character code on entering a first game. Icon: grey shut eye (no game, no code), full shut eye (code ready, unseen), open eye (code on screen), refresh (seen; hold to replace it). Codes can repeat but very rarely.
- Private cards: each player's own hole cards are kept apart from the cards shown at the table. Anyone adds them with the floating card icon on any stage of a hand, write only. After the game, any player opens their own cards in hand review with their player code and can add or change them; the game stays closed. Nobody else sees them; they are never in images or CSV in the open.
- Shared report (trial): Game Summary and Compare are open; each player page is encrypted with that player's code. Lock text: "Enter player code to access player stats."
- Awards come from a fixed list, each with a minimum to count (src/report/model.ts, AWARD_LIST). A tie shares an award.
- Oldest phones: Felt needs iOS 16.2 or Chrome 111. `app/index.html` shows a warning below that. Do not add workarounds for older phones.
- Report: View (in the app), Link (encrypted online for 30 days, key in the link), Download (HTML file).
- Tabs: Home, Games, Players, Settings. Players holds Players, Leaderboard and Stats (old #/insights links still open there). Games holds Games and Stats (table-level figures across closed games).
- Players list: Everyone and each group open and close with one tap on the head (kept on this phone); the arrow turns over and the rows slide in. An open group shows every player as a chip; a tap adds or takes out that player. No per-player hide eye; Show hidden players lists players hidden from new games.
- Stats filters: Cash and Tournaments are two on/off chips (both on = all; one is always on). Periods: All, CYTD, L30D, across the full width. Charts carry axis labels and titles.
- Swipe a closed game left to show Delete; a long swipe deletes at once. Undo puts it back.
- Game settings: Save sits top right and stays in view. A swipe down or a tap outside leaves without saving.
- The live room closes by itself when the game is closed, or after 12 hours with no action from the host.
- End game count starts filled: each player's own count if they sent one from the player view (My final chip count), else an exact estimate. The host edits any of them.
- Load screen: the S draws, the two inner circles fade in, and each spoke wipes in along its own short segment as the S passes it (never across a circle).
- Start view (Host or Player): two equal buttons, no movement on press, a soft fade in.
- Each time Felt opens, the first view asks Host or Player (a game link skips it). Host opens Home. Player opens the camera scanner, which has a Back button top left. A scanned or pasted game link opens that game. Host a game instead leads to Home.
- Settings, Hands, You: enter your player code to make this phone yours (Not me undoes it). Your own hidden cards then open on this phone.
- Tap a closed game on Home or Games: it reopens (live) with Undo.
- Motion follows the phone (Reduce Motion) unless Settings, Motion says Full. It belongs to the phone: a backup restore must not change it.
- Action table: names sit in a panel on the page background, with no box. Boxes cut off at the panel edge. A slide bar shows when columns are out of view.
- A hand opened again goes to where it stopped: the street cards if missing, else the player to act.
- Save hand and Save, next hand show only when no card entry is open.
- Every button press gives a haptic tick, fired inside the click (iOS allows it only there).
- UI principles (names open cards, controls show only when they work, frames react): `.claude/skills/felt-ui/SKILL.md`.
- Card design rules: `.claude/skills/card-design/SKILL.md`. Logo on a card back is 15% to 25% of the card height.
- Download options name the content and the file type: Results (1 image), Results and stats, Full game record, Spreadsheet data (3 CSV files).
