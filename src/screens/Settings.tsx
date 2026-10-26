import { useEffect, useRef, useState } from 'react';
import { useStore, usePlayerName, type BackupData } from '../store';
import { Help, Icon, Toggle, num, toast } from '../components/ui';
import { handsCsv, ledgerCsv, playersCsv } from '../report/csv';
import { shareFiles, textFile } from '../report/share';
import { money } from '../lib/format';
import type { Markers, Settings as S, ThemePref } from '../types';

const THEMES: { k: ThemePref; label: string; icon: string }[] = [
  { k: 'system', label: 'Auto', icon: 'phone' },
  { k: 'light', label: 'Light', icon: 'sun' },
  { k: 'dark', label: 'Dark', icon: 'moon' },
];

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
  const [newTag, setNewTag] = useState('');

  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => setUsage(`${((e.usage ?? 0) / 1024).toFixed(0)} KB`)).catch(() => {});
  }, [games]);

  const numField = (label: string, key: keyof S, prefix?: string) => (
    <label className="field" style={{ marginTop: 0 }}>
      <span className="label tiny">{label}</span>
      <div className="input-wrap">
        {prefix && <span className="prefix">{prefix}</span>}
        <input className="input" inputMode="decimal" defaultValue={String(settings[key])}
          onBlur={(e) => { const v = num(e.target.value); if (v !== null && v >= 0) update({ [key]: v } as Partial<S>); }} />
      </div>
    </label>
  );

  const backup = async () => {
    const data = exportBackup();
    const f = textFile(JSON.stringify(data), `felt-backup-${new Date().toLocaleDateString('en-CA')}.json`, 'application/json');
    const r = await shareFiles([f], 'Felt backup');
    if (r !== 'cancelled') toast('Backup saved');
  };
  const restore = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as BackupData;
      if (data.app !== 'felt' || !Array.isArray(data.games) || !Array.isArray(data.players)) throw new Error("that file isn't a Felt backup");
      importBackup(data);
      toast(`Restored ${data.games.length} games and ${data.players.length} players`);
    } catch (e) {
      toast(`Couldn't restore: ${(e as Error).message}`);
    }
  };
  const exportAllCsv = async () => {
    const closed = games.filter((g) => g.status === 'closed').sort((a, b) => a.startedAt - b.startedAt);
    const d = new Date().toLocaleDateString('en-CA');
    await shareFiles([
      textFile(playersCsv(closed, name), `felt-players-${d}.csv`),
      textFile(handsCsv(closed, name), `felt-hands-${d}.csv`),
      textFile(ledgerCsv(closed, name), `felt-ledger-${d}.csv`),
    ], 'Felt data');
  };
  const setMarker = (k: keyof Markers, v: boolean) => update({ markers: { ...settings.markers, [k]: v } });

  return (
    <div className="screen plain">
      <div className="page-title">
        <h1>Settings</h1>
      </div>

      <div className="section-head"><h2>Appearance</h2></div>
      <div className="seg" role="radiogroup" aria-label="Theme">
        {THEMES.map((t) => (
          <button key={t.k} role="radio" aria-checked={settings.theme === t.k} aria-selected={settings.theme === t.k} onClick={() => update({ theme: t.k })}>
            <Icon name={t.icon} /> {t.label}
          </button>
        ))}
      </div>
      <div className="tiny faint" style={{ margin: '8px 2px 0' }}>Auto follows your phone's light or dark setting.</div>

      <div className="section">
        <div className="section-head"><h2>New games</h2><Help k="units" /></div>
        <div className="panel">
          <div className="grid3">
            {numField('Small blind', 'sb')}
            {numField('Big blind', 'bb')}
            <label className="field" style={{ marginTop: 0 }}>
              <span className="label tiny">Currency</span>
              <input className="input" defaultValue={settings.currency} onBlur={(e) => update({ currency: e.target.value.trim() || 'S$' })} />
            </label>
          </div>
          <div className="grid2" style={{ marginTop: 14 }}>
            {numField('1 unit is worth', 'unitValue', settings.currency)}
            {numField('Buy-in, units', 'defaultBuyIn')}
          </div>
          <div className="grid2" style={{ marginTop: 14 }}>
            {numField('Tournament entry', 'tournamentBuyIn', settings.currency)}
            {numField('Starting stack', 'startingStack')}
          </div>
          <div className="small muted" style={{ marginTop: 12 }}>
            A buy-in of {settings.defaultBuyIn} units is <span className="num">{money(settings.defaultBuyIn * settings.unitValue, settings.currency)}</span>, or {(settings.defaultBuyIn / (settings.bb || 1)).toFixed(0)} big blinds.
          </div>
        </div>
      </div>

      <div className="section">
        <div className="section-head"><h2>Hand details</h2></div>
        <div className="panel" style={{ padding: '4px 14px' }}>
          {([['dealer', 'Dealer', 'Track the button. It moves on after each hand.'], ['allIn', 'All-in', 'Mark hands that went all-in.'],
            ['straddle', 'Straddle', 'Mark straddled hands.'], ['tags', 'Tags and notes', 'Label hands, like “Bad beat”.']] as const).map(([k, l, d]) => (
            <div key={k} className="list-row">
              <div className="grow"><div style={{ fontWeight: 700 }}>{l}</div><div className="tiny faint">{d}</div></div>
              <Toggle on={settings.markers[k]} onChange={(v) => setMarker(k, v)} label={l} />
            </div>
          ))}
        </div>
        <div className="label" style={{ margin: '18px 2px 10px' }}>Tags</div>
        <div className="chips">
          {settings.tags.map((t) => (
            <button key={t} className="chip sm" onClick={() => update({ tags: settings.tags.filter((x) => x !== t) })} aria-label={`Remove tag ${t}`}>{t} <span className="x"><Icon name="close" size={12} /></span></button>
          ))}
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <input className="input grow" style={{ minHeight: 44, fontSize: 15 }} placeholder="New tag" value={newTag} onChange={(e) => setNewTag(e.target.value)} />
          <button className="btn sm" style={{ minHeight: 44 }} disabled={!newTag.trim()} onClick={() => { update({ tags: [...new Set([...settings.tags, newTag.trim()])] }); setNewTag(''); }}>Add</button>
        </div>
      </div>

      <div className="section">
        <div className="section-head"><h2>Your data <Help k="backup" /></h2><span className="small muted">{games.length} games, {players.length} players{usage ? `, ${usage}` : ''}</span></div>
        <div className="small muted" style={{ margin: '0 2px 12px' }}>Everything stays on this phone.</div>
        <div className="btn-row">
          <button className="btn" onClick={backup}><Icon name="download" /> Back up</button>
          <button className="btn" onClick={() => fileRef.current?.click()}><Icon name="upload" /> Restore</button>
        </div>
        <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) restore(f); e.target.value = ''; }} />
        <button className="btn block" style={{ marginTop: 12 }} onClick={exportAllCsv}><Icon name="file" /> Export every game as CSV</button>
        <button className="btn danger block" style={{ marginTop: 12 }} onClick={() => {
          if (erase < 2) { setErase(erase + 1); toast(erase === 0 ? 'Tap twice more to erase everything' : 'One more tap erases everything for good'); return; }
          eraseAll();
          setErase(0);
          toast('Everything erased');
        }}><Icon name="trash" /> {erase === 0 ? 'Erase everything' : erase === 1 ? 'Are you sure?' : 'Erase for good'}</button>
      </div>

      <div className="section">
        <div className="section-head"><h2>Add to your home screen</h2></div>
        <div className="card small muted">
          In Safari, tap <b>Share</b>, then <b>Add to Home Screen</b>. Felt then opens full screen and works without a connection.
        </div>
      </div>
    </div>
  );
}
