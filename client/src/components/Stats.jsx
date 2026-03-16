import { useState, useEffect } from 'react';
import { stats } from '../api.js';

export default function Stats() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    stats().then(setData).finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-gray-500 text-sm">Loading...</p>;
  if (!data) return <p className="text-gray-500 text-sm">No data.</p>;

  return (
    <div className="space-y-6">
      <div className="p-4 bg-gray-800 rounded-lg">
        <p className="text-lg font-bold">{data.total}</p>
        <p className="text-sm text-gray-400">Total thoughts</p>
      </div>

      <div className="p-4 bg-gray-800 rounded-lg">
        <h3 className="text-sm font-medium mb-3">By Type</h3>
        <div className="space-y-1">
          {Object.entries(data.by_type || {}).map(([type, count]) => (
            <div key={type} className="flex justify-between text-sm">
              <span className="text-gray-300">{type}</span>
              <span className="text-gray-500">{count}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="p-4 bg-gray-800 rounded-lg">
        <h3 className="text-sm font-medium mb-3">Top Topics</h3>
        <div className="flex gap-2 flex-wrap">
          {(data.top_topics || []).map(({ topic, count }) => (
            <span key={topic} className="px-2 py-1 bg-indigo-900 text-indigo-300 rounded text-xs">
              {topic} ({count})
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
