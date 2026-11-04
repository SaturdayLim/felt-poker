/* Phone feedback under the thumb. Android has navigator.vibrate. An iPhone does not: from iOS 18, a click on a
   switch input gives one small tick. iOS allows the tick only inside a press, or soon after one, so the first pulse
   runs in the same call and never from a timer. Older iPhones stay silent. */

// the clicks that make a tick are not presses: nothing else in the app hears them
if (typeof window !== 'undefined') {
  window.addEventListener('click', (e) => {
    if ((e.target as Element | null)?.closest?.('head')) e.stopImmediatePropagation();
  }, true);
}

function tick() {
  const label = document.createElement('label');
  label.ariaHidden = 'true';
  label.style.display = 'none';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  label.appendChild(input);
  document.head.appendChild(label);
  label.click();
  label.remove();
}

/** One pulse (ms), or a list of pulses and gaps. */
export function haptic(pattern: number | number[] = 10) {
  if (navigator.vibrate?.(pattern)) return;
  try {
    const list = Array.isArray(pattern) ? pattern : [pattern];
    tick();
    let at = 0;
    list.forEach((ms, i) => {
      if (i % 2 === 0 && i > 0) window.setTimeout(tick, at);
      at += ms;
    });
  } catch { /* no haptics on this phone */ }
}
