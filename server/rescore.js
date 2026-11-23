// The last step of search: what age and curation do to a fused (RRF) score.
// One rule for search, typed search and spider. No imports, so `npm test` can
// run it on the Mac (tests/rescore.test.mjs).
//
// Why this is its own file (2026-11-23): the recall probe showed that an entry
// older than 90 days, asked with its own words, is the first hit 3 times in 100
// and missing from the top ten 35 times. RRF scores sit in a narrow band (one
// leg gives 1/61 for rank 1 and 1/90 for rank 30), while the factors below span
// a much wider one, so a factor outweighs where a hit ranked. The default is
// unchanged for now; `recency: false` exists to measure the search without age.
// See tasks/todo.md, the time-decay plan.

// Canonical dossiers (People/Projects/Topics) are curated truth — they should
// outrank a stale raw thought on overlapping content. Modest multiplier;
// calibrate with the evaluator. Dossiers are ALSO exempt from time decay: a
// current dossier is not "old news" just because its file wasn't touched today.
export const DOSSIER_BOOST = 1.5;
// 0.76.0: the boost goes only to a dossier the query NAMES (matchAnchors —
// the same recognition map and spider use). An unnamed dossier is context and
// is weighted like an average-aged thought. Measured on 10 work questions:
// dossiers took 25% of the top-10; the named ones were relevant, while the
// siblings that only shared a word ("Bird" → ERSTE Market, Hitelkártya,
// Vállakozók) were all judged irrelevant. Hand-set; calibrate with the eval.
export const UNNAMED_DOSSIER = 0.5;

/**
 * Recency factor of a thought, the ONE rule search and spider share (0.65.0).
 * Prefer effective_date (content date) over created_at (capture date): old
 * Gmail/Fireflies content captured today should NOT get a recency boost as
 * if it were a fresh thought. 90-day scale — gentler than the initial 30-day;
 * a 30-day decay over-penalised content older than a month even when the
 * match was much stronger.
 */
export function recencyFactor({ effective_date, created_at }, now = Date.now()) {
  const days = (now - new Date(effective_date || created_at).getTime()) / 86400000;
  return 1 / (1 + days / 90);
}

/**
 * Re-score rolled-up hits and sort them. `score` comes in as the fused score
 * and goes out multiplied; `cosine_score` keeps what came in.
 * - `isNamed(hit)`: the query names this dossier (decided by the caller, which
 *   has the vault context).
 * - `recency: false`: age is left out; the dossier weights stay.
 */
export function rescore(results, { now = Date.now(), isNamed = () => false, recency = true } = {}) {
  return results
    .map((r) => {
      const isDossier = r.kind === 'dossier';
      const decay = isDossier || !recency ? 1 : recencyFactor(r, now);
      const boost = isDossier ? (isNamed(r) ? DOSSIER_BOOST : UNNAMED_DOSSIER) : 1;
      return { ...r, cosine_score: r.score, score: r.score * decay * boost };
    })
    .sort((a, b) => b.score - a.score);
}
