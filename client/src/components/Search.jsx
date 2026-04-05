import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
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
          className="flex-1 px-3 py-2 bg-surface border border-subtle text-txt text-sm"
        />
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-2 bg-accent text-white text-sm font-medium disabled:opacity-50 hover:bg-accent-dark transition-colors"
        >
          {loading ? '...' : 'Search'}
        </button>
      </form>
      <div>
        {results.map((r) => (
          <div key={r.id} className="py-6 border-t border-[var(--border)] first:border-t-0 -mx-6 px-6">
            <div className="mb-3">
              {r.title && <h3 className="text-base font-bold mb-1 uppercase tracking-wide text-txt">{r.title}</h3>}
              <div className="text-sm text-txt-sec prose-sm"><ReactMarkdown>{r.text}</ReactMarkdown></div>
            </div>

            <div className="space-y-2 text-xs">
              {r.metadata?.type && (
                <div className="flex items-center gap-2">
                  <span className="text-txt-ter w-16">Type</span>
                  <span className="px-2 py-0.5 bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300">{r.metadata.type}</span>
                </div>
              )}

              {r.metadata?.topics?.length > 0 && (
                <div className="flex items-start gap-2">
                  <span className="text-txt-ter w-16 pt-0.5">Topics</span>
                  <div className="flex gap-1 flex-wrap">
                    {r.metadata.topics.map((t) => (
                      <span key={t} className="px-2 py-0.5 bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">{t}</span>
                    ))}
                  </div>
                </div>
              )}

              {r.metadata?.projects?.length > 0 && (
                <div className="flex items-start gap-2">
                  <span className="text-txt-ter w-16 pt-0.5">Projects</span>
                  <div className="flex gap-1 flex-wrap">
                    {r.metadata.projects.map((p) => (
                      <span key={p} className="px-2 py-0.5 bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300">{p}</span>
                    ))}
                  </div>
                </div>
              )}

              {r.metadata?.people?.length > 0 && (
                <div className="flex items-start gap-2">
                  <span className="text-txt-ter w-16 pt-0.5">People</span>
                  <div className="flex gap-1 flex-wrap">
                    {r.metadata.people.map((p) => (
                      <span key={p} className="px-2 py-0.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">{p}</span>
                    ))}
                  </div>
                </div>
              )}

              {r.metadata?.action_items?.length > 0 && (
                <div className="flex items-start gap-2">
                  <span className="text-txt-ter w-16 pt-0.5">Actions</span>
                  <div className="flex flex-col gap-1">
                    {r.metadata.action_items.map((a, i) => (
                      <span key={i} className="px-2 py-0.5 bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">{a}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <p className="text-xs text-txt-ter mt-3">Score: {r.score?.toFixed(3)}{r.cosine_score ? ` (cosine: ${r.cosine_score.toFixed(3)})` : ''} · {new Date(r.created_at).toLocaleString()}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
