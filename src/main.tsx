import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './saturday/css/tokens.css';
import './saturday/css/skin-felt.css';
import './saturday/css/saturday.css';
import './styles.css';
import './css/nav.css';
import './css/motion.css';
import './css/players.css';
import './css/stats.css';
import './css/chrome.css';
import './css/review.css';
import './css/recorder.css';
import './css/viewer.css';
import './css/report.css';
import './css/settings.css';
import { installMotion, installPresses } from './lib/motion';

installMotion();
installPresses();
// a long press opens no menu on buttons, rows or images (Android shows one even with no text selected); fields keep theirs
document.addEventListener('contextmenu', (e) => {
  if (!(e.target as Element | null)?.closest?.('input, textarea, [contenteditable="true"], .felt-selectable')) e.preventDefault();
});

registerSW({ immediate: true });
// Ask the browser to keep our data even under storage pressure.
navigator.storage?.persist?.().catch(() => {});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

if (import.meta.env.DEV) {
  // handy for poking at state from the browser console during development
  import('./store').then(({ useStore }) => { (window as unknown as { __store: unknown }).__store = useStore; });
}
