/* The player view of a live game. Opened from the host's link or the scanner. A viewer can read the action and the
   settings, read every closed hand street by street, add their own cards (with their code) and flag a wrong update.
   Nothing else: no reports, no awards, no settings, no way to read any private cards, including their own. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Cards, Empty, Header, Help, Icon, Sheet, toast } from '../components/ui';
import { CardEntrySheet } from '../components/cardEntry';
import { CodeBoxes } from '../components/codeBoxes';
import { Candle, candleScale } from '../components/candle';
import { lock, unlock, type LockBox } from '../report/lock';
import { CHECK_TEXT, keyFromPassphrase, open, seal } from '../live/crypto';
import { pickDriver } from '../live/host';
import { viewText, type HandView, type NowSnapshot, type PubSnapshot, type StackLine, type ViewStreet } from '../live/snapshot';
import type { HelpKey } from '../lib/help';
import type { Card } from '../types';

interface Meta { locked?: boolean; check?: string | null; updatedAt?: number; handCount?: number }
interface Me { id: string; name: string }
type Tab = 'action' | 'settings' | 'hands' | 'players';
const TABS: { k: Tab; label: string }[] = [{ k: 'action', label: 'Action' }, { k: 'hands', label: 'Hands' }, { k: 'players', label: 'Players' }, { k: 'settings', label: 'Settings' }];

const ss = {
  get: (k: string) => { try { return sessionStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { sessionStorage.setItem(k, v); } catch { /* private mode */ } },
  del: (k: string) => { try { sessionStorage.removeItem(k); } catch { /* private mode */ } },
};
const ls = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode or full */ } },
};
const gap = (n: number) => ({ ['--sat-gap' as string]: `var(--sat-space-${n})` });
const money = (n: number | null) => (n === null ? '-' : String(Math.round(n)));
const stackText = (s?: StackLine) => (!s || s.stack === null ? '-' : `${s.spread ? '~' : ''}${money(s.stack)}`);

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
  const [openHand, setOpenHand] = useState<number | null>(null);
  const [err, setErr] = useState('');
  const entered = useRef<Set<number>>(new Set(JSON.parse(ss.get(`felt-join-entered:${room}`) ?? '[]')));

  // the last copy on this phone shows at once, and the room refreshes it
  useEffect(() => {
    const saved = key && ls.get(`felt-join-pub:${room}`);
    if (saved) open<PubSnapshot>(saved, key!).then(setPub, () => undefined);
  }, [room, key]);

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
      driver.watch(room, 'pub', (v) => { if (typeof v === 'string') open<PubSnapshot>(v, key).then((p) => { setPub(p); ls.set(`felt-join-pub:${room}`, v); }, () => setErr('The key does not fit this game.')); }),
      driver.watch(room, 'now', (v) => { if (typeof v === 'string') open<NowSnapshot>(v, key).then(setNow, () => undefined); else setNow(null); }),
    ];
    return () => stops.forEach((s) => s());
  }, [driver, room, key, meta]);

  // a code kept for this tab opens the player at once; a replaced code signs the player out
  useEffect(() => {
    if (!code || !Object.keys(ident).length) return;
    if (!me) { tryCode(code); return; }
    const box = ident[me.id];
    if (box) unlock(box, code).catch(() => {
      setMe(null); setCode(null); ss.del(`felt-join-code:${room}`);
      toast('Your code changed. Ask the host for the new code.');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ident, code]);

  const tryCode = async (c: string) => {
    for (const box of Object.values(ident)) {
      try {
        const who = await unlock<Me>(box, c);
        setMe(who); setCode(c); ss.set(`felt-join-code:${room}`, c);
        return true;
      } catch { /* not this box */ }
    }
    return false;
  };

  const blank = (body: JSX.Element) => <div className="felt-page"><Header title="Live game" />{body}</div>;
  if (!driver) return blank(<Empty title="Live link not available">This phone cannot open live games. Ask the host for the report instead.</Empty>);
  if (err) return blank(<Empty title="Cannot open the game">{err}</Empty>);
  if (meta === null) return blank(<Empty title="The host stopped sharing">This game is not live now. This page returns when the host starts sharing again.</Empty>);
  if (meta && !key) return <PassForm room={room} meta={meta} onKey={(k) => { setKey(k); ss.set(`felt-join-key:${room}`, k); }} />;
  if (!pub) return blank(<div className="sat-stack" aria-label="Loading the game"><div className="felt-skel" style={{ height: 44 }} /><div className="felt-skel" style={{ height: 220 }} /><div className="felt-skel" style={{ height: 120 }} /></div>);

  const hands = [...pub.hands].sort((a, b) => b.n - a.n);
  const blinds = { sb: pub.game.sb, bb: pub.game.bb };
  const stacks = now?.stacks ?? pub.stacks;
  const sendCards = async (n: number, cards: Card[]) => {
    if (!me || !code) return;
    await driver.set(room, `inbox/${me.id}/${n}`, await lock({ cards }, code));
    entered.current.add(n);
    ss.set(`felt-join-entered:${room}`, JSON.stringify([...entered.current]));
  };
  const shownHand = openHand !== null ? hands.find((h) => h.n === openHand) : undefined;

  if (shownHand) {
    return (
      <div className="felt-page">
        <Header back={() => setOpenHand(null)} title={`Hand ${shownHand.n}`} sub={pub.game.name} />
        <PlayByPlay view={shownHand.view} board={shownHand.board} />
      </div>
    );
  }

  return (
    <div className="felt-page">
      <Header title={pub.game.name} sub={me ? me.name : `Live, ${pub.hands.length} ${pub.hands.length === 1 ? 'hand' : 'hands'}`}
        right={<button className="sat-btn sat-btn--ghost sat-iconbtn" aria-label={me ? `Signed in as ${me.name}` : 'Enter player code'} onClick={() => setSheet('code')}><Icon name="users" /></button>}>
        <div className="felt-tabs sat-glass felt-join-tabs" role="tablist" aria-label="Live game">
          {TABS.map((t) => <button key={t.k} role="tab" aria-selected={tab === t.k} onClick={() => setTab(t.k)}>{t.label}</button>)}
        </div>
      </Header>

      <div className="sat-stack" style={gap(3)}>
        {tab === 'action' && <ActionLog now={now} hands={hands} blinds={blinds} onFlag={() => setSheet('flag')} />}
        {tab === 'hands' && <HandsList hands={hands} blinds={blinds} onOpen={setOpenHand} />}
        {tab === 'players' && <PlayersTab pub={pub} stacks={stacks} me={me} button={now?.view.button ?? pub.button} />}
        {tab === 'settings' && <Rules pub={pub} />}
      </div>

      {(tab === 'action' || tab === 'hands') && (
        <button type="button" className="felt-fab felt-fab--page" aria-label={me ? 'Add my cards' : 'Enter player code to add cards'} onClick={() => setSheet(me ? 'cards' : 'code')}><Icon name="cardsadd" size={30} stroke={1.8} /></button>
      )}

      {sheet === 'code' && <CodeSheet me={me} onClose={() => setSheet(null)} onSubmit={async (c) => { const ok = await tryCode(c); if (ok) setSheet(null); return ok; }}
        onLeave={() => { setMe(null); setCode(null); ss.del(`felt-join-code:${room}`); setSheet(null); }} />}
      {sheet === 'cards' && me && <HandPick hands={hands} now={now} entered={entered.current} me={me} onClose={() => setSheet(null)} onSave={sendCards} />}
      {sheet === 'flag' && <FlagSheet hands={hands} now={now} onClose={() => setSheet(null)}
        onSend={async (n, text) => { await driver.set(room, `flags/${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`, await seal({ n, text }, key!)); toast('Flag sent to the host.'); setSheet(null); }} />}
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

function CopyHand({ n, blinds, view }: { n: number; blinds: { sb: number; bb: number }; view: HandView }) {
  return (
    <button type="button" className="sat-btn sat-btn--ghost sat-iconbtn felt-copy" aria-label={`Copy hand ${n}`}
      onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(viewText(n, blinds.sb, blinds.bb, view)).then(() => toast(`Hand ${n} copied.`), () => toast('Copy was blocked.')); }}>
      <Icon name="copy" size={18} />
    </button>
  );
}

/** One band: the street name, the board so far (old cards faded, the new card clear), then the action, newest first. */
function Band({ s }: { s: ViewStreet }) {
  return (
    <div className="felt-band">
      <div className="felt-band-title">{s.label}</div>
      {(s.old.length > 0 || s.fresh.length > 0) && (
        <div className="felt-band-cards">
          {s.old.length > 0 && <span className="felt-cards-old"><Cards cards={s.old} size="sm" /></span>}
          <Cards cards={s.fresh} size="sm" />
        </div>
      )}
      {(s.shown ?? []).map((x) => (
        <div key={x.name} className="felt-band-shown"><span>{x.name}</span><Cards cards={x.cards} size="sm" />{x.rank && <span className="sat-small sat-muted">{x.rank}</span>}</div>
      ))}
      {[...s.lines].reverse().map((l, i) => <div key={i} className="felt-band-line">{l}</div>)}
    </div>
  );
}

function HandFrame({ n, view, blinds, live }: { n: number; view: HandView; blinds: { sb: number; bb: number }; live?: { toAct: string | null; pot: number } }) {
  return (
    <section className="sat-glass-2 felt-frame" aria-label={`Hand ${n}`}>
      <div className="felt-frame-head">
        <h2 className="felt-frame-title">Hand {n}</h2>
        <CopyHand n={n} blinds={blinds} view={view} />
      </div>
      {live && <div className="felt-frame-live"><span>{live.toAct ? <><b>{live.toAct}</b> to act</> : ''}</span><span>Pot <b className="sat-num">{money(live.pot)}</b></span></div>}
      {[...view.streets].reverse().map((s) => <Band key={s.key} s={s} />)}
    </section>
  );
}

function ActionLog({ now, hands, blinds, onFlag }: { now: NowSnapshot | null; hands: PubSnapshot['hands']; blinds: { sb: number; bb: number }; onFlag: () => void }) {
  const closed = now ? hands.filter((h) => h.n !== now.n) : hands;
  return (
    <>
      {!now && !hands.length && <div className="sat-flat sat-card sat-small">No hands yet.</div>}
      {now && <HandFrame n={now.n} view={now.view} blinds={blinds} live={{ toAct: now.toAct, pot: now.pot }} />}
      {closed.map((h) => <HandFrame key={h.n} n={h.n} view={h.view} blinds={blinds} />)}
      <button className="sat-btn sat-btn--ghost" onClick={onFlag}><Icon name="flag" size={18} /> Flag a wrong update</button>
    </>
  );
}

function HandsList({ hands, blinds, onOpen }: { hands: PubSnapshot['hands']; blinds: { sb: number; bb: number }; onOpen: (n: number) => void }) {
  if (!hands.length) return <div className="sat-flat sat-card sat-small">No hands yet.</div>;
  return (
    <div className="sat-stack" style={gap(2)}>
      {hands.map((h) => (
        <div key={h.n} role="button" tabIndex={0} className="sat-glass-2 felt-frame felt-frame--tap" onClick={() => onOpen(h.n)} onKeyDown={(e) => e.key === 'Enter' && onOpen(h.n)}>
          <div className="felt-frame-head">
            <span className="sat-cluster" style={gap(1)}><h2 className="felt-frame-title">Hand {h.n}</h2><CopyHand n={h.n} blinds={blinds} view={h.view} /></span>
            <b className="sat-num">{money(h.pot)}</b>
          </div>
          <span className="sat-small sat-muted">{h.winners.map((w) => `${w.name} +${money(w.amount)}`).join(', ') || 'No winner recorded'}</span>
          {h.board.length > 0 && <Cards cards={h.board} size="sm" />}
          {h.shown.map((s) => <div key={s.name} className="felt-band-shown"><span>{s.name}</span><Cards cards={s.cards} size="sm" /><span className="sat-small sat-muted">{s.rank}</span></div>)}
        </div>
      ))}
    </div>
  );
}

/** The host's hand view, read only: stage tabs and the action boxes. Cards that were not shown never reach this phone. */
function PlayByPlay({ view, board }: { view: HandView; board: Card[] }) {
  const [at, setAt] = useState(view.streets[0]?.key ?? 'preflop');
  const s = view.streets.find((x) => x.key === at);
  const reach = s ? [...s.old, ...s.fresh] : board;
  return (
    <div className="sat-stack" style={gap(3)}>
      <div className="felt-tabs sat-glass felt-join-tabs" role="tablist" aria-label="Hand stage">
        {view.streets.map((x) => <button key={x.key} role="tab" aria-selected={x.key === at} onClick={() => setAt(x.key)}>{x.key === 'preflop' ? 'Pre' : x.key === 'showdown' ? 'End' : x.label}</button>)}
      </div>
      {s && s.key !== 'showdown' && <div className="felt-rec-status"><span /><span>Pot <b className="sat-num">{money(s.pot)}</b></span></div>}
      {s?.key === 'showdown' ? (
        <section className="sat-glass-2 felt-frame">
          {board.length > 0 && <Cards cards={board} />}
          <Band s={s} />
        </section>
      ) : (
        <>
          {reach.length > 0 && <Cards cards={reach} />}
          {s && (
            <div className="felt-acts" style={{ ['--cols' as string]: Math.max(1, s.cols) }}>
              {s.rows.map((r) => (
                <div key={r.name} className={`felt-acts-row ${r.folded ? 'is-folded' : ''}`}>
                  <span className="felt-acts-name"><span className="felt-ellipsis">{r.name}</span>{r.pos && <span className="felt-acts-sub">{r.pos}</span>}</span>
                  <span />
                  {r.cells.map((c, i) => (
                    <span key={i} className={`felt-box is-${c.kind} ${c.past ? 'is-past' : ''}`}>
                      {c.kind === 'fold' || c.kind === 'call' ? <span className="l">{c.t}</span> : c.t ? <span className="n sat-num">{c.t}</span> : null}
                      {c.dark && <span className="felt-box-dark" aria-hidden="true"><Icon name="dark" size={12} stroke={2} /></span>}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PlayersTab({ pub, stacks, me, button }: { pub: PubSnapshot; stacks: StackLine[]; me: Me | null; button: string | null }) {
  const seats = [...pub.players].sort((a, b) => a.seat - b.seat);
  // the signed-in player sits south, otherwise seat 1; the rest follow clockwise
  const at = Math.max(0, seats.findIndex((p) => p.id === me?.id));
  const ring = seats.map((_, i) => seats[(at + i) % seats.length]);
  const all = pub.standings;
  const nows = all.map((s) => s.now);
  const recLow = Math.min(0, ...all.map((s) => s.low)), recHigh = Math.max(0, ...all.map((s) => s.high));
  const scale = candleScale([recLow, recHigh]);
  const mine = all.find((s) => s.id === me?.id);
  return (
    <>
      <div className="sat-glass-2 felt-table-card">
        <div className="felt-table-rail"><div className="felt-table-felt">{pub.game.name}</div></div>
        {ring.map((p, i) => {
          const a = Math.PI / 2 + (i * 2 * Math.PI) / ring.length;
          return (
            <div key={p.id} className={`felt-seat ${p.id === me?.id ? 'is-me' : ''}`} style={{ left: `${50 + 40 * Math.cos(a)}%`, top: `${50 + 40 * Math.sin(a)}%` }}>
              <b className="felt-ellipsis">{p.name}</b>
              <span className="felt-seat-stack sat-num">{stackText(stacks.find((s) => s.name === p.name))}</span>
              {button === p.name && <span className="felt-seat-btn" aria-label="Button">D</span>}
            </div>
          );
        })}
      </div>
      <section className="sat-glass-2 sat-card sat-stack" style={gap(1)}>
        <span className="sat-cluster" style={gap(1)}><b>Table</b><Help k="candleTable" /></span>
        <Candle scale={scale} low={recLow} high={recHigh} from={all.length ? Math.min(...nows) : 0} to={all.length ? Math.max(...nows) : 0} label="Table" />
        {mine && (
          <>
            <span className="sat-cluster" style={gap(1)}><b>Current standing</b><Help k="candleMine" /></span>
            <Candle scale={scale} low={mine.low} high={mine.high} from={0} to={mine.now} mark={mine.now} tone={mine.now < 0 ? 'coral' : 'blue'} label="Current standing" />
          </>
        )}
      </section>
    </>
  );
}

function Rules({ pub }: { pub: PubSnapshot }) {
  return (
    <div className="sat-glass-2 felt-list">
      {pub.rules.map((r) => <div key={r.label} className="felt-row"><span className="felt-row-main sat-cluster" style={gap(1)}>{r.label}{r.tip && <Help k={r.tip as HelpKey} />}</span><span className="sat-small" style={{ textAlign: 'right' }}>{r.value}</span></div>)}
    </div>
  );
}

/* ------------------------------ sheets ------------------------------ */

function CodeSheet({ me, onSubmit, onClose, onLeave }: { me: Me | null; onSubmit: (c: string) => Promise<boolean>; onClose: () => void; onLeave: () => void }) {
  return (
    <Sheet open onClose={onClose} title={me ? me.name : 'Player code'}>
      {me ? <button className="sat-btn sat-btn--block" onClick={onLeave}>Sign out</button> : <CodeBoxes onSubmit={onSubmit} />}
    </Sheet>
  );
}

function HandPick({ hands, now, entered, me, onSave, onClose }: {
  hands: PubSnapshot['hands']; now: NowSnapshot | null; entered: Set<number>; me: Me; onSave: (n: number, cards: Card[]) => Promise<void>; onClose: () => void;
}) {
  const [n, setN] = useState<number | null>(null);
  const live = now && now.view.dealt.includes(me.name) && !hands.some((h) => h.n === now.n) ? [{ n: now.n, blocked: [...now.board, ...(now.view.streets.flatMap((s) => (s.shown ?? []).flatMap((x) => x.cards)))] }] : [];
  const mine = [...live, ...hands.filter((x) => x.dealt.includes(me.name)).map((x) => ({ n: x.n, blocked: [...x.board, ...x.shown.flatMap((s) => s.cards)] }))];
  const h = mine.find((x) => x.n === n);
  if (h) {
    return (
      <CardEntrySheet players={[me.id]} initial={me.id} closeOnSave name={() => me.name} entered={entered.has(h.n) ? [me.id] : []}
        blocked={h.blocked} onClose={onClose}
        onSave={(_p, cards) => { onSave(h.n, cards).catch(() => toast('Cards not sent. Check the connection and try again.')); }} />
    );
  }
  return (
    <Sheet open onClose={onClose} title="Pick a hand" sub="Your cards are write only. Nobody can see them, not even you.">
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
          {hands.filter((h) => h.n !== now?.n).map((h) => <option key={h.n} value={h.n}>Hand {h.n}</option>)}
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
