---
name: card-design
description: Felt playing card design rules. Use when drawing or changing a card face, card back, or any picture of a card in the app, load screen or report.
---

# Felt Card Design

## Card back

- Finish: matte, with a fine paper grain and no shine.
- Field: ink `#1C1E21`.
- Border: one line of ice `#EBF1F5`, about 4% of the card height (3 px at 70, 2 px at 40, 1.5 px at 31). No inner keyline.
- Monogram: the small S logo in blue `#0052CC`, centred. Its height is 20% of the card height (14, 8 and 6 px).
- Use the small logo (`FeltMark`), which reads as an S at every size.
- Corners: radius about 6% of the card height.
- Proportion: 5 wide by 7 high.

## Before you change the back

Show samples first: the full card, the load screen, and the sizes in the app (card entry 70 px, player row 31 px, tab icon 22 px). Wait for the owner to pick.

## Picked back (4 Nov 2026)

Ink field, one ice border, blue S at 20%. Built in `CardBack` (src/components/ui.tsx) and `.felt-cardback` (src/styles.css).

## Live cards and empty places

- A live card (face or back) casts elevation 1: soft stacked layers, blur 2 x the y-offset, low opacity.
- An empty place for a card is etched: a dark groove and a light lip, no fill and no shadow. Nil is one etched box split down the middle.
- The slot being filled shows one focus line over its border, never a second ring.

## Earlier direction (replaced)

The owner rejected flat foil, then a geometric blue and black field. The picked back above replaces both.
