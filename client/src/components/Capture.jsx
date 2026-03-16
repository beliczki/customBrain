import { useState } from 'react';
import { capture } from '../api.js';

export default function Capture() {
  const [text, setText] = useState('');
  const [secret, setSecret] = useState(localStorage.getItem('capture_secret') || '');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      localStorage.setItem('capture_secret', secret);
      const res = await capture(text, secret);
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
        <input
          type="password"
          placeholder="Capture secret"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          className="w-full px-3 py-2 bg-gray-800 rounded-lg text-sm"
        />
        <textarea
          placeholder="What's on your mind?"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          className="w-full px-3 py-2 bg-gray-800 rounded-lg text-sm resize-none"
        />
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-2 bg-indigo-600 rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {loading ? 'Capturing...' : 'Capture'}
        </button>
      </form>
      {result && (
        <div className="mt-4 p-4 bg-gray-800 rounded-lg text-sm">
          {result.error ? (
            <p className="text-red-400">{result.error}</p>
          ) : (
            <div>
              <p className="text-green-400 mb-2">Captured!</p>
              {result.metadata && (
                <div className="space-y-1 text-gray-400">
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
