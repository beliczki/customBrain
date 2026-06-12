import { Router } from 'express';
import { embedText } from '../embeddings.js';
import { sparseEncodeQuery } from '../sparse.js';
import { hybridSearch, getByIds, explainLegs, getChunksWithVectors } from '../qdrant.js';

const router = Router();

router.get('/search', async (req, res) => {
  const { q, limit } = req.query;
  if (!q) return res.status(400).json({ error: 'q parameter required' });

  try {
    const results = await searchThoughts(q, parseInt(limit) || 5);
    res.json(results);
  } catch (err) {
    console.error('Search error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Live "why did this thought match?" explainer (P18). Runs the query on each
// retrieval leg separately (dense-only, bm25-only, RRF-fused) and reports, for
// every point of the given thought (summary + each chunk), its cosine/rank on
// each leg — null when it didn't make the top-N. Shows what surfaced and what
// didn't, straight from Qdrant's own scoring.
router.get('/search/explain', async (req, res) => {
  const { q, id } = req.query;
  if (!q || !id) return res.status(400).json({ error: 'q and id parameters required' });

  try {
    const denseVector = await embedText(q, 'RETRIEVAL_QUERY');
    const sparseVector = sparseEncodeQuery(q);
    const legs = await explainLegs(denseVector, sparseVector, 100);
    const chunks = await getChunksWithVectors(id);

    const rankMap = (pts) => {
      const m = new Map();
      pts.forEach((p, i) => m.set(String(p.id), { rank: i + 1, score: p.score }));
      return m;
    };
    const dM = rankMap(legs.dense);
    const bM = rankMap(legs.bm25);
    const rM = rankMap(legs.rrf);
    const lookup = (pid) => ({
      dense: dM.get(String(pid)) || null,
      bm25: bM.get(String(pid)) || null,
      rrf: rM.get(String(pid)) || null,
    });

    const points = [
      { id, label: 'thought / summary', kind: 'thought', ...lookup(id) },
      ...chunks.map((c) => ({
        id: c.id,
        label: c.payload.chunk_label,
        kind: c.payload.chunk_kind,
        ...lookup(c.id),
      })),
    ];
    const winner = points
      .filter((p) => p.rrf)
      .sort((a, b) => a.rrf.rank - b.rrf.rank)[0]?.id || null;

    res.json({ q, id, leg_limit: 100, winner, points });
  } catch (err) {
    console.error('Explain error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;

function applyTimeDecay(results) {
  const now = Date.now();
  return results
    .map((r) => {
      // Prefer effective_date (content date) over created_at (capture date).
      // Old Gmail/Fireflies content captured today should NOT get a recency
      // boost as if it were a fresh thought.
      const dateStr = r.effective_date || r.created_at;
      const days = (now - new Date(dateStr).getTime()) / 86400000;
      // 90-day half-life — gentler than initial 30-day. At 238 thoughts the
      // brain has months of context; a 30-day decay over-penalises content
      // older than a month even when cosine match is much stronger.
      const decay = 1 / (1 + days / 90);
      return { ...r, cosine_score: r.score, score: r.score * decay };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Roll chunk hits up to their parent thought, keeping the best-scoring chunk
 * per parent. A parent that hits both as a thought-vector AND via a chunk is
 * surfaced once with the higher of the two scores (and the chunk label if
 * the chunk was the winner).
 */
async function rollupChunkHits(rawHits) {
  // Group by canonical thought id (chunk → parent_id, thought → own id)
  const byThought = new Map();
  const parentIdsToFetch = new Set();

  for (const hit of rawHits) {
    const canonicalId = hit.kind === 'chunk' ? hit.parent_id : hit.id;
    if (!canonicalId) continue; // defensive: a chunk with no parent_id is data corruption
    const existing = byThought.get(canonicalId);
    if (!existing || hit.score > existing.score) {
      byThought.set(canonicalId, hit);
    }
    if (hit.kind === 'chunk') parentIdsToFetch.add(hit.parent_id);
  }

  // Batch-fetch parent thoughts for chunk-winning groups (thoughts already
  // carry their own payload, no fetch needed)
  const parents = await getByIds([...parentIdsToFetch]);
  const parentMap = new Map(parents.map((p) => [p.id, p]));

  const out = [];
  for (const [canonicalId, hit] of byThought) {
    if (hit.kind === 'chunk') {
      const parent = parentMap.get(hit.parent_id);
      if (!parent) continue; // parent missing → skip
      out.push({
        id: parent.id,
        title: parent.title,
        text: parent.text,
        created_at: parent.created_at,
        effective_date: parent.effective_date,
        source: parent.source,
        has_v2_summary: parent.has_v2_summary,
        chunk_count: parent.chunk_count,
        last_internal_date: parent.last_internal_date,
        refresh_count: parent.refresh_count,
        last_message_from: parent.last_message_from,
        metadata: {
          people: parent.people,
          topics: parent.topics,
          projects: parent.projects,
          type: parent.type,
          action_items: parent.action_items,
        },
        score: hit.score,
        matched_chunk_label: hit.chunk_label,
        matched_chunk_kind: hit.chunk_kind,
        matched_chunk_text: hit.chunk_text,
      });
    } else {
      out.push({
        id: hit.id,
        title: hit.title,
        text: hit.text,
        created_at: hit.created_at,
        effective_date: hit.effective_date,
        source: hit.source,
        has_v2_summary: hit.has_v2_summary,
        chunk_count: hit.chunk_count,
        last_internal_date: hit.last_internal_date,
        refresh_count: hit.refresh_count,
        last_message_from: hit.last_message_from,
        metadata: hit.metadata,
        score: hit.score,
      });
    }
  }
  return out;
}

export async function searchThoughts(query, limit = 5) {
  const denseVector = await embedText(query, 'RETRIEVAL_QUERY');
  const sparseVector = sparseEncodeQuery(query);
  // Over-fetch so rollup can collapse chunk-clusters and still leave us with N
  const overfetchLimit = Math.max(limit * 6, 30);
  const rawHits = await hybridSearch(denseVector, sparseVector, overfetchLimit);
  const rolled = await rollupChunkHits(rawHits);
  const decayed = applyTimeDecay(rolled);
  return decayed.slice(0, limit);
}
