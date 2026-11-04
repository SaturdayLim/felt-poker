/* Phone feedback under the thumb. Android has navigator.vibrate. An iPhone does not: from iOS 18, a tap on a
   switch input gives one small tick, so a pattern there becomes one tick per pulse. Older iPhones stay silent. */

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
    let at = 0;
    list.forEach((ms, i) => {
      if (i % 2 === 0) window.setTimeout(tick, at);
      at += ms;
    });
  } catch { /* no haptics on this phone */ }
}
