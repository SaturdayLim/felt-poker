import { useEffect, useMemo, useState } from 'react';
import qrcode from 'qrcode-generator';
import type { Game } from '../types';
import { Caption, Help, Icon, Sheet, toast } from './ui';
import { cancelStop, dismissFlag, liveAvailable, liveStatus, onLiveChange, requestStop, startSharing } from '../live/host';

/** Re-reads the live state of a game whenever it changes. */
export function useLive(gameId: string) {
  const [, tick] = useState(0);
  useEffect(() => onLiveChange(() => tick((x) => x + 1)), []);
  return liveStatus(gameId);
}

/** Green: live. Amber: on, with no connection now. Red: off. */
export function SharingLamp({ state }: { state: 'on' | 'wait' | 'off' }) {
  return <span className={`felt-share-lamp is-${state}`} aria-hidden="true" />;
}
export const lampState = (live: ReturnType<typeof liveStatus>) => (!live.on ? 'off' : live.connected ? 'on' : 'wait');
const LAMP_TEXT = { on: 'Live', wait: 'Waiting for a connection', off: 'Off' };

/** Host controls for the live link of one game: the switch and status, lock, copy the link, show a QR, read flags. */
export function LiveSheet({ g, onClose }: { g: Game; onClose: () => void }) {
  const live = useLive(g.id);
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const available = liveAvailable();
  const lamp = lampState(live);

  const start = async () => {
    setBusy(true);
    try { cancelStop(g.id); if (!liveStatus(g.id).on) await startSharing(g.id, pass); setPass(''); }
    catch (e) { toast(`Live link did not start: ${(e as Error).message}`); }
    finally { setBusy(false); }
  };
  const stop = () => {
    requestStop(g.id);
    toast('Sharing off. The room goes in 5 seconds.', { label: 'Undo', run: () => cancelStop(g.id) });
  };
  const copy = () => {
    if (!live.on) return;
    navigator.clipboard?.writeText(live.link).then(() => toast('Link copied.'), () => toast('Copy was blocked. Select the link and copy it.'));
  };
  const qr = useMemo(() => {
    if (!live.on) return '';
    const q = qrcode(0, 'M');
    q.addData(live.link);
    q.make();
    return q.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
  }, [live.on && live.link]);

  return (
    <Sheet open onClose={onClose} title="Live link">
      {!available && <div className="sat-flat sat-card sat-small">The live link is not set up in this app yet. See docs/FIREBASE-SETUP.md.</div>}

      {available && (
        <div className="sat-switch-row">
          <span className="sat-cluster" style={{ ['--sat-gap' as string]: 'var(--sat-space-2)' }}>
            <span>Sharing status</span><Help k="sharing" />
            <SharingLamp state={lamp} /><b className="sat-small">{busy ? 'Starting' : LAMP_TEXT[lamp]}</b>
          </span>
          <button type="button" className="sat-switch" role="switch" aria-checked={live.on} aria-label="Sharing" aria-disabled={busy} onClick={() => { if (busy) return; if (live.on) stop(); else start(); }} />
        </div>
      )}

      {!live.on && available && (
        <div className="sat-field">
          <label htmlFor="lp">Join passphrase (optional)</label>
          <input id="lp" className="sat-input" autoComplete="off" autoCapitalize="off" placeholder="Leave empty for an open link" value={pass} onChange={(e) => setPass(e.target.value)} />
        </div>
      )}

      {live.on && (
        <>
          <div className="felt-qr" dangerouslySetInnerHTML={{ __html: qr }} aria-label="QR code of the live link" role="img" />
          <p className="sat-small sat-mono" style={{ wordBreak: 'break-all' }}>{live.link}</p>
          <button className="sat-btn sat-btn--block" onClick={copy}><Icon name="file" /> Copy link</button>
          {live.locked && <p className="sat-small sat-muted">Locked: the link does not hold the key. Tell players the passphrase.</p>}

          {live.flags.length > 0 && (
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
        </>
      )}
    </Sheet>
  );
}
