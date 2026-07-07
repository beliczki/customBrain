import { Router } from 'express';
import Graph from 'graphology';
import louvain from 'graphology-communities-louvain';
import { getAllWithVectors } from '../qdrant.js';

const router = Router();

// Semantic edges reuse the exact Related-thoughts tunables from the Obsidian
// export (server/routes/export.js) so the graph and the vault agree on what
// counts as "related". kNN per node, cosine floor.
const SEMANTIC_MIN_SCORE = 0.75;
const SEMANTIC_K = 3;

// Metadata tags used by more than this many active thoughts don't generate
// pairwise edges — a 40-thought project would add C(40,2)=780 clique edges
// and turn the graph into the hairball find_overconnected exists to fight.
// The tag still appears on nodes (and over-broad tags remain the hygiene
// trio's job); only its edge fan-out is suppressed.
const TAG_FANOUT_CAP = 20;

router.get('/graph', async (req, res) => {
  try {
    res.json(await buildGraph());
  } catch (err) {
    console.error('Graph error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;

/** In-memory cosine on two equal-length vectors (same as export.js). */
function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Build the full brain graph: nodes = active thoughts, three edge kinds with
 * categorical provenance (the gbrain/Graphify convergence — every edge says
 * WHY it exists):
 *   - metadata  (deterministic): shared people/projects/topics, weight = count
 *   - semantic  (statistical):   cosine kNN over dense vectors, k=3, >= 0.75
 *   - supersedes (structural):   near-duplicate archive chain, directed
 * Louvain communities are computed server-side (deterministic, randomWalk off)
 * and each cluster is labeled after its highest-degree member — no LLM call.
 */
export async function buildGraph(points = null) {
  // points param is a test seam: pass synthetic [{id, vector, payload}] to
  // exercise the edge/community logic without a live Qdrant.
  const all = points || (await getAllWithVectors());
  const active = all.filter((p) => p.payload?.status !== 'archived');
  const activeIds = new Set(active.map((p) => p.id));

  const nodes = active.map((p) => ({
    id: p.id,
    title: p.payload.title || '(untitled)',
    type: p.payload.type || 'unknown',
    source: p.payload.source || 'manual',
    people: p.payload.people || [],
    projects: p.payload.projects || [],
    topics: p.payload.topics || [],
    created_at: p.payload.created_at,
    effective_date: p.payload.effective_date,
  }));

  const edges = [];

  // --- metadata edges: reverse-index each tag, pairwise within fan-out cap ---
  const tagIndex = new Map(); // "field:tag" -> [nodeId]
  for (const p of active) {
    for (const [field, values] of [
      ['people', p.payload.people],
      ['projects', p.payload.projects],
      ['topics', p.payload.topics],
    ]) {
      for (const v of values || []) {
        const key = `${field}:${v}`;
        if (!tagIndex.has(key)) tagIndex.set(key, []);
        tagIndex.get(key).push(p.id);
      }
    }
  }
  // Merge multi-tag pairs into ONE edge carrying every shared tag, so the
  // client renders a single explainable line, not stacked duplicates.
  const metaPairs = new Map(); // "idA|idB" (sorted) -> { people:[], projects:[], topics:[] }
  for (const [key, ids] of tagIndex) {
    if (ids.length < 2 || ids.length > TAG_FANOUT_CAP) continue;
    const [field, ...rest] = key.split(':');
    const tag = rest.join(':');
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const pairKey = ids[i] < ids[j] ? `${ids[i]}|${ids[j]}` : `${ids[j]}|${ids[i]}`;
        if (!metaPairs.has(pairKey)) metaPairs.set(pairKey, { people: [], projects: [], topics: [] });
        metaPairs.get(pairKey)[field].push(tag);
      }
    }
  }
  for (const [pairKey, shared] of metaPairs) {
    const [source, target] = pairKey.split('|');
    const weight = shared.people.length + shared.projects.length + shared.topics.length;
    edges.push({ source, target, kind: 'metadata', weight, shared });
  }

  // --- semantic edges: kNN per node over dense vectors (O(N²), fine at this
  // scale — getAllWithVectors carries the same caveat for the export path) ---
  const withVec = active.filter((p) => Array.isArray(p.vector));
  const semPairs = new Set();
  for (const p of withVec) {
    const neighbors = [];
    for (const other of withVec) {
      if (other.id === p.id) continue;
      const score = cosine(p.vector, other.vector);
      if (score >= SEMANTIC_MIN_SCORE) neighbors.push({ id: other.id, score });
    }
    neighbors.sort((a, b) => b.score - a.score);
    for (const n of neighbors.slice(0, SEMANTIC_K)) {
      const pairKey = p.id < n.id ? `${p.id}|${n.id}` : `${n.id}|${p.id}`;
      if (semPairs.has(pairKey)) continue;
      semPairs.add(pairKey);
      const [source, target] = pairKey.split('|');
      edges.push({ source, target, kind: 'semantic', weight: n.score, score: n.score });
    }
  }

  // --- supersedes edges: directed new -> old. The old thought is archived,
  // so pull it in as a ghost node rather than dropping the chain. ---
  const ghostNodes = [];
  const byId = new Map(all.map((p) => [p.id, p]));
  for (const p of active) {
    const oldId = p.payload.supersedes;
    if (!oldId) continue;
    if (!activeIds.has(oldId)) {
      const old = byId.get(oldId);
      if (!old) continue; // deleted, not just archived
      if (!ghostNodes.some((g) => g.id === oldId)) {
        ghostNodes.push({
          id: old.id,
          title: old.payload.title || '(untitled)',
          type: old.payload.type || 'unknown',
          source: old.payload.source || 'manual',
          people: [], projects: [], topics: [],
          created_at: old.payload.created_at,
          archived: true,
        });
      }
    }
    edges.push({ source: p.id, target: oldId, kind: 'supersedes', weight: 1 });
  }
  nodes.push(...ghostNodes);

  // --- communities: Louvain over the combined weighted graph ---
  const g = new Graph({ type: 'undirected', multi: false });
  for (const n of nodes) g.addNode(n.id);
  for (const e of edges) {
    if (!g.hasEdge(e.source, e.target)) {
      g.addEdge(e.source, e.target, { weight: e.weight });
    } else {
      // metadata + semantic between the same pair: sum weights so Louvain
      // sees the doubly-connected pair as strongly bound.
      const existing = g.getEdgeAttribute(e.source, e.target, 'weight');
      g.setEdgeAttribute(e.source, e.target, 'weight', existing + e.weight);
    }
  }
  // randomWalk: false => deterministic communities across rebuilds, so
  // clusters don't shuffle names/colors every reload.
  const assignments = g.order > 0 ? louvain(g, { randomWalk: false, getEdgeWeight: 'weight' }) : {};

  const degreeOf = (id) => g.degree(id);
  for (const n of nodes) {
    n.community = assignments[n.id] ?? -1;
    n.degree = degreeOf(n.id);
  }

  // Cluster label = highest-degree member's title (deterministic; tie-break by
  // id for stability — Graphify's LLM-free labeling recipe).
  const byCommunity = new Map();
  for (const n of nodes) {
    if (!byCommunity.has(n.community)) byCommunity.set(n.community, []);
    byCommunity.get(n.community).push(n);
  }
  const communities = [...byCommunity.entries()].map(([id, members]) => {
    const hub = members.slice().sort((a, b) => b.degree - a.degree || String(a.id).localeCompare(String(b.id)))[0];
    return { id, label: hub.title, size: members.length };
  }).sort((a, b) => b.size - a.size);

  const orphan_count = nodes.filter((n) => n.degree === 0).length;

  return {
    nodes,
    edges,
    communities,
    stats: {
      node_count: nodes.length,
      edge_count: edges.length,
      metadata_edges: edges.filter((e) => e.kind === 'metadata').length,
      semantic_edges: edges.filter((e) => e.kind === 'semantic').length,
      supersedes_edges: edges.filter((e) => e.kind === 'supersedes').length,
      orphan_count,
      community_count: communities.length,
    },
    tunables: { SEMANTIC_MIN_SCORE, SEMANTIC_K, TAG_FANOUT_CAP },
  };
}
