import { useState } from 'react';
import { search } from '../api.js';

export default function Search() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  async function handleSearch(e) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    try {
      const data = await search(query);
      setResults(data);
    } catch (err) {
      setResults([]);
    }
    setLoading(false);
  }

  return (
    <div>
      <form onSubmit={handleSearch} className="flex gap-2 mb-6">
        <input
          placeholder="Search your brain..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 px-3 py-2 bg-gray-800 rounded-lg text-sm"
        />
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-2 bg-indigo-600 rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {loading ? '...' : 'Search'}
        </button>
      </form>
      <div className="space-y-3">
        {results.map((r) => (
          <div key={r.id} className="p-4 bg-gray-800 rounded-lg">
            <p className="text-sm mb-2">{r.text}</p>
            <div className="flex gap-2 flex-wrap">
              {r.metadata?.topics?.map((t) => (
                <span key={t} className="px-2 py-0.5 bg-indigo-900 text-indigo-300 rounded text-xs">{t}</span>
              ))}
              {r.metadata?.people?.map((p) => (
                <span key={p} className="px-2 py-0.5 bg-emerald-900 text-emerald-300 rounded text-xs">{p}</span>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2">Score: {r.score?.toFixed(3)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
