import { useEffect, useMemo, useRef, useState } from 'react';
import qrcode from 'qrcode-generator';
import type { Game } from '../types';
import { Caption, Help, Icon, toast, useSwipeDown } from './ui';
import { cancelStop, dismissFlag, liveAvailable, liveStatus, onLiveChange, requestStop, startSharing } from '../live/host';

/** Re-reads the live state of a game whenever it changes. */
export function useLive(gameId: string) {
  const [, tick] = useState(0);
  useEffect(() => onLiveChange(() => tick((x) => x + 1)), []);
  return liveStatus(gameId);
}

/** The QR of the link, large, in a pop-up that grows out of the QR button. A tap anywhere or a swipe down slides it away. */
export function QrPopup({ link, onClose }: { link: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const leaving = useRef(false);
  const svg = useMemo(() => {
    const q = qrcode(0, 'M');
    q.addData(link);
    q.make();
    return q.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
  }, [link]);
  useEffect(() => { const d = ref.current; if (d && !d.open) d.showModal(); }, []);
  const close = () => {
    const d = ref.current;
    if (leaving.current) return;
    if (!d?.animate || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { onClose(); return; }
    leaving.current = true;
    const t = { duration: 240, easing: 'cubic-bezier(0.32, 0.72, 0, 1)', fill: 'forwards' as const };
    try { d.animate({ opacity: [1, 0] }, { ...t, pseudoElement: '::backdrop' }); } catch { /* an older phone: the backdrop does not fade */ }
    d.animate({ translate: [d.style.translate || '0 0', '0 100vh'] }, t).onfinish = onClose;
  };
  useSwipeDown(ref, close);
  return (
    <dialog ref={ref} className="felt-qr-pop" aria-label="QR code of the live link" onClick={close} onCancel={(e) => { e.preventDefault(); close(); }}>
      <div className="felt-qr" dangerouslySetInnerHTML={{ __html: svg }} role="img" aria-label="QR code of the live link" />
    </dialog>
  );
}

/** The live link of one game, on the page: password, copy, QR and the switch. The switch glows green when the link
    is on and red when it is off. Copy and QR work only when it is on. The password is hidden until the eye is tapped. */
export function LiveRow({ g }: { g: Game }) {
  const live = useLive(g.id);
  const passKey = `felt-live-pass:${g.id}`;
  const [pass, setPassRaw] = useState(() => { try { return localStorage.getItem(passKey) ?? ''; } catch { return ''; } });
  const setPass = (v: string) => { setPassRaw(v); try { localStorage.setItem(passKey, v); } catch { /* private mode */ } };
  const [see, setSee] = useState(false);
  const [busy, setBusy] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  if (!liveAvailable()) return <div className="sat-flat sat-card sat-small">The live link is not set up in this app yet. See docs/FIREBASE-SETUP.md.</div>;

  const start = async () => {
    setBusy(true);
    try { cancelStop(g.id); if (!liveStatus(g.id).on) await startSharing(g.id, pass); }
    catch (e) { toast(`Live link did not start: ${(e as Error).message}`); }
    finally { setBusy(false); }
  };
  const stop = () => {
    requestStop(g.id);
    toast('Sharing off. The room goes in 5 seconds.', { label: 'Undo', run: () => cancelStop(g.id) });
  };
  const copy = () => {
    if (!live.on) return;
    navigator.clipboard?.writeText(live.link).then(() => toast('Link copied.'), () => toast('Copy was blocked.'));
  };
  const state = busy ? 'wait' : !live.on ? 'off' : live.connected ? 'on' : 'wait';

  return (
    <section className="sat-stack" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)' }}>
      <div className="sat-flat sat-card felt-liverow">
        <button type="button" className={`felt-liveswitch is-${state}`} role="switch" aria-checked={live.on} aria-label="Live link" aria-disabled={busy} onClick={() => { if (busy) return; if (live.on) stop(); else start(); }}><Icon name="power" size={16} stroke={2.6} /></button>
        {/* off: a field to type in. On with no password: plain text, because there is nothing to type */}
        {live.on && !pass ? <span className="felt-livepass-none">No password</span> : (
          <span className={`felt-livepass ${live.on ? 'is-set' : ''}`}>
            <input className="felt-livepass-in" type={see ? 'text' : 'password'} aria-label="Live link password" placeholder="Add password" autoComplete="off" autoCapitalize="off" spellCheck={false}
              value={pass} disabled={live.on || busy} onChange={(e) => setPass(e.target.value)} />
            {pass && <button type="button" className="felt-livepass-eye" aria-label={see ? 'Hide the password' : 'Show the password'} aria-pressed={see} onClick={() => setSee(!see)}><Icon name={see ? 'eye' : 'dark'} size={18} /></button>}
          </span>
        )}
        <Help k="sharing" />
        <span className="felt-liverow-end">
          <button type="button" className="sat-btn sat-btn--ghost sat-iconbtn" aria-label="Copy the link" aria-disabled={!live.on} disabled={!live.on} onClick={copy}><Icon name="link" /></button>
          <button type="button" className="sat-btn sat-btn--ghost sat-iconbtn" aria-label="Show the QR code" aria-disabled={!live.on} disabled={!live.on} onClick={() => setQrOpen(true)}><Icon name="qr" /></button>
        </span>
      </div>
      {qrOpen && live.on && <QrPopup link={live.link} onClose={() => setQrOpen(false)} />}
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
