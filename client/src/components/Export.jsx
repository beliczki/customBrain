import { useState, useRef, useEffect } from 'react';
import { exportToObsidian } from '../api.js';

export default function Export() {
  const [topic, setTopic] = useState('');
  const [days, setDays] = useState('');
  const [logLines, setLogLines] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const logRef = useRef(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logLines]);

  async function handleExport() {
    setLoading(true);
    setLogLines([]);
    setResult(null);
    try {
      const res = await exportToObsidian(
        { filter_topic: topic || undefined, filter_days: days ? parseInt(days) : undefined },
        (line) => setLogLines((prev) => [...prev, line])
      );
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

      {/* Streaming terminal log */}
      {logLines.length > 0 && (
        <div
          ref={logRef}
          className="bg-[#0d1117] text-[#c9d1d9] font-mono text-xs p-4 max-h-80 overflow-y-auto border border-[#30363d]"
        >
          {logLines.map((line, i) => (
            <div key={i} className={
              line.startsWith('  ') ? 'text-[#8b949e]' :
              line.includes('✓') ? 'text-[#7ee787]' :
              line.includes('+ ') ? 'text-[#7ee787]' :
              line.includes('complete') ? 'text-[#79c0ff] font-bold' :
              'text-[#c9d1d9]'
            }>
              {line}
            </div>
          ))}
          {loading && <div className="text-[#c9d1d9] animate-pulse">▊</div>}
        </div>
      )}

      {/* Summary after completion */}
      {result && !result.error && (
        <div className="text-sm">
          <div className="py-4 border-t border-[var(--border)]">
            <p className="text-green-600 dark:text-green-400 font-medium mb-2">
              Vault rebuilt — {result.exported_count} thoughts exported
            </p>
            <p className="text-txt-ter">{result.deleted} old files deleted</p>
          </div>

          {result.by_type && (
            <div className="py-4 border-t border-[var(--border)]">
              <h3 className="text-xs font-medium text-txt-ter uppercase tracking-wide mb-2">By type</h3>
              <div className="flex gap-3 flex-wrap">
                {Object.entries(result.by_type).map(([type, count]) => (
                  <span key={type} className="text-txt-sec">{type} <span className="text-txt-ter">({count})</span></span>
                ))}
              </div>
            </div>
          )}

          {result.people && (
            <div className="py-4 border-t border-[var(--border)]">
              <h3 className="text-xs font-medium text-txt-ter uppercase tracking-wide mb-2">
                People ({result.people.total})
              </h3>
              <div className="flex gap-2 flex-wrap">
                {result.people.all.map((name) => (
                  <span
                    key={name}
                    className={`px-2 py-0.5 text-xs ${
                      result.people.created.includes(name)
                        ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                        : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300'
                    }`}
                  >
                    {name}{result.people.created.includes(name) ? ' ✱' : ''}
                  </span>
                ))}
              </div>
            </div>
          )}

          {result.projects && (
            <div className="py-4 border-t border-[var(--border)]">
              <h3 className="text-xs font-medium text-txt-ter uppercase tracking-wide mb-2">
                Projects ({result.projects.total})
              </h3>
              <div className="flex gap-2 flex-wrap">
                {result.projects.all.map((name) => (
                  <span
                    key={name}
                    className={`px-2 py-0.5 text-xs ${
                      result.projects.created.includes(name)
                        ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                        : 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300'
                    }`}
                  >
                    {name}{result.projects.created.includes(name) ? ' ✱' : ''}
                  </span>
                ))}
              </div>
            </div>
          )}

          {result.files?.length > 0 && (
            <details className="py-4 border-t border-[var(--border)]">
              <summary className="text-xs font-medium text-txt-ter uppercase tracking-wide cursor-pointer">
                Files ({result.files.length})
              </summary>
              <ul className="mt-2 text-txt-sec space-y-1 text-xs">
                {result.files.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {result?.error && (
        <p className="text-red-600 dark:text-red-400 text-sm">{result.error}</p>
      )}
    </div>
  );
}
