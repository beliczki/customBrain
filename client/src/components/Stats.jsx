import { useState, useEffect } from 'react';
import { stats } from '../api.js';

export default function Stats() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    stats().then(setData).finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-txt-ter text-sm">Loading...</p>;
  if (!data) return <p className="text-txt-ter text-sm">No data.</p>;

  return (
    <div className="space-y-6">
      <div className="p-4 bg-surface border border-subtle">
        <p className="text-lg font-bold text-txt">{data.total}</p>
        <p className="text-sm text-txt-sec">Total thoughts</p>
      </div>

      <div className="p-4 bg-surface border border-subtle">
        <h3 className="text-sm font-medium mb-3 text-txt">By Type</h3>
        <div className="space-y-1">
          {Object.entries(data.by_type || {}).map(([type, count]) => (
            <div key={type} className="flex justify-between text-sm">
              <span className="text-txt-sec">{type}</span>
              <span className="text-txt-ter">{count}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="p-4 bg-surface border border-subtle">
        <h3 className="text-sm font-medium mb-3 text-txt">Top Topics</h3>
        <div className="flex gap-2 flex-wrap">
          {(data.top_topics || []).map(({ topic, count }) => (
            <span key={topic} className="px-2 py-1 bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300 text-xs">
              {topic} ({count})
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
