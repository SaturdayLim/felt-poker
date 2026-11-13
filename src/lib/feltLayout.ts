/* The owner's places for the parts of each seat, for each table size (set by dragging in docs/mockups/table-sizes.html, 13 Nov 2026).
   FELT_MOVES[players][seat][part] = [right, down, turn]: m (1% of the table height) added to the place the rule in `seatSpots`
   gives, and degrees added to the hole cards. Seat 0 is the bottom centre; seats go clockwise seen from above.
   A stack move shifts every column of that stack. The rule in `seatSpots` must stay as it is, or these moves shift with it. */
export type FeltPart = 'stack' | 'hole' | 'bet' | 'dealer';
export type FeltMoves = Record<number, Record<number, Partial<Record<FeltPart, number[]>>>>;

// Empty since the rule in `seatSpots` took in the owner's placing (13 Nov 2026). Add a move here only for a place the rule cannot give.
export const FELT_MOVES: FeltMoves = {};
