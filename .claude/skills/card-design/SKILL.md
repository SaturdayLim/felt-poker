---
name: card-design
description: Felt playing card design rules. Use when drawing or changing a card face, card back, or any picture of a card in the app, load screen or report.
---

# Felt Card Design

## Card back

- Finish: matte, with a fine paper grain and no shine.
- Field: ink `#1C1E21`.
- Border: one line of ice `#EBF1F5`, about 4% of the card height (3 px at 70, 2 px at 40, 1.5 px at 31). No inner keyline.
- Mark: the full Felt mark (two chips and the S), centred. The chips are ice at 50% strength. The S is the highlight: the load screen gold `#CDB98A` (token `--felt-card-gold`, fixed in both themes), with a heavier stroke so it reads clearly stronger than the chips (`--sat-mark-stroke`: 2.2 px by default, 3 px at `lg`, 1.8 px at `sm`; not scaled, set in `.felt-cardback`). A thin blue S read as a blue outline at card size (owner, 12 Nov 2026). Its height is 40% of the card height (28, 16 and 12.4 px) at every size, set in CSS from the card box.
- Use `FeltMark full`. Give the SVG an explicit size (container units plus aspect-ratio), never `width: auto` alone: Safari can collapse it.
- Corners: radius about 6% of the card height.
- Proportion: 5 wide by 7 high.

## Before you change the back

Show samples first: the full card, the load screen, and the sizes in the app (card entry 70 px, player row 31 px, tab icon 22 px). Wait for the owner to pick.

## Picked back (4 Nov 2026)

Ink field, one ice border, full mark at 40% of the card height: chips at 50%, gold S as the highlight (owner, 12 Nov 2026). Built in `CardBack` (src/components/ui.tsx) and `.felt-cardback` (src/styles.css).

## Live cards and empty places

- A live card (face or back) casts elevation 1: soft stacked layers, blur 2 x the y-offset, low opacity.
- An empty place for a card is etched: a dark groove and a light lip, no fill and no shadow. Nil is one etched box split down the middle.
- The slot being filled shows one focus line over its border, never a second ring.

## Earlier direction (replaced)

The owner rejected flat foil, then a geometric blue and black field. The picked back above replaces both.
