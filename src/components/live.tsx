import { useEffect, useMemo, useRef, useState } from 'react';
import qrcode from 'qrcode-generator';
import type { Game } from '../types';
import { Caption, Help, Icon, mixClip, toast, useSwipeDown } from './ui';
import { DRAWER, SPRING, calm, spring } from '../lib/motion';
import { cancelStop, dismissFlag, liveAvailable, liveStatus, onLiveChange, requestStop, startSharing } from '../live/host';

/** Re-reads the live state of a game whenever it changes. */
export function useLive(gameId: string) {
  const [, tick] = useState(0);
  useEffect(() => onLiveChange(() => tick((x) => x + 1)), []);
  return liveStatus(gameId);
}

const FULL = 'inset(0px 0px 0px 0px round 16px)';
/** The clip that shows only the part of the pop-up over the QR icon. */
function iconClip(d: HTMLElement, from?: DOMRect): string {
  const r = d.getBoundingClientRect();
  if (!from) return `inset(${r.height / 2}px ${r.width / 2}px ${r.height / 2}px ${r.width / 2}px round 16px)`;
  const ins = [from.top - r.top, r.right - from.right, r.bottom - from.bottom, from.left - r.left].map((v) => Math.max(0, Math.min(v, Math.max(r.width, r.height))));
  return `inset(${ins[0]}px ${ins[1]}px ${ins[2]}px ${ins[3]}px round 16px)`;
}

/** The QR of the link, large, in a pop-up that springs out of the QR icon. A tap anywhere or a swipe down fades it away. */
export function QrPopup({ link, from, onClose }: { link: string; from?: DOMRect; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const leaving = useRef(false);
  const svg = useMemo(() => {
    const q = qrcode(0, 'M');
    q.addData(link);
    q.make();
    return q.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
  }, [link]);
  useEffect(() => {
    const d = ref.current;
    if (!d || d.open) return;
    d.showModal();
    if (calm() || !d.animate) return;
    // out of the QR icon as a clip: the code keeps its size, the frame opens around it
    spring(d, (p) => ({ clipPath: mixClip(iconClip(d, from), FULL, Math.min(p, 1)), opacity: String(Math.min(1, p * 2)) }), SPRING.qr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const close = () => {
    const d = ref.current;
    if (leaving.current) return;
    if (!d?.animate || calm()) { onClose(); return; }
    leaving.current = true;
    const t = { duration: 220, easing: DRAWER, fill: 'forwards' as const };
    try { d.animate({ opacity: [1, 0] }, { ...t, pseudoElement: '::backdrop' }); } catch { /* an older phone: the backdrop does not fade */ }
    d.animate({ clipPath: [FULL, iconClip(d, from)], opacity: [1, 0] }, t).onfinish = onClose;
  };
  useSwipeDown(ref, close);
  return (
    <dialog ref={ref} className="felt-qr-pop" aria-label="QR code of the live link" onClick={close} onCancel={(e) => { e.preventDefault(); close(); }}>
      <div className="felt-qr" dangerouslySetInnerHTML={{ __html: svg }} role="img" aria-label="QR code of the live link" />
    </dialog>
  );
}

/** The live link of one game, on the page: password, copy, QR and the switch. The switch glows green when the link
    is on and red when it is off. Copy and QR exist only when it is on. The password is hidden until the eye is tapped. */
export function LiveRow({ g }: { g: Game }) {
  const live = useLive(g.id);
  const passKey = `felt-live-pass:${g.id}`;
  const [pass, setPassRaw] = useState(() => { try { return localStorage.getItem(passKey) ?? ''; } catch { return ''; } });
  const setPass = (v: string) => { setPassRaw(v); try { localStorage.setItem(passKey, v); } catch { /* private mode */ } };
  const [see, setSee] = useState(false);
  const [busy, setBusy] = useState(false);
  const [qrFrom, setQrFrom] = useState<DOMRect | null>(null);
  if (!liveAvailable()) return <div className="sat-flat sat-card sat-small">The live link is not set up in this app yet. See docs/FIREBASE-SETUP.md.</div>;

  const start = async () => {
    setBusy(true);
    try { cancelStop(g.id); if (!liveStatus(g.id).on) await startSharing(g.id, pass); }
    catch (e) { toast(`Live link did not start: ${(e as Error).message}`); }
    finally { setBusy(false); }
  };
  const stop = () => {
    requestStop(g.id);
    toast('Room closed.', { label: 'Undo', run: () => cancelStop(g.id), countdown: 5 });
    // a closed room forgets its password: after the 5 seconds to undo, switching on asks for one in the field on this page
    setTimeout(() => { if (!liveStatus(g.id).on) { setPassRaw(''); setSee(false); try { localStorage.removeItem(passKey); } catch { /* private mode */ } } }, 5300);
  };
  const copy = () => {
    if (!live.on) return;
    navigator.clipboard?.writeText(live.link).then(() => toast('Link copied.'), () => toast('Copy was blocked.'));
  };
  const state = busy ? 'wait' : !live.on ? 'off' : live.connected ? 'on' : 'wait';

  return (
    <section className="sat-stack" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)' }}>
      <div className={`sat-flat sat-card felt-liverow is-${state}`}>
        <button type="button" className={`felt-liveswitch is-${state}`} role="switch" aria-checked={live.on} aria-label="Live link" aria-disabled={busy} onClick={() => { if (busy) return; if (live.on) stop(); else start(); }}><Icon name="power" size={16} stroke={2.6} /></button>
        {/* off: a field to type in. On: the same space, censored, with the eye. */}
        <span className={`felt-livepass ${live.on ? 'is-set' : ''}`}>
          <span className="felt-livepass-fit">
            <input className="felt-livepass-in" type={see ? 'text' : 'password'} aria-label="Live link password" placeholder={live.on ? '' : 'Add password'} autoComplete="off" autoCapitalize="off" spellCheck={false}
              value={pass} disabled={live.on || busy} onChange={(e) => setPass(e.target.value)} />
          </span>
          {pass && <button type="button" className="felt-livepass-eye" aria-label={see ? 'Hide the password' : 'Show the password'} aria-pressed={see} onClick={() => setSee(!see)}><Icon name={see ? 'eye' : 'dark'} size={18} /></button>}
        </span>
        <Help k="sharing" />
        {live.on && (
          <span className="felt-liverow-end">
            <button type="button" className="sat-btn sat-btn--ghost sat-iconbtn" aria-label="Copy the link" onClick={copy}><Icon name="link" /></button>
            <button type="button" className="sat-btn sat-btn--ghost sat-iconbtn" aria-label="Show the QR code" onClick={(e) => setQrFrom(e.currentTarget.getBoundingClientRect())}><Icon name="qr" /></button>
          </span>
        )}
      </div>
      {qrFrom && live.on && <QrPopup link={live.link} from={qrFrom} onClose={() => setQrFrom(null)} />}
      {live.on && live.viewers.length > 0 && (
        <div className="sat-cluster felt-liveviewers" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)' }}>
          <Caption>Viewing now</Caption>
          {live.viewers.map((v, i) => <span key={v.id} className="sat-chip felt-viewer">{v.name ?? `Device ${i + 1}`}</span>)}
        </div>
      )}
      {live.on && live.flags.length > 0 && (
        <>
          <Caption>Flags from players</Caption>
          <div className="sat-glass-2 felt-list">
            {live.flags.map((f) => (
              <div key={f.id} className="felt-row">
                <span className="felt-row-main"><span className="felt-row-title">Hand {f.n}</span><span className="felt-row-sub">{f.text}</span></span>
                <button className="sat-btn sat-btn--sm" onClick={() => dismissFlag(g.id, f.id)}>Dismiss</button>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
