import { useEffect, useRef, useState } from 'react';
import { useStore, usePlayerName, type BackupData } from '../store';
import { Caption, Header, Help, Icon, Toggle, num, toast } from '../components/ui';
import { handsCsv, ledgerCsv, playersCsv } from '../report/csv';
import { shareFiles, textFile } from '../report/share';
import { money } from '../lib/format';
import type { Markers, Settings as S, ThemePref } from '../types';

const THEMES: { k: ThemePref; label: string; icon: string }[] = [
  { k: 'auto', label: 'Auto', icon: 'phone' },
  { k: 'light', label: 'Light', icon: 'sun' },
  { k: 'dark', label: 'Dark', icon: 'moon' },
];
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
  const restore = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as BackupData;
      if (data.app !== 'felt' || !Array.isArray(data.games) || !Array.isArray(data.players)) throw new Error('not a Felt backup');
      importBackup(data);
      toast(`Restored ${data.games.length} games and ${data.players.length} players`);
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

        <section className="sat-glass sat-card sat-stack">
          <div className="sat-split"><h2 className="sat-h2">New games</h2><Help k="units" /></div>
          <div className="sat-grid" style={{ ['--sat-min' as string]: '120px', ...gap(3) }}>
            {numField('s-sb', 'Small blind (units)', 'sb')}
            {numField('s-bb', 'Big blind (units)', 'bb')}
            <div className="sat-field">
              <label htmlFor="s-cur">Currency</label>
              <input id="s-cur" className="sat-input" defaultValue={settings.currency} onBlur={(e) => update({ currency: e.target.value.trim() || 'S$' })} />
              <span className="sat-hint">Symbol (e.g. S$)</span>
            </div>
            {numField('s-uv', `Multiplier (${settings.currency})`, 'unitValue', 'Per unit (e.g. 0.1)', 'unitValue')}
            {numField('s-bi', 'Buy-in (units)', 'defaultBuyIn', `${money(settings.defaultBuyIn * settings.unitValue, settings.currency)}, ${(settings.defaultBuyIn / (settings.bb || 1)).toFixed(0)} big blinds`)}
            {numField('s-te', `Tournament entry (${settings.currency})`, 'tournamentBuyIn')}
            {numField('s-ss', 'Starting stack (chips)', 'startingStack')}
          </div>
        </section>

        <section className="sat-glass sat-card sat-stack">
          <h2 className="sat-h2">Hands</h2>
          <div className="sat-switch-row">
            <span><span style={{ display: 'block' }}>Track the button</span><span className="sat-small sat-muted">Moves one seat clockwise after each hand. Sets who gets odd chips in a split pot.</span></span>
            <Toggle on={settings.markers.dealer} onChange={(v) => setMarker('dealer', v)} label="Track the button" />
          </div>
        </section>

        <section className="sat-glass sat-card sat-stack">
          <div className="sat-split"><h2 className="sat-h2">Data</h2><Help k="backup" /></div>
          <p className="sat-small sat-muted">{games.length} games and {players.length} players stored on this phone{usage ? ` (${usage})` : ''}. Nothing is sent online.</p>
          <div className="sat-grid" style={{ ['--sat-min' as string]: '130px', ...gap(2) }}>
            <button className="sat-btn sat-btn--primary" onClick={backup}><Icon name="download" /> Back up</button>
            <button className="sat-btn" onClick={() => fileRef.current?.click()}><Icon name="upload" /> Restore</button>
          </div>
          <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) restore(f); e.target.value = ''; }} />
          <button className="sat-btn" onClick={exportAllCsv}><Icon name="file" /> Export all games (CSV)</button>
          <button className="sat-btn sat-btn--ghost" style={{ color: 'var(--sat-neg)' }} onClick={() => {
            if (erase < 2) { setErase(erase + 1); toast(erase === 0 ? 'Tap 2 more times to erase all data' : 'Tap once more to erase all data for good'); return; }
            eraseAll();
            setErase(0);
            toast('All data erased from this phone');
          }}><Icon name="trash" /> {erase === 0 ? 'Erase all data' : erase === 1 ? 'Tap again to confirm' : 'Erase for good'}</button>
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
