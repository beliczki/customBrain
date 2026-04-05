import { useState } from 'react';
import Capture from './components/Capture.jsx';
import Search from './components/Search.jsx';
import Recent from './components/Recent.jsx';
import Stats from './components/Stats.jsx';
import Export from './components/Export.jsx';

const tabs = ['Capture', 'Search', 'Recent', 'Stats', 'Export'];
const APP_NAME = import.meta.env.VITE_APP_NAME || 'customBrain';

export default function App() {
  const [active, setActive] = useState('Capture');
  const [token, setToken] = useState(localStorage.getItem('capture_secret') || '');

  const header = (
    <div className="flex items-center gap-3 mb-6">
      <img src="/brain_darkmode.svg" alt="" className="w-8 h-8" />
      <h1 className="text-2xl font-bold">{APP_NAME}</h1>
    </div>
  );

  if (!token) {
    return (
      <div className="max-w-md mx-auto px-4 py-24 flex flex-col items-center">
        <img src="/brain_darkmode.svg" alt="" className="w-24 h-24 mb-4" />
        <h1 className="text-2xl font-bold mb-8">{APP_NAME}</h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const val = e.target.elements.token.value.trim();
            if (val) {
              localStorage.setItem('capture_secret', val);
              setToken(val);
            }
          }}
          className="w-full space-y-4"
        >
          <input
            name="token"
            type="password"
            placeholder="API token"
            className="w-full px-3 py-2 bg-gray-800 rounded-lg text-sm"
            autoFocus
          />
          <button
            type="submit"
            className="w-full px-6 py-2 bg-indigo-600 rounded-lg text-sm font-medium"
          >
            Unlock
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {header}
      <nav className="flex gap-2 mb-8">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActive(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              active === tab
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            {tab}
          </button>
        ))}
      </nav>
      {active === 'Capture' && <Capture />}
      {active === 'Search' && <Search />}
      {active === 'Recent' && <Recent />}
      {active === 'Stats' && <Stats />}
      {active === 'Export' && <Export />}
    </div>
  );
}
