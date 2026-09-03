import { useState, useEffect } from 'react';
import { recent, deleteThought } from '../api.js';
import ThoughtView from './ThoughtView.jsx';
import ChunkAnatomyModal from './ChunkAnatomyModal.jsx';

export default function Recent() {
  const [thoughts, setThoughts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [anatomyId, setAnatomyId] = useState(null);

  const load = () => {
    setLoading(true);
    setError(null);
    recent(20)
      .then(setThoughts)
      .catch((err) => { setError(err.message); setThoughts([]); })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  async function handleDelete(id) {
    if (!confirm('Delete this thought?')) return;
    await deleteThought(id);
    setThoughts((prev) => prev.filter((t) => t.id !== id));
  }

  if (loading) return <p className="text-txt-ter text-sm">Loading...</p>;

  if (error) {
    return (
      <div className="empty-state py-8">
        <p className="text-red-600 dark:text-red-400 text-sm mb-3">{error}</p>
        <button
          onClick={load}
          className="toolbar-btn border border-subtle px-3 py-1.5 text-xs text-txt-ter hover:text-txt"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      {thoughts.length === 0 && <p className="text-txt-ter text-sm">No thoughts yet.</p>}
      {thoughts.map((t) => (
        <div key={t.id} className="py-6 border-t border-[var(--border)] first:border-t-0 -mx-6 px-6">
          <ThoughtView thought={t} onDelete={handleDelete} onAnatomy={setAnatomyId} />
        </div>
      ))}
      <ChunkAnatomyModal thoughtId={anatomyId} onClose={() => setAnatomyId(null)} />
    </div>
  );
}
