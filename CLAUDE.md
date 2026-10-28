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
