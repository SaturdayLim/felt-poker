import { useEffect, useRef, useState } from 'react';
import { SPLASH_DEFAULT, useStore, usePlayerName, type BackupData } from '../store';
import { Caption, Header, Help, Icon, Toggle, num, toast, useCardLook } from '../components/ui';
import { DEFAULT_FACE, SUIT_NAME, SUIT_SYMBOL, lookColor } from '../lib/cards';
import { handsCsv, ledgerCsv, playersCsv } from '../report/csv';
import { shareFiles, textFile } from '../report/share';
import { CHANGELOG } from '../lib/changelog';
import { money } from '../lib/format';
import type { CardLook, Markers, Settings as S, SuitKey, ThemePref } from '../types';

const THEMES: { k: ThemePref; label: string; icon: string }[] = [
  { k: 'auto', label: 'Auto', icon: 'phone' },
  { k: 'light', label: 'Light', icon: 'sun' },
  { k: 'dark', label: 'Dark', icon: 'moon' },
];
const SPLASH: { ms: number; label: string }[] = [
  { ms: 0, label: 'Off' },
  { ms: 1800, label: 'Short' },
  { ms: SPLASH_DEFAULT, label: 'Standard' },
  { ms: 4500, label: 'Long' },
];
const count = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
const gap = (n: number) => ({ ['--sat-gap' as string]: `var(--sat-space-${n})` });

export default function Settings() {
  const settings = useStore((s) => s.settings);
  const update = useStore((s) => s.updateSettings);
  const games = useStore((s) => s.games);
  const players = useStore((s) => s.players);
  const exportBackup = useStore((s) => s.exportBackup);
  const importBackup = useStore((s) => s.importBackup);
  const eraseAll = useStore((s) => s.eraseAll);
  const name = usePlayerName();
  const fileRef = useRef<HTMLInputElement>(null);
  const [usage, setUsage] = useState<string>('');
  const [erase, setErase] = useState(0);

  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => setUsage(`${((e.usage ?? 0) / 1024).toFixed(0)} KB`)).catch(() => {});
  }, [games]);

  const numField = (id: string, label: string, key: keyof S, hint?: string, tip?: 'unitValue') => (
    <div className="sat-field">
      <label htmlFor={id}>{label}{tip && <> <Help k={tip} /></>}</label>
      <input id={id} className="sat-input sat-num" inputMode="decimal" defaultValue={String(settings[key])}
        onBlur={(e) => { const v = num(e.target.value); if (v !== null && v >= 0) update({ [key]: v } as Partial<S>); else toast('Use numbers only (e.g. 200).'); }} />
      {hint && <span className="sat-hint">{hint}</span>}
    </div>
  );

  const backup = async () => {
    const data = exportBackup();
    const f = textFile(JSON.stringify(data), `felt-backup-${new Date().toLocaleDateString('en-CA')}.json`, 'application/json');
    const r = await shareFiles([f], 'Felt backup');
    if (r === 'downloaded') toast('Backup exported to Downloads');
    else if (r === 'shared') toast('Backup shared');
  };
  /** Ask the service worker for a new build, then open the live site again so the phone downloads it.
      Data stays: it lives in this origin's storage, which the live site shares. */
  const checkUpdate = async () => {
    const site = new URL('../', location.href);
    try {
      toast('Checking for update');
      await fetch(site.href, { cache: 'no-store', method: 'HEAD' });
      const reg = await navigator.serviceWorker?.getRegistration();
      await reg?.update();
    } catch {
      toast('No connection. Connect to the internet and try again.');
      return;
    }
    site.searchParams.set('u', String(Date.now()));
    location.replace(site.href);
  };

  const restore = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as BackupData;
      if (data.app !== 'felt' || !Array.isArray(data.games) || !Array.isArray(data.players)) throw new Error('not a Felt backup');
      importBackup(data);
      toast(`Restored ${count(data.games.length, 'game')} and ${count(data.players.length, 'player')}`);
    } catch (e) {
      toast(`Backup unable to load (${(e as Error).message}). Pick a felt-backup file.`);
    }
  };
  const exportAllCsv = async () => {
    const closed = games.filter((g) => g.status === 'closed').sort((a, b) => a.startedAt - b.startedAt);
    const d = new Date().toLocaleDateString('en-CA');
    const r = await shareFiles([
      textFile(playersCsv(closed, name), `felt-players-${d}.csv`),
      textFile(handsCsv(closed, name), `felt-hands-${d}.csv`),
      textFile(ledgerCsv(closed, name), `felt-ledger-${d}.csv`),
    ], 'Felt data');
    if (r === 'downloaded') toast('3 CSV files exported to Downloads');
  };
  const setMarker = (k: keyof Markers, v: boolean) => update({ markers: { ...settings.markers, [k]: v } });

  return (
    <div className="felt-page">
      <Header title="Settings" />
      <div className="sat-stack" style={gap(6)}>
        <section className="sat-stack" style={gap(2)}>
          <Caption>Theme</Caption>
          <div className="sat-seg sat-seg--block" role="radiogroup" aria-label="Theme">
            {THEMES.map((t) => (
              <button key={t.k} role="radio" aria-checked={settings.theme === t.k} onClick={() => update({ theme: t.k })}><Icon name={t.icon} /> {t.label}</button>
            ))}
          </div>
          <p className="sat-small sat-muted">Auto follows the phone setting. Saved on this phone.</p>
        </section>

        <section className="sat-stack" style={gap(2)}>
          <Caption tip="splash">Opening screen</Caption>
          <div className="sat-seg sat-seg--block" role="radiogroup" aria-label="Opening screen">
            {SPLASH.map((o) => (
              <button key={o.ms} role="radio" aria-checked={settings.splashMs === o.ms} onClick={() => update({ splashMs: o.ms })}>{o.label}</button>
            ))}
          </div>
          <p className="sat-small sat-muted">{settings.splashMs ? `Shows for ${(settings.splashMs / 1000).toFixed(1)} seconds when Felt opens. Tap it to skip.` : 'Felt opens straight into the app.'}</p>
        </section>

        <section className="sat-glass sat-card sat-stack">
          <div className="sat-split"><h2 className="sat-h2">New games</h2><Help k="units" /></div>
          <div className="sat-grid" style={{ ['--sat-min' as string]: '120px', ...gap(3) }}>
            {numField('s-sb', 'SB (chips)', 'sb')}
            {numField('s-bb', 'BB (chips)', 'bb')}
            <div className="sat-field">
              <label htmlFor="s-cur">Currency</label>
              <input id="s-cur" className="sat-input" defaultValue={settings.currency} onBlur={(e) => update({ currency: e.target.value.trim() || 'S$' })} />
              <span className="sat-hint">Symbol (e.g. S$)</span>
            </div>
            {numField('s-uv', `Multiplier (${settings.currency})`, 'unitValue', 'Per unit (e.g. 0.1)', 'unitValue')}
            {numField('s-bi', 'Buy-in (chips)', 'defaultBuyIn', `${money(settings.defaultBuyIn * settings.unitValue, settings.currency)}, ${(settings.defaultBuyIn / (settings.bb || 1)).toFixed(0)} BB`)}
            {numField('s-te', `Tournament entry (${settings.currency})`, 'tournamentBuyIn')}
            {numField('s-ss', 'Starting stack (chips)', 'startingStack')}
          </div>
        </section>

        <section className="sat-glass sat-card sat-stack">
          <h2 className="sat-h2">Hands</h2>
          <div className="sat-stack" style={gap(2)}>
            <Caption tip="me">You</Caption>
            <div className="sat-cluster" style={gap(2)}>
              <button className="sat-chip" aria-pressed={!settings.me} onClick={() => update({ me: undefined })}>Nobody</button>
              {players.filter((p) => !p.archived || p.id === settings.me).map((p) => <button key={p.id} className="sat-chip" aria-pressed={settings.me === p.id} onClick={() => update({ me: p.id })}>{p.name}</button>)}
            </div>
          </div>
          <div className="sat-switch-row">
            <span><span style={{ display: 'block' }}>Track the button</span><span className="sat-small sat-muted">Moves one seat clockwise after each hand. Sets who gets odd chips in a split pot.</span></span>
            <Toggle on={settings.markers.dealer} onChange={(v) => setMarker('dealer', v)} label="Track the button" />
          </div>
        </section>

        <section className="sat-glass sat-card sat-stack">
          <div className="sat-split"><h2 className="sat-h2">Data</h2><Help k="backup" /></div>
          <p className="sat-small sat-muted">{count(games.length, 'game')} and {count(players.length, 'player')} stored on this phone{usage ? ` (${usage})` : ''}. Nothing is sent online unless you turn on a live link.</p>
          <div className="sat-grid" style={{ ['--sat-min' as string]: '130px', ...gap(2) }}>
            <button className="sat-btn sat-btn--primary" onClick={backup}><Icon name="download" /> Back up (1 file)</button>
            <button className="sat-btn" onClick={() => fileRef.current?.click()}><Icon name="upload" /> Restore</button>
          </div>
          <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) restore(f); e.target.value = ''; }} />
          <button className="sat-btn" onClick={exportAllCsv}><Icon name="file" /> Download all games (3 CSV files)</button>
          <button className="sat-btn sat-btn--ghost" style={{ color: 'var(--sat-neg)' }} onClick={() => {
            if (erase < 2) { setErase(erase + 1); toast(erase === 0 ? 'Tap 2 more times to erase all data' : 'Tap once more to erase all data for good'); return; }
            eraseAll();
            setErase(0);
            toast('All data erased from this phone');
          }}><Icon name="trash" /> {erase === 0 ? 'Erase all data' : erase === 1 ? 'Tap again to confirm' : 'Erase for good'}</button>
        </section>

        <section className="sat-glass sat-card sat-stack">
          <CardLookEditor />
        </section>

        <section className="sat-glass sat-card sat-stack">
          <h2 className="sat-h2">App update</h2>
          <p className="sat-small sat-muted">Version {__APP_VERSION__}, built {__BUILD_DATE__}.</p>
          <button className="sat-btn" onClick={checkUpdate}><Icon name="refresh" /> Check for update</button>
          <details>
            <summary className="sat-small" style={{ cursor: 'pointer' }}>Version history</summary>
            <div className="sat-stack" style={{ ...gap(3), marginTop: 'var(--sat-space-3)' }}>
              {CHANGELOG.map((c) => (
                <div key={c.version}>
                  <b>{c.version}</b> <span className="sat-small sat-muted">{c.date}</span>
                  <ul className="sat-small" style={{ margin: '4px 0 0', paddingLeft: 20 }}>{c.notes.map((n) => <li key={n}>{n}</li>)}</ul>
                </div>
              ))}
            </div>
          </details>
        </section>

        <section className="sat-flat sat-card sat-stack" style={gap(3)}>
          <h2 className="sat-h3">Install on iPhone (1 minute)</h2>
          <ol className="sat-small" style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 4 }}>
            <li>Open this page in Safari.</li>
            <li>Tap <b>Share</b>.</li>
            <li>Tap <b>Add to Home Screen</b>.</li>
            <li>Open Felt from the home screen. It works offline after the first load.</li>
          </ol>
        </section>
      </div>
    </div>
  );
}

/** Suit colours and the order of the suit rows in the card picker. Kept on this phone. */
function CardLookEditor() {
  const look = useCardLook();
  const update = useStore((s) => s.updateSettings);
  const save = (next: CardLook) => update({ cards: next });
  const [drag, setDrag] = useState<{ s: SuitKey; y: number; dy: number; h: number } | null>(null);
  const isDefault = !look.custom;

  const grip = (s: SuitKey) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      const row = e.currentTarget.closest('.felt-suit-row') as HTMLElement;
      setDrag({ s, y: e.clientY, dy: 0, h: row.offsetHeight + 6 });
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (drag?.s !== s) return;
      let dy = e.clientY - drag.y, y = drag.y;
      const i = look.order.indexOf(s), to = dy > drag.h / 2 ? i + 1 : dy < -drag.h / 2 ? i - 1 : i;
      if (to !== i && to >= 0 && to < look.order.length) {
        const order = [...look.order];
        order.splice(i, 1);
        order.splice(to, 0, s);
        save({ ...look, order });
        y += (to - i) * drag.h;
        dy = e.clientY - y;
      }
      setDrag({ ...drag, y, dy });
    },
    onPointerUp: () => setDrag(null),
    onPointerCancel: () => setDrag(null),
    onKeyDown: (e: React.KeyboardEvent) => {
      const d = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0, i = look.order.indexOf(s);
      if (!d || !look.order[i + d]) return;
      e.preventDefault();
      const order = [...look.order];
      [order[i], order[i + d]] = [order[i + d], order[i]];
      save({ ...look, order });
    },
  });

  return (
    <>
      <div className="sat-split">
        <span className="sat-cluster" style={{ ['--sat-gap' as string]: 'var(--sat-space-1)' }}><h2 className="sat-h2">Cards</h2><Help k="cardLook" /></span>
        <label className="felt-look-toggle">
          <span className="sat-small">{isDefault ? 'Default' : 'Custom'}</span>
          <button type="button" role="switch" aria-checked={isDefault} aria-label="Default card colours" className="felt-look-switch" onClick={() => save({ ...look, custom: isDefault })}>
            <span className="felt-look-thumb"><i className="is-rainbow" /><i className="is-default" /></span>
          </button>
        </label>
      </div>
      <div className="felt-suit-list">
        {look.order.map((s: SuitKey) => (
          <div key={s} className={`felt-suit-row ${drag?.s === s ? 'is-dragging' : ''}`} style={drag?.s === s ? { transform: `translateY(${drag.dy}px)` } : undefined}>
            <button type="button" className="felt-suit-grip" aria-label={`Drag ${SUIT_NAME[s]} to change its row`} {...grip(s)}>
              <svg viewBox="0 0 16 12" width="16" height="12" aria-hidden="true"><path d="M1 1h14M1 6h14M1 11h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            </button>
            <span className="felt-suit-mark" style={{ color: lookColor(look, s) }} aria-hidden="true">{SUIT_SYMBOL[s]}</span>
            <span className="felt-row-title felt-grow">{SUIT_NAME[s]}</span>
            <div className={`felt-suit-custom ${isDefault ? '' : 'is-open'}`} aria-hidden={isDefault}>
              <SuitColor name={SUIT_NAME[s]} value={lookColor(look, s)} off={isDefault} onChange={(hex) => save({ ...look, colors: { ...look.colors, [s]: hex } })} />
            </div>
          </div>
        ))}
        <div className="felt-suit-row">
          <span className="felt-suit-grip" aria-hidden="true" />
          <span className="felt-suit-mark" aria-hidden="true" />
          <span className="felt-row-title felt-grow">Background</span>
          <div className={`felt-suit-custom ${isDefault ? '' : 'is-open'}`} aria-hidden={isDefault}>
            <SuitColor name="Background" value={look.bg ?? DEFAULT_FACE} off={isDefault} onChange={(hex) => save({ ...look, bg: hex })} />
          </div>
        </div>
      </div>
    </>
  );
}

/** Hex box and eyedropper for one colour. The box saves on each valid code. The inputs stay mounted while the
    colour changes: a remount would close the phone's colour picker in the middle of a slider drag. */
function SuitColor({ name, value, off, onChange }: { name: string; value: string; off: boolean; onChange: (hex: string) => void }) {
  const full = (h: string) => (h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h).toUpperCase();
  const [text, setText] = useState(full(value));
  useEffect(() => { setText(full(value)); }, [value]);
  return (
    <>
      <input className="sat-input felt-suit-hex sat-num" aria-label={`${name} colour as a hex code`} value={text} maxLength={7} autoComplete="off" autoCapitalize="characters" spellCheck={false} tabIndex={off ? -1 : 0}
        onChange={(e) => {
          const v = e.target.value.trim();
          setText(v);
          const h = v.startsWith('#') ? v : `#${v}`;
          if (/^#[0-9a-fA-F]{6}$/.test(h)) onChange(h.toUpperCase());
        }} />
      <label className="felt-suit-drop" aria-label={`Pick a colour for ${name}`}>
        <Icon name="eyedrop" size={18} />
        <input type="color" value={full(value).toLowerCase()} tabIndex={off ? -1 : 0} onChange={(e) => onChange(e.target.value.toUpperCase())} />
      </label>
    </>
  );
}
