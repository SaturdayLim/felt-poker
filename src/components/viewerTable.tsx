/* The player view's Table: the room's snapshots on the shared table screen (tableFelt.tsx). */
import { useMemo, type ReactNode } from 'react';
import { TablePage, type FeltMe } from './tableFelt';
import type { FeltHand } from '../lib/felt';
import { idleFelt, nowFelt, pubFelt } from '../live/feltView';
import type { NowSnapshot, PubSnapshot, StackLine } from '../live/snapshot';

export function ViewerTable({ pub, now, stacks, onBack, corner, me }: { pub: PubSnapshot; now: NowSnapshot | null; stacks: StackLine[]; onBack: () => void; corner?: (hand: FeltHand) => ReactNode; me?: FeltMe }) {
  // a new hand shows only after real action; a hand the room has closed shows as finished, with its result
  const open = now && now.acted !== false && !pub.hands.some((h) => h.n === now.n) ? now : null;
  const live = useMemo(() => (open ? nowFelt(pub, open) : null), [pub, open]);
  const hands = useMemo(() => pub.hands.map((h) => pubFelt(pub, h)), [pub]);
  const idle = useMemo(() => idleFelt(pub, stacks), [pub, stacks]);
  return <TablePage hands={hands} live={live} idle={idle} canLive={pub.game.status === 'live'} onBack={onBack} corner={corner} me={me} />;
}
