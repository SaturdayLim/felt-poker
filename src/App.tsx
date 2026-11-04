import { useEffect } from 'react';
import { SPLASH_KEY, useStore } from './store';
import { applyTheme } from './theme';
import { cleanLook, lookBg } from './lib/cards';
import { NAV_TABS, useRoute } from './router';
import { Icon, SlidePane, TabPill, ToastHost } from './components/ui';
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
import Insights from './screens/Insights';
import Players from './screens/Players';
import Settings from './screens/Settings';
import Group from './screens/Group';
import Join from './screens/Join';
import JoinScan from './screens/JoinScan';
import ReportLink from './screens/ReportLink';
import { resumeSharing, watchGames } from './live/host';
import { cleanReports } from './live/reportLink';

const NAV = [
  { path: '', label: 'Home', icon: 'home' },
  { path: 'games', label: 'Games', icon: 'games' },
  { path: 'insights', label: 'Stats', icon: 'chart' },
  { path: 'players', label: 'Players', icon: 'users' },
  { path: 'settings', label: 'Settings', icon: 'settings' },
];

export default function App() {
  const hydrated = useStore((s) => s.hydrated);
  const theme = useStore((s) => s.settings.theme);
  const splashMs = useStore((s) => s.settings.splashMs);
  const face = useStore((s) => lookBg(cleanLook(s.settings.cards)));
  const r = useRoute();
  useEffect(() => { if (hydrated) applyTheme(theme); }, [hydrated, theme]);
  useEffect(() => { document.documentElement.style.setProperty('--felt-card-face', face); }, [face]);
  // live link: reconnect to rooms that were open, and publish changes to shared games
  useEffect(() => {
    if (!hydrated) return;
    resumeSharing();
    cleanReports().catch(() => undefined);
    return watchGames();
  }, [hydrated]);
  useEffect(() => { if (hydrated) try { localStorage.setItem(SPLASH_KEY, String(splashMs)); } catch { /* private mode */ } }, [hydrated, splashMs]);
  // an open keyboard must not cover the field being typed in
  useEffect(() => {
    const vv = window.visualViewport;
    const fit = () => { if (vv) document.documentElement.style.setProperty('--felt-kb', `${Math.max(0, window.innerHeight - vv.height - vv.offsetTop)}px`); };
    let t: number | undefined;
    const onFocus = (e: FocusEvent) => {
      const el = e.target as HTMLElement;
      if (!el.matches?.('input:not([type="color"]):not([type="range"]), textarea, select')) return;
      window.clearTimeout(t);
      t = window.setTimeout(() => {
        const r = el.getBoundingClientRect(), bottom = vv ? vv.height + vv.offsetTop : window.innerHeight;
        if (r.bottom > bottom - 12 || r.top < (vv?.offsetTop ?? 0)) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }, 320);
    };
    vv?.addEventListener('resize', fit);
    document.addEventListener('focusin', onFocus);
    return () => { vv?.removeEventListener('resize', fit); document.removeEventListener('focusin', onFocus); window.clearTimeout(t); };
  }, []);
  if (!hydrated) return <div className="felt-app" />;

  let screen: JSX.Element;
  let nav = true;
  const [a, b, c, d] = r;
  if (a === 'games') screen = <Games />;
  else if (a === 'new') { screen = <NewGame type={b === 'tournament' ? 'tournament' : 'cash'} />; nav = false; }
  else if (a === 'game' && b) {
    nav = false;
    if (c === 'hand') screen = <HandRoute gameId={b} handId={d} />;
    else if (c === 'count') screen = <CountChips gameId={b} />;
    else if (c === 'close') screen = <CloseTable gameId={b} />;
    else if (c === 'report') screen = <Report gameId={b} />;
    else if (c === 'hands') screen = <GameLive gameId={b} initialTab="hands" />;
    else screen = <GameLive gameId={b} />;
  }
  else if (a === 'join' && !b) { screen = <JoinScan />; nav = false; }
  else if (a === 'r' && b && c) { screen = <ReportLink id={b} reportKey={c} />; nav = false; }
  else if (a === 'join' && b) { screen = <Join key={`${b}/${c ?? ''}`} room={b} keyFromLink={c} />; nav = false; }
  else if (a === 'insights') screen = <Insights initialPlayer={b} />;
  else if (a === 'players') screen = <Players />;
  else if (a === 'group' && b) screen = <Group groupId={b} />;
  else if (a === 'settings') screen = <Settings />;
  else screen = <Home />;

  const active = a === 'game' || a === 'new' ? 'games' : a === 'group' ? 'players' : a ?? '';
  return (
    <div className="felt-app felt-enter">
      <SlidePane k={a ?? ''} i={NAV_TABS.indexOf(a ?? '')}>{screen}</SlidePane>
      {nav && (
        <nav className="felt-nav" aria-label="Main">
          <div className="sat-glass-2">
            <TabPill />
            {NAV.map((n) => (
              <a key={n.path} href={`#/${n.path}`} aria-current={active === n.path ? 'page' : undefined}>
                <Icon name={n.icon} />
                {n.label}
              </a>
            ))}
          </div>
        </nav>
      )}
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
