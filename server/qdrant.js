import { QdrantClient } from '@qdrant/js-client-rest';
import crypto from 'node:crypto';

const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL || 'http://localhost:6333',
});

const COLLECTION = 'thoughts_v2';

export async function upsertPoint(denseVector, sparseVector, payload, id = null) {
  const pointId = id || crypto.randomUUID();
  await qdrant.upsert(COLLECTION, {
    points: [{
      id: pointId,
      vector: { dense: denseVector, bm25: sparseVector },
      payload,
    }],
  });
  return pointId;
}

function mapHit(p) {
  return {
    id: p.id,
    score: p.score,
    kind: p.payload.kind || 'thought',
    text: p.payload.text,
    title: p.payload.title,
    created_at: p.payload.created_at,
    effective_date: p.payload.effective_date,
    metadata: {
      people: p.payload.people,
      topics: p.payload.topics,
      projects: p.payload.projects,
      type: p.payload.type,
      action_items: p.payload.action_items,
    },
    parent_id: p.payload.parent_id,
    chunk_kind: p.payload.chunk_kind,
    chunk_label: p.payload.chunk_label,
    chunk_text: p.payload.chunk_text,
    parent_title: p.payload.parent_title,
    parent_source: p.payload.parent_source,
  };
}

/**
 * Pure-dense semantic search. Used for near-duplicate / conflict detection
 * at capture time, where lexical match is the wrong signal — we want
 * "semantically similar regardless of wording" so paraphrases trigger
 * the contradiction check.
 */
export async function searchVector(vector, limit = 5) {
  const results = await qdrant.query(COLLECTION, {
    query: vector,
    using: 'dense',
    limit,
    with_payload: true,
  });
  return results.points.map(mapHit);
}

/**
 * Hybrid search: dense (Gemini cosine) + sparse (BM25 with server-side IDF)
 * fused via Reciprocal Rank Fusion. Used by the user-facing search route.
 * Each leg over-fetches 4× so RRF has room to fuse meaningfully.
 *
 * RRF k=60 per Cormack/Clarke/Büttcher 2009 (literature default; also Elastic,
 * Vespa, Weaviate). Qdrant's built-in default is k=2, which lets a single
 * BM25 rank-1 lexical hit (1/(2+0)=0.5) numerically dominate the fusion —
 * dense rank-2 contributes only 1/(2+1)=0.333 and can never catch up.
 * At k=60 the rank-position penalty flattens (rank 1 vs 20: 0.0164 vs 0.0125),
 * so both legs contribute meaningfully instead of single-leg-rank-1 winning.
 * Probe data: tasks/p8-baseline-k2.json vs tasks/p8-after-k60.json.
 */
export async function hybridSearch(denseVector, sparseVector, limit = 5) {
  const results = await qdrant.query(COLLECTION, {
    prefetch: [
      { query: denseVector, using: 'dense', limit: limit * 4 },
      { query: sparseVector, using: 'bm25', limit: limit * 4 },
    ],
    query: { rrf: { k: 60 } },
    limit,
    with_payload: true,
  });
  return results.points.map(mapHit);
}

/**
 * Batch-fetch points by ids. Returns array of { id, ...payload }.
 */
export async function getByIds(ids) {
  if (!ids?.length) return [];
  const results = await qdrant.retrieve(COLLECTION, {
    ids,
    with_payload: true,
  });
  return (results || []).map((p) => ({ id: p.id, ...p.payload }));
}

// Common filter to exclude v2 chunk points from any "list of thoughts" query.
// Chunks are a search-augmenting layer; the THOUGHT is the canonical unit.
const NOT_CHUNK = { must_not: [{ key: 'kind', match: { value: 'chunk' } }] };

export async function scrollRecent(limit = 10) {
  // Order by effective_date — the date the CONTENT happened, not when it was
  // captured. A 7-month-old email captured today should NOT jump to the top
  // of Recent just because the cron labeled it now.
  const results = await qdrant.scroll(COLLECTION, {
    limit,
    with_payload: true,
    order_by: { key: 'effective_date', direction: 'desc' },
    filter: NOT_CHUNK,
  });
  return results.points.map((p) => ({
    id: p.id,
    text: p.payload.text,
    title: p.payload.title,
    metadata: {
      people: p.payload.people,
      topics: p.payload.topics,
      projects: p.payload.projects,
      type: p.payload.type,
      action_items: p.payload.action_items,
    },
    created_at: p.payload.created_at,
    effective_date: p.payload.effective_date,
  }));
}

export async function getAllPayloads() {
  const all = [];
  let offset = undefined;
  while (true) {
    const batch = await qdrant.scroll(COLLECTION, {
      limit: 100,
      with_payload: true,
      offset,
      filter: NOT_CHUNK,
    });
    all.push(...batch.points);
    if (!batch.next_page_offset) break;
    offset = batch.next_page_offset;
  }
  return all.map((p) => p.payload);
}

/**
 * Fetch all points with both payload AND vectors. Used by the Obsidian
 * export to compute per-thought semantic neighbors (P1d: semantic autolinks).
 * At ~100-500 thoughts this is cheap; at 1000s, consider batching.
 */
export async function getAllWithVectors() {
  const all = [];
  let offset = undefined;
  while (true) {
    const batch = await qdrant.scroll(COLLECTION, {
      limit: 100,
      with_payload: true,
      with_vector: true,
      offset,
      filter: NOT_CHUNK,
    });
    all.push(...batch.points);
    if (!batch.next_page_offset) break;
    offset = batch.next_page_offset;
  }
  // Unwrap the named-vector container so callers (Obsidian export's semantic
  // neighbor computation) keep their existing array-of-floats contract.
  return all.map((p) => ({
    id: p.id,
    vector: p.vector?.dense || p.vector,
    payload: p.payload,
  }));
}

export async function deletePoint(id) {
  await qdrant.delete(COLLECTION, { points: [id] });
}

export async function updatePayload(id, payload) {
  await qdrant.setPayload(COLLECTION, { points: [id], payload });
}

export async function getById(id) {
  const results = await qdrant.retrieve(COLLECTION, {
    ids: [id],
    with_payload: true,
  });
  if (!results || results.length === 0) return null;
  const p = results[0];
  return { id: p.id, ...p.payload };
}

export async function findBySourceId(source, sourceId) {
  const results = await scrollFiltered(
    {
      must: [
        { key: 'source', match: { value: source } },
        { key: 'source_id', match: { value: sourceId } },
      ],
    },
    1,
  );
  return results[0] || null;
}

/**
 * Like findBySourceId but returns the raw payload so callers can read fields
 * that the scrollFiltered mapper drops (last_internal_date, refresh_count,
 * status, …). Used by the Gmail intake cron to decide whether a thread needs
 * a refresh.
 */
export async function findBySourceIdRaw(source, sourceId) {
  const results = await qdrant.scroll(COLLECTION, {
    limit: 1,
    with_payload: true,
    filter: {
      must: [
        { key: 'source', match: { value: source } },
        { key: 'source_id', match: { value: sourceId } },
      ],
    },
  });
  if (!results.points || results.points.length === 0) return null;
  const p = results.points[0];
  return { id: p.id, ...p.payload };
}

/**
 * Compute per-thought connection stats for brain-hygiene diagnostics.
 *
 * Returns thoughts sorted by suspicion score (hub_score desc, then
 * project_count desc). Only active thoughts (status != 'archived').
 *
 * hub_score is the sum of "thought-count per project" across all the
 * thought's projects — i.e. how many thoughts this one connects to via
 * shared-project edges in the Obsidian graph.
 */
export async function getConnectionStats() {
  const all = [];
  let offset = undefined;
  while (true) {
    const batch = await qdrant.scroll(COLLECTION, {
      limit: 200,
      with_payload: true,
      offset,
      filter: NOT_CHUNK,
    });
    all.push(...batch.points);
    if (!batch.next_page_offset) break;
    offset = batch.next_page_offset;
  }

  // First pass: reverse index — how many (active) thoughts use each project/person/topic
  const projectCounts = new Map();
  const personCounts = new Map();
  const topicCounts = new Map();
  for (const p of all) {
    if (p.payload.status === 'archived') continue;
    for (const pr of p.payload.projects || []) projectCounts.set(pr, (projectCounts.get(pr) || 0) + 1);
    for (const pe of p.payload.people || []) personCounts.set(pe, (personCounts.get(pe) || 0) + 1);
    for (const to of p.payload.topics || []) topicCounts.set(to, (topicCounts.get(to) || 0) + 1);
  }

  // Second pass: compute per-thought scores
  const stats = [];
  for (const p of all) {
    if (p.payload.status === 'archived') continue;
    const projects = p.payload.projects || [];
    const people = p.payload.people || [];
    const topics = p.payload.topics || [];
    // hub_score excludes self — if a project has count=1 (only this thought),
    // it contributes 0 edges to other thoughts.
    const hubFromProjects = projects.reduce((n, pr) => n + Math.max(0, (projectCounts.get(pr) || 0) - 1), 0);
    const hubFromPeople = people.reduce((n, pe) => n + Math.max(0, (personCounts.get(pe) || 0) - 1), 0);
    stats.push({
      id: p.id,
      title: p.payload.title,
      type: p.payload.type,
      created_at: p.payload.created_at,
      project_count: projects.length,
      people_count: people.length,
      topic_count: topics.length,
      projects,
      people,
      hub_score: hubFromProjects + hubFromPeople,
      hub_from_projects: hubFromProjects,
      hub_from_people: hubFromPeople,
    });
  }

  return { stats, projectCounts, personCounts, topicCounts };
}

export async function scrollFiltered(filter, limit = 100) {
  const all = [];
  let offset = undefined;
  while (true) {
    const batch = await qdrant.scroll(COLLECTION, {
      limit,
      with_payload: true,
      filter,
      offset,
    });
    all.push(...batch.points);
    if (!batch.next_page_offset) break;
    offset = batch.next_page_offset;
  }
  return all.map((p) => ({
    id: p.id,
    text: p.payload.text,
    title: p.payload.title,
    people: p.payload.people,
    topics: p.payload.topics,
    projects: p.payload.projects,
    type: p.payload.type,
    action_items: p.payload.action_items,
    created_at: p.payload.created_at,
  }));
}

/**
 * Same scroll as scrollFiltered, but returns the raw payload spread onto
 * each row — exposes fields the projecting mapper drops (source_id,
 * has_auto_summary, refresh_count, last_internal_date, archived_*, …).
 * Use this from backfill scripts that need to read those fields.
 */
export async function scrollFilteredRaw(filter, limit = 100) {
  const all = [];
  let offset = undefined;
  while (true) {
    const batch = await qdrant.scroll(COLLECTION, {
      limit,
      with_payload: true,
      filter,
      offset,
    });
    all.push(...batch.points);
    if (!batch.next_page_offset) break;
    offset = batch.next_page_offset;
  }
  return all.map((p) => ({ id: p.id, ...p.payload }));
}
