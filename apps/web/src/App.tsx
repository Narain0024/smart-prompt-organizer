import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, hasToken } from './api';
import Dashboard from './pages/Dashboard';
import Library from './pages/Library';
import Settings from './pages/Settings';
import Collections from './pages/Collections';
import Placeholder from './pages/Placeholder';

const NAV: { path: string; label: string }[] = [
  { path: '/', label: 'Dashboard' }, { path: '/prompts', label: 'My Prompts' },
  { path: '/studio', label: 'Prompt Studio' }, { path: '/collections', label: 'Collections' },
  { path: '/dna', label: 'Prompt DNA' }, { path: '/knowledge', label: 'Knowledge Base' },
  { path: '/settings', label: 'Settings' },
];
const PLANNED: Record<string, { title: string; stage: string; blurb: string }> = {
  '/studio': { title: 'Prompt Studio', stage: 'Stage 5', blurb: 'Polish, expand, analyze and build prompts with AI.' },
  '/dna': { title: 'Prompt DNA', stage: 'Stage 6', blurb: 'Evidence-based analytics about how you write prompts.' },
  '/knowledge': { title: 'Knowledge Base', stage: 'Stage 7', blurb: 'Insights and connections across your prompts.' },
};

const routeOf = () => location.hash.replace(/^#/, '') || '/';

export default function App() {
  const [route, setRoute] = useState(routeOf());
  useEffect(() => {
    const on = () => setRoute(routeOf());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const health = useQuery({ queryKey: ['health'], queryFn: api.health });

  if (!hasToken()) {
    return (
      <main className="main" style={{ margin: '10vh auto' }}>
        <h1>Open the app from the server</h1>
        <p className="muted">Start the backend with <code>npm run dev:server</code>, then open the “Open the app” URL it prints. It carries a one-time session token.</p>
      </main>
    );
  }

  const collectionMatch = route.match(/^\/collections(?:\/([^/]+))?$/);
  let page;
  if (route === '/') page = <Dashboard />;
  else if (route === '/prompts') page = <Library />;
  else if (route === '/settings') page = <Settings />;
  else if (collectionMatch) page = <Collections id={collectionMatch[1]} />;
  else if (PLANNED[route]) page = <Placeholder {...PLANNED[route]} />;
  else page = <Placeholder title="Page not found" stage="" blurb="That address doesn’t exist." />;

  return (
    <div className="shell">
      <nav className="side" aria-label="Main">
        <div className="logo">Prompt Organizer</div>
        {NAV.map((n) => (
          <a key={n.path} className="nav" href={`#${n.path}`} aria-current={route === n.path || (n.path !== '/' && route.startsWith(n.path + '/')) ? 'page' : undefined}>{n.label}</a>
        ))}
      </nav>
      <main className="main">
        {health.isError && <div className="err" role="alert">{(health.error as Error).message}</div>}
        {page}
      </main>
    </div>
  );
}
