import { useState, useEffect } from 'react';
import { recent, deleteThought } from '../api.js';
import ThoughtView from './ThoughtView.jsx';

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
    <div>
      {thoughts.length === 0 && <p className="text-txt-ter text-sm">No thoughts yet.</p>}
      {thoughts.map((t) => (
        <div key={t.id} className="py-6 border-t border-[var(--border)] first:border-t-0 -mx-6 px-6">
          <ThoughtView thought={t} onDelete={handleDelete} />
        </div>
      ))}
    </div>
  );
}
