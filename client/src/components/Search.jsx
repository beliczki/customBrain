import { useEffect, useState } from 'react';
import { search, streamTrace } from '../api.js';
import ThoughtBody from './ThoughtBody.jsx';
import ThoughtFacts from './ThoughtFacts.jsx';
import ChunkAnatomyModal from './ChunkAnatomyModal.jsx';
import BrainMapPackage from './BrainMapPackage.jsx';
import SpiderResult, { SpiderProgress } from './SpiderResult.jsx';
import { ShellHeader } from './AppShell.jsx';

// Two methods over one input (0.57.0; named after their MCP tools since 0.60.0): "map" is the package the
// agent gets; "search" is the raw hybrid hit list with the anatomy view.
// A submit fetches only the active mode; switching fetches the other one for
// the same query the first time it is shown.
// [mode key, label = method name]. spider (0.63.0) has no route of its own:
// its text view reads the same /trace answer the graph replay plays.
const MODES = [['hits', 'search'], ['package', 'map'], ['spider', 'spider']];
const METHOD_OF = { hits: 'search', package: 'map', spider: 'spider' };
const MODE_OF = { search: 'hits', map: 'package', spider: 'spider' };
// spider's step budget (0.75.0): the server default is 24.
const STEP_CHOICES = [12, 24, 36, 48];

// `active` (0.71.0): the page stays mounted while another tab shows (the
// graph replay returns here with the results intact); only the active page
// draws into the shell's header and footer.
export default function Search({ active, onTraverse }) {
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [mode, setMode] = useState('package');
  const [steps, setSteps] = useState(24);
  const [results, setResults] = useState({ q: null, hits: [] });
  const [map, setMap] = useState({ q: null, data: null });
  const [spider, setSpider] = useState({ q: null, data: null });
  // Live stage list per streamed method (map, spider), shown while it runs and after.
  const [phases, setPhases] = useState({ package: [], spider: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [anatomyId, setAnatomyId] = useState(null);

  async function run(m, q, stepBudget = steps) {
    setLoading(true);
    setError(null);
    try {
      if (m === 'package' || m === 'spider') {
        const set = m === 'package' ? setMap : setSpider;
        set({ q, data: null });
        setPhases((all) => ({ ...all, [m]: [] }));
        // A stage's 'done' line replaces its 'start' line in place.
        const data = await streamTrace(METHOD_OF[m], q, (ev) => setPhases((all) => {
          const prev = all[m];
          const at = prev.findIndex((p) => p.name === ev.name);
          const next = at < 0 ? [...prev, ev] : prev.map((p, i) => (i === at ? ev : p));
          return { ...all, [m]: next };
        }), m === 'spider' ? stepBudget : null);
        set({ q, data: m === 'package' ? data.result : data });
      }
      else setResults({ q, hits: await search(q) });
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }

  // Browser history (0.72.0): every search and method switch is a history
  // entry (?q=…&m=search|map|spider), so Back returns to the previous search
  // and a link opens straight into it.
  const pushHistory = (m, q, stepBudget = steps) => {
    const url = `?q=${encodeURIComponent(q)}&m=${METHOD_OF[m]}${m === 'spider' ? `&s=${stepBudget}` : ''}`;
    if (window.location.search !== url) window.history.pushState(null, '', url);
  };

  // Read ?q=&m= on load and on Back/Forward; this restores, it does not push.
  useEffect(() => {
    const fromUrl = () => {
      const p = new URLSearchParams(window.location.search);
      const q = p.get('q');
      if (!q) return;
      const m = MODE_OF[p.get('m')] || 'package';
      const st = Number(p.get('s')) || 24;
      setQuery(q);
      setSubmittedQuery(q);
      setMode(m);
      setSteps(st);
      run(m, q, st);
    };
    fromUrl();
    window.addEventListener('popstate', fromUrl);
    return () => window.removeEventListener('popstate', fromUrl);
    // run only uses state setters; mount-time wiring on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSearch(e) {
    e.preventDefault();
    if (!query.trim()) return;
    setSubmittedQuery(query);
    pushHistory(mode, query);
    run(mode, query);
  }

  // A new search from inside the results (spider's tag menu).
  function searchFor(q, method) {
    const m = MODE_OF[method];
    setQuery(q);
    setSubmittedQuery(q);
    setMode(m);
    pushHistory(m, q);
    run(m, q);
  }

  function switchMode(m) {
    setMode(m);
    if (submittedQuery) pushHistory(m, submittedQuery);
    const loadedFor = { package: map.q, spider: spider.q, hits: results.q }[m];
    if (submittedQuery && loadedFor !== submittedQuery) run(m, submittedQuery);
  }

  return (
    <div>
      {/* 0.68.0: the search bar lives in the shell's top bar — input · method switch · Search */}
      {active && (
      <ShellHeader>
        <form onSubmit={handleSearch} className="search-bar flex items-center gap-2 w-full max-w-3xl">
          <input
            placeholder="Search your brain..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 min-w-0 px-3 py-1.5 bg-surface border border-subtle text-txt text-sm"
          />
          <div className="search-mode-switch inline-flex shrink-0 border border-subtle">
            {MODES.map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                className={`px-3 py-1.5 text-xs font-medium uppercase tracking-wider transition-colors ${
                  mode === m ? 'bg-accent text-white' : 'text-txt-ter hover:text-txt'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {mode === 'spider' && (
            <select
              value={steps}
              onChange={(e) => {
                const st = Number(e.target.value);
                setSteps(st);
                if (submittedQuery) { pushHistory('spider', submittedQuery, st); run('spider', submittedQuery, st); }
              }}
              title="A spider lépéskerete — több lépés = több találat, hosszabb válasz"
              className="search-steps shrink-0 px-2 py-1.5 bg-surface border border-subtle text-txt-sec text-xs"
            >
              {STEP_CHOICES.map((n) => <option key={n} value={n}>{n} lépés</option>)}
            </select>
          )}
          <button
            type="submit"
            disabled={loading}
            className="shrink-0 px-5 py-1.5 bg-accent text-white text-sm font-medium disabled:opacity-50 hover:bg-accent-dark transition-colors"
          >
            {loading ? '...' : 'Search'}
          </button>
        </form>
        {submittedQuery && (
          <button
            type="button"
            onClick={() => onTraverse(METHOD_OF[mode], submittedQuery, mode === 'spider' ? steps : null)}
            className="search-traverse-btn ml-auto shrink-0 px-3 py-1.5 text-xs border border-subtle text-txt-sec hover:text-txt transition-colors"
            title="A módszer lépései lassítva, a Graph Ontológia nézetén — onnan visszalépve ez az eredmény vár"
          >
            Bejárás a gráfon ▶
          </button>
        )}
      </ShellHeader>
      )}
      {error && <p className="text-red-600 dark:text-red-400 text-sm mb-4">Error: {error}</p>}
      {/* map: stages above the package; spider: stages alone until the result, then in its top panel */}
      {((mode === 'package') || (mode === 'spider' && !spider.data)) && phases[mode].length > 0 && <div className="mb-6"><SpiderProgress phases={phases[mode]} /></div>}
      {/* The page is wide for spider's lens columns; the other methods keep the reading width. */}
      {mode === 'package' && map.data && <div className="max-w-[852px] mx-auto"><BrainMapPackage map={map.data} onShowHits={() => switchMode('hits')} /></div>}
      {mode === 'spider' && spider.data && <SpiderResult key={spider.q} walk={spider.data.result} phases={phases.spider} onSearch={searchFor} active={active} />}
      {mode === 'hits' && (
      <div className="max-w-[852px] mx-auto">
        {results.hits.map((r) => (
          <div key={r.id} className="py-6 border-t border-[var(--border)] first:border-t-0 -mx-6 px-6">
            <div className="mb-3">
              <div className="flex justify-between items-start gap-2">
                {r.title && <h3 className="text-base font-bold mb-1 uppercase tracking-wide text-txt flex-1 min-w-0">{r.title}</h3>}
                <button
                  onClick={() => setAnatomyId(r.id)}
                  className="anatomy-btn shrink-0 inline-flex items-center gap-1 text-xs text-txt-ter hover:text-accent border border-subtle px-2 py-1"
                  title="Vektor-anatómia: hány vektor, milyen chunkok, mi alapján találta meg"
                >
                  ⊞ Anatómia
                </button>
              </div>
              {r.matched_chunk_label && (
                <p className="chunk-match-label text-xs text-txt-ter italic mb-2">
                  ↳ találat: <span className="not-italic font-medium text-txt-sec">{r.matched_chunk_label}</span>
                  {r.matched_chunk_kind && <span className="ml-1 text-[10px] uppercase tracking-wider">({r.matched_chunk_kind})</span>}
                </p>
              )}
              <ThoughtBody text={r.text} />
            </div>

            <div className="space-y-2 text-xs">
              {r.metadata?.type && (
                <div className="flex items-center gap-2">
                  <span className="text-txt-ter w-16">Type</span>
                  <span className="px-2 py-0.5 bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300">{r.metadata.type}</span>
                </div>
              )}

              {r.metadata?.topics?.length > 0 && (
                <div className="flex items-start gap-2">
                  <span className="text-txt-ter w-16 pt-0.5">Topics</span>
                  <div className="flex gap-1 flex-wrap">
                    {r.metadata.topics.map((t) => (
                      <span key={t} className="px-2 py-0.5 bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">{t}</span>
                    ))}
                  </div>
                </div>
              )}

              {r.metadata?.projects?.length > 0 && (
                <div className="flex items-start gap-2">
                  <span className="text-txt-ter w-16 pt-0.5">Projects</span>
                  <div className="flex gap-1 flex-wrap">
                    {r.metadata.projects.map((p) => (
                      <span key={p} className="px-2 py-0.5 bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300">{p}</span>
                    ))}
                  </div>
                </div>
              )}

              {r.metadata?.people?.length > 0 && (
                <div className="flex items-start gap-2">
                  <span className="text-txt-ter w-16 pt-0.5">People</span>
                  <div className="flex gap-1 flex-wrap">
                    {r.metadata.people.map((p) => (
                      <span key={p} className="px-2 py-0.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">{p}</span>
                    ))}
                  </div>
                </div>
              )}

              {r.metadata?.action_items?.length > 0 && (
                <div className="flex items-start gap-2">
                  <span className="text-txt-ter w-16 pt-0.5">Actions</span>
                  <div className="flex flex-col gap-1">
                    {r.metadata.action_items.map((a, i) => (
                      <span key={i} className="px-2 py-0.5 bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">{a}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <ThoughtFacts item={r} />

            <p className="text-xs text-txt-ter mt-3">
              {r.evidence && (
                <span
                  className="evidence-badge inline-block mr-2 px-1.5 py-0.5 border border-subtle text-[10px] uppercase tracking-wider"
                  title="Miért találta meg: exact_title = a cím tartalmazza a keresést · bm25_exact = top lexikális találat · high_dense = erős szemantikus egyezés (cosine ≥ 0.8) · weak_semantic = csak a fúzió hozta fel"
                >
                  {r.evidence.replace('_', ' ')}
                </span>
              )}
              Score: {r.score?.toFixed(3)}{r.cosine_score ? ` (cosine: ${r.cosine_score.toFixed(3)})` : ''}
              {r.effective_date && r.effective_date.slice(0, 10) !== r.created_at?.slice(0, 10) ? (
                <> · <span title="when the content happened">{new Date(r.effective_date).toLocaleString()}</span> <span className="text-[10px] uppercase tracking-wider">captured {new Date(r.created_at).toLocaleDateString()}</span></>
              ) : (
                <> · {new Date(r.effective_date || r.created_at).toLocaleString()}</>
              )}
            </p>
          </div>
        ))}
      </div>
      )}
      <ChunkAnatomyModal thoughtId={anatomyId} query={submittedQuery} onClose={() => setAnatomyId(null)} />
    </div>
  );
}
