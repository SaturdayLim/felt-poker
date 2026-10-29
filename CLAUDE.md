# Felt: project rules

Standing instructions from the user. They apply to every screen, report and tip.

## UI copy

- **Chips, not units.** Amounts at the table are "chips" (1 chip = 1 small blind). Code names such as `units()` and `inUnits` stay as they are.
- **Source only as a tip.** A figure's source is never printed on the page. Use `SourceTip` (an info tip titled Source) beside the heading or block it belongs to.
- **One line per field in a tip.** When an info tip covers two or more separate fields or options (for example Bet entry and Pot count), give each its own line: write `text` as an array in `src/lib/help.ts`; `Help` renders each entry as its own paragraph.
- Saturday WRITING.md still applies: no contractions, no middle-dot chains, Title Case page titles.

## Behaviour

- Theme and opening-screen length belong to the phone. A backup restore must never change them.
- Player status: dealt into a hand or acting in it turns the player green (playing). An away player is paused and not dealt in by default.
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
- Minimum-raise error: "Raise minimum = 14" with "Call 4" and "Raise to 14" buttons. No brackets, no "(house rule)".
- Dark actions carry a shut-eye mark; the SB and BB posts always show it. Straddle only for the first to act preflop (or the next after straddles), at the minimum raise of the house rule; it gives that player a later turn.
- A player with nobody left to answer (everyone else folded or all-in) cannot bet or raise: those keys are greyed and a stored raise counts as a call.
- Use "SB" and "BB" in labels, not "Small blind" and "Big blind".
- 2-7 bounty (per game; on by default for cash, off for tournaments): Revealed, Winning, Best hand (last hand standing counts); Offsuit only or Suited allowed; chips. Every other player dealt in pays; a player who busts in the hand is exempt, a short stack pays what it has. It moves chips between stacks, never into the pot.
- A shown 2-7 gets a Pay bounty tag at the result: pressed automatically when the rule is met, pressable by hand when it is not. Felt records what the table agreed; it never decides.
- Partly recorded follows the log: filling in every skipped box makes the hand whole again.
- Keypad open: everything else is greyed out; a tap outside only closes the keypad. Scrolling leaves it open.
- The close-street button names the outcome ("Eve wins 9") and offers Undo when empty boxes took the default.
- Stacks: a missed hand turns them into ranges; a count (tap the stack) or a typed all-in makes one exact again. With a range, All-in asks for the amount.
- Chip moves (side game, tip, other) change stacks, not pots or hand stats, and show as dashed rows between hands.
