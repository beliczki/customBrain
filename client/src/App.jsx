import { useState, useEffect } from 'react';
import Capture from './components/Capture.jsx';
import Search from './components/Search.jsx';
import Recent from './components/Recent.jsx';
import Agenda from './components/Agenda.jsx';
import Stats from './components/Stats.jsx';
import Export from './components/Export.jsx';
import Settings from './components/Settings.jsx';
import ThemeToggle from './components/ThemeToggle.jsx';
import pkg from '../package.json';

const tabs = ['Capture', 'Search', 'Recent', 'Agenda', 'Stats', 'Export', 'Settings'];
const APP_NAME = import.meta.env.VITE_APP_NAME || 'customBrain';
const APP_VERSION = pkg.version;

export default function App() {
  const [active, setActive] = useState('Capture');
  const [token, setToken] = useState(localStorage.getItem('ui_secret') || '');
  // While true, we have a token in localStorage but haven't verified it against
  // the server yet. Mount-time validation: if /stats returns 401, the stored
  // token is stale (e.g. UI_SECRET rotated, deployment swapped env, .env reset).
  // Clear it and bounce the user to the Unlock screen instead of letting them
  // see a broken UI that silently 401s every API call.
  const [validating, setValidating] = useState(!!token);

  useEffect(() => {
    if (!token) {
      setValidating(false);
      return;
    }
    let canceled = false;
    fetch('/stats', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (canceled) return;
        if (res.status === 401) {
          localStorage.removeItem('ui_secret');
          setToken('');
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
    return (
      <div className="min-h-screen">
        <ThemeToggle />
        <div className="section-row">
          <div className="container">
            <div className="py-24 flex flex-col items-center px-6">
              <img src="/brain_darkmode.svg" alt="" className="w-24 h-24 mb-4 dark:block hidden" />
              <img src="/brain.svg" alt="" className="w-24 h-24 mb-4 dark:hidden" />
              <h1 className="text-2xl font-bold mb-8 text-txt">{APP_NAME}</h1>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const val = e.target.elements.token.value.trim();
                  if (val) {
                    localStorage.setItem('ui_secret', val);
                    setToken(val);
                  }
                }}
                className="w-full max-w-sm space-y-4"
              >
                <input
                  name="token"
                  type="password"
                  placeholder="API token"
                  className="w-full px-3 py-2 bg-surface border border-subtle text-txt text-sm"
                  autoFocus
                />
                <button
                  type="submit"
                  className="w-full px-6 py-2 bg-accent text-white text-sm font-medium hover:bg-accent-dark transition-colors"
                >
                  Unlock
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <ThemeToggle />
      {/* Header row */}
      <div className="section-row">
        <div className="container">
          <div className="flex items-center gap-3 px-6 py-4">
            <img src="/brain_darkmode.svg" alt="" className="w-8 h-8 dark:block hidden" />
            <img src="/brain.svg" alt="" className="w-8 h-8 dark:hidden" />
            <h1 className="text-2xl font-bold text-txt">{APP_NAME}</h1>
            <span className="text-xs text-txt-sec bg-surface border border-subtle px-1.5 py-0.5 rounded font-mono">
              v{APP_VERSION}
            </span>
          </div>
        </div>
      </div>
      {/* Nav row */}
      <div className="section-row">
        <div className="container">
          <nav className="flex px-6">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActive(tab)}
                className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                  active === tab
                    ? 'border-[var(--accent-blue)] text-txt'
                    : 'border-transparent text-txt-sec hover:text-txt'
                }`}
              >
                {tab}
              </button>
            ))}
          </nav>
        </div>
      </div>
      {/* Content row */}
      <div className="section-row min-h-[calc(100vh-120px)]">
        <div className="container">
          <div className="px-6 py-8">
            {active === 'Capture' && <Capture />}
            {active === 'Search' && <Search />}
            {active === 'Recent' && <Recent />}
            {active === 'Agenda' && <Agenda />}
            {active === 'Stats' && <Stats />}
            {active === 'Export' && <Export />}
            {active === 'Settings' && <Settings />}
          </div>
        </div>
      </div>
    </div>
  );
}
