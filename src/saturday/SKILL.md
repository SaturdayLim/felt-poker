---
name: saturday-signature
description: Saturday Portfolio design signature (glass UI, Instrument Serif + Geist, teal accent, Código skin). Use when building or restyling any web page, dashboard, HTML report, Apps Script page or tool UI for a Saturday Portfolio or Código project, or when the user says "Saturday signature", "our design kit" or "house style for apps". Not for printed PDF/Word reports (use report-house-style).
---

# Saturday Signature

This folder is the kit. Its path is the folder containing this file (call it KIT).

## Steps

1. Read `KIT/SIGNATURE.md` (design rules) and `KIT/WRITING.md` (voice and caption samples) before writing any UI or copy.
2. Copy KIT into the project as `saturday/` (skip `demo/index.single.html`, `SKILL.md` is harmless). Do not edit the copy's generated files (`css/tokens.css`, `css/skin-*.css`, `tokens/tailwind*`); change `tokens/tokens.json` and run `node saturday/tools/build-tokens.js` instead.
3. Wire it in exactly as `KIT/README.md` "Load the kit into a project" says: theme script first in `<head>`, then `tokens.css`, `saturday.css`, optional `skin-codigo.css`, `saturday.js` deferred, and `class="sat"` on `<body>`.
4. Código projects: add `skin-codigo.css` and `data-skin="codigo"` on `<html>`. Always spell Código with the accent.
5. Build from the classes shown in `KIT/demo/index.html`. Copy markup patterns from it rather than inventing new components. New components use only `--sat-*` tokens.
6. One-file deliverables: run `node saturday/tools/inline-kit.js in.html out.html`.

## Non-negotiables

- Dark-mode glass is a dark tint (the tokens already do this). Never add a white translucent layer over the mesh in dark mode.
- Max two glass layers stacked. Tables and dense numbers on `.sat-glass-2` or `.sat-solid`.
- Instrument Serif is never bold.
- Copy follows `WRITING.md` (owner-approved): Title Case for page titles only; UPPERCASE captions with the unit in brackets via `.sat-qual`; deltas `▲ 39.3% v F25 (32,942)`; quarters as `F26Q3` or `C26Q1` with a July-June financial year; numbers as `14.9k`, `$4.21m`, `-1,240`; period abbreviations from the pattern table (`FYTD`, `M-1TD`, `PFYTD`, `N3M`, `MoM`); volume in 9Lc; finding-first figcaption, caveats in an info tip, `Source:` line under every chart and data table; no verbal contractions; no middle-dot chains; Código 1530 and Añejo always with accents.
- Saturday projects use the shaker mark from `assets/` in the header (see `SIGNATURE.md` 5b).
- Touch: 44px targets, primary action in `.sat-bottombar` on phones, filters in `.sat-sheet`, nothing hover-only.
- If colours change: `node saturday/tools/check-contrast.js` must pass.

## Done means

Open the page and check: light, dark and auto; 375px and 1280px wide; no sideways scroll at 375px; keyboard reaches every control. Report what was and was not checked.
