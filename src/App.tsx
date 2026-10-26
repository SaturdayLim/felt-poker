import { useEffect } from 'react';
import { useStore } from './store';
import { applyTheme } from './theme';
import { useRoute } from './router';
import { Icon, ToastHost } from './components/ui';
import Home from './screens/Home';
import Games from './screens/Games';
import NewGame from './screens/NewGame';
import GameLive from './screens/GameLive';
import HandEditor from './screens/HandEditor';
import CountChips from './screens/CountChips';
import CloseTable from './screens/CloseTable';
import Report from './screens/Report';
import Insights from './screens/Insights';
import Players from './screens/Players';
import Settings from './screens/Settings';

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
  const r = useRoute();
  useEffect(() => { if (hydrated) applyTheme(theme); }, [hydrated, theme]);
  if (!hydrated) return <div className="app" />;

  let screen: JSX.Element;
  let nav = true;
  const [a, b, c, d] = r;
  if (a === 'games') screen = <Games />;
  else if (a === 'new') { screen = <NewGame type={b === 'tournament' ? 'tournament' : 'cash'} />; nav = false; }
  else if (a === 'game' && b) {
    nav = false;
    if (c === 'hand') screen = <HandEditor gameId={b} handId={d} />;
    else if (c === 'count') screen = <CountChips gameId={b} />;
    else if (c === 'close') screen = <CloseTable gameId={b} />;
    else if (c === 'report') screen = <Report gameId={b} />;
    else screen = <GameLive gameId={b} />;
  }
  else if (a === 'insights') screen = <Insights initialPlayer={b} />;
  else if (a === 'players') screen = <Players />;
  else if (a === 'settings') screen = <Settings />;
  else screen = <Home />;

  const active = a === 'game' || a === 'new' ? 'games' : a ?? '';
  return (
    <div className="app">
      {screen}
      {nav && (
        <nav className="nav">
          <div className="inner glass">
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
