# Felt: Design Principles

Rules for future builds. `CLAUDE.md` links here.

## Colour: 60 / 30 / 10

Picked 4 Nov 2026.

- 60%: ink `#1C1E21` (dark background, light text) and ice `#EBF1F5` (light background, dark text). Backgrounds and surfaces.
- 30%: blue `#0052CC`. Tinted surfaces, active tabs, the background mesh, standard primary buttons.
- 10%: orange `#FF5722` in dark, `#EE4E1C` in light (every light-mode orange). One main action per screen, the next box to fill, the signed-in player, marks.
- Subtle: `#E2E8F0` for divider lines, borders and disabled states (at low opacity in dark).
- Blue text: `#0045B5` in light, to pass contrast. In dark, `#0052CC` text fails on ink (2.5:1), so blue text is `#6BA6FF`.
- Text on blue: white (6.8:1). Text on orange: ink, in both modes (5.3:1 in dark, 4.6:1 in light).
- Light orange is `#EE4E1C`, not `#E64A19`: ink text needs a lighter orange to reach 4.5:1, and `#EE4E1C` still holds 3.2:1 against the ice background.
- Losses are not coral. Dark uses `#F7A8B8`, and light uses `#A3342A`.
- Black suit marks always sit on a white card or chip, never on a dark surface.

## Custom colours

- Settings, Colours: Default or Custom. Custom takes five base colours (Base, Main, Accent, Up, Down) and derives every token from them.
- Text on a Main or Accent fill is white or Base, whichever has more contrast.

## Elevation

- Three depths only, in the whole app: 1 resting (glass, live cards), 2 raised (buttons that stand up, a dragged row, the card button), 3 overlay (sheets, tips, toasts, the QR).
- Each depth is stacked soft layers. Each layer doubles the offset and the blur (blur = 2 x offset) and has a lower opacity.
- Use `--felt-elev-1`, `--felt-elev-2`, `--felt-elev-3`. Do not write a new drop shadow.
- Glows that show a state (lamps, the live switch) and inset lines (etched slots, wells) are not elevation.

## Phone details

- Numbers use tabular figures (`.sat-num`), so counters do not jiggle.
- Headlines stay balanced, with no single word on the last line.
- Respect safe areas at the top and bottom of every full-screen view.
- Tap targets are at least 44px, even when the icon is smaller.
- The screen changes before the server answers. A failure shows a toast.
- Show the last copy on the phone, then refresh in the background.
- Skeletons, not spinners or "Loading" text.
- Undo toasts, not "are you sure". Keep a prompt only when no Undo can work: erase all data, replace a player code.
- Sheets dismiss with a swipe down.
- Use continuous corners where the browser supports them.
- Tips and toasts sit in the top layer, above open sheets.

## Desktop details, for any future desktop build

- A command menu on cmd+K.
- Keyboard shortcut hints beside actions.
- Safe triangle: a submenu stays open while the pointer crosses towards it.
- Blurred placeholders while images load.

## Oldest phones

Felt needs iOS 16.2 or Chrome 111. Below that, `app/index.html` shows a warning. Do not add workarounds for older phones.
