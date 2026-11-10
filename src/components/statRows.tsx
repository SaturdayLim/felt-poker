import type { ReactNode } from 'react';
import { Caption, Help } from './ui';
import type { HelpKey } from '../lib/help';

/* Stats with a visual order. A page of equal tiles has no first thing to read, so figures come in three sizes:
   a Headline (two or three big figures, the answer at a glance), a StatRows card (a titled list of rows; a row with a
   share shows a bar, so a column of rates reads by length before it reads by digit), and plain text for the rest. */

export interface Fig { label: string; value: ReactNode; note?: ReactNode; tip?: HelpKey; q?: string }

/** The big figures of a page, in one card. */
export function Headline({ items, label }: { items: Fig[]; label: string }) {
  return (
    <section className="sat-glass sat-card felt-headline" aria-label={label} style={{ ['--cols' as string]: items.length }}>
      {items.map((f) => (
        <div key={f.label} className="felt-headline-fig">
          <Caption q={f.q} tip={f.tip}>{f.label}</Caption>
          <span className="sat-kpi">{f.value}</span>
          {f.note && <span className="sat-note">{f.note}</span>}
        </div>
      ))}
    </section>
  );
}

export interface Row { label: string; value: ReactNode; note?: ReactNode; tip?: HelpKey; share?: number }

/** A titled list of figures. `share` (0 to 1) draws a bar under the row. */
export function StatRows({ title, tip, rows, hint }: { title: string; tip?: HelpKey; rows: Row[]; hint?: ReactNode }) {
  return (
    <section className="sat-glass sat-card sat-stack felt-statrows" style={{ ['--sat-gap' as string]: 'var(--sat-space-3)' }}>
      <div className="sat-split"><h2 className="sat-h3">{title}</h2>{tip && <Help k={tip} />}</div>
      {hint && <p className="sat-small sat-muted" style={{ marginTop: 'calc(var(--sat-space-2) * -1)' }}>{hint}</p>}
      <div className="felt-statrows-list">
        {rows.map((r) => (
          <div key={r.label} className="felt-statrow">
            <span className="felt-statrow-label">{r.label}{r.tip && <> <Help k={r.tip} /></>}</span>
            <span className="felt-statrow-value sat-num">{r.value}</span>
            {r.share !== undefined && <span className="felt-statrow-bar" aria-hidden="true"><i style={{ width: `${Math.round(Math.min(1, Math.max(0, r.share)) * 100)}%` }} /></span>}
            {r.note && <span className="felt-statrow-note sat-small sat-muted">{r.note}</span>}
          </div>
        ))}
      </div>
    </section>
  );
}
