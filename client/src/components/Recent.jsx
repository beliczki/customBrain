import { useState, useEffect } from 'react';
import { recent, deleteThought } from '../api.js';

export default function Recent() {
  const [thoughts, setThoughts] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    recent(20).then(setThoughts).finally(() => setLoading(false));
  };

  useEffect(load, []);

  async function handleDelete(id) {
    if (!confirm('Delete this thought?')) return;
    await deleteThought(id);
    setThoughts((prev) => prev.filter((t) => t.id !== id));
  }

  if (loading) return <p className="text-txt-ter text-sm">Loading...</p>;

  return (
    <div className="space-y-4">
      {thoughts.length === 0 && <p className="text-txt-ter text-sm">No thoughts yet.</p>}
      {thoughts.map((t) => (
        <div key={t.id} className="p-4 bg-surface border border-subtle">
          <div className="flex justify-between items-start mb-3">
            <div className="flex-1">
              {t.title && <h3 className="text-base font-bold mb-1 uppercase tracking-wide text-txt">{t.title}</h3>}
              <p className="text-sm text-txt-sec">{t.text}</p>
            </div>
            <button
              onClick={() => handleDelete(t.id)}
              className="ml-3 px-3 py-1 bg-red-100 hover:bg-red-200 text-red-600 dark:bg-red-900/40 dark:hover:bg-red-800 dark:text-red-400 text-xs flex items-center gap-1 shrink-0"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              Delete
            </button>
          </div>

          <div className="space-y-2 text-xs">
            {t.metadata?.type && (
              <div className="flex items-center gap-2">
                <span className="text-txt-ter w-16">Type</span>
                <span className="px-2 py-0.5 bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300">{t.metadata.type}</span>
              </div>
            )}

            {t.metadata?.topics?.length > 0 && (
              <div className="flex items-start gap-2">
                <span className="text-txt-ter w-16 pt-0.5">Topics</span>
                <div className="flex gap-1 flex-wrap">
                  {t.metadata.topics.map((topic) => (
                    <span key={topic} className="px-2 py-0.5 bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">{topic}</span>
                  ))}
                </div>
              </div>
            )}

            {t.metadata?.projects?.length > 0 && (
              <div className="flex items-start gap-2">
                <span className="text-txt-ter w-16 pt-0.5">Projects</span>
                <div className="flex gap-1 flex-wrap">
                  {t.metadata.projects.map((p) => (
                    <span key={p} className="px-2 py-0.5 bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300">{p}</span>
                  ))}
                </div>
              </div>
            )}

            {t.metadata?.people?.length > 0 && (
              <div className="flex items-start gap-2">
                <span className="text-txt-ter w-16 pt-0.5">People</span>
                <div className="flex gap-1 flex-wrap">
                  {t.metadata.people.map((p) => (
                    <span key={p} className="px-2 py-0.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">{p}</span>
                  ))}
                </div>
              </div>
            )}

            {t.metadata?.action_items?.length > 0 && (
              <div className="flex items-start gap-2">
                <span className="text-txt-ter w-16 pt-0.5">Actions</span>
                <div className="flex flex-col gap-1">
                  {t.metadata.action_items.map((a, i) => (
                    <span key={i} className="px-2 py-0.5 bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">{a}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <p className="text-xs text-txt-ter mt-3">{new Date(t.created_at).toLocaleString()}</p>
        </div>
      ))}
    </div>
  );
}
