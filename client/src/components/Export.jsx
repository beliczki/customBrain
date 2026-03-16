import { useState } from 'react';
import { exportToObsidian } from '../api.js';

export default function Export() {
  const [topic, setTopic] = useState('');
  const [days, setDays] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleExport() {
    setLoading(true);
    setResult(null);
    try {
      const res = await exportToObsidian({
        filter_topic: topic || undefined,
        filter_days: days ? parseInt(days) : undefined,
      });
      setResult(res);
    } catch (err) {
      setResult({ error: err.message });
    }
    setLoading(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          placeholder="Filter by topic (optional)"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          className="flex-1 px-3 py-2 bg-gray-800 rounded-lg text-sm"
        />
        <input
          placeholder="Last N days"
          type="number"
          value={days}
          onChange={(e) => setDays(e.target.value)}
          className="w-32 px-3 py-2 bg-gray-800 rounded-lg text-sm"
        />
      </div>
      <button
        onClick={handleExport}
        disabled={loading}
        className="px-6 py-2 bg-indigo-600 rounded-lg text-sm font-medium disabled:opacity-50"
      >
        {loading ? 'Exporting...' : 'Export to Google Drive'}
      </button>
      {result && (
        <div className="p-4 bg-gray-800 rounded-lg text-sm">
          {result.error ? (
            <p className="text-red-400">{result.error}</p>
          ) : (
            <div>
              <p className="text-green-400">Exported {result.exported_count} files</p>
              {result.files?.length > 0 && (
                <ul className="mt-2 text-gray-400 space-y-1">
                  {result.files.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
