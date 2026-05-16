import { useState, useEffect } from 'react';
import { agenda, agendaSync } from '../api.js';
import ThoughtModal from './ThoughtModal.jsx';

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
  const [openThoughtId, setOpenThoughtId] = useState(null);

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
            <AgendaEventCard
              key={e.event.event_id || e.event.start + e.event.title}
              entry={e}
              onThoughtClick={setOpenThoughtId}
            />
          ))}
        </div>
      ))}

      {openThoughtId && (
        <ThoughtModal thoughtId={openThoughtId} onClose={() => setOpenThoughtId(null)} />
      )}
    </div>
  );
}

function AgendaEventCard({ entry, onThoughtClick }) {
  const { event, brain_context: ctx } = entry;
  const attendeeCount = (event.attendees || []).length;
  const hasThoughts = ctx.thoughts.length > 0;
  const detected = ctx.detected_projects || [];
  const counts = ctx.project_thought_counts || {};

  return (
    <div className="agenda-event py-4 border-t border-[var(--border)] first:border-t-0 -mx-6 px-6">
      {/* Event header */}
      <div className="agenda-event__head mb-2">
        <div className="flex items-center gap-2 mb-1 text-xs text-txt-ter">
          <span className="font-mono">{timeRange(event.start, event.end, event.is_all_day)}</span>
          {attendeeCount > 0 && (
            <span>· {attendeeCount} attendee{attendeeCount === 1 ? '' : 's'}</span>
          )}
        </div>
        <h3 className="text-sm font-medium text-txt">{event.title || '(no title)'}</h3>
      </div>

      {/* Detected project header — only when a known project name is in the title */}
      {detected.length > 0 && (
        <div className="agenda-event__project-header mt-2 text-xs">
          {detected.map((proj) => (
            <span key={proj} className="text-txt-sec">
              <span className="text-txt-ter">Project: </span>
              <strong className="text-purple-700 dark:text-purple-300">{proj}</strong>
              {counts[proj] != null && (
                <span className="text-txt-ter"> · {counts[proj]} thought{counts[proj] === 1 ? '' : 's'} tagged</span>
              )}
              {' '}
            </span>
          ))}
        </div>
      )}

      {/* Thoughts list — primary content, clickable opens modal */}
      {hasThoughts ? (
        <ul className="agenda-event__thoughts mt-3 space-y-1">
          {ctx.thoughts.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onThoughtClick(t.id)}
                className="agenda-thought-link flex items-baseline gap-2 text-xs w-full text-left py-0.5 hover:bg-[var(--border)] -mx-1 px-1 transition-colors"
              >
                <span className={`font-mono w-12 shrink-0 ${t.score == null ? 'text-purple-600 dark:text-purple-400' : 'text-txt-ter'}`}>
                  {t.score == null ? 'recent' : `${Math.round(t.score * 100)}%`}
                </span>
                <span className="text-txt-sec flex-1 underline-offset-2 hover:underline">{t.title}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-txt-ter italic mt-2">no matching thoughts</p>
      )}
    </div>
  );
}
