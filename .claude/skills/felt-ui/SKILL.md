---
name: felt-ui
description: Felt UI principles. Use when adding or changing any screen, button, name, figure or control in the app.
---

# Felt UI Principles

## Everything named is a way in

- A player name opens the player card, on every screen. Use `PlayerName` from `src/components/players.tsx`.
- The exception is logging: names in the live action table, chip pickers and the chip count keep their logging job.
- A figure opens what is behind it. On the player card, Net and Win rate open Full stats, and Games opens the list of games.
- A row in a list is one button across its full width.
- A name inside a row still opens the player card. The rest of the row keeps the job of the row.

## A control exists only when it works

- Do not grey out a control that needs something else first. Leave it off the page, and show it with the thing it needs.
- Copy and QR of the live link show only when the room is open.
- Copy of a player code shows only with the code on screen.
- Keep a greyed control only when the reader must learn that the option exists, for example Bet with nobody left to answer.

## The frame reacts to the press

- If text sits in a frame, the frame reacts. Rows reach the edge of their list, so the light reaches the corners.
- The press finishes first, then the action runs.
- A quick press and a slow press look different. `docs/MOTION-LIST.md` has the values.
- Each press gives a haptic tick, fired inside the click.

## Words on the page

- An explanation goes in the info tip of its field. The page shows labels and live figures.
- Check every element against the Unslop list in the global CLAUDE.md. Mark each hit as value-adding, with its job, or remove it.
- Sentence case labels, with no eyebrow above a heading.
- Instrument Serif is for the Felt wordmark only.
