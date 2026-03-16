import { useState } from 'react';
import Capture from './components/Capture.jsx';
import Search from './components/Search.jsx';
import Recent from './components/Recent.jsx';
import Stats from './components/Stats.jsx';
import Export from './components/Export.jsx';

const tabs = ['Capture', 'Search', 'Recent', 'Stats', 'Export'];

export default function App() {
  const [active, setActive] = useState('Capture');

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Open Brain</h1>
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
