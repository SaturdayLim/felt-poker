/* Join a game from the app: the camera fills the screen, and the paste box and the way back to hosting float over it.
   iPhones have no built-in QR reader for web pages, so frames go to jsQR. It loads only here. */
import { useEffect, useRef, useState } from 'react';
import { Icon, toast } from '../components/ui';
import { go } from '../router';
import { haptic } from '../lib/haptics';

const HOST_FLAG = 'felt-host';
export const wantsHost = () => { try { return localStorage.getItem(HOST_FLAG) === '1'; } catch { return true; } };

/** The join route inside a pasted or scanned link, or null. */
export function joinRoute(text: string): string | null {
  const m = /#\/(join\/[\w-]+(?:\/[\w-]+)?)/.exec(text.trim());
  return m ? m[1] : null;
}

export default function JoinScan() {
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<'wait' | 'on' | 'off'>('wait');
  const [text, setText] = useState('');
  const [torch, setTorch] = useState<boolean | null>(null);
  const track = useRef<MediaStreamTrack | null>(null);

  const open = (t: string) => {
    const r = joinRoute(t);
    if (!r) { toast('This is not a Felt game link.'); return; }
    haptic(20);
    go(r);
  };

  useEffect(() => {
    let live = true;
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (!live) { stream.getTracks().forEach((t) => t.stop()); return; }
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
        setState('on');
        track.current = stream.getVideoTracks()[0];
        if ((track.current.getCapabilities?.() as { torch?: boolean } | undefined)?.torch) setTorch(false);
        const { default: jsQR } = await import('jsqr');
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        const scan = () => {
          if (!live) return;
          if (v.videoWidth) {
            // the middle square, at most 480 pixels: enough for a QR that fills the frame, and quick on older phones
            const side = Math.min(v.videoWidth, v.videoHeight), size = Math.min(side, 480);
            canvas.width = size; canvas.height = size;
            ctx.drawImage(v, (v.videoWidth - side) / 2, (v.videoHeight - side) / 2, side, side, 0, 0, size, size);
            const hit = jsQR(ctx.getImageData(0, 0, size, size).data, size, size, { inversionAttempts: 'dontInvert' });
            if (hit && joinRoute(hit.data)) { open(hit.data); return; }
          }
          timer = window.setTimeout(scan, 160);
        };
        scan();
      } catch { if (live) setState('off'); }
    })();
    return () => { live = false; window.clearTimeout(timer); stream?.getTracks().forEach((t) => t.stop()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const paste = async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (t) { setText(t); open(t); } else toast('The clipboard is empty.');
    } catch { toast('Paste was blocked. Press and hold the box to paste.'); }
  };
  const flip = async () => {
    const on = !torch;
    try { await track.current?.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] }); setTorch(on); } catch { /* the phone refused */ }
  };

  return (
    <div className="felt-scan">
      <video ref={video} className="felt-scan-video" playsInline muted />
      <div className="felt-scan-top sat-glass-2">
        <div className="felt-grow">
          <h1 className="felt-scan-title">Join a game</h1>
          <small>{state === 'off' ? 'Camera is off. Allow the camera, or paste the link.' : 'Point the camera at the QR on the host phone'}</small>
        </div>
        {torch !== null && <button type="button" className="sat-btn sat-btn--ghost sat-iconbtn" aria-label="Flashlight" aria-pressed={torch} onClick={flip}><Icon name="bolt" /></button>}
      </div>
      <div className="felt-scan-frame" aria-hidden="true"><i /><i /><i /><i /></div>
      <div className="felt-scan-dock sat-glass-2">
        <div className="felt-scan-paste">
          <input className="sat-input" aria-label="Paste the link" placeholder="Paste the link" value={text} autoComplete="off" autoCapitalize="off" spellCheck={false}
            onChange={(e) => { setText(e.target.value); if (joinRoute(e.target.value)) open(e.target.value); }} onKeyDown={(e) => e.key === 'Enter' && text && open(text)} />
          <button type="button" className="sat-btn sat-btn--primary" onClick={paste}>Paste</button>
        </div>
        <button type="button" className="sat-btn sat-btn--ghost sat-btn--block" onClick={() => { try { localStorage.setItem(HOST_FLAG, '1'); } catch { /* private mode */ } go(''); window.dispatchEvent(new HashChangeEvent('hashchange')); }}>Host a game instead</button>
      </div>
    </div>
  );
}
