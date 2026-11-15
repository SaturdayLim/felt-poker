/* The action log of one saved hand, for the host: every action in time order, street by street, then the result.
   The same sentences as the Full Action Log export ("BB (Nic) raises to 4."). Copy pastes it as plain text. */
import { useMemo } from 'react';
import { Cards, Icon, Sheet, toast } from './ui';
import { handView } from '../report/model';
import type { Game, Hand, ID } from '../types';

export function HandLogSheet({ g, h, name, onClose }: { g: Game; h: Hand; name: (id: ID) => string; onClose: () => void }) {
  const view = useMemo(() => (h.log ? handView(g, h, name) : null), [g, h, name]);
  const text = view ? [...view.streets.map((s) => [s.street, ...s.lines].join('\n')), view.result].join('\n\n') : '';
  const copy = () => navigator.clipboard?.writeText(`Hand ${h.n}\n\n${text}`).then(() => toast(`Hand ${h.n} copied.`), () => toast('Copy was blocked.'));
  return (
    <Sheet open onClose={onClose} title={`Action log, hand ${h.n}`}
      action={view ? <button type="button" className="sat-btn sat-btn--ghost sat-iconbtn" aria-label={`Copy hand ${h.n}`} onClick={copy}><Icon name="copy" size={18} /></button> : undefined}>
      {!view ? <p className="sat-muted">This hand has no action log.</p> : (
        <div className="sat-stack felt-hlog" style={{ ['--sat-gap' as string]: 'var(--sat-space-4)' }}>
          {view.streets.map((s) => (
            <section key={s.street} className="sat-stack" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)' }}>
              <div className="sat-split"><h3 className="sat-h3">{s.street}</h3>{s.cards.length > 0 && <Cards cards={s.cards} size="sm" />}</div>
              {s.lines.length ? s.lines.map((l, i) => <p key={i}>{l}</p>) : <p className="sat-muted">No action.</p>}
            </section>
          ))}
          <p><b>{view.result}</b></p>
        </div>
      )}
    </Sheet>
  );
}
