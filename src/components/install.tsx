import { useEffect, useState } from 'react';
import { Info, Sheet } from './ui';

/* Install help. Felt opened in a browser tab on a phone that can run it gets one pop-up that says how to install it.
   The version limits are the ones of app/index.html: iOS 16.2 or later in Safari, or Chrome 111 or later on Android. */

type Prompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferred: Prompt | null = null;
const SEEN_KEY = 'felt-install-seen';
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as Prompt; listeners.forEach((f) => f()); });
  window.addEventListener('appinstalled', () => { deferred = null; listeners.forEach((f) => f()); });
}

export type Platform = 'ios' | 'android' | null;

/** The phone Felt can install on, from the browser name and version. Null when it is neither. */
export function installPlatform(ua = navigator.userAgent): Platform {
  const ios = /iP(hone|ad|od)/.test(ua);
  if (ios) {
    const m = /OS (\d+)[_.](\d+)/.exec(ua);
    const ok = m ? +m[1] > 16 || (+m[1] === 16 && +m[2] >= 2) : false;
    return ok && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua) ? 'ios' : null;
  }
  if (/Android/.test(ua)) {
    const m = /Chrome\/(\d+)/.exec(ua);
    return m && +m[1] >= 111 && !/EdgA|OPR|SamsungBrowser|Firefox/.test(ua) ? 'android' : null;
  }
  return null;
}

/** Felt runs as an installed app (home screen), not in a browser tab. */
export const isStandalone = () => !!window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

const STEPS: Record<'ios' | 'android', string[]> = {
  ios: ['Open Felt in Safari.', 'Tap the Share button.', 'Tap Add to Home Screen.', 'Tap Add.', 'Open Felt from the home screen.'],
  android: ['Open Felt in Chrome.', 'Tap the menu button (three dots).', 'Tap Install app.', 'Tap Install.', 'Open Felt from the home screen.'],
};

function useDeferred() {
  const [, tick] = useState(0);
  useEffect(() => { const f = () => tick((n) => n + 1); listeners.add(f); return () => { listeners.delete(f); }; }, []);
  return deferred;
}

const run = async (p: Prompt) => { deferred = null; listeners.forEach((f) => f()); try { await p.prompt(); await p.userChoice; } catch { /* the phone refused */ } };

function Steps({ platform }: { platform: 'ios' | 'android' }) {
  return (
    <ol className="felt-install-steps">
      {STEPS[platform].map((s) => <li key={s}>{s}</li>)}
    </ol>
  );
}

/** The one-time pop-up. It shows once per phone: any way of closing it is remembered. */
export function InstallPopup() {
  const [open, setOpen] = useState(false);
  const platform = installPlatform();
  const prompt = useDeferred();
  useEffect(() => {
    if (!platform || isStandalone()) return;
    try { if (localStorage.getItem(SEEN_KEY)) return; } catch { /* private mode: it shows each time */ }
    const t = window.setTimeout(() => setOpen(true), 2500);
    return () => window.clearTimeout(t);
  }, [platform]);
  if (!platform) return null;
  const close = () => { setOpen(false); try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* private mode */ } };
  return (
    <Sheet open={open} onClose={close} title="Install Felt">
      <p className="sat-small">Felt opens faster and works offline when it is on the home screen.</p>
      {platform === 'android' && prompt
        ? <button type="button" className="sat-btn sat-btn--primary felt-install-btn" onClick={() => { void run(prompt); close(); }}>Install</button>
        : <Steps platform={platform} />}
    </Sheet>
  );
}

/** The same steps as an info tip, for Settings, General. It lists the phone's own steps first. */
export function InstallTip() {
  const own = installPlatform();
  const order: ('ios' | 'android')[] = own === 'android' ? ['android', 'ios'] : ['ios', 'android'];
  return (
    <Info title="How to install">
      {order.map((k) => (
        <span key={k} className="felt-tip-line"><b>{k === 'ios' ? 'iPhone (Safari)' : 'Android (Chrome)'}:</b> {STEPS[k].join(' ')}</span>
      ))}
    </Info>
  );
}

/** The one-tap Install button of Chrome, when the phone offers it. */
export function InstallButton() {
  const prompt = useDeferred();
  if (!prompt) return null;
  return <button type="button" className="sat-btn sat-btn--sm" onClick={() => void run(prompt)}>Install</button>;
}
