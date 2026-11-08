/* One mark per table award. Every mark sits on a 24 px grid, drawn as strokes only (round caps and joins, like the
   Felt mark), so it takes the colour of the text around it (currentColor in HTML, one colour in the canvas image).
   `AWARD_ICONS[title]` is a list of SVG path strings. Draw them with stroke width `ICON_STROKE` and no fill. */

export const ICON_GRID = 24;
export const ICON_STROKE = 1.6;

const f = (n: number) => String(Math.round(n * 100) / 100);

/** Snowflake: 3 arms through the middle, each with a pair of small branches near both ends. */
function snowflake(): string[] {
  const out: string[] = [];
  for (const deg of [90, 150, 210]) {
    const t = (deg * Math.PI) / 180;
    const c = Math.cos(t), s = Math.sin(t);
    const pt = (r: number) => `${f(12 + c * r)} ${f(12 - s * r)}`;
    out.push(`M${pt(9.5)}L${pt(-9.5)}`);
    for (const sign of [1, -1]) {
      const at = 6 * sign;
      const bx = 12 + c * at, by = 12 - s * at;
      for (const side of [1, -1]) {
        const u = t + (side * Math.PI) / 3 + (sign < 0 ? Math.PI : 0);
        out.push(`M${f(bx)} ${f(by)}L${f(bx + Math.cos(u) * 2.6)} ${f(by - Math.sin(u) * 2.6)}`);
      }
    }
  }
  return out;
}

export const AWARD_ICONS: Record<string, string[]> = {
  // armoured glove: a raised gauntlet with a knuckle plate and a cuff
  'Diamond Hands': [
    'M7 11V8.2a1.4 1.4 0 0 1 2.8 0V6a1.4 1.4 0 0 1 2.8 0v-.8a1.4 1.4 0 0 1 2.8 0V6.5a1.4 1.4 0 0 1 2.8 0V15c0 2.4-1.8 4.4-4.4 4.4h-1.2c-1.7 0-2.7-.8-3.8-2.3L7 11z',
    'M7 12h11.4',
    'M9.6 19.4v2.1h6.4v-2.1',
  ],
  // crown
  'King Of The Hill': [
    'M4.5 8L8.5 12 12 5.5 15.5 12 19.5 8 18 18.5H6z',
    'M6 21h12',
  ],
  // pot of gold: coins on a round pot with small feet
  Leprechaun: [
    'M6 12.5c-1 .8-1.5 2-1.5 3.5a4.5 4.5 0 0 0 4.5 4.5h6a4.5 4.5 0 0 0 4.5-4.5c0-1.5-.5-2.7-1.5-3.5',
    'M4.8 12.5h14.4',
    'M10 8.4a2 2 0 1 0 4 0a2 2 0 1 0-4 0z',
    'M5.6 10.4a1.7 1.7 0 1 0 3.4 0a1.7 1.7 0 1 0-3.4 0z',
    'M15 10.4a1.7 1.7 0 1 0 3.4 0a1.7 1.7 0 1 0-3.4 0z',
    'M8.5 20.5l-1 1.5',
    'M15.5 20.5l1 1.5',
  ],
  // sun with rays over a laurel arc
  Apollo: [
    'M8 10a4 4 0 1 0 8 0a4 4 0 1 0-8 0z',
    'M12 2.5v2 M12 15.5v2 M4.5 10h2 M17.5 10h2',
    'M6.7 4.7l1.4 1.4 M15.9 13.9l1.4 1.4 M17.3 4.7l-1.4 1.4 M8.1 13.9l-1.4 1.4',
    'M4.5 19.5c3.2 2.5 11.8 2.5 15 0',
    'M7.5 20.6l-1.4-1.6 M16.5 20.6l1.4-1.6',
  ],
  'Ice Cold': snowflake(),
  // reverse arrow: out to the right, round the bend and back
  Comeback: [
    'M4 8h10a4.5 4.5 0 0 1 0 9H8',
    'M11 14l-3 3 3 3',
  ],
  // bull head with horns, ears and a nose ring
  Unrelenting: [
    'M7.5 9.5L9.5 9h5l2 .5-.5 5.5c-.3 2-1.5 4-4 6-2.5-2-3.7-4-4-6z',
    'M7.5 9.5C6 9.5 3.5 8 3 4.5c2 1.3 4 2 6 2.2',
    'M16.5 9.5C18 9.5 20.5 8 21 4.5c-2 1.3-4 2-6 2.2',
    'M7.7 12L4.5 12.8 M16.3 12l3.2.8',
    'M10.5 18.2a1.5 1.5 0 0 0 3 0',
    'M9.8 13h.01 M14.2 13h.01',
  ],
  // a boulder with a crack
  'The Rock': [
    'M3.5 17.5L6 10.5l4-4 5 1.5 3.5 4 2 5.5-3 2.5H7z',
    'M10 6.5l1.5 5 3-1.5',
    'M11.5 11.5L10 17',
  ],
  // target with crosshair ticks
  'Bounty Hunter': [
    'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0z',
    'M7 12a5 5 0 1 0 10 0a5 5 0 1 0-10 0z',
    'M12 12h.01',
    'M12 1.5v4 M12 18.5v4 M1.5 12h4 M18.5 12h4',
  ],
  // shield with a check
  'Iron Defender': [
    'M12 3l7 2.5v6c0 4.5-3 8-7 9.5-4-1.5-7-5-7-9.5v-6z',
    'M9 11.5l2.2 2.2 3.8-4.2',
  ],
};

/** The paths for one award, or an empty list for a title with no mark. */
export const awardPaths = (title: string): string[] => AWARD_ICONS[title] ?? [];
