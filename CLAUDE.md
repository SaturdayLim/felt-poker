# Felt: project rules

Standing instructions from the user. They apply to every screen, report and tip.

## UI copy

- **Chips, not units.** Amounts at the table are "chips" (1 chip = 1 small blind). Code names such as `units()` and `inUnits` stay as they are.
- **Source only as a tip.** A figure's source is never printed on the page. Use `SourceTip` (an info tip titled Source) beside the heading or block it belongs to.
- **One line per field in a tip.** When an info tip covers two or more separate fields or options (for example Bet entry and Pot count), give each its own line: write `text` as an array in `src/lib/help.ts`; `Help` renders each entry as its own paragraph.
- Saturday WRITING.md still applies: no contractions, no middle-dot chains, Title Case page titles.

## Behaviour

- Theme and opening-screen length belong to the phone. A backup restore must never change them.
- Player status: dealt into a hand or acting in it turns the player green (playing).
- Hand recorder rows run in time order: small blind first, button last. Columns are passes around the table, newest flush right.
- A skipped box takes the default: check, or fold when facing a bet. Defaults are there to save taps and stay editable.
- Shuffling seats does not draw a button: seat 1 has the button, seat 2 the small blind, seat 3 the big blind.
- Keypads: no betting-helper keys (half pot, pot). Never use "<" as a backspace; use the backspace-key icon.
- Action boxes: C = call or check, F = fold, a number = the street total bet or raised to. Typing an amount no higher than the bet is a C.
- Amounts are totals, never added: only a player's latest box stands, earlier boxes fade hard.
- An action answers a specific bet; if an earlier change moves that bet, the action is dropped (blank box).
- Minimum raise is a house rule in Settings (Last raise by default, SB steps, Double). A smaller raise is refused with C or the minimum raise offered.
- Keypad buttons say Call (Check when nothing is owed), Fold, All-in, with no amounts under them. Only the boxes use C and F.
- Minimum-raise error: "Raise minimum = 14" with "Call 4" and "Raise to 14" buttons. No brackets, no "(house rule)".
- Dark actions carry a shut-eye mark; the SB and BB posts always show it. Straddle only for the first to act preflop (or the next after straddles), at the minimum raise of the house rule; it gives that player a later turn.
- A player with nobody left to answer (everyone else folded or all-in) cannot bet or raise: those keys are greyed and a stored raise counts as a call.
- Use "SB" and "BB" in labels, not "Small blind" and "Big blind".
