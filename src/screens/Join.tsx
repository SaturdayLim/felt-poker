/* The player view of a live game. Opened from the host's link or the scanner. A viewer can read the action and the
   settings, read every closed hand street by street, add their own cards (with their code) and flag a wrong update.
   Nothing else: no reports, no awards, no settings. A signed-in player sees only their own hidden cards, never anyone else's. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { CardPair, Empty, Header, Help, Icon, Info, NewItemsPill, Sheet, SlidePane, TabPill, toast, WordButton } from '../components/ui';
import { calm } from '../lib/motion';
import { CardEntrySheet } from '../components/cardEntry';
import { CodeBoxes } from '../components/codeBoxes';
import { BirdsEye } from '../components/birdsEye';
import { RevealProvider, useBigPips, useSeenCards, VCards, ViewerLookSettings } from '../components/viewerLook';
import { StandingChart } from '../components/candle';
import { lock, unlock, type LockBox } from '../report/lock';
import { CHECK_TEXT, keyFromPassphrase, open, seal } from '../live/crypto';
import { pickDriver } from '../live/host';
import { viewText, type HandView, type NowSnapshot, type PubSnapshot, type StackLine, type ViewStreet } from '../live/snapshot';
import type { HelpKey } from '../lib/help';
import type { Card } from '../types';
import { go } from '../router';
import { SHOWDOWN_LOCK } from '../components/cardEntry';

interface Meta { locked?: boolean; check?: string | null; updatedAt?: number; handCount?: number }
interface Me { id: string; name: string; clash?: number[];
  /** This player's hidden cards that the host holds, by hand (entered on the host phone or sent from here).
      Older hosts sent hand numbers only. */
  logged?: number[] | Record<string, Card[]>;
  /** Why each hand to check cannot be right: board, shown or entry. */
  why?: Record<string, string[]> }
/** The hidden cards of each hand that this player can see: theirs only. A number with no cards means cards are logged but unknown here. */
const loggedOf = (me: Me): Record<number, Card[]> => Array.isArray(me.logged) ? Object.fromEntries(me.logged.map((n) => [n, []])) : Object.fromEntries(Object.entries(me.logged ?? {}).map(([n, c]) => [Number(n), c]));
/** Red: a card contradicts the table, and the hand is left out of stats. Blue: it only matches another hidden entry. */
const WHY: Record<string, string> = { board: 'A card is also on the board.', shown: 'Another player showed a card you logged.', entry: 'Another player logged a card you logged.' };
const levelOf = (why: string[] = []) => (why.includes('board') || why.includes('shown') ? 'red' : why.length ? 'blue' : null);
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
/** A random id for this device, kept between visits. It says nothing about the player. */
const deviceId = () => {
  let id = ls.get('felt-device');
  if (!id) { id = Math.random().toString(36).slice(2, 12); ls.set('felt-device', id); }
  return id;
};
const PotLine = ({ h }: { h: PubSnapshot['hands'][number] }) => (
  <span className="sat-small sat-muted felt-frame-cap"><span className="sat-num">Pot: {money(h.pot)}</span> - {/* one winner with the whole pot: the amount would repeat the pot, so only the name shows */}{h.winners.length === 1 && Math.round(h.winners[0].amount) === Math.round(h.pot) ? h.winners[0].name : h.winners.map((w) => `${w.name} (${money(w.amount)})`).join(', ') || 'No winner recorded'}</span>
);
/** Every run of the board, when the rest of the board ran more than once. */
const RunBoards = ({ runs, size }: { runs: NonNullable<HandView['runs']>; size?: 'sm' }) => (
  <div className="felt-runs">
    {runs.map((r, i) => (
      <div key={i} className="felt-run"><span className="sat-caption">Run {i + 1}</span>{r.common.length > 0 && <span className="felt-cards-old"><VCards cards={r.common} size={size} /></span>}<VCards cards={r.cards} size={size} /></div>
    ))}
  </div>
);
/** A player who did not show: the name and "Not shown". No face-down pair, because this phone cannot know if cards were entered. */
const NotShownRows = ({ names }: { names?: string[] }) => <>{(names ?? []).map((m) => <div key={m} className="felt-band-shown"><span>{m}</span><span className="sat-small sat-muted">Not shown</span></div>)}</>;

export default function Join({ room, keyFromLink }: { room: string; keyFromLink?: string }) {
  const driver = useMemo(() => pickDriver(), []);
  const big = useBigPips();
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
  const [cardsHand, setCardsHand] = useState<number | null>(null);
  const [err, setErr] = useState('');
  // cards sent from this phone, by hand, until the host's copy arrives (older pages kept hand numbers only)
  const entered = useRef<Map<number, Card[]>>((() => {
    const v = JSON.parse(ss.get(`felt-join-entered:${room}`) ?? '[]');
    return new Map<number, Card[]>(Array.isArray(v) ? v.map((x: number | [number, Card[]]) => (Array.isArray(x) ? x : [x, []])) : []);
  })());

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
    if (box) unlock<Me>(box, code).then(setMe, () => {
      setMe(null); setCode(null); ss.del(`felt-join-code:${room}`);
      toast('Your code changed. Ask the host for the new code.');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ident, code]);

  // tell the host this device has the game open, and who it is once a code is in; about once a minute while on screen
  const signedName = me?.name ?? null;
  const ready = !!(driver && key && meta);
  useEffect(() => {
    if (!ready) return;
    const say = (bye = false) => { seal({ hello: deviceId(), name: signedName, bye }, key!).then((v) => driver!.set(room, `flags/${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`, v)).catch(() => undefined); };
    say();
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') say(); }, 60000);
    const leave = () => say(true);
    window.addEventListener('pagehide', leave);
    return () => { window.clearInterval(t); window.removeEventListener('pagehide', leave); };
  }, [ready, signedName, driver, room, key]);

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
  // the host closed the room: nothing is left to view here
  if (meta === null) return blank(<Empty title="Room has been closed" action={<button className="sat-btn sat-btn--primary sat-btn--block" onClick={() => go('')}>Home</button>} />);
  if (meta && !key) return <PassForm room={room} meta={meta} onKey={(k) => { setKey(k); ss.set(`felt-join-key:${room}`, k); }} />;
  if (!pub) return blank(<div className="sat-stack" aria-label="Loading the game"><div className="felt-skel" style={{ height: 44 }} /><div className="felt-skel" style={{ height: 220 }} /><div className="felt-skel" style={{ height: 120 }} /></div>);

  const hands = [...pub.hands].sort((a, b) => b.n - a.n);
  const blinds = { sb: pub.game.sb, bb: pub.game.bb };
  const stacks = now?.stacks ?? pub.stacks;
  const sendCards = async (n: number, cards: Card[]) => {
    if (!me || !code) return;
    await driver.set(room, `inbox/${me.id}/${n}`, await lock({ cards }, code));
    entered.current.set(n, cards);
    ss.set(`felt-join-entered:${room}`, JSON.stringify([...entered.current.entries()]));
  };
  // the host tells this player alone, inside the box only their code opens, which hands cannot be right. The host
  // sends a hand only once a later hand is under way
  const toCheck = me?.clash ?? [];
  const shownHand = openHand !== null ? hands.find((h) => h.n === openHand) : undefined;

  if (shownHand) {
    return (
      <div className={`felt-page ${big}`}>
        <Header back={() => setOpenHand(null)} title={`Hand ${shownHand.n}`} sub={pub.game.name} />
        <PlayByPlay view={shownHand.view} board={shownHand.board} />
      </div>
    );
  }

  return (
    <div className={`felt-page ${big}`}>
      <Header title={pub.game.name} sub={me ? me.name : `Live, ${pub.hands.length} ${pub.hands.length === 1 ? 'hand' : 'hands'}`}>
        <div className="felt-tabs sat-glass felt-join-tabs" role="tablist" aria-label="Live game">
          <TabPill />
          {TABS.map((t) => <button key={t.k} role="tab" aria-selected={tab === t.k} onClick={() => setTab(t.k)}>{t.label}</button>)}
        </div>
      </Header>

      <SlidePane k={tab} i={TABS.findIndex((t) => t.k === tab)}>
      <div className="sat-stack" style={gap(3)}>
        {tab === 'action' && <ActionLog pub={pub} stacks={stacks} now={now} hands={hands} blinds={blinds} onFlag={() => setSheet('flag')} />}
        {tab === 'hands' && <HandsList hands={hands} blinds={blinds} onOpen={setOpenHand} />}
        {tab === 'players' && <PlayersTab pub={pub} stacks={stacks} me={me} button={now?.view.button ?? pub.button}
          onCount={me && code ? async (chips) => { await driver.set(room, `inbox/${me.id}/count`, await lock({ count: chips }, code)); } : undefined} />}
        {tab === 'settings' && <><Rules pub={pub} /><ViewerLookSettings /></>}
      </div>
      </SlidePane>

      <button type="button" className="felt-fab felt-fab--page" aria-label={me ? 'Add my cards' : 'Sign in with your player code'} onClick={() => setSheet(me ? 'cards' : 'code')}><Icon name="cardsadd" size={30} stroke={1.8} /></button>

      {sheet === 'code' && <CodeSheet onClose={() => setSheet(null)} onSubmit={async (c) => { const ok = await tryCode(c); if (ok) setSheet('cards'); return ok; }} />}
      {sheet === 'cards' && me && <HandPick hands={hands} now={now} entered={entered.current} me={me} toCheck={toCheck} start={cardsHand} onClose={() => { setSheet(null); setCardsHand(null); }} onSave={sendCards}
        onLeave={() => { setMe(null); setCode(null); ss.del(`felt-join-code:${room}`); setSheet(null); }} />}
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
          <label htmlFor="jp">Password</label>
          <input id="jp" className="sat-input" autoComplete="off" autoCapitalize="off" value={pass} aria-invalid={bad}
            onChange={(e) => { setPass(e.target.value); setBad(false); }} onKeyDown={(e) => e.key === 'Enter' && go()} />
          {bad && <span className="sat-error">Password does not match.</span>}
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
function Band({ s, runs }: { s: ViewStreet; runs?: HandView['runs'] }) {
  return (
    <div className="felt-band">
      <div className="felt-band-title">{s.label}</div>
      {(s.old.length > 0 || s.fresh.length > 0) && (
        <div className="felt-band-cards">
          {s.old.length > 0 && <span className="felt-cards-old"><VCards cards={s.old} size="sm" /></span>}
          <VCards cards={s.fresh} size="sm" reveal />
        </div>
      )}
      {s.key === 'showdown' && runs && <RunBoards runs={runs} size="sm" />}
      {(s.shown ?? []).map((x) => (
        <div key={x.name} className="felt-band-shown"><span>{x.name}</span><VCards cards={x.cards} size="sm" />{x.rank && <span className="sat-small sat-muted">{x.rank}</span>}</div>
      ))}
      <NotShownRows names={s.mucked} />
      {[...s.lines].reverse().map((l, i) => <div key={i} className="felt-band-line">{l}</div>)}
    </div>
  );
}

function HandFrame({ n, view, blinds, live }: { n: number; view: HandView; blinds: { sb: number; bb: number }; live?: { toAct: string | null; pot: number } }) {
  // cards on screen when this frame first shows never flip: only a card that arrives later does
  const seen = useSeenCards(() => view.streets.flatMap((s) => [...s.old, ...s.fresh]));
  return (
    <RevealProvider value={seen}>
    <section className="sat-glass-2 felt-frame" aria-label={`Hand ${n}`}>
      <div className="felt-frame-sum"><h2 className="felt-frame-title">Hand {n}</h2></div>
      <CopyHand n={n} blinds={blinds} view={view} />
      {live && <div className="felt-frame-live"><span>{live.toAct ? <><b>{live.toAct}</b> to act</> : ''}</span><span>Pot <b className="sat-num">{money(live.pot)}</b></span></div>}
      {[...view.streets].reverse().map((s) => <Band key={s.key} s={s} runs={view.runs} />)}
    </section>
    </RevealProvider>
  );
}

function ActionLog({ pub, stacks, now: sent, hands, blinds, onFlag }: { pub: PubSnapshot; stacks: StackLine[]; now: NowSnapshot | null; hands: PubSnapshot['hands']; blinds: { sb: number; bb: number }; onFlag: () => void }) {
  // a new hand shows only after real action: blinds and card entry alone do not count
  const now = sent && sent.acted !== false ? sent : null;
  const closed = now ? hands.filter((h) => h.n !== now.n) : hands;
  // a hand that arrives while the page is scrolled away from the newest raises a pill; a tap jumps up to it
  const latest = Math.max(now?.n ?? 0, ...hands.map((h) => h.n));
  const lastSeen = useRef(latest);
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    const added = latest - lastSeen.current;
    lastSeen.current = latest;
    if (added > 0 && window.scrollY > 160) setUnread((u) => u + added);
  }, [latest]);
  useEffect(() => {
    const on = () => { if (window.scrollY < 80) setUnread(0); };
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  // List (the action log) or Table (the bird's-eye view); the choice stays on this phone
  const [table, setTable] = useState(() => ls.get('felt-viewer-table') === '1');
  const pick = (v: boolean) => { setTable(v); ls.set('felt-viewer-table', v ? '1' : '0'); };
  return (
    <>
      <div className="felt-viewer-switch">
        <div className="sat-seg" role="radiogroup" aria-label="Action view">
          <TabPill />
          <button type="button" role="radio" aria-checked={!table} onClick={() => pick(false)}>List</button>
          <button type="button" role="radio" aria-checked={table} onClick={() => pick(true)}>Table</button>
        </div>
        <Info title="Table view">
          <span style={{ display: 'block' }}>List shows the action as text.</span>
          <span style={{ display: 'block' }}>Table shows the seats from above. The button is at the bottom.</span>
          <span style={{ display: 'block' }}>A ring marks the player to act. Red chips show what a player put in this hand.</span>
        </Info>
      </div>
      {table && <BirdsEye pub={pub} now={sent} stacks={stacks} />}
      {!table && <NewItemsPill count={unread} noun={unread === 1 ? 'hand' : 'hands'} onJump={() => { window.scrollTo({ top: 0, behavior: calm() ? 'auto' : 'smooth' }); setUnread(0); }} />}
      {!table && !now && !hands.length && <div className="sat-flat sat-card sat-small">No hands yet.</div>}
      {!table && now && <HandFrame key={now.n} n={now.n} view={now.view} blinds={blinds} live={{ toAct: now.toAct, pot: now.pot }} />}
      {!table && closed.map((h) => <HandFrame key={h.n} n={h.n} view={h.view} blinds={blinds} />)}
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
          <div className="felt-frame-sum">
            <h2 className="felt-frame-title">Hand {h.n}</h2>
            <PotLine h={h} />
          </div>
          <CopyHand n={h.n} blinds={blinds} view={h.view} />
          {h.view.runs ? <RunBoards runs={h.view.runs} size="sm" /> : h.board.length > 0 && <VCards cards={h.board} size="sm" />}
          {h.shown.map((s) => <div key={s.name} className="felt-band-shown"><span>{s.name}</span><VCards cards={s.cards} size="sm" /><span className="sat-small sat-muted">{s.rank}</span></div>)}
          <NotShownRows names={h.mucked} />
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
        <TabPill />
        {view.streets.map((x) => <button key={x.key} role="tab" aria-selected={x.key === at} onClick={() => setAt(x.key)}>{x.key === 'preflop' ? 'Pre' : x.key === 'showdown' ? 'End' : x.label}</button>)}
      </div>
      {s && s.key !== 'showdown' && <div className="felt-rec-status"><span /><span>Pot <b className="sat-num">{money(s.pot)}</b></span></div>}
      <SlidePane k={at} i={view.streets.findIndex((x) => x.key === at)}>
      {s?.key === 'showdown' ? (
        <section className="sat-glass-2 felt-frame">
          {!view.runs && board.length > 0 && <VCards cards={board} />}
          <Band s={s} runs={view.runs} />
        </section>
      ) : (
        <>
          {reach.length > 0 && <VCards cards={reach} />}
          {s && <StepTable s={s} />}
        </>
      )}
      </SlidePane>
    </div>
  );
}

/** One action per step: each box sits a step to the right of the action before it, so the boxes read in time
    order across the rows, with no columns to line up. Names stay still while the boxes scroll. */
const BOX = 50, ROW = 46, GAP = 4;
/** The step between two actions: two passes round the table fit in the visible width. Nine players give a small step. */
export const stepFor = (view: number, players: number) => Math.max(8, Math.min(BOX + GAP, (view - BOX) / Math.max(1, 2 * players - 1)));
function StepTable({ s }: { s: ViewStreet }) {
  const track = useRef<HTMLDivElement>(null);
  const [view, setView] = useState(260);
  useEffect(() => {
    const t = track.current;
    if (!t) return;
    const fit = () => setView(t.clientWidth - 10);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(t);
    return () => ro.disconnect();
  }, []);
  const step = stepFor(view, s.rows.length);
  // time order: pass by pass round the table, rows in the order they act. Each box sits at least one step right of
  // the one before it, and never on top of the box before it in its own row (after folds the table gets short)
  const placed: { ri: number; c: ViewStreet['rows'][number]['cells'][number]; x: number }[] = [];
  const rowEnd: number[] = [];
  for (let col = 0; col < s.cols; col++) s.rows.forEach((r, ri) => {
    const c = r.cells[col];
    if (!c || c.kind === 'off') return;
    const prev = placed.length ? placed[placed.length - 1].x + step : 0;
    const x = Math.max(prev, rowEnd[ri] ?? 0);
    placed.push({ ri, c, x });
    rowEnd[ri] = x + BOX + GAP;
  });
  const width = placed.length ? placed[placed.length - 1].x + BOX : 0;
  // the newest action sits flush right
  useEffect(() => { const t = track.current; if (t) t.scrollLeft = t.scrollWidth; }, [s]);
  return (
    <div className="felt-steps" style={{ ['--row' as string]: `${ROW}px` }}>
      <div className="felt-steps-names">
        {s.rows.map((r) => (
          <span key={r.name} className={`felt-acts-name ${r.folded ? 'is-folded' : ''}`}><span className="felt-ellipsis">{r.name}</span>{r.pos && <span className="felt-acts-sub">{r.pos}</span>}</span>
        ))}
      </div>
      <div ref={track} className="felt-steps-track">
        <div className="felt-steps-field" style={{ width, height: s.rows.length * ROW }}>
          {s.rows.map((r, ri) => <i key={r.name} className="felt-steps-line" style={{ top: ri * ROW + ROW / 2 }} />)}
          {placed.map(({ ri, c, x }, i) => (
            <span key={i} className={`felt-box is-${c.kind} ${c.past ? 'is-past' : ''}`} style={{ left: x, top: ri * ROW + 3, width: BOX, height: ROW - 6 }}>
              {c.kind === 'allin' && <span className="v">All-in</span>}
              {c.kind === 'fold' || c.kind === 'call' ? <span className="l">{c.t}</span> : c.t ? <span className="n sat-num">{c.t}</span> : null}
              {c.dark && <span className="felt-box-dark" aria-hidden="true"><Icon name="dark" size={12} stroke={2} /></span>}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function PlayersTab({ pub, stacks, me, button, onCount }: { pub: PubSnapshot; stacks: StackLine[]; me: Me | null; button: string | null; onCount?: (chips: number) => Promise<void> }) {
  const seats = [...pub.players].sort((a, b) => a.seat - b.seat);
  // the signed-in player sits south, otherwise seat 1; the rest follow clockwise
  const at = Math.max(0, seats.findIndex((p) => p.id === me?.id));
  const ring = seats.map((_, i) => seats[(at + i) % seats.length]);
  const all = pub.standings;
  const nows = all.map((s) => s.now);
  const table = { low: Math.min(0, ...all.map((s) => s.low)), high: Math.max(0, ...all.map((s) => s.high)), from: all.length ? Math.min(...nows) : 0, to: all.length ? Math.max(...nows) : 0 };
  const mine = all.find((s) => s.id === me?.id);
  return (
    <>
      <div className="sat-glass-2 felt-table-card">
        <div className="felt-table-rail"><div className="felt-table-felt">{pub.game.name}</div></div>
        {ring.map((p, i) => {
          const a = Math.PI / 2 + (i * 2 * Math.PI) / ring.length;
          return (
            <div key={p.id} className={`felt-seat ${p.id === me?.id ? 'is-me' : ''}`} style={{ left: `${50 + 38 * Math.cos(a)}%`, top: `${50 + 37 * Math.sin(a)}%` }}>
              <b className="felt-ellipsis">{p.name}</b>
              <span className="felt-seat-stack sat-num">{stackText(stacks.find((s) => s.name === p.name))}</span>
              {button === p.name && <span className="felt-seat-btn" aria-label="Button">D</span>}
            </div>
          );
        })}
      </div>
      <section className="sat-glass-2 sat-card sat-stack" style={gap(1)}>
        {mine && <span className="sat-cluster" style={gap(1)}><b>Current standing</b><Help k="candleMine" /></span>}
        <StandingChart table={table} mine={mine ? { low: mine.low, high: mine.high, now: mine.now } : undefined} />
        <span className="sat-cluster sat-small sat-muted" style={gap(1)}>Table<Help k="candleTable" /></span>
      </section>
      {me && onCount && <SendCount onCount={onCount} />}
    </>
  );
}

/** The signed-in player sends their own final chip count. The host's End game count starts from it. */
function SendCount({ onCount }: { onCount: (chips: number) => Promise<void> }) {
  const [v, setV] = useState('');
  const n = v.trim() === '' ? null : Number(v.replace(/,/g, ''));
  const ok = n !== null && Number.isFinite(n) && n >= 0;
  return (
    <section className="sat-glass-2 sat-card sat-stack" style={gap(2)}>
      <div className="sat-field">
        <label htmlFor="mycount">My final chip count <Help k="sendCount" /></label>
        <div className="felt-addchips" style={{ borderTop: 0, paddingTop: 0 }}>
          <input id="mycount" className="sat-input sat-num" inputMode="numeric" placeholder="0" value={v} onChange={(e) => setV(e.target.value)} aria-invalid={v !== '' && !ok} />
          <WordButton word="Sent" ready={ok} className="sat-btn sat-btn--primary sat-btn--lg" aria-disabled={!ok}
            run={() => { if (ok) onCount(Math.round(n!)).then(() => setV(''), () => toast('Count not sent. Check the connection and try again.')); }}>Send</WordButton>
        </div>
      </div>
    </section>
  );
}

function Rules({ pub }: { pub: PubSnapshot }) {
  const row = (r: PubSnapshot['rules'][number], label = r.label) => <div key={r.label} className="felt-row"><span className="felt-row-main sat-cluster" style={gap(1)}>{label}{r.tip && <Help k={r.tip as HelpKey} />}</span><span className="sat-small" style={{ textAlign: 'right' }}>{r.value}</span></div>;
  const is27 = (r: PubSnapshot['rules'][number]) => /^2-7 (win|hand|amount)$/.test(r.label);
  const b27 = pub.rules.filter(is27);
  return (
    <>
      <div className="sat-glass-2 felt-list">{pub.rules.filter((r) => !is27(r)).map((r) => row(r))}</div>
      {b27.length > 0 && (
        <section className="sat-glass-2 felt-list felt-rule-group" aria-label="2-7 bounty">
          <span className="sat-caption felt-rule-cap">2-7 bounty <Help k="bounty27" /></span>
          {b27.map((r) => row(r, r.label[4].toUpperCase() + r.label.slice(5)))}
        </section>
      )}
    </>
  );
}

/* ------------------------------ sheets ------------------------------ */

function CodeSheet({ onSubmit, onClose }: { onSubmit: (c: string) => Promise<boolean>; onClose: () => void }) {
  return (
    <Sheet open onClose={onClose} title="Player code">
      <CodeBoxes onSubmit={onSubmit} />
    </Sheet>
  );
}

/** The cards this player showed at the table in a hand, if any. */
const shownBy = (view: HandView, name: string): Card[] => view.streets.flatMap((s) => s.shown ?? []).find((x) => x.name === name)?.cards ?? [];

function HandPick({ hands, now, entered, me, toCheck, start, onSave, onClose, onLeave }: {
  hands: PubSnapshot['hands']; now: NowSnapshot | null; entered: Map<number, Card[]>; me: Me; toCheck: number[]; start: number | null; onSave: (n: number, cards: Card[]) => Promise<void>; onClose: () => void; onLeave: () => void;
}) {
  const live = now && now.view.dealt.includes(me.name) && !hands.some((h) => h.n === now.n) ? [{ n: now.n, blocked: now.board, shown: shownBy(now.view, me.name) }] : [];
  const mine = [...live, ...hands.filter((x) => x.dealt.includes(me.name)).map((x) => ({ n: x.n, blocked: x.board, shown: x.shown.find((s) => s.name === me.name)?.cards ?? [] }))];
  // cards shown at the table belong to the host's showdown: they cannot be replaced from here
  const [n, setN] = useState<number | null>(() => (start !== null && mine.find((x) => x.n === start)?.shown.length ? null : start));
  const pick = (x: (typeof mine)[number]) => { if (x.shown.length) toast(SHOWDOWN_LOCK); else setN(x.n); };
  const host = loggedOf(me);
  // the host copy wins once it arrives: the host may have replaced what this phone sent
  const known = (k: number): Card[] => (host[k]?.length ? host[k] : entered.get(k) ?? []);
  const hidden = (k: number) => entered.has(k) || k in host;
  const flagOf = (k: number) => (toCheck.includes(k) ? levelOf(me.why?.[k] ?? ['entry']) : null);
  const reason = (k: number) => [...(me.why?.[k] ?? ['entry']).map((w) => WHY[w]).filter(Boolean),
    flagOf(k) === 'red' ? 'This hand is left out of your stats until you change the cards.' : 'This hand still counts.'].join(' ');
  const h = mine.find((x) => x.n === n);
  if (h) {
    return (
      <CardEntrySheet players={[me.id]} initial={me.id} closeOnSave edge name={() => me.name} entered={hidden(h.n) ? [me.id] : []} known={known(h.n)}
        blocked={h.blocked} onClose={onClose}
        onSave={(_p, cards) => { onSave(h.n, cards).catch(() => toast('Cards not sent. Check the connection and try again.')); }} />
    );
  }
  return (
    <Sheet open onClose={onClose} edge title={me.name} sub="Nobody else can see your hidden cards.">
      <div className="sat-glass-2 felt-list">
        {!mine.length && <div className="felt-row sat-small sat-muted">No hands for you yet.</div>}
        {mine.map((x) => (
          <div key={x.n} className="felt-row felt-row--flag">
            <button type="button" className="felt-row-hit" onClick={() => pick(x)} aria-label={`Hand ${x.n}${x.shown.length ? ', shown at the table' : hidden(x.n) ? ', hidden cards logged' : ''}`}>
              <span className="felt-row-main"><span className="felt-row-title">Hand {x.n}</span></span>
              {/* the player's own cards show face up: shown at the table, or hidden and known on this phone */}
              {x.shown.length ? <VCards cards={x.shown} size="sm" /> : known(x.n).length === 2 ? <VCards cards={known(x.n)} size="sm" /> : <CardPair filled={hidden(x.n)} />}
              {/* open eye: shown at the table. Shut eye: hidden cards logged */}
              {(x.shown.length > 0 || hidden(x.n)) && <span className="felt-eye" aria-hidden="true"><Icon name={x.shown.length ? 'eye' : 'dark'} size={18} /></span>}
            </button>
            {/* red: contradicts the table. Blue: matches another hidden entry. Tap for the reason */}
            {flagOf(x.n) && <button type="button" className={`felt-flag is-${flagOf(x.n)}`} aria-label={`Hand ${x.n}: cards cannot all be right. Show why`} onClick={() => toast(reason(x.n))}>!</button>}
          </div>
        ))}
      </div>
      <button className="sat-btn sat-btn--block" onClick={onLeave}>Sign out</button>
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
      <WordButton word="Sent" ready={!!text.trim()} className="sat-btn sat-btn--primary sat-btn--lg sat-btn--block" aria-disabled={!text.trim()} run={() => { if (text.trim()) onSend(n, text.trim()); }}>Send to host</WordButton>
    </Sheet>
  );
}
