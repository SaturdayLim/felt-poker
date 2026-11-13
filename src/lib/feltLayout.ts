/* The owner's places for the parts of each seat, for each table size (set by dragging in docs/mockups/table-sizes.html, 13 Nov 2026).
   FELT_MOVES[players][seat][part] = [right, down, turn]: m (1% of the table height) added to the place the rule in `seatSpots`
   gives, and degrees added to the hole cards. Seat 0 is the bottom centre; seats go clockwise seen from above.
   A stack move shifts every column of that stack. The rule in `seatSpots` must stay as it is, or these moves shift with it. */
export type FeltPart = 'stack' | 'hole' | 'bet' | 'dealer';
export type FeltMoves = Record<number, Record<number, Partial<Record<FeltPart, number[]>>>>;

export const FELT_MOVES: FeltMoves = {
  2: {
    0: { dealer: [-2.63, -2.44], stack: [2.07, 1.32] },
    1: { stack: [5.45, 2.07], hole: [-14.66, 0.94], bet: [-13.15, 1.69], dealer: [-12.03, -0.38] },
  },
  3: {
    0: { dealer: [-3.19, -2.44] },
    1: { dealer: [-6.01, 7.33], hole: [-9.02, 8.08], bet: [-6.2, 8.46] },
    2: { hole: [8.46, 8.08], dealer: [9.02, 10.15], bet: [6.58, 8.08] },
  },
  4: {
    0: { dealer: [-3.57, -2.07], bet: [-0.56, -1.69] },
    1: { stack: [-1.13, 2.44] },
    2: { hole: [-15.22, 0.94], dealer: [-9.58, 0.56], bet: [-15.41, 1.5] },
    3: { stack: [0.38, 3.76], hole: [-0.38, -0.19], dealer: [-2.63, 1.13], bet: [-7.33, -0.38] },
  },
  5: {
    0: { dealer: [-3.38, -2.26] },
    1: { dealer: [2.26, -3.19] },
    2: { hole: [-12.03, 0.75], bet: [-9.58, 2.26], dealer: [-10.34, 1.32], stack: [1.69, 0.94] },
    3: { dealer: [17.48, 3.38], hole: [15.03, 0.38], bet: [12.59, 2.44], stack: [-1.69, 1.13] },
    4: { dealer: [-5.26, 0] },
  },
  6: {
    0: { dealer: [-3.01, -2.44] },
    1: { dealer: [2.44, -3.95], bet: [4.13, -2.07] },
    2: { hole: [-8.83, 6.77], dealer: [-4.32, 6.39], bet: [-6.58, 8.27] },
    3: { hole: [-14.09, -0.75], dealer: [-10.34, 0], bet: [-14.28, 0.19] },
    4: { hole: [9.58, 8.08], bet: [7.33, 9.02], dealer: [8.83, 11.09] },
    5: { dealer: [-5.64, -1.32], bet: [-1.13, -1.5] },
  },
  7: {
    0: { dealer: [-3.57, -2.07], stack: [1.5, 1.13] },
    1: { dealer: [1.5, -4.7] },
    2: { bet: [0.19, 8.27], hole: [-3.76, 7.89], dealer: [0.75, 6.95] },
    3: { hole: [-14.85, 0.94], bet: [-15.03, 1.5], dealer: [-12.21, 1.69] },
    4: { hole: [15.22, 0.19], dealer: [17.1, 0.19], bet: [14.85, 1.69] },
    5: { dealer: [1.88, 12.21], hole: [3.76, 8.83], bet: [1.69, 7.89] },
    6: { dealer: [-2.82, -2.63] },
  },
  8: {
    0: { stack: [3.19, 0.94], dealer: [-2.44, -1.69] },
    1: { dealer: [-0.56, -3.95], bet: [1.5, -0.94] },
    2: { hole: [2.44, 1.69], stack: [-0.75, 11.46], bet: [3.95, 1.32], dealer: [3.38, -0.56] },
    3: { stack: [4.32, 0], hole: [-11.28, 4.51], bet: [-5.26, 4.51], dealer: [-9.96, 3.57] },
    4: { stack: [1.88, 0.38], hole: [-14.66, 0.94], bet: [-15.41, 1.5], dealer: [-13.15, 0.38] },
    5: { stack: [-4.32, 0], hole: [11.28, 4.51], bet: [9.77, 6.39], dealer: [13.53, 4.89] },
    6: { hole: [-2.44, 1.69], stack: [0.75, 11.46], bet: [-3.95, 1.32], dealer: [-4.32, 3.19] },
    7: { dealer: [-2.63, -2.82], hole: [-1.88, -1.13], bet: [-3.01, -2.26], stack: [1.32, 1.13] },
  },
  9: {
    0: { dealer: [-2.26, -2.26] },
    1: { dealer: [-0.38, -4.13], bet: [0.94, -1.13] },
    2: { dealer: [3.01, -2.26], bet: [2.63, -0.94] },
    3: { hole: [-8.27, 7.33], bet: [-3.76, 7.33], dealer: [-6.39, 7.7] },
    4: { hole: [-12.59, 1.5], stack: [3.38, 1.13], bet: [-12.97, 2.26], dealer: [-10.9, 0.75] },
    5: { hole: [15.41, 0.38], stack: [24.62, 1.88], bet: [15.22, 1.32], dealer: [16.54, -0.19] },
    6: { stack: [-0.38, 2.26], hole: [9.96, 8.08], bet: [6.58, 8.08], dealer: [9.4, 10.71] },
    7: { stack: [1.13, 2.44], dealer: [-3.01, 0.56], bet: [-0.75, -1.32] },
    8: { dealer: [-2.26, -2.63], bet: [0, -1.5] },
  },
  10: {
    0: { dealer: [-1.88, -2.07] },
    1: { dealer: [-1.5, -4.13], bet: [0.94, -1.13] },
    2: { bet: [2.07, -1.69], dealer: [2.44, -2.63] },
    3: { hole: [-6.39, 12.21], bet: [-0.75, 11.28], dealer: [-4.32, 10.9] },
    4: { hole: [-14.09, 1.5], bet: [-14.09, 2.82], dealer: [-12.21, 1.5] },
    5: { dealer: [-12.21, 0.38], hole: [-14.09, 0.75], bet: [-15.22, 2.07], stack: [2.07, 1.32] },
    6: { hole: [14.28, 1.88], stack: [26.31, 5.26], bet: [14.09, 1.88], dealer: [16.54, 2.44] },
    7: { hole: [6.2, 11.46], dealer: [2.82, 15.03], bet: [4.7, 12.59], stack: [6.39, 21.61] },
    8: { dealer: [-3.95, 0], stack: [-10.15, 17.85] },
    9: { dealer: [-1.5, -2.63] },
  },
};
