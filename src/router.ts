import { useEffect, useState } from 'react';

export function useRoute(): string[] {
  const read = () => (window.location.hash.replace(/^#\/?/, '') || '').split('/').filter(Boolean);
  const [parts, setParts] = useState(read);
  useEffect(() => {
    const on = () => { setParts(read()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return parts;
}

export function go(path: string, replace = false) {
  const h = '#/' + path.replace(/^\/+/, '');
  if (replace) window.location.replace(h);
  else window.location.hash = h;
}

export function back(fallback = '') {
  if (window.history.length > 1) window.history.back();
  else go(fallback, true);
}
