import { useState, useEffect } from 'react';
import { stats } from '../api.js';
import HealthCheck from './HealthCheck.jsx';

const fmt = (n) => n.toLocaleString('en-US');

export default function Stats() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    stats().then(setData).finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-txt-ter text-sm">Loading...</p>;
  if (!data) return <p className="text-txt-ter text-sm">No data.</p>;

  return (
    <div>
      <div className="py-6 border-t border-[var(--border)] first:border-t-0 -mx-6 px-6">
        <p className="text-lg font-bold text-txt">{data.total}</p>
        <p className="text-sm text-txt-sec">Total thoughts</p>
      </div>

      <div className="py-6 border-t border-[var(--border)] first:border-t-0 -mx-6 px-6">
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

      <div className="py-6 border-t border-[var(--border)] first:border-t-0 -mx-6 px-6">
        <h3 className="text-sm font-medium mb-3 text-txt">Top Topics</h3>
        <div className="flex gap-2 flex-wrap">
          {(data.top_topics || []).map(({ topic, count }) => (
            <span key={topic} className="px-2 py-1 bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300 text-xs">
              {topic} ({count})
            </span>
          ))}
        </div>
      </div>

      <div className="token-usage py-6 border-t border-[var(--border)] first:border-t-0 -mx-6 px-6">
        <h3 className="text-sm font-medium mb-1 text-txt">Anthropic API usage</h3>
        <p className="text-xs text-txt-ter mb-4">
          From state/anthropic-usage.jsonl. Tokens in include cache reads/writes. Cost at list price, computed on read.
        </p>

        <div className="token-usage__windows grid grid-cols-2 gap-6 mb-6">
          {[['last_30', 'Last 30 days'], ['last_60', 'Last 60 days']].map(([key, label]) => {
            const w = data.anthropic_usage[key];
            return (
              <div key={key} className="token-usage__window">
                <p className="text-lg font-bold text-txt">${w.total.usd.toFixed(2)}</p>
                <p className="text-sm text-txt-sec mb-2">
                  {label} · {w.total.calls} calls · {fmt(w.total.input_tokens)} in · {fmt(w.total.output_tokens)} out
                </p>
                <div className="space-y-1">
                  {Object.entries(w.by_site).sort((a, b) => b[1].usd - a[1].usd).map(([site, g]) => (
                    <div key={site} className="token-usage__row flex justify-between text-sm">
                      <span className="text-txt-sec">{site}</span>
                      <span className="text-txt-ter">{g.calls} calls · ${g.usd.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <h4 className="text-xs uppercase tracking-wider text-txt-ter mb-2">Daily</h4>
        {data.anthropic_usage.daily.length === 0 && (
          <p className="token-usage__empty text-sm text-txt-ter">No calls logged yet.</p>
        )}
        <div className="token-usage__daily space-y-1">
          {data.anthropic_usage.daily.map((d) => (
            <div key={d.day} className="token-usage__row flex justify-between text-sm">
              <span className="text-txt-sec">{d.day}</span>
              <span className="text-txt-ter">
                {d.calls} calls · {fmt(d.input_tokens)} in · {fmt(d.output_tokens)} out · ${d.usd.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="py-6 border-t border-[var(--border)] first:border-t-0 -mx-6 px-6">
        <HealthCheck />
      </div>
    </div>
  );
}
