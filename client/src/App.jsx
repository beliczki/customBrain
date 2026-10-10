import { useState, useEffect, lazy, Suspense } from 'react';
import Capture from './components/Capture.jsx';
import Search from './components/Search.jsx';
import Recent from './components/Recent.jsx';
import Agenda from './components/Agenda.jsx';
import AgentRuns from './components/AgentRuns.jsx';
// Lazy: sigma + graphology (~400 kB) load only when the Graph tab is opened,
// keeping the initial SPA bundle small and the Hetzner build under memory.
const Graph = lazy(() => import('./components/Graph.jsx'));
import Stats from './components/Stats.jsx';
import Export from './components/Export.jsx';
import Settings from './components/Settings.jsx';
import ThemeToggle from './components/ThemeToggle.jsx';
import AppShell from './components/AppShell.jsx';

const APP_NAME = import.meta.env.VITE_APP_NAME || 'customBrain';

// Pre-validates the token against /stats before saving to localStorage. Inline
// error messages for 401 (wrong token) and 429 (rate-limit lockout, since
// 0.24.2). The server's escalating ladder (3 → 1min, 3 → 5min, 3 → 10min,
// 3 → 30min) is global; the message just surfaces the retry-after value.
function UnlockForm({ onAuthenticated }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    const val = e.target.elements.token.value.trim();
    if (!val) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/stats', { headers: { Authorization: `Bearer ${val}` } });
      if (res.ok) {
        onAuthenticated(val);
        return;
      }
      if (res.status === 429) {
        const data = await res.json().catch(() => ({}));
        const seconds = data.retry_after_seconds || 60;
        const display = seconds >= 60 ? `${Math.ceil(seconds / 60)} min` : `${seconds}s`;
        setError(`Too many failed attempts. Locked for ${display}.`);
      } else if (res.status === 401) {
        setError('Wrong token.');
      } else {
        setError(`Unexpected error (HTTP ${res.status}).`);
      }
    } catch (err) {
      setError(`Network error: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen">
      <ThemeToggle />
      <div className="section-row">
        <div className="container">
          <div className="py-24 flex flex-col items-center px-6">
            <img src="/brain_darkmode.svg" alt="" className="w-24 h-24 mb-4 dark:block hidden" />
            <img src="/brain.svg" alt="" className="w-24 h-24 mb-4 dark:hidden" />
            <h1 className="text-2xl font-bold mb-8 text-txt">{APP_NAME}</h1>
            <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
              <input
                name="token"
                type="password"
                placeholder="API token"
                className="w-full px-3 py-2 bg-surface border border-subtle text-txt text-sm"
                autoFocus
                disabled={submitting}
              />
              <button
                type="submit"
                disabled={submitting}
                className="w-full px-6 py-2 bg-accent text-white text-sm font-medium hover:bg-accent-dark disabled:opacity-50 transition-colors"
              >
                {submitting ? 'Unlocking…' : 'Unlock'}
              </button>
              {error && (
                <p className="text-red-600 dark:text-red-400 text-sm text-center">{error}</p>
              )}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  // A ?q= link (a pushed search, 0.72.0) opens on the Search page.
  const [active, setActive] = useState(() => (new URLSearchParams(window.location.search).has('q') ? 'Search' : 'Capture'));
  useEffect(() => {
    const onPop = () => { if (new URLSearchParams(window.location.search).has('q')) setActive('Search'); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  // Traversal replay (0.61.0): Search hands {method, q} to the Graph tab.
  const [traversal, setTraversal] = useState(null);
  // Settings is a dialog over the current page (0.63.1), not a page.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [token, setToken] = useState(localStorage.getItem('ui_secret') || '');
  // While true, we have a token in localStorage but haven't verified it against
  // the server yet. Mount-time validation: if /stats returns 401, the stored
  // token is stale (e.g. UI_SECRET rotated, deployment swapped env, .env reset).
  // Clear it and bounce the user to the Unlock screen instead of letting them
  // see a broken UI that silently 401s every API call.
  const [validating, setValidating] = useState(!!token);
  // Served by the server off the root package.json, so the badge always shows
  // the version that is actually running — not whatever was current when the
  // SPA bundle was last built.
  const [version, setVersion] = useState(null);

  useEffect(() => {
    if (!token) {
      setValidating(false);
      return;
    }
    let canceled = false;
    fetch('/stats', { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (canceled) return;
        if (res.status === 401) {
          localStorage.removeItem('ui_secret');
          setToken('');
        } else if (res.ok) {
          const data = await res.json();
          if (!canceled) setVersion(data.version);
        }
        setValidating(false);
      })
      .catch(() => {
        // Network error — don't kick out, the user may be offline. Let
        // them interact and the next API call will surface the real failure.
        if (!canceled) setValidating(false);
      });
    return () => { canceled = true; };
  }, [token]);

  if (validating) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-txt-ter text-sm">Checking token…</p>
      </div>
    );
  }

  if (!token) {
    return <UnlockForm onAuthenticated={(val) => { localStorage.setItem('ui_secret', val); setToken(val); }} />;
  }

  const navigate = (tab) => { setTraversal(null); setActive(tab); };
  const logout = () => { localStorage.removeItem('ui_secret'); setToken(''); };

  return (
    <AppShell
      appName={APP_NAME}
      version={version}
      active={active}
      onNavigate={navigate}
      onLogout={logout}
      onOpenSettings={() => setSettingsOpen(true)}
      settingsOpen={settingsOpen}
      title={active}
      fullBleed={active === 'Graph'}
      wide={active === 'Search'}
    >
      {active === 'Capture' && <Capture />}
      {/* Search stays mounted (0.71.0): back from the graph replay, its results are still there. */}
      <div className={active === 'Search' ? '' : 'hidden'}>
        <Search active={active === 'Search'} onTraverse={(method, q, steps) => { setTraversal({ method, q, steps }); setActive('Graph'); }} />
      </div>
      {active === 'Recent' && <Recent />}
      {active === 'Agenda' && <Agenda />}
      {active === 'Graph' && (
        <Suspense fallback={<p className="text-txt-ter text-sm p-8">Loading graph…</p>}>
          <Graph traversal={traversal} onCloseTraversal={() => { setTraversal(null); setActive('Search'); }} />
        </Suspense>
      )}
      {active === 'Stats' && <Stats />}
      {active === 'MCP log' && <AgentRuns />}
      {active === 'Export' && <Export />}
      {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} />}
    </AppShell>
  );
}
