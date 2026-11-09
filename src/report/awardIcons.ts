/* One mark per table award. Every mark sits on a 24 px grid, drawn as strokes only (round caps and joins, like the
   Felt mark), so it takes the colour of the text around it (currentColor in HTML, one colour in the canvas image).
   Two line weights keep a mark from crowding: `main` paths use `ICON_STROKE`, `detail` paths use the thinner
   `ICON_DETAIL`. Draw both with no fill. A mark sits with its visual centre at 12,12, unless it rests on a surface. */

export const ICON_GRID = 24;
export const ICON_STROKE = 1.7;
export const ICON_DETAIL = 1.0;

export type AwardMark = { main: string[]; detail: string[] };

const f = (n: number) => String(Math.round(n * 100) / 100);

/** Snowflake: 3 main arms through the middle, each with a pair of small detail branches near both ends. */
function snowflake(): AwardMark {
  const main: string[] = [];
  const detail: string[] = [];
  for (const deg of [90, 150, 210]) {
    const t = (deg * Math.PI) / 180;
    const c = Math.cos(t), s = Math.sin(t);
    const pt = (r: number) => `${f(12 + c * r)} ${f(12 - s * r)}`;
    main.push(`M${pt(9.5)}L${pt(-9.5)}`);
    for (const sign of [1, -1]) {
      const at = 6 * sign;
      const bx = 12 + c * at, by = 12 - s * at;
      for (const side of [1, -1]) {
        const u = t + (side * Math.PI) / 3 + (sign < 0 ? Math.PI : 0);
        detail.push(`M${f(bx)} ${f(by)}L${f(bx + Math.cos(u) * 2.8)} ${f(by - Math.sin(u) * 2.8)}`);
      }
    }
  }
  return { main, detail };
}

/** Sun: a disc with a thinner inner ring, 8 long main rays and 8 short detail rays between them. */
function sun(): AwardMark {
  const ray = (deg: number, r0: number, r1: number) => {
    const t = (deg * Math.PI) / 180;
    return `M${f(12 + Math.cos(t) * r0)} ${f(12 - Math.sin(t) * r0)}L${f(12 + Math.cos(t) * r1)} ${f(12 - Math.sin(t) * r1)}`;
  };
  const main = ['M7.5 12a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0-9 0z'];
  const detail = ['M9.3 12a2.7 2.7 0 1 0 5.4 0a2.7 2.7 0 1 0-5.4 0z'];
  for (let k = 0; k < 8; k++) {
    main.push(ray(k * 45, 7.2, 10.6));
    detail.push(ray(22.5 + k * 45, 7.2, 9));
  }
  return { main, detail };
}

export const AWARD_ICONS: Record<string, AwardMark> = {
  // clenched fist: four knuckles in a row, a thumb across the front, a wrist cuff
  'Diamond Hands': {
    main: [
      'M6 9.5V7a1.5 1.5 0 0 1 3 0a1.5 1.5 0 0 1 3 0a1.5 1.5 0 0 1 3 0a1.5 1.5 0 0 1 3 0V11.5c0 2-1 3.5-3 3.5H9c-1.7 0-3-1.5-3-3.5z',
      'M6 10.5H13a1.6 1.6 0 0 1 0 3.2H8.5',
      'M8 15v3.5h8V15',
    ],
    detail: ['M9 7v3.5 M12 7v3.5 M15 7v3.5'],
  },
  // crown, raised so its centre sits at the middle of the grid
  'King Of The Hill': {
    main: ['M4.5 6.5L8.5 10.5 12 4 15.5 10.5 19.5 6.5 18 17H6z', 'M6.5 19.5h11'],
    detail: ['M6.4 14.5h11.2'],
  },
  // pot of gold: coins on a round pot with small feet (sits on a surface)
  Leprechaun: {
    main: [
      'M6 12.5c-1 .8-1.5 2-1.5 3.5a4.5 4.5 0 0 0 4.5 4.5h6a4.5 4.5 0 0 0 4.5-4.5c0-1.5-.5-2.7-1.5-3.5',
      'M4.8 12.5h14.4',
    ],
    detail: [
      'M10 8.4a2 2 0 1 0 4 0a2 2 0 1 0-4 0z',
      'M5.6 10.4a1.7 1.7 0 1 0 3.4 0a1.7 1.7 0 1 0-3.4 0z',
      'M15 10.4a1.7 1.7 0 1 0 3.4 0a1.7 1.7 0 1 0-3.4 0z',
      'M8.5 20.5l-1 1.5',
      'M15.5 20.5l1 1.5',
    ],
  },
  Apollo: sun(),
  'Ice Cold': snowflake(),
  // reverse arrow: out to the right, round the bend and back; centred on the grid
  Comeback: {
    main: ['M5 6h10a4.5 4.5 0 0 1 0 9H9', 'M12 12l-3 3 3 3'],
    detail: ['M5 9.5h7'],
  },
  // bull head with horns, ears and a nose ring
  Unrelenting: {
    main: [
      'M7.5 9.5L9.5 9h5l2 .5-.5 5.5c-.3 2-1.5 4-4 6-2.5-2-3.7-4-4-6z',
      'M7.5 9.5C6 9.5 3.5 8 3 4.5c2 1.3 4 2 6 2.2',
      'M16.5 9.5C18 9.5 20.5 8 21 4.5c-2 1.3-4 2-6 2.2',
    ],
    detail: ['M7.7 12L4.5 12.8 M16.3 12l3.2.8', 'M10.5 18.2a1.5 1.5 0 0 0 3 0', 'M9.8 13h.01 M14.2 13h.01'],
  },
  // a boulder with a crack (sits on a surface)
  'The Rock': {
    main: ['M3.5 17.5L6 10.5l4-4 5 1.5 3.5 4 2 5.5-3 2.5H7z'],
    detail: ['M10 6.5l1.5 5 3-1.5', 'M11.5 11.5L10 17'],
  },
  // target with crosshair ticks
  'Bounty Hunter': {
    main: ['M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0z', 'M12 12h.01'],
    detail: ['M7 12a5 5 0 1 0 10 0a5 5 0 1 0-10 0z', 'M12 1.5v4 M12 18.5v4 M1.5 12h4 M18.5 12h4'],
  },
  // shield carrying a simplified Saturday mark (src/saturday/assets/saturday-shakes-mark.svg)
  'Iron Defender': {
    main: ['M12 2.5l8 2.8v6.2c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10V5.3z'],
    detail: [
      'M13.52 9.72L13.16 6.67C12.7 6.5 11.1 6.5 10.78 6.64L10.29 10.94C11.1 11 12.6 11.2 13.56 10.97',
      'M10.44 10.84C11.4 11.1 13 11 13.71 10.79C13.7 11.6 13.3 16 13.1 17.1C12.8 17.4 11.3 17.4 10.84 17.09C10.6 15.8 10.45 14.2 10.33 12.76',
    ],
  },
};

const NONE: AwardMark = { main: [], detail: [] };

/** The paths for one award, or empty lists for a title with no mark. */
export const awardPaths = (title: string): AwardMark => AWARD_ICONS[title] ?? NONE;
