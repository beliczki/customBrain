import { useState } from 'react';
import { capture } from '../api.js';

export default function Capture() {
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await capture(text);
      setResult(res);
      if (res.ok) setText('');
    } catch (err) {
      setResult({ error: err.message });
    }
    setLoading(false);
  }

  return (
    <div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <textarea
          placeholder="What's on your mind?"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          className="w-full px-3 py-2 bg-surface border border-subtle text-txt text-sm resize-y min-h-[120px]"
        />
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-2 bg-accent text-white text-sm font-medium disabled:opacity-50 hover:bg-accent-dark transition-colors"
        >
          {loading ? 'Capturing...' : 'Capture'}
        </button>
      </form>
      {result && (
        <div className="mt-4 p-4 bg-surface border border-subtle text-sm">
          {result.error ? (
            <p className="text-red-600 dark:text-red-400">{result.error}</p>
          ) : (
            <div>
              <p className="text-green-600 dark:text-green-400 mb-2">Captured!</p>
              {result.metadata && (
                <div className="space-y-1 text-txt-sec">
                  <p>Type: {result.metadata.type}</p>
                  {result.metadata.topics?.length > 0 && (
                    <p>Topics: {result.metadata.topics.join(', ')}</p>
                  )}
                  {result.metadata.people?.length > 0 && (
                    <p>People: {result.metadata.people.join(', ')}</p>
                  )}
                  {result.metadata.action_items?.length > 0 && (
                    <p>Actions: {result.metadata.action_items.join(', ')}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
