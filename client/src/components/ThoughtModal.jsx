import { useEffect, useState } from 'react';
import { getThought } from '../api.js';
import ThoughtView from './ThoughtView.jsx';

// Overlay modal that fetches a thought by id and renders it with ThoughtView.
// Internal scroll for long thoughts. ESC and backdrop click close it.
export default function ThoughtModal({ thoughtId, onClose }) {
  const [thought, setThought] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!thoughtId) return;
    setLoading(true);
    setError(null);
    setThought(null);
    getThought(thoughtId)
      .then((t) => {
        if (!t) setError('Thought not found');
        else setThought(t);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [thoughtId]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!thoughtId) return null;

  return (
    <div
      className="thought-modal-backdrop fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 sm:p-8 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="thought-modal bg-surface border border-subtle shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="thought-modal__close absolute top-2 right-2 z-10 w-8 h-8 flex items-center justify-center text-txt-ter hover:text-txt hover:bg-[var(--border)] transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <div className="thought-modal__body overflow-y-auto p-6">
          {loading && <p className="text-txt-ter text-sm">Loading…</p>}
          {error && <p className="text-red-600 dark:text-red-400 text-sm">Error: {error}</p>}
          {thought && <ThoughtView thought={thought} />}
        </div>
      </div>
    </div>
  );
}
