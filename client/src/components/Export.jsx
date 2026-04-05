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
          className="flex-1 px-3 py-2 bg-surface border border-subtle text-txt text-sm"
        />
        <input
          placeholder="Last N days"
          type="number"
          value={days}
          onChange={(e) => setDays(e.target.value)}
          className="w-32 px-3 py-2 bg-surface border border-subtle text-txt text-sm"
        />
      </div>
      <button
        onClick={handleExport}
        disabled={loading}
        className="px-6 py-2 bg-accent text-white text-sm font-medium disabled:opacity-50 hover:bg-accent-dark transition-colors"
      >
        {loading ? 'Exporting...' : 'Export to Google Drive'}
      </button>
      {result && (
        <div className="text-sm">
          {result.error ? (
            <p className="text-red-600 dark:text-red-400">{result.error}</p>
          ) : (
            <div className="bg-[#0d1117] dark:bg-[#0d1117] text-[#c9d1d9] font-mono text-xs p-4 overflow-x-auto border border-[#30363d]">
              {result.log?.map((line, i) => (
                <div key={i} className={
                  line.startsWith('  ') ? 'text-[#8b949e] pl-2' :
                  line.includes('✓') ? 'text-[#7ee787]' :
                  line.includes('+ ') ? 'text-[#7ee787]' :
                  line.includes('complete') ? 'text-[#79c0ff] font-bold' :
                  line.includes('...') ? 'text-[#c9d1d9]' :
                  'text-[#c9d1d9]'
                }>
                  {line}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
