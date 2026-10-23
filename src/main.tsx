import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './styles.css';

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
