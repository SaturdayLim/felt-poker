import { useEffect, useRef, useState } from 'react';
import { normalCode } from '../lib/codes';

const LEN = 6;

/** A player code as 6 boxes. One input sits over the boxes, so paste and autofill work. The last character submits.
    A wrong code shows the error for 1 second, the boxes clear, and typing starts again. */
export function CodeBoxes({ onSubmit, autoFocus = true }: { onSubmit: (code: string) => Promise<boolean>; autoFocus?: boolean }) {
  const [v, setV] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'bad'>('idle');
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const change = async (raw: string) => {
    if (state !== 'idle') return;
    const code = normalCode(raw).slice(0, LEN);
    setV(code);
    if (code.length < LEN) return;
    setState('busy');
    if (await onSubmit(code)) return;
    setState('bad');
    timer.current = window.setTimeout(() => { setV(''); setState('idle'); input.current?.focus(); }, 1000);
  };

  return (
    <div className="felt-boxes-wrap">
      <div className={`felt-boxes is-${state}`}>
        {Array.from({ length: LEN }, (_, i) => (
          <span key={i} className={`felt-boxes-cell ${i === v.length && state === 'idle' ? 'is-next' : ''}`} aria-hidden="true">{v[i] ?? ''}</span>
        ))}
        <input ref={input} className="felt-boxes-input" aria-label="Player code" aria-invalid={state === 'bad'} autoFocus={autoFocus}
          autoComplete="one-time-code" autoCapitalize="characters" autoCorrect="off" spellCheck={false} inputMode="text" value={v} readOnly={state !== 'idle'}
          onChange={(e) => change(e.target.value)} />
      </div>
      <span className={`felt-boxes-err ${state === 'bad' ? 'is-on' : ''}`} role={state === 'bad' ? 'alert' : undefined}>Code does not match.</span>
    </div>
  );
}
