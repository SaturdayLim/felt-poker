/* The player view of a live game. Opened from the host's link. A viewer can read the action and the settings,
   read plain history and showdown hands, add their own cards (with their code) and flag a wrong update.
   Nothing else: no reports, no awards, no settings, no way to read any private cards, including their own. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Caption, Cards, Empty, Header, Help, Icon, Sheet, toast } from '../components/ui';
import type { HelpKey } from '../lib/help';
import { CardEntrySheet } from '../components/cardEntry';
import { lock, unlock, type LockBox } from '../report/lock';
import { CHECK_TEXT, keyFromPassphrase, open, seal } from '../live/crypto';
import { pickDriver } from '../live/host';
import type { NowSnapshot, PubSnapshot } from '../live/snapshot';
import type { Card } from '../types';

interface Meta { locked?: boolean; check?: string | null; updatedAt?: number; handCount?: number }
interface Me { id: string; name: string }
type Tab = 'action' | 'settings' | 'history' | 'table';
const TABS: { k: Tab; label: string }[] = [{ k: 'action', label: 'Action' }, { k: 'history', label: 'Hands' }, { k: 'table', label: 'Table' }, { k: 'settings', label: 'Settings' }];

const ss = {
  get: (k: string) => { try { return sessionStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { sessionStorage.setItem(k, v); } catch { /* private mode */ } },
};
const gap = (n: number) => ({ ['--sat-gap' as string]: `var(--sat-space-${n})` });

export default function Join({ room, keyFromLink }: { room: string; keyFromLink?: string }) {
  const driver = useMemo(() => pickDriver(), []);
  const [meta, setMeta] = useState<Meta | null | undefined>(undefined);
  const [key, setKey] = useState<string | null>(keyFromLink ?? ss.get(`felt-join-key:${room}`));
  const [pub, setPub] = useState<PubSnapshot | null>(null);
  const [now, setNow] = useState<NowSnapshot | null>(null);
  const [ident, setIdent] = useState<Record<string, LockBox>>({});
  const [me, setMe] = useState<Me | null>(null);
  const [code, setCode] = useState<string | null>(ss.get(`felt-join-code:${room}`));
  const [tab, setTab] = useState<Tab>('action');
  const [sheet, setSheet] = useState<null | 'code' | 'cards' | 'flag'>(null);
  const [err, setErr] = useState('');
  const entered = useRef<Set<number>>(new Set(JSON.parse(ss.get(`felt-join-entered:${room}`) ?? '[]')));

  // connect and watch the room
  useEffect(() => {
    if (!driver) return;
    const stops: (() => void)[] = [];
    let live = true;
    driver.signIn().then(() => {
      if (!live) return;
      stops.push(driver.watch(room, 'meta', (v) => setMeta((v as Meta | null) ?? null)));
      stops.push(driver.watch(room, 'ident', (v) => setIdent((v as Record<string, LockBox> | null) ?? {})));
    }, (e) => setErr(String(e?.message ?? e)));
    return () => { live = false; stops.forEach((s) => s()); };
  }, [driver, room]);

  useEffect(() => {
    if (!driver || !key || !meta) return;
    const stops = [
      driver.watch(room, 'pub', (v) => { if (typeof v === 'string') open<PubSnapshot>(v, key).then(setPub, () => setErr('The key does not fit this game.')); }),
      driver.watch(room, 'now', (v) => { if (typeof v === 'string') open<NowSnapshot>(v, key).then(setNow, () => undefined); else setNow(null); }),
    ];
    return () => stops.forEach((s) => s());
  }, [driver, room, key, meta]);

  // a code kept for this tab opens the player at once
  useEffect(() => {
    if (me || !code) return;
    tryCode(code, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ident, code]);

  const tryCode = async (c: string, quiet = false) => {
    for (const box of Object.values(ident)) {
      try {
        const who = await unlock<Me>(box, c);
        setMe(who); setCode(c); ss.set(`felt-join-code:${room}`, c);
        return true;
      } catch { /* not this box */ }
    }
    if (!quiet && Object.keys(ident).length) toast('Code does not match.');
    return false;
  };

  if (!driver) return <div className="felt-page"><Header title="Live game" /><Empty title="Live link not available">This phone cannot open live games. Ask the host for the report instead.</Empty></div>;
  if (err) return <div className="felt-page"><Header title="Live game" /><Empty title="Cannot open the game">{err}</Empty></div>;
  if (meta === undefined) return <div className="felt-page"><Header title="Live game" /><p className="sat-small sat-muted">Connecting.</p></div>;
  if (meta === null) return <div className="felt-page"><Header title="Live game" /><Empty title="The host stopped sharing">This game is no longer live. Ask the host for the report.</Empty></div>;
  if (!key) return <PassForm room={room} meta={meta} onKey={(k) => { setKey(k); ss.set(`felt-join-key:${room}`, k); }} />;
  if (!pub) return <div className="felt-page"><Header title="Live game" /><p className="sat-small sat-muted">Loading the game.</p></div>;

  const hands = [...pub.hands].sort((a, b) => b.n - a.n);
  const sendCards = async (n: number, cards: Card[]) => {
    if (!me || !code) return;
    await driver.set(room, `inbox/${me.id}/${n}`, await lock({ cards }, code));
    entered.current.add(n);
    ss.set(`felt-join-entered:${room}`, JSON.stringify([...entered.current]));
  };

  return (
    <div className="felt-page">
      <Header title={pub.game.name} sub={`Live, ${pub.hands.length} ${pub.hands.length === 1 ? 'hand' : 'hands'}`}
        right={<button className="sat-btn sat-btn--ghost sat-iconbtn" aria-label={me ? `Signed in as ${me.name}` : 'Enter player code'} onClick={() => setSheet('code')}><Icon name="users" /></button>}>
        <div className="felt-tabs" role="tablist" aria-label="Live game">
          {TABS.map((t) => <button key={t.k} role="tab" aria-selected={tab === t.k} onClick={() => setTab(t.k)}>{t.label}</button>)}
        </div>
      </Header>

      <div className="sat-stack" style={gap(3)}>
        {tab === 'action' && <Action now={now} pub={pub} />}
        {tab === 'history' && <History hands={hands} />}
        {tab === 'table' && <Table pub={pub} />}
        {tab === 'settings' && <Settings pub={pub} />}

        <div className="sat-flat sat-card sat-stack" style={gap(2)}>
          {me ? (
            <>
              <p className="sat-small"><b>{me.name}</b>. Your cards are write only: saved, but nobody can see them, not even you. Enter them again to replace them.</p>
              <button className="sat-btn sat-btn--primary" onClick={() => setSheet('cards')} aria-disabled={!hands.length}><Icon name="cards" /> Add my cards</button>
            </>
          ) : (
            <button className="sat-btn" onClick={() => setSheet('code')}><Icon name="users" /> Enter player code to add cards</button>
          )}
          <button className="sat-btn sat-btn--ghost" onClick={() => setSheet('flag')}>Flag a wrong update</button>
        </div>
      </div>

      {sheet === 'code' && <CodeSheet me={me} onClose={() => setSheet(null)} onSubmit={async (c) => { if (await tryCode(c)) setSheet(null); }} />}
      {sheet === 'cards' && me && <HandPick hands={hands} entered={entered.current} me={me} onClose={() => setSheet(null)} onSave={sendCards} />}
      {sheet === 'flag' && <FlagSheet hands={hands} now={now} onClose={() => setSheet(null)}
        onSend={async (n, text) => { await driver.set(room, `flags/${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`, await seal({ n, text }, key)); toast('Flag sent to the host.'); setSheet(null); }} />}
    </div>
  );
}

/* ------------------------------ screens ------------------------------ */

function PassForm({ room, meta, onKey }: { room: string; meta: Meta; onKey: (k: string) => void }) {
  const [pass, setPass] = useState('');
  const [bad, setBad] = useState(false);
  const go = async () => {
    const k = await keyFromPassphrase(pass, room);
    try { if (meta.check && (await open<string>(meta.check, k)) === CHECK_TEXT) { onKey(k); return; } } catch { /* wrong */ }
    setBad(true);
  };
  return (
    <div className="felt-page">
      <Header title="Live game" sub="Locked by the host" />
      <div className="sat-glass sat-card sat-stack" style={gap(3)}>
        <div className="sat-field">
          <label htmlFor="jp">Join passphrase</label>
          <input id="jp" className="sat-input" autoComplete="off" autoCapitalize="off" value={pass} aria-invalid={bad}
            onChange={(e) => { setPass(e.target.value); setBad(false); }} onKeyDown={(e) => e.key === 'Enter' && go()} />
          {bad && <span className="sat-error">Passphrase does not match.</span>}
        </div>
        <button className="sat-btn sat-btn--primary sat-btn--lg sat-btn--block" aria-disabled={!pass.trim()} onClick={() => pass.trim() && go()}>Join</button>
      </div>
    </div>
  );
}

const money = (n: number | null) => (n === null ? '-' : String(Math.round(n)));

function Stacks({ lines }: { lines: PubSnapshot['stacks'] }) {
  return (
    <div className="sat-glass-2 felt-list">
      {lines.map((s) => (
        <div key={s.name} className="felt-row">
          <span className="felt-row-main">{s.name}</span>
          <b className="sat-num">{s.stack === null ? '-' : `${s.spread ? '~' : ''}${money(s.stack)}`}</b>
        </div>
      ))}
    </div>
  );
}

function Action({ now, pub }: { now: NowSnapshot | null; pub: PubSnapshot }) {
  if (!now) {
    return (
      <>
        <div className="sat-flat sat-card sat-small">Between hands. The next hand shows here as the host records it.</div>
        <Caption>Chips (approximate)</Caption>
        <Stacks lines={pub.stacks} />
      </>
    );
  }
  return (
    <>
      <section className="sat-glass sat-card sat-stack" style={gap(2)}>
        <div className="sat-split"><h2 className="sat-h2">Hand {now.n}</h2><b>{now.stage}</b></div>
        {now.board.length > 0 && <Cards cards={now.board} />}
        <div className="sat-split"><span className="sat-muted">Pot</span><b className="sat-num">{money(now.pot)}</b></div>
        {now.toAct && <div className="sat-split"><span className="sat-muted">Next to act</span><b>{now.toAct}</b></div>}
      </section>
      {now.actions.length > 0 && (
        <div className="sat-glass-2 felt-list">
          {now.actions.map((a, i) => <div key={i} className="felt-row"><span className="sat-small sat-muted" style={{ width: 56 }}>{a.street}</span><span className="felt-row-main">{a.text}</span></div>)}
        </div>
      )}
      <Caption>Chips (approximate)</Caption>
      <Stacks lines={now.stacks} />
    </>
  );
}

function History({ hands }: { hands: PubSnapshot['hands'] }) {
  if (!hands.length) return <div className="sat-flat sat-card sat-small">No hands yet.</div>;
  return (
    <div className="sat-stack" style={gap(2)}>
      {hands.map((h) => (
        <div key={h.n} className="sat-glass-2 sat-card sat-stack" style={gap(1)}>
          <div className="sat-split"><b>Hand {h.n}</b><b className="sat-num">{money(h.pot)}</b></div>
          <span className="sat-small sat-muted">{h.winners.map((w) => `${w.name} +${money(w.amount)}`).join(', ') || 'No winner recorded'}</span>
          {h.board.length > 0 && <Cards cards={h.board} size="sm" />}
          {h.shown.map((s) => <div key={s.name} className="sat-split"><span>{s.name}</span><span className="sat-split" style={{ gap: 8 }}><Cards cards={s.cards} size="sm" /><span className="sat-small sat-muted">{s.rank}</span></span></div>)}
        </div>
      ))}
    </div>
  );
}

function Table({ pub }: { pub: PubSnapshot }) {
  const rows = pub.players.map((p) => {
    const dealt = pub.hands.filter((h) => h.dealt.includes(p.name)).length;
    const won = pub.hands.filter((h) => h.winners.some((w) => w.name === p.name)).length;
    const shown = pub.hands.filter((h) => h.shown.some((s) => s.name === p.name)).length;
    const stack = pub.stacks.find((s) => s.name === p.name);
    return { name: p.name, dealt, won, shown, stack };
  });
  return (
    <div className="sat-glass-2 felt-list" style={{ overflowX: 'auto' }}>
      <table className="sat-table" style={{ width: '100%' }}>
        <thead><tr><th>Player</th><th>Dealt</th><th>Won</th><th>Shown</th><th>Chips</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.name}><td>{r.name}</td><td className="sat-num">{r.dealt}</td><td className="sat-num">{r.won}</td><td className="sat-num">{r.shown}</td><td className="sat-num">{r.stack ? `${r.stack.spread ? '~' : ''}${money(r.stack.stack)}` : '-'}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

function Settings({ pub }: { pub: PubSnapshot }) {
  return (
    <div className="sat-glass-2 felt-list">
      {pub.rules.map((r) => <div key={r.label} className="felt-row"><span className="felt-row-main">{r.label}{r.tip && <Help k={r.tip as HelpKey} />}</span><span className="sat-small" style={{ textAlign: 'right' }}>{r.value}</span></div>)}
    </div>
  );
}

/* ------------------------------ sheets ------------------------------ */

function CodeSheet({ me, onSubmit, onClose }: { me: Me | null; onSubmit: (c: string) => void; onClose: () => void }) {
  const [c, setC] = useState('');
  return (
    <Sheet open onClose={onClose} title={me ? me.name : 'Player code'} sub={me ? 'Signed in on this page until you close it.' : 'Enter your player code to add your cards.'}>
      {!me && (
        <>
          <div className="sat-field">
            <label htmlFor="jc">Player code</label>
            <input id="jc" className="sat-input sat-mono felt-code-input" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={9} value={c}
              onChange={(e) => setC(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && c && onSubmit(c)} />
          </div>
          <button className="sat-btn sat-btn--primary sat-btn--lg sat-btn--block" aria-disabled={!c} onClick={() => c && onSubmit(c)}>Open</button>
        </>
      )}
      {me && <button className="sat-btn sat-btn--block" onClick={onClose}>Done</button>}
    </Sheet>
  );
}

function HandPick({ hands, entered, me, onSave, onClose }: {
  hands: PubSnapshot['hands']; entered: Set<number>; me: Me; onSave: (n: number, cards: Card[]) => Promise<void>; onClose: () => void;
}) {
  const [n, setN] = useState<number | null>(null);
  const h = hands.find((x) => x.n === n);
  const mine = hands.filter((x) => x.dealt.includes(me.name));
  if (h) {
    return (
      <CardEntrySheet players={[me.id]} initial={me.id} closeOnSave name={() => me.name} entered={entered.has(h.n) ? [me.id] : []}
        blocked={[...h.board, ...h.shown.flatMap((s) => s.cards)]} onClose={onClose}
        onSave={(_p, cards) => { onSave(h.n, cards).catch(() => toast('Cards not sent. Check the connection and try again.')); }} />
    );
  }
  return (
    <Sheet open onClose={onClose} title="Pick a hand" sub="Newest first. Cards you enter are write only.">
      <div className="sat-glass-2 felt-list">
        {!mine.length && <div className="felt-row sat-small sat-muted">No hands for you yet.</div>}
        {mine.map((x) => (
          <button key={x.n} className="felt-row" onClick={() => setN(x.n)}>
            <span className="felt-row-main"><span className="felt-row-title">Hand {x.n}</span></span>
            <span className="sat-small sat-muted">{entered.has(x.n) ? 'Entered' : 'Not entered'}</span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

function FlagSheet({ hands, now, onSend, onClose }: { hands: PubSnapshot['hands']; now: NowSnapshot | null; onSend: (n: number, text: string) => void; onClose: () => void }) {
  const [n, setN] = useState<number>(now?.n ?? hands[0]?.n ?? 0);
  const [text, setText] = useState('');
  return (
    <Sheet open onClose={onClose} title="Flag a wrong update" sub="The host sees your note and decides. A flag never changes the game.">
      <div className="sat-field">
        <label htmlFor="fh">Hand</label>
        <select id="fh" className="sat-input" value={n} onChange={(e) => setN(Number(e.target.value))}>
          {now && <option value={now.n}>Hand {now.n} (now)</option>}
          {hands.map((h) => <option key={h.n} value={h.n}>Hand {h.n}</option>)}
        </select>
      </div>
      <div className="sat-field">
        <label htmlFor="ft">What looks wrong?</label>
        <input id="ft" className="sat-input" maxLength={160} placeholder="For example: Nat bet 8, not 6" value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      <button className="sat-btn sat-btn--primary sat-btn--lg sat-btn--block" aria-disabled={!text.trim()} onClick={() => text.trim() && onSend(n, text.trim())}>Send to host</button>
    </Sheet>
  );
}
