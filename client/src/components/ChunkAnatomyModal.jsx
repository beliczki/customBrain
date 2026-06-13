import { useEffect, useState } from 'react';
import { thoughtAnatomy, searchExplain } from '../api.js';

// Retrieval anatomy + live "why did this match?" explainer (P18). Opened per
// thought. Shows how many vectors represent the thought (summary + chunks), and
// — when opened from a search with a query — how each point scored on the
// dense / bm25 / RRF legs and which one surfaced it.
// Hover "?" with an explanation bubble. CSS-only (group-hover), no positioning JS.
function HelpTip({ text }) {
  return (
    <span className="help-tip group relative inline-flex align-middle ml-1 cursor-help">
      <span className="help-tip__icon w-3.5 h-3.5 inline-flex items-center justify-center rounded-full border border-subtle text-[9px] leading-none text-txt-ter">?</span>
      <span className="help-tip__bubble pointer-events-none absolute left-0 bottom-full z-30 mb-1 hidden group-hover:block w-60 bg-surface border border-subtle shadow-lg p-2 text-[11px] leading-snug normal-case tracking-normal text-txt-sec">
        {text}
      </span>
    </span>
  );
}

function KindBadge({ kind }) {
  const map = {
    summary: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300',
    content: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
    thought: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  };
  return <span className={`anatomy-kind px-2 py-0.5 text-[10px] uppercase tracking-wider ${map[kind] || map.thought}`}>{kind}</span>;
}

function ChunkText({ text }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  const long = text.length > 220;
  return (
    <div className="anatomy-chunk-text text-xs text-txt-ter mt-1 whitespace-pre-wrap break-words">
      {open || !long ? text : `${text.slice(0, 220)}…`}
      {long && (
        <button onClick={() => setOpen((o) => !o)} className="show-more-btn ml-1 text-accent hover:underline">
          {open ? 'kevesebb' : 'több'}
        </button>
      )}
    </div>
  );
}

function Score({ leg, kind }) {
  // leg = { rank, score } | null
  if (!leg) return <span className="text-txt-ter">—</span>;
  const val = kind === 'dense' ? leg.score.toFixed(3) : kind === 'bm25' ? leg.score.toFixed(2) : `#${leg.rank}`;
  return (
    <span>
      {kind === 'rrf' ? '' : <span className="text-txt-sec">{val}</span>}
      {kind !== 'rrf' && <span className="text-txt-ter"> #{leg.rank}</span>}
      {kind === 'rrf' && <span className="text-txt-sec">#{leg.rank}</span>}
    </span>
  );
}

export default function ChunkAnatomyModal({ thoughtId, query, onClose }) {
  const [anatomy, setAnatomy] = useState(null);
  const [explain, setExplain] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!thoughtId) return;
    setLoading(true);
    setError(null);
    setAnatomy(null);
    setExplain(null);
    const jobs = [thoughtAnatomy(thoughtId).then(setAnatomy)];
    if (query) jobs.push(searchExplain(query, thoughtId).then(setExplain).catch(() => {}));
    Promise.all(jobs).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [thoughtId, query]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!thoughtId) return null;

  const exMap = new Map((explain?.points || []).map((p) => [String(p.id), p]));
  const rows = anatomy
    ? [
        { id: anatomy.id, kind: 'thought', label: 'thought / summary', dense_dim: anatomy.main.dense_dim, bm25_terms: anatomy.main.bm25_terms, text: null },
        ...anatomy.chunks.map((c) => ({ id: c.id, kind: c.chunk_kind, label: c.chunk_label, dense_dim: c.dense_dim, bm25_terms: c.bm25_terms, text: c.chunk_text })),
      ]
    : [];

  return (
    <div className="anatomy-modal-backdrop fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 sm:p-8 overflow-y-auto" onClick={onClose}>
      <div className="anatomy-modal bg-surface border border-subtle shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col relative" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} aria-label="Close" className="anatomy-modal__close absolute top-2 right-2 z-10 w-8 h-8 flex items-center justify-center text-txt-ter hover:text-txt hover:bg-[var(--border)]">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>

        <div className="anatomy-modal__body overflow-y-auto p-6">
          <h3 className="text-xs uppercase tracking-wider text-txt-ter mb-1">Vektor-anatómia</h3>
          {loading && <p className="text-txt-ter text-sm">Betöltés…</p>}
          {error && <p className="text-red-600 dark:text-red-400 text-sm">Hiba: {error}</p>}

          {anatomy && (
            <>
              <h2 className="text-base font-bold text-txt mb-2">{anatomy.title || '(cím nélkül)'}</h2>
              <div className="anatomy-stats flex flex-wrap gap-x-4 gap-y-1 text-xs text-txt-sec mb-4">
                <span><b className="text-txt">{anatomy.totals.points}</b> pont</span>
                <span><b className="text-txt">{anatomy.totals.dense_vectors}</b> dense + <b className="text-txt">{anatomy.totals.sparse_vectors}</b> bm25 vektor</span>
                {anatomy.has_v2_summary ? (
                  <span><b className="text-txt">{anatomy.totals.summary_chunks}</b> summary + <b className="text-txt">{anatomy.totals.content_chunks}</b> content chunk</span>
                ) : (
                  <span className="empty-state text-txt-ter">1 vektor · nincs chunk (egytémájú vagy &lt;1500 char)</span>
                )}
                <span className="text-txt-ter">forrás: {anatomy.source}</span>
              </div>

              <div className="anatomy-legend flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-txt-ter mb-4">
                <span>
                  dense 3072d
                  <HelpTip text="A jelentést kódoló Gemini-embedding — fix 3072 számból (innen a '3072d'). Szemantikus hasonlóságra: 'ugyanazt jelenti', akkor is ha más szavakkal van leírva." />
                </span>
                <span>
                  bm25 term
                  <HelpTip text="Kulcsszó- (sparse) vektor. Pontos szó-egyezésre — nevek, rövidítések (pl. SZA), amiket a dense elmosna. A 'N term' = N egyedi szótő ebben a darabban (kisbetűsítés + stopszavak elhagyása + szótövezés után). Több term = szélesebb szókincs, több szóra található meg." />
                </span>
                <span>
                  keresés
                  <HelpTip text="A keresés a dense és a bm25 vektort RRF-fel fúzionálja. Keresésből nyitva itt látod pontonként a cosine-t, a rangot mindkét lábon, és melyik chunk vitte fel a thoughtot." />
                </span>
              </div>

              {query && (
                <p className="anatomy-query text-xs text-txt-ter mb-3">
                  keresés: <span className="text-txt-sec">«{query}»</span>
                  {explain?.winner && <span className="ml-2">· a kiemelt pont vitte fel a thoughtot</span>}
                  {!explain && <span className="ml-2">(explain betöltése…)</span>}
                </p>
              )}

              <div className="anatomy-points divide-y divide-[var(--border)] border-t border-[var(--border)]">
                {rows.map((r) => {
                  const ex = exMap.get(String(r.id));
                  const isWinner = explain?.winner && String(explain.winner) === String(r.id);
                  return (
                    <div key={r.id} className={`anatomy-point py-3 ${isWinner ? 'bg-amber-50 dark:bg-amber-900/20 -mx-2 px-2' : ''}`}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <KindBadge kind={r.kind} />
                        <span className="text-sm text-txt font-medium">{r.label}</span>
                        {isWinner && <span className="px-1.5 py-0.5 text-[10px] uppercase tracking-wider bg-amber-200 text-amber-800 dark:bg-amber-800 dark:text-amber-200">match</span>}
                        <span className="ml-auto text-[10px] text-txt-ter font-mono">dense {r.dense_dim}d · bm25 {r.bm25_terms} term</span>
                      </div>

                      {query && (
                        <div className="anatomy-scores grid grid-cols-3 gap-2 mt-1.5 text-[11px] font-mono">
                          <span className="text-txt-ter">dense: <Score leg={ex?.dense} kind="dense" /></span>
                          <span className="text-txt-ter">bm25: <Score leg={ex?.bm25} kind="bm25" /></span>
                          <span className="text-txt-ter">RRF: <Score leg={ex?.rrf} kind="rrf" /></span>
                        </div>
                      )}

                      <ChunkText text={r.text} />
                    </div>
                  );
                })}
              </div>

              {query && (
                <p className="text-[10px] text-txt-ter mt-3">
                  Számok: dense = cosine + rang a top-100-ban · bm25 = score + rang · RRF = fúziós rang. „—" = nem volt a top-100-ban azon a lábon.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
