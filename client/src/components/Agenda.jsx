import { useState, useEffect } from 'react';
import { agenda, agendaSync } from '../api.js';

function dayLabel(dateStr) {
  const d = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayStart = new Date(d);
  dayStart.setHours(0, 0, 0, 0);
  const diffDays = Math.round((dayStart - today) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

function timeRange(start, end, isAllDay) {
  if (isAllDay) return 'All day';
  const s = new Date(start);
  const e = new Date(end);
  const fmt = (d) => d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${fmt(s)} – ${fmt(e)}`;
}

function groupByDay(events) {
  const groups = new Map();
  for (const e of events) {
    const key = new Date(e.event.start).toDateString();
    if (!groups.has(key)) groups.set(key, { label: dayLabel(e.event.start), date: e.event.start, events: [] });
    groups.get(key).events.push(e);
  }
  return [...groups.values()];
}

function cacheAgeLabel(ms) {
  if (ms == null) return '';
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  return `${hr}h ago`;
}

export default function Agenda() {
  const [cache, setCache] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await agenda(7);
      setCache(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const onSync = async () => {
    setSyncing(true);
    setError(null);
    try {
      const data = await agendaSync(7);
      setCache(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) return <p className="text-txt-ter text-sm">Loading…</p>;

  if (!cache) {
    return (
      <div className="text-sm">
        <p className="text-txt-ter mb-4">No agenda cache yet. Run a sync to fetch your calendar + brain context.</p>
        <button
          onClick={onSync}
          disabled={syncing}
          className="px-4 py-2 bg-accent text-white text-sm font-medium hover:bg-accent-dark transition-colors disabled:opacity-50"
        >
          {syncing ? 'Syncing…' : 'Sync now'}
        </button>
      </div>
    );
  }

  const groups = groupByDay(cache.events);

  return (
    <div className="agenda-tab">
      {/* Top bar — sync gomb + cache age */}
      <div className="agenda-topbar flex items-center justify-between mb-6 pb-3 border-b border-[var(--border)]">
        <div className="text-xs text-txt-ter">
          <span className="mr-3">
            <strong className="text-txt-sec">{cache.event_count}</strong> events ·{' '}
            <strong className="text-txt-sec">{cache.enriched_count}</strong> with brain context
          </span>
          <span>synced {cacheAgeLabel(cache.cache_age_ms)}</span>
        </div>
        <button
          onClick={onSync}
          disabled={syncing}
          className="px-3 py-1.5 bg-accent text-white text-xs font-medium hover:bg-accent-dark transition-colors disabled:opacity-50"
        >
          {syncing ? 'Syncing…' : 'Sync now'}
        </button>
      </div>

      {error && <p className="text-red-600 dark:text-red-400 text-sm mb-4">Error: {error}</p>}

      {groups.length === 0 && (
        <p className="text-txt-ter text-sm">No events in the next 7 days.</p>
      )}

      {groups.map((group) => (
        <div key={group.date} className="agenda-day mb-8">
          <h2 className="agenda-day__header text-xs uppercase tracking-wider text-txt-ter mb-3 pb-1 border-b border-subtle">
            {group.label}
          </h2>
          {group.events.map((e) => (
            <AgendaEventCard key={e.event.event_id || e.event.start + e.event.title} entry={e} />
          ))}
        </div>
      ))}
    </div>
  );
}

function AgendaEventCard({ entry }) {
  const { event, brain_context: ctx } = entry;
  const hasContext = ctx.thoughts.length > 0 || ctx.people.length > 0 || ctx.projects.length > 0;
  const attendeeCount = (event.attendees || []).length;

  return (
    <div className="agenda-event py-4 border-t border-[var(--border)] first:border-t-0 -mx-6 px-6">
      <div className="flex items-start justify-between mb-2 gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1 text-xs text-txt-ter">
            <span className="font-mono">{timeRange(event.start, event.end, event.is_all_day)}</span>
            {attendeeCount > 0 && (
              <span>· {attendeeCount} attendee{attendeeCount === 1 ? '' : 's'}</span>
            )}
          </div>
          <h3 className="text-sm font-medium text-txt">{event.title || '(no title)'}</h3>
        </div>
      </div>

      {!hasContext && (
        <p className="text-xs text-txt-ter italic">no brain context above threshold</p>
      )}

      {ctx.thoughts.length > 0 && (
        <div className="agenda-event__thoughts mt-3 space-y-1">
          {ctx.thoughts.map((t) => (
            <div key={t.id} className="flex items-baseline gap-2 text-xs">
              <span className="text-txt-ter font-mono w-10 shrink-0">{(t.score * 100).toFixed(0)}%</span>
              <span className="text-txt-sec">{t.title}</span>
            </div>
          ))}
        </div>
      )}

      {(ctx.projects.length > 0 || ctx.people.length > 0 || ctx.topics.length > 0) && (
        <div className="agenda-event__meta mt-3 space-y-1.5 text-xs">
          {ctx.projects.length > 0 && (
            <div className="flex items-start gap-2">
              <span className="text-txt-ter w-16 shrink-0 pt-0.5">Projects</span>
              <div className="flex gap-1 flex-wrap">
                {ctx.projects.map((p) => (
                  <span key={p} className="px-2 py-0.5 bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300">{p}</span>
                ))}
              </div>
            </div>
          )}
          {ctx.people.length > 0 && (
            <div className="flex items-start gap-2">
              <span className="text-txt-ter w-16 shrink-0 pt-0.5">People</span>
              <div className="flex gap-1 flex-wrap">
                {ctx.people.map((p) => (
                  <span key={p} className="px-2 py-0.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">{p}</span>
                ))}
              </div>
            </div>
          )}
          {ctx.topics.length > 0 && (
            <div className="flex items-start gap-2">
              <span className="text-txt-ter w-16 shrink-0 pt-0.5">Topics</span>
              <div className="flex gap-1 flex-wrap">
                {ctx.topics.map((t) => (
                  <span key={t} className="px-2 py-0.5 bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">{t}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
