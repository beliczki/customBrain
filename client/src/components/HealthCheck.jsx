import { useState } from 'react';
import { healthCheck } from '../api.js';
import ThoughtModal from './ThoughtModal.jsx';

// On-demand brain audit. Mounted as a section under the Stats tab.
// Listing-only — no mutations. Clicking a thought id opens ThoughtModal.

export default function HealthCheck() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [openThoughtId, setOpenThoughtId] = useState(null);
  const [expanded, setExpanded] = useState(new Set());

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await healthCheck();
      if (result.error) throw new Error(result.error);
      setData(result);
      setExpanded(new Set());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggle = (key) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  return (
    <div className="health-check">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-txt">Brain Health Check</h3>
        <button
          type="button"
          onClick={run}
          disabled={loading}
          className="px-3 py-1.5 bg-accent text-white text-xs font-medium hover:bg-accent-dark disabled:opacity-50 transition-colors"
        >
          {loading ? 'Running…' : data ? 'Re-run' : 'Run health check'}
        </button>
      </div>
      <p className="text-xs text-txt-ter mb-4">
        On-demand audit. Listing-only — no mutations. Click any thought id to open full view.
      </p>

      {error && <p className="text-red-600 dark:text-red-400 text-sm mb-4">Error: {error}</p>}

      {data && (
        <>
          <div className="text-xs text-txt-ter mb-4">
            Generated {new Date(data.generated_at).toLocaleString()} in {(data.duration_ms / 1000).toFixed(1)}s ·{' '}
            <strong className="text-txt-sec">{data.totals.thoughts_active}</strong> active ·{' '}
            <strong className="text-txt-sec">{data.totals.thoughts_archived}</strong> archived
          </div>

          <HealthSection
            id="duplicates"
            title="Duplicate candidates"
            subtitle={`cosine > ${data.checks.duplicate_candidates.threshold}`}
            count={data.checks.duplicate_candidates.count}
            expanded={expanded.has('duplicates')}
            onToggle={() => toggle('duplicates')}
          >
            {data.checks.duplicate_candidates.pairs.map((p, i) => (
              <div key={i} className="text-xs py-1">
                <span className="font-mono text-txt-ter mr-2">{Math.round(p.score * 100)}%</span>
                <ThoughtLink id={p.a_id} title={p.a_title} onOpen={setOpenThoughtId} />
                {' ↔ '}
                <ThoughtLink id={p.b_id} title={p.b_title} onOpen={setOpenThoughtId} />
              </div>
            ))}
          </HealthSection>

          <HealthSection
            id="over_tagged"
            title="Over-tagged thoughts"
            subtitle="hub_score ≥ 20 OR projects ≥ 5"
            count={data.checks.over_tagged.count}
            expanded={expanded.has('over_tagged')}
            onToggle={() => toggle('over_tagged')}
          >
            {data.checks.over_tagged.items.map((t) => (
              <div key={t.id} className="text-xs py-1">
                <span className="font-mono text-txt-ter mr-2">hub:{t.hub_score}</span>
                <ThoughtLink id={t.id} title={t.title} onOpen={setOpenThoughtId} />
                <span className="text-txt-ter ml-2">({t.project_count} proj, {t.people_count} ppl)</span>
              </div>
            ))}
          </HealthSection>

          <HealthSection
            id="stale_summaries"
            title="Stale auto-summaries"
            subtitle="summary older than thought's updated_at"
            count={data.checks.stale_summaries.count}
            expanded={expanded.has('stale_summaries')}
            onToggle={() => toggle('stale_summaries')}
          >
            {data.checks.stale_summaries.items.map((t) => (
              <div key={t.id} className="text-xs py-1">
                <span className="font-mono text-txt-ter mr-2">{t.hours_stale}h</span>
                <ThoughtLink id={t.id} title={t.title} onOpen={setOpenThoughtId} />
              </div>
            ))}
          </HealthSection>

          <HealthSection
            id="oversized"
            title="Oversized w/o summary"
            subtitle={`text > ${data.checks.oversized_no_summary.threshold_chars} chars, coworker-loop not run yet`}
            count={data.checks.oversized_no_summary.count}
            expanded={expanded.has('oversized')}
            onToggle={() => toggle('oversized')}
          >
            {data.checks.oversized_no_summary.items.map((t) => (
              <div key={t.id} className="text-xs py-1">
                <span className="font-mono text-txt-ter mr-2">{(t.length / 1000).toFixed(1)}k</span>
                <ThoughtLink id={t.id} title={t.title} onOpen={setOpenThoughtId} />
                <span className="text-txt-ter ml-2">({t.source})</span>
              </div>
            ))}
          </HealthSection>

          {data.checks.metadata_anomalies?.unavailable ? (
            <p className="text-xs text-txt-ter italic mt-4">Metadata anomalies: vault context unavailable ({data.checks.metadata_anomalies.reason})</p>
          ) : (
            <>
              <HealthSection
                id="unknown_projects"
                title="Unknown projects in metadata"
                subtitle="tagged on thoughts but no canonical .md in Projects/"
                count={data.checks.metadata_anomalies.totals.unknown_projects}
                expanded={expanded.has('unknown_projects')}
                onToggle={() => toggle('unknown_projects')}
              >
                {data.checks.metadata_anomalies.unknown_projects.map((p) => (
                  <div key={p.name} className="text-xs py-1">
                    <span className="font-mono text-txt-ter mr-2">×{p.count}</span>
                    <span className="text-txt-sec">{p.name}</span>
                  </div>
                ))}
              </HealthSection>

              <HealthSection
                id="unknown_people"
                title="Unknown people in metadata"
                subtitle="tagged on thoughts but no canonical .md in People/"
                count={data.checks.metadata_anomalies.totals.unknown_people}
                expanded={expanded.has('unknown_people')}
                onToggle={() => toggle('unknown_people')}
              >
                {data.checks.metadata_anomalies.unknown_people.map((p) => (
                  <div key={p.name} className="text-xs py-1">
                    <span className="font-mono text-txt-ter mr-2">×{p.count}</span>
                    <span className="text-txt-sec">{p.name}</span>
                  </div>
                ))}
              </HealthSection>

              <HealthSection
                id="orphan_project_files"
                title="Orphan Project files"
                subtitle="canonical .md exists but no active thought references it"
                count={data.checks.metadata_anomalies.totals.orphan_project_files}
                expanded={expanded.has('orphan_project_files')}
                onToggle={() => toggle('orphan_project_files')}
              >
                {data.checks.metadata_anomalies.orphan_project_files.map((name) => (
                  <div key={name} className="text-xs py-1 text-txt-sec">{name}</div>
                ))}
              </HealthSection>

              <HealthSection
                id="orphan_people_files"
                title="Orphan People files"
                subtitle="canonical .md exists but no active thought references it"
                count={data.checks.metadata_anomalies.totals.orphan_people_files}
                expanded={expanded.has('orphan_people_files')}
                onToggle={() => toggle('orphan_people_files')}
              >
                {data.checks.metadata_anomalies.orphan_people_files.map((name) => (
                  <div key={name} className="text-xs py-1 text-txt-sec">{name}</div>
                ))}
              </HealthSection>
            </>
          )}
        </>
      )}

      {openThoughtId && (
        <ThoughtModal thoughtId={openThoughtId} onClose={() => setOpenThoughtId(null)} />
      )}
    </div>
  );
}

function HealthSection({ id, title, subtitle, count, expanded, onToggle, children }) {
  const empty = count === 0;
  return (
    <div className="health-section py-3 border-t border-[var(--border)] -mx-6 px-6">
      <button
        type="button"
        onClick={empty ? undefined : onToggle}
        disabled={empty}
        className="w-full flex items-center justify-between text-left disabled:cursor-default"
      >
        <div>
          <div className="text-sm font-medium text-txt">
            {title} <span className={`ml-2 ${empty ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-300'}`}>{count}</span>
          </div>
          <div className="text-xs text-txt-ter">{subtitle}</div>
        </div>
        {!empty && (
          <span className="text-xs text-txt-ter">{expanded ? '▾' : '▸'}</span>
        )}
      </button>
      {!empty && expanded && (
        <div className="mt-3 pl-2 border-l-2 border-subtle space-y-0.5">{children}</div>
      )}
    </div>
  );
}

function ThoughtLink({ id, title, onOpen }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(id)}
      className="text-txt-sec hover:text-txt underline-offset-2 hover:underline text-left"
    >
      {title}
    </button>
  );
}
