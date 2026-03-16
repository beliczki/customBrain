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
      <div className="space-y-4">
        {results.map((r) => (
          <div key={r.id} className="p-4 bg-gray-800 rounded-lg">
            <div className="mb-3">
              {r.title && <h3 className="text-base font-bold mb-1 uppercase tracking-wide">{r.title}</h3>}
              <p className="text-sm text-gray-300">{r.text}</p>
            </div>

            <div className="space-y-2 text-xs">
              {r.metadata?.type && (
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 w-16">Type</span>
                  <span className="px-2 py-0.5 bg-gray-700 text-gray-300 rounded">{r.metadata.type}</span>
                </div>
              )}

              {r.metadata?.topics?.length > 0 && (
                <div className="flex items-start gap-2">
                  <span className="text-gray-500 w-16 pt-0.5">Topics</span>
                  <div className="flex gap-1 flex-wrap">
                    {r.metadata.topics.map((t) => (
                      <span key={t} className="px-2 py-0.5 bg-indigo-900 text-indigo-300 rounded">{t}</span>
                    ))}
                  </div>
                </div>
              )}

              {r.metadata?.projects?.length > 0 && (
                <div className="flex items-start gap-2">
                  <span className="text-gray-500 w-16 pt-0.5">Projects</span>
                  <div className="flex gap-1 flex-wrap">
                    {r.metadata.projects.map((p) => (
                      <span key={p} className="px-2 py-0.5 bg-purple-900 text-purple-300 rounded">{p}</span>
                    ))}
                  </div>
                </div>
              )}

              {r.metadata?.people?.length > 0 && (
                <div className="flex items-start gap-2">
                  <span className="text-gray-500 w-16 pt-0.5">People</span>
                  <div className="flex gap-1 flex-wrap">
                    {r.metadata.people.map((p) => (
                      <span key={p} className="px-2 py-0.5 bg-emerald-900 text-emerald-300 rounded">{p}</span>
                    ))}
                  </div>
                </div>
              )}

              {r.metadata?.action_items?.length > 0 && (
                <div className="flex items-start gap-2">
                  <span className="text-gray-500 w-16 pt-0.5">Actions</span>
                  <div className="flex flex-col gap-1">
                    {r.metadata.action_items.map((a, i) => (
                      <span key={i} className="px-2 py-0.5 bg-amber-900 text-amber-300 rounded">{a}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <p className="text-xs text-gray-500 mt-3">Score: {r.score?.toFixed(3)} · {new Date(r.created_at).toLocaleString()}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
