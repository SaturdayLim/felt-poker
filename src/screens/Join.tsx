/* The player view of a live game. Opened from the host's link or the scanner. A viewer can read the action and the
   settings, read every closed hand street by street, add their own cards (with their code) and flag a wrong update.
   Nothing else: no reports, no awards, no settings. A signed-in player sees only their own hidden cards, never anyone else's. */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CardPair, PlayingCard, useCardLook, Empty, Header, Help, Icon, NewItemsPill, NumericText, Sheet, SlidePane, TabPill, toast, WordButton } from '../components/ui';
import { calm } from '../lib/motion';
import { isRangeStack } from '../lib/stacks';
import { CardEntrySheet } from '../components/cardEntry';
import { CodeBoxes } from '../components/codeBoxes';
import { BountyHandTip, BountyWinTip, MinRaiseTip } from '../components/rules';
import { ViewerTable } from '../components/viewerTable';
import type { FeltMe } from '../components/tableFelt';
import { FELT_HUES, type FeltHand } from '../lib/felt';
import { SUIT_SYMBOL, lookColor, rankLabel } from '../lib/cards';
import { RevealProvider, useBigPips, useSeenCards, VCards, ViewerLookSettings } from '../components/viewerLook';
import { StandingChart } from '../components/candle';
import { lock, unlock, type LockBox } from '../report/lock';
import { CHECK_TEXT, keyFromPassphrase, open, seal } from '../live/crypto';
import { pickDriver } from '../live/host';
import { viewText, type HandView, type NowSnapshot, type PubSnapshot, type StackLine, type ViewStreet } from '../live/snapshot';
import type { HelpKey } from '../lib/help';
import type { Card, PlayerLook } from '../types';
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
type Tab = 'action' | 'hands' | 'players' | 'game' | 'cards';
/* Each view is one icon; the open one opens out to its title, as on the host pages (owner, 13 Nov 2026). */
const TABS: { k: Tab; label: string; icon: string }[] = [
  { k: 'action', label: 'Action', icon: 'book' }, { k: 'hands', label: 'Hands', icon: 'cards' }, { k: 'players', label: 'Players', icon: 'person' },
  { k: 'game', label: 'Game Settings', icon: 'chip' }, { k: 'cards', label: 'Card Settings', icon: 'spade' },
];

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
/** A range stack shows no figure. */
const stackText = (bb: number, s?: StackLine) => (!s || s.stack === null ? '-' : isRangeStack(s.spread, bb) ? '' : money(s.stack));
/** A random id for this device, kept between visits. It says nothing about the player. */
const deviceId = () => {
  let id = ls.get('felt-device');
  if (!id) { id = Math.random().toString(36).slice(2, 12); ls.set('felt-device', id); }
  return id;
};
const PotLine = ({ h }: { h: PubSnapshot['hands'][number] }) => (
  // the pot figure keeps the digits of the row (no even-width digits: the Geist tabular 1 has a foot and reads as a serif)
  <span className="sat-small sat-muted felt-frame-cap"><span>Pot: {money(h.pot)}</span> -{/* one winner with the whole pot: the amount would repeat the pot, so only the name shows */}{h.winners.length === 1 && Math.round(h.winners[0].amount) === Math.round(h.pot) ? h.winners[0].name : h.winners.map((w) => `${w.name} (${money(w.amount)})`).join(', ') || 'No winner recorded'}</span>
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
  // the look this player just chose, shown at once on this phone; the host sends it to everyone with the next snapshot
  const [myLook, setMyLook] = useState<PlayerLook | null>(null);
  // the Sign in words stay on the card button until the first sign-in on this phone
  const [signedOnce, setSignedOnce] = useState(() => ls.get('felt-viewer-signed-once') === '1');
  useEffect(() => { if (me && !signedOnce) { ls.set('felt-viewer-signed-once', '1'); setSignedOnce(true); } }, [me, signedOnce]);
  const words = !signedOnce && !me;
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
  if (meta === null) return blank(<Empty title="Room closed. Please ask Host to share new link or report." action={<button className="sat-btn sat-btn--primary sat-btn--block" onClick={() => go('')}>Home</button>} />);
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
  // the Table: this player's own look, and the card button that opens into the code boxes or the cards
  const mineNow = me ? pub.players.find((p) => p.name === me.name) : undefined;
  const look: PlayerLook = myLook ?? { hue: mineNow?.hue, photo: mineNow?.photo };
  const tablePub = me && myLook ? { ...pub, players: pub.players.map((p) => (p.name === me.name ? { ...p, hue: myLook.hue, photo: myLook.photo } : p)) } : pub;
  const sendLook = async (next: PlayerLook) => {
    if (!me || !code) return;
    setMyLook(next);
    try { await driver.set(room, `inbox/${me.id}/look`, await lock(next, code)); } catch { toast('Not sent. Check the connection and try again.'); }
  };
  const tableMe: FeltMe | undefined = me && code ? { id: me.name, panel: (close) => <LookPanel look={look} seat={pub.players.findIndex((p) => p.name === me.name)} onSet={sendLook} onClose={close} /> } : undefined;
  const tableCorner = (hand: FeltHand) => <TableCards me={me} onShow={hand.n} hands={hands} now={now} entered={entered.current} tryCode={tryCode} onSave={sendCards}
    onLeave={() => { setMe(null); setCode(null); setMyLook(null); ss.del(`felt-join-code:${room}`); }} />;
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
      <Header banner={pub.game.name} sub={me ? me.name : `Live, ${pub.hands.length} ${pub.hands.length === 1 ? 'hand' : 'hands'}`}
        tabs={TABS.map((t) => ({ label: t.label, icon: t.icon, on: tab === t.k, go: () => (tab === t.k ? window.scrollTo({ top: 0, behavior: calm() ? 'auto' : 'smooth' }) : setTab(t.k)) }))} />

      <SlidePane k={tab} i={TABS.findIndex((t) => t.k === tab)}>
      <div className="sat-stack" style={gap(3)}>
        {tab === 'action' && <ActionLog pub={pub} stacks={stacks} now={now} hands={hands} blinds={blinds} onFlag={() => setSheet('flag')}
          tablePub={tablePub} tableCorner={tableCorner} tableMe={tableMe} />}
        {tab === 'hands' && <HandsList hands={hands} blinds={blinds} onOpen={setOpenHand} />}
        {tab === 'players' && <PlayersTab pub={pub} stacks={stacks} me={me} button={now?.view.button ?? pub.button}
          onCount={me && code ? async (chips) => { await driver.set(room, `inbox/${me.id}/count`, await lock({ count: chips }, code)); } : undefined} />}
        {tab === 'game' && <Rules pub={pub} />}
        {tab === 'cards' && <ViewerLookSettings />}
      </div>
      </SlidePane>

      {/* first-time players read "Sign in" with the icon; after the first sign-in on this phone the words fold away */}
      <button type="button" className="felt-fab felt-fab--page felt-fab--words" data-words={words} aria-label={me ? 'Add my cards' : 'Sign in with your player code'} onClick={() => setSheet(me ? 'cards' : 'code')}>
        <Icon name="cardsadd" size={30} stroke={1.8} />
        <span className="felt-fab-words" aria-hidden="true">Sign in</span>
      </button>

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
      {live && <div className="felt-frame-live"><span>{live.toAct ? <><b>{live.toAct}</b> to act</> : ''}</span><span>Pot <b className="sat-num"><NumericText value={money(live.pot)} /></b></span></div>}
      {[...view.streets].reverse().map((s) => <Band key={s.key} s={s} runs={view.runs} />)}
    </section>
    </RevealProvider>
  );
}

function ActionLog({ stacks, now: sent, hands, blinds, onFlag, tablePub, tableCorner, tableMe }: { pub: PubSnapshot; stacks: StackLine[]; now: NowSnapshot | null; hands: PubSnapshot['hands']; blinds: { sb: number; bb: number }; onFlag: () => void; tablePub: PubSnapshot; tableCorner: (hand: FeltHand) => ReactNode; tableMe?: FeltMe }) {
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
        <Help k="viewerAction" />
      </div>
      {table && <ViewerTable pub={tablePub} now={sent} stacks={stacks} onBack={() => pick(false)} corner={tableCorner} me={tableMe} />}
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
      {s && s.key !== 'showdown' && <div className="felt-rec-status"><span /><span>Pot <b className="sat-num"><NumericText value={money(s.pot)} /></b></span></div>}
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
              <span className="felt-seat-stack sat-num"><NumericText value={stackText(pub.game.bb, stacks.find((s) => s.name === p.name))} /></span>
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

const B27_NAME: Record<string, string> = { win: 'Win condition', hand: 'Hand', amount: 'Bounty (chips)' };

function Rules({ pub }: { pub: PubSnapshot }) {
  const row = (r: PubSnapshot['rules'][number], label = r.label) => <div key={r.label} className="felt-row"><span className="felt-row-main sat-cluster" style={gap(1)}>{label}{r.tip === 'minRaise' ? <MinRaiseTip value={r.value} /> : r.tip === 'bountyWin' ? <BountyWinTip value={r.value} /> : r.tip === 'bountyHand' ? <BountyHandTip value={r.value} /> : r.tip && <Help k={r.tip as HelpKey} />}</span><span className="sat-small" style={{ textAlign: 'right' }}>{r.value}</span></div>;
  const is27 = (r: PubSnapshot['rules'][number]) => /^7-2 (win|hand|amount)$/.test(r.label);
  const b27 = pub.rules.filter(is27);
  return (
    <>
      <div className="sat-glass-2 felt-list">{pub.rules.filter((r) => !is27(r)).map((r) => row(r))}</div>
      {b27.length > 0 && (
        <section className="sat-glass-2 felt-list felt-rule-group" aria-label="7-2 bounty">
          <span className="sat-caption felt-rule-cap">7-2 bounty <Help k="bounty27" /></span>
          {b27.map((r) => row(r, B27_NAME[r.label.slice(4)] ?? r.label))}
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

/** The card button of the Table. It opens out of itself, in the table's own direction: the player code boxes for a player who has
    not logged on, else this player's cards for the hand on show, ready to pick. Cards go to the host as from the card sheet. */
function TableCards({ me, onShow, hands, now, entered, tryCode, onSave, onLeave }: {
  me: Me | null; onShow: number; hands: PubSnapshot['hands']; now: NowSnapshot | null; entered: Map<number, Card[]>;
  tryCode: (c: string) => Promise<boolean>; onSave: (n: number, cards: Card[]) => Promise<void>; onLeave: () => void;
}) {
  const cardLook = useCardLook();
  const [open, setOpen] = useState(false);
  // the panel keeps its content while it closes
  const [kept, setKept] = useState(false);
  const show = (v: boolean) => { setOpen(v); if (v) setKept(true); else window.setTimeout(() => setKept(false), 260); };
  const live = me && now && now.acted !== false && now.view.dealt.includes(me.name) && !hands.some((h) => h.n === now.n) ? [{ n: now.n, blocked: now.board, shown: shownBy(now.view, me.name) }] : [];
  const mine = me ? [...live, ...hands.filter((x) => x.dealt.includes(me.name)).map((x) => ({ n: x.n, blocked: x.board, shown: x.shown.find((s) => s.name === me.name)?.cards ?? [] }))] : [];
  const host = me ? loggedOf(me) : {};
  const known = (k: number): Card[] => (host[k]?.length ? host[k] : entered.get(k) ?? []);
  const [n, setN] = useState<number | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const h = mine.find((x) => x.n === n) ?? null;
  const choose = (k: number) => { setN(k); setCards(known(k).slice(0, 2)); };
  // it opens on the hand on show when this player was dealt in, else on their newest hand
  const openUp = () => { const first = mine.find((x) => x.n === onShow) ?? mine[0]; if (first) choose(first.n); show(true); };
  // a player who has just logged on goes straight to their cards
  const logOn = async (c: string) => tryCode(c);
  useEffect(() => { setN(null); setCards([]); }, [me?.id]);
  useEffect(() => { if (open && me && n === null && mine.length) choose((mine.find((x) => x.n === onShow) ?? mine[0]).n); }); // eslint-disable-line react-hooks/exhaustive-deps
  const tap = (c: Card) => setCards((was) => (was.includes(c) ? was.filter((x) => x !== c) : was.length < 2 ? [...was, c] : was));
  const save = () => { if (!h || cards.length !== 2) return; onSave(h.n, cards).then(() => toast('Cards saved.'), () => toast('Cards not sent. Check the connection and try again.')); show(false); };
  return (
    <span className="tfc">
      {open && <button type="button" className="tfc-veil" aria-label="Close" onClick={() => show(false)} />}
      <div className="tfc-panel" data-open={open} role="dialog" aria-label={me ? 'Add own hand' : 'Player code'} aria-hidden={!open}>
        {kept && !me && <><b className="tfc-title">Player code</b><CodeBoxes onSubmit={logOn} /></>}
        {kept && me && (
          <>
            <div className="tfc-head">
              {mine.length > 0 && (
                <select className="tfp-pick" aria-label="Hand" value={h?.n ?? ''} onChange={(e) => choose(Number(e.target.value))}>
                  {mine.map((x) => <option key={x.n} value={x.n}>Hand {x.n}</option>)}
                </select>
              )}
              <span className="tfc-pair">{[0, 1].map((i) => <PlayingCard key={i} card={(h?.shown.length ? h.shown : cards)[i] ?? null} size="sm" />)}</span>
              <button type="button" className="tfc-text" onClick={() => { show(false); onLeave(); }}>Sign out</button>
            </div>
            {!mine.length && <p className="tfc-note">No hands for you yet.</p>}
            {h && h.shown.length > 0 && <p className="tfc-note">{SHOWDOWN_LOCK}</p>}
            {h && !h.shown.length && (
              <>
                <div className="tfc-grid">
                  {[...'shdc'].flatMap((su) => [...'AKQJT98765432'].map((r) => {
                    const c = (r + su) as Card;
                    return <button key={c} type="button" disabled={h.blocked.includes(c)} aria-pressed={cards.includes(c)} aria-label={`${rankLabel(c)} ${SUIT_SYMBOL[su]}`} style={{ color: cards.includes(c) ? undefined : lookColor(cardLook, su) }} onClick={() => tap(c)}>{rankLabel(c)}<i>{SUIT_SYMBOL[su]}</i></button>;
                  }))}
                </div>
                <div className="tfc-foot"><span className="tfc-note">Nobody else can see your hidden cards.</span><button type="button" className="tfc-save" disabled={cards.length !== 2} onClick={save}>Save</button></div>
              </>
            )}
          </>
        )}
      </div>
      <button type="button" className="tfp-fab" aria-label={me ? 'Add own hand' : 'Log on with your player code'} aria-expanded={open} onClick={() => (open ? show(false) : openUp())}><Icon name="cardsadd" size={28} stroke={1.8} /></button>
    </span>
  );
}

/** A photo as a small square JPEG (96 px), so it fits in the game snapshot. */
async function smallPhoto(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((ok, no) => { img.onload = () => ok(); img.onerror = () => no(new Error('photo')); img.src = url; });
    const side = Math.min(img.naturalWidth, img.naturalHeight), c = document.createElement('canvas');
    c.width = c.height = 96;
    c.getContext('2d')!.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 96, 96);
    return c.toDataURL('image/jpeg', 0.72);
  } finally { URL.revokeObjectURL(url); }
}

/** Your own look on the Table: a tap on a colour sets it; Photo opens the camera. Each change goes to the host at once. */
function LookPanel({ look, seat, onSet, onClose }: { look: PlayerLook; seat: number; onSet: (l: PlayerLook) => void; onClose: () => void }) {
  const hue = look.hue ?? Math.max(0, seat) % FELT_HUES.length;
  const take = async (f?: File) => { if (!f) return; try { onSet({ hue, photo: await smallPhoto(f) }); onClose(); } catch { toast('This photo cannot be read. Try another.'); } };
  return (
    <div className="tfl">
      <div className="tfl-hues" role="radiogroup" aria-label="Your colour">
        {FELT_HUES.map((c, i) => <button key={c} type="button" role="radio" aria-checked={i === hue} aria-label={`Colour ${i + 1}`} style={{ background: c }} onClick={() => onSet({ ...look, hue: i })} />)}
      </div>
      <div className="tfl-row">
        <label className="tfl-btn">Photo<input type="file" accept="image/*" capture="user" hidden onChange={(e) => { void take(e.target.files?.[0]); e.target.value = ''; }} /></label>
        {look.photo && <button type="button" className="tfl-btn" onClick={() => onSet({ hue })}>No photo</button>}
      </div>
    </div>
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
