import { useEffect, useRef, useState } from 'react';
import { useStore, usePlayerName, type BackupData } from '../store';
import { Icon, Toggle, num, toast } from '../components/ui';
import { handsCsv, ledgerCsv, playersCsv } from '../report/csv';
import { shareFiles, textFile } from '../report/share';
import { money } from '../lib/format';
import type { Markers, Settings as S } from '../types';

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
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<string>('');
  const [erase, setErase] = useState(0);
  const [newTag, setNewTag] = useState('');

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => {});
    navigator.storage?.estimate?.().then((e) => setUsage(`${((e.usage ?? 0) / 1024).toFixed(0)} KB used`)).catch(() => {});
  }, [games]);

  const numField = (label: string, key: keyof S, prefix?: string) => (
    <label className="field" style={{ marginTop: 0 }}>
      <span className="tiny muted">{label}</span>
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
    if (r !== 'cancelled') toast('Backup exported');
  };
  const restore = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as BackupData;
      if (data.app !== 'felt' || !Array.isArray(data.games) || !Array.isArray(data.players)) throw new Error('Not a Felt backup');
      importBackup(data);
      toast(`Restored ${data.games.length} games, ${data.players.length} players`);
    } catch (e) {
      toast(`Import failed: ${(e as Error).message}`);
    }
  };
  const exportAllCsv = async () => {
    const closed = games.filter((g) => g.status === 'closed').sort((a, b) => a.startedAt - b.startedAt);
    const d = new Date().toLocaleDateString('en-CA');
    await shareFiles([
      textFile(playersCsv(closed, name), `felt-all-players-${d}.csv`),
      textFile(handsCsv(closed, name), `felt-all-hands-${d}.csv`),
      textFile(ledgerCsv(closed, name), `felt-all-ledger-${d}.csv`),
    ], 'Felt data export');
  };
  const setMarker = (k: keyof Markers, v: boolean) => update({ markers: { ...settings.markers, [k]: v } });

  return (
    <div className="screen">
      <div className="page-title">
        <div className="eyebrow">Preferences</div>
        <h1>Settings</h1>
        <p>Defaults for new games, markers and your data.</p>
      </div>

      <div className="section-head"><h2>New game defaults</h2></div>
      <div className="card">
        <div className="grid3">
          {numField('Small blind', 'sb')}
          {numField('Big blind', 'bb')}
          <label className="field" style={{ marginTop: 0 }}>
            <span className="tiny muted">Currency</span>
            <input className="input" defaultValue={settings.currency} onBlur={(e) => update({ currency: e.target.value.trim() || 'S$' })} />
          </label>
        </div>
        <div className="grid2" style={{ marginTop: 12 }}>
          {numField('1 unit is worth', 'unitValue', settings.currency)}
          {numField('Cash buy-in (units)', 'defaultBuyIn')}
        </div>
        <div className="grid2" style={{ marginTop: 12 }}>
          {numField('Tournament entry', 'tournamentBuyIn', settings.currency)}
          {numField('Starting stack', 'startingStack')}
        </div>
        <div className="small muted" style={{ marginTop: 10 }}>
          Default buy-in: {settings.defaultBuyIn} units = {money(settings.defaultBuyIn * settings.unitValue, settings.currency)} ({(settings.defaultBuyIn / (settings.bb || 1)).toFixed(0)} BB)
        </div>
      </div>

      <div className="section">
        <div className="section-head"><h2>Hand markers</h2></div>
        <div className="card flat" style={{ padding: '4px 14px' }}>
          {([['dealer', 'Dealer button', 'Track who had the button, auto-rotates each hand'], ['allIn', 'All-in', 'Flag hands that went all-in'],
            ['straddle', 'Straddle', 'Flag straddled hands'], ['tags', 'Tags & notes', 'Free tags like “Bad beat” or “Cooler”']] as const).map(([k, l, d]) => (
            <div key={k} className="list-row">
              <div className="grow"><div style={{ fontWeight: 600 }}>{l}</div><div className="tiny muted">{d}</div></div>
              <Toggle on={settings.markers[k]} onChange={(v) => setMarker(k, v)} label={l} />
            </div>
          ))}
        </div>
        <div className="label" style={{ margin: '16px 0 8px' }}>Tags</div>
        <div className="chips">
          {settings.tags.map((t) => (
            <button key={t} className="chip" onClick={() => update({ tags: settings.tags.filter((x) => x !== t) })}>{t} <span className="x"><Icon name="close" size={12} /></span></button>
          ))}
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <input className="input grow" style={{ height: 42, fontSize: 15 }} placeholder="New tag" value={newTag} onChange={(e) => setNewTag(e.target.value)} />
          <button className="btn sm" style={{ height: 42 }} disabled={!newTag.trim()} onClick={() => { update({ tags: [...new Set([...settings.tags, newTag.trim()])] }); setNewTag(''); }}>Add</button>
        </div>
      </div>

      <div className="section">
        <div className="section-head"><h2>Your data</h2><span className="small muted">{games.length} games · {players.length} players</span></div>
        <div className="card flat">
          <div className="small muted">
            Everything is stored only on this device{persisted === true ? ' (protected from automatic clean-up)' : ''}. {usage}
            <br />Export a backup now and then — deleting the app from your home screen deletes its data.
          </div>
          <div className="btn-row" style={{ marginTop: 12 }}>
            <button className="btn" onClick={backup}><Icon name="download" /> Backup</button>
            <button className="btn" onClick={() => fileRef.current?.click()}><Icon name="upload" /> Restore</button>
          </div>
          <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) restore(f); e.target.value = ''; }} />
          <button className="btn block" style={{ marginTop: 10 }} onClick={exportAllCsv}><Icon name="file" /> Export all games as CSV</button>
          <button className="btn danger block" style={{ marginTop: 10 }} onClick={() => {
            if (erase < 2) { setErase(erase + 1); toast(erase === 0 ? 'Tap twice more to erase everything' : 'Tap once more — this cannot be undone'); return; }
            eraseAll();
            setErase(0);
            toast('All data erased');
          }}><Icon name="trash" /> {erase === 0 ? 'Erase all data' : erase === 1 ? 'Really erase?' : 'Erase permanently'}</button>
        </div>
      </div>

      <div className="section">
        <div className="section-head"><h2>Install on iPhone</h2></div>
        <div className="card flat small muted">
          Open this page in Safari → tap <b>Share</b> → <b>Add to Home Screen</b>. It then runs full-screen and works offline.
        </div>
      </div>
    </div>
  );
}
