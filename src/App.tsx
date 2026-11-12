import { useEffect, useLayoutEffect, useState } from 'react';
import { SPLASH_KEY, useStore } from './store';
import { applyTheme, useResolvedTheme } from './theme';
import { cleanLook, lookBg } from './lib/cards';
import { applyPalette, cleanPalette } from './lib/palette';
import { NAV_TABS, back, go, goTab, guardHistory, parentOf, tabPos, useRoute } from './router';
import { installTabSwipe } from './lib/tabSwipe';
import { flushSync } from 'react-dom';
import { bounceBack, calm } from './lib/motion';
import { FEATURES } from './lib/features';
import { SlidePane, ToastHost } from './components/ui';
import { PlayerHost } from './components/players';
import { NavRail, NewGameFab, ThemeHost } from './components/navRail';
import { SearchHost, type SearchPage } from './components/searchHost';
import Home from './screens/Home';
import Games from './screens/Games';
import NewGame from './screens/NewGame';
import GameLive from './screens/GameLive';
import HandEditorClassic from './screens/HandEditorClassic';
import HandRecorder from './screens/HandRecorder';
import { useStore as useStoreForRoute } from './store';
import CountChips from './screens/CountChips';
import CloseTable from './screens/CloseTable';
import Report from './screens/Report';
import Players from './screens/Players';
import Settings, { settingsView } from './screens/Settings';
import { InstallPopup } from './components/install';
import Start from './screens/Start';
import Group from './screens/Group';
import Join from './screens/Join';
import JoinScan from './screens/JoinScan';
import ReportLink from './screens/ReportLink';
import { resumeSharing, watchGames } from './live/host';
import { cleanReports } from './live/reportLink';
import { WATCH } from './lib/watch';
import Spectator from './screens/Spectator';

const NAV = [
  { path: '', label: 'Home', icon: 'home' },
  { path: 'games', label: 'Games', icon: 'games' },
  { path: 'players', label: 'Players', icon: 'users' },
  { path: 'settings', label: 'Settings', icon: 'settings' },
];

export default function App() {
  const hydrated = useStore((s) => s.hydrated);
  const [role, setRole] = useState<string | null>(() => { try { return sessionStorage.getItem('felt-role'); } catch { return 'host'; } });
  const theme = useStore((s) => s.settings.theme);
  const splashMs = useStore((s) => s.settings.splashMs);
  const face = useStore((s) => lookBg(cleanLook(s.settings.cards)));
  const r = useRoute();
  useEffect(() => { if (hydrated) applyTheme(theme); }, [hydrated, theme]);
  // a field with focus when the tab or the view changes lets go, so the keyboard goes down and the tab bar comes back
  const pageKey = `${r[0] ?? ''}:${r[0] === 'games' ? (r[1] === 'stats' ? 's' : 'l') : r[0] === 'players' ? (r[1] === 'board' || r[1] === 'stats' ? r[1] : 'l') : ''}`;
  useEffect(() => { const el = document.activeElement as HTMLElement | null; if (el?.matches?.('input, textarea, select, [contenteditable]')) el.blur(); }, [pageKey]);
  // the static start shell (app/index.html) gives way to the real first screen in the same frame: same mark, same place
  useLayoutEffect(() => { if (hydrated) document.getElementById('felt-boot')?.remove(); }, [hydrated]);
  // the phone's back swipe (finger moving right) moves to the tab on the left and the forward swipe to the tab on the right (like a drag across the page); at Settings and Home they bounce
  useEffect(() => guardHistory((way) => {
    const top = window.location.hash.replace(/^#\/?/, '').split('/')[0] ?? '';
    const i = NAV_TABS.indexOf(top === 'insights' ? 'players' : top);
    const to = NAV_TABS[i + (way === 'back' ? -1 : 1)];
    if (i >= 0 && to !== undefined && document.querySelector('.felt-nav')) { goTab(to); return; }
    // a sub page: the back swipe leaves it for the screen it came from (or its logical parent after a reload)
    const parent = way === 'back' ? parentOf(window.location.hash, (id) => useStore.getState().games.find((g) => g.id === id)?.status === 'closed') : undefined;
    if (parent !== undefined) back(parent); else bounceBack(way === 'back' ? 1 : -1);
  }), []);
  // a drag across the page moves to the neighbouring tab, or bounces at Home and Settings
  useEffect(() => installTabSwipe(), []);
  useEffect(() => { document.documentElement.style.setProperty('--felt-card-face', face); }, [face]);
  const palette = useStore((s) => s.settings.palette);
  // the open theme, not the preference: with Phone, an OS switch to dark must swap in the dark set
  const shownTheme = useResolvedTheme(theme);
  useEffect(() => { applyPalette(cleanPalette(palette)); }, [palette, shownTheme]);
  // live link: reconnect to rooms that were open, and publish changes to shared games
  useEffect(() => {
    // the spectator window only reads: no live room, no clean-up
    if (!hydrated || WATCH) return;
    resumeSharing();
    cleanReports().catch(() => undefined);
    return watchGames();
  }, [hydrated]);
  useEffect(() => { if (hydrated && !WATCH) try { localStorage.setItem(SPLASH_KEY, String(splashMs)); } catch { /* private mode */ } }, [hydrated, splashMs]);
  // an open keyboard must not cover the field being typed in
  useEffect(() => {
    const vv = window.visualViewport;
    const html = document.documentElement;
    // a field that brings up the on-screen keyboard
    const TEXT = 'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="file"]):not([type="image"]):not([type="hidden"]), textarea, select, [contenteditable]:not([contenteditable="false"])';
    const typing = () => !!(document.activeElement as HTMLElement | null)?.matches?.(TEXT);
    const touch = window.matchMedia?.('(hover: none) and (pointer: coarse)');
    // the gap under the visual viewport; on first load iOS can report one with no keyboard open
    const gap = () => (vv ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) : 0);
    let back: number | undefined;
    const fit = () => {
      if (!vv) return;
      const root = html.style;
      // only a focused text field has a keyboard: any other gap is not one
      root.setProperty('--felt-kb', `${typing() ? gap() : 0}px`);
      // the height left above the keyboard: an open sheet never grows past it, so its top stays on screen
      root.setProperty('--felt-vvh', `${vv.height}px`);
      // the keyboard has gone: the tab bar comes back
      if (!typing() && gap() < 80 && html.classList.contains('felt-typing')) { window.clearTimeout(back); html.classList.remove('felt-typing'); }
    };
    // the keyboard comes up in front of the tab bar: the bar hides at once, before the keyboard moves (nav.css)
    const onIn = () => {
      if (!typing() || !(touch?.matches || gap() > 80)) return;
      window.clearTimeout(back);
      html.classList.add('felt-typing');
    };
    const onOut = () => {
      window.clearTimeout(back);
      // focus can move straight to the next field; wait for the keyboard to close, or give up after a while
      back = window.setTimeout(() => { if (!typing()) html.classList.remove('felt-typing'); }, 650);
    };
    let t: number | undefined;
    const onFocus = (e: FocusEvent) => {
      onIn();
      const el = e.target as HTMLElement;
      if (!el.matches?.('input:not([type="color"]):not([type="range"]), textarea, select')) return;
      // a sheet moves up by the keyboard height by itself: scrolling the field as well throws it off the top
      if (el.closest('dialog[open]')) return;
      window.clearTimeout(t);
      t = window.setTimeout(() => {
        const r = el.getBoundingClientRect(), bottom = vv ? vv.height + vv.offsetTop : window.innerHeight;
        if (r.bottom > bottom - 12 || r.top < (vv?.offsetTop ?? 0)) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }, 320);
    };
    vv?.addEventListener('resize', fit);
    // iOS pans the page under the keyboard without a resize: follow the pan too
    vv?.addEventListener('scroll', fit);
    document.addEventListener('focusin', onFocus);
    document.addEventListener('focusout', onOut);
    return () => {
      vv?.removeEventListener('resize', fit); vv?.removeEventListener('scroll', fit); document.removeEventListener('focusin', onFocus);
      document.removeEventListener('focusout', onOut); window.clearTimeout(t); window.clearTimeout(back); html.classList.remove('felt-typing');
    };
  }, []);
  // at launch iOS can lay the page out short of the screen (a grey strip under the tab bar) until something scrolls: a tiny scroll lays it out again, as a tab change does
  useEffect(() => {
    if (!hydrated) return;
    const fix = () => { window.scrollTo(0, 1); window.scrollTo(0, 0); };
    const t = [0, 150, 500, 1200].map((ms) => window.setTimeout(fix, ms));
    return () => t.forEach((x) => window.clearTimeout(x));
  }, [hydrated]);
  if (!hydrated) return <div className="felt-app" />;
  // Host or Player: the Start view fades into the next screen (the Nightcap mark morphs into the Home banner mark), never a cut
  const pickRole = (k: 'host' | 'player') => {
    try { sessionStorage.setItem('felt-role', k); } catch { /* private mode */ }
    const root = document.documentElement;
    root.classList.add('felt-roleswap');
    window.setTimeout(() => root.classList.remove('felt-roleswap'), 1000);
    if (k === 'player') { go('join'); window.setTimeout(() => setRole(k), 600); return; }
    const swap = () => flushSync(() => setRole(k));
    if (document.startViewTransition && !calm()) {
      const t = document.startViewTransition(swap);
      t.ready.catch(() => undefined);
      window.setTimeout(() => { try { t.skipTransition(); } catch { /* already done */ } }, 1500);
    } else swap();
  };

  let screen: JSX.Element;
  let nav = true;
  const [a, b, c, d] = r;
  if (a === 'games') screen = <Games player={b} />;
  else if (a === 'new') { screen = <NewGame type={b === 'tournament' && FEATURES.tournaments ? 'tournament' : 'cash'} />; nav = false; }
  else if (a === 'game' && b) {
    nav = false;
    if (c === 'hand') screen = <HandRoute gameId={b} handId={d} />;
    else if (c === 'count') screen = <CountChips gameId={b} />;
    else if (c === 'close') screen = <CloseTable gameId={b} />;
    else if (c === 'settle') screen = <CloseTable gameId={b} view="settle" />;
    else if (c === 'report') screen = <Report gameId={b} />;
    else if (c === 'table') screen = <Spectator gameId={b} />;
    else if (c === 'hands') screen = <GameLive gameId={b} initialTab="hands" />;
    else screen = <GameLive gameId={b} />;
  }
  else if (a === 'watch' && b) { screen = <Spectator gameId={b} alone />; nav = false; }
  else if (a === 'join' && !b) { screen = <JoinScan />; nav = false; }
  else if (a === 'r' && b && c) { screen = <ReportLink id={b} reportKey={c} />; nav = false; }
  else if (a === 'join' && b) { screen = <Join key={`${b}/${c ?? ''}`} room={b} keyFromLink={c} />; nav = false; }
  // stats live in the Players tab; old insights links still work
  else if (a === 'insights') screen = <Players view={b === 'standings' ? 'board' : 'stats'} pid={b === 'standings' ? undefined : b} />;
  else if (a === 'players') screen = <Players view={b === 'board' ? 'board' : b === 'stats' ? 'stats' : 'list'} pid={c} />;
  else if (a === 'group' && b) screen = <Group groupId={b} />;
  else if (a === 'settings') screen = <Settings view={settingsView(b)} />;
  // each time Nightcap opens: Host or Player first; a link to a game skips it
  else if (!role) { screen = <Start onHost={() => pickRole('host')} onPlayer={() => pickRole('player')} />; nav = false; }
  else screen = <Home />;

  // the shared search bar shows on the Games list and the Players list only
  const searchPage: SearchPage = !nav || !role ? null : a === 'games' && b !== 'stats' ? 'games' : a === 'players' && b !== 'board' && b !== 'stats' ? 'players' : null;
  const active = a === 'game' || a === 'new' ? 'games' : a === 'group' || a === 'insights' ? 'players' : a ?? '';
  return (
    <div className="felt-app felt-enter">
      <SlidePane k={a === 'insights' ? 'players' : a ?? ''} i={tabPos(a ?? '')}>{screen}</SlidePane>
      {nav && <NavRail tabs={NAV} active={active} />}
      <ThemeHost show={nav && !!role && Number.isInteger(tabPos(a ?? ''))} />
      <SearchHost page={searchPage} />
      <NewGameFab show={nav && !!role && (a === undefined || a === 'games')} />
      <PlayerHost />
      {role && <InstallPopup />}
      <ToastHost />
    </div>
  );
}

/** New hands use the street-by-street recorder; hands logged the quick way open in the quick editor. */
function HandRoute({ gameId, handId }: { gameId: string; handId?: string }) {
  const hand = useStoreForRoute((s) => s.games.find((g) => g.id === gameId)?.hands.find((h) => h.id === handId));
  if (handId === 'quick') return <HandEditorClassic key={`quick-${gameId}`} gameId={gameId} />;
  if (!handId || handId === 'new') return <HandRecorder key={`new-${gameId}`} gameId={gameId} />;
  return hand?.log ? <HandRecorder key={handId} gameId={gameId} handId={handId} /> : <HandEditorClassic key={handId} gameId={gameId} handId={handId} />;
}
