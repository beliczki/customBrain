import { Router } from 'express';
import Graph from 'graphology';
import louvain from 'graphology-communities-louvain';
import { readFile } from 'node:fs/promises';
import { getAllWithVectors, scrollFilteredRaw, payloadFieldRows } from '../qdrant.js';
import { LAYERS, layerOf } from '../ontology.js';
import { nameKey } from '../names.js';
import { listCommitments } from '../commitments.js';
import { REPOS_STATUS_PATH } from '../repos-status.js';
import { CATALOG_PATH } from '../files-catalog.js';
import { getCachedGraph } from '../graph-cache.js';

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
    const { graph, built_at } = await getCachedGraph();
    res.json({ ...graph, built_at });
  } catch (err) {
    console.error('Graph error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Ontológia mode (0.59.0): the non-thought layers, loaded the first time the
// mode is picked so the default graph payload does not grow.
router.get('/graph/ontology', async (req, res) => {
  try {
    res.json(await buildOntology());
  } catch (err) {
    console.error('Graph ontology error:', err.message);
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
    layer: layerOf(p.payload),
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
          layer: layerOf(old.payload),
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

// A person needs this many thoughts to get a Horgony node — the same bar the
// Graph's Person grouping sets (MIN_ANCHOR_SIZE in Graph.jsx). Robi ("Me") is
// on nearly every thought, so his dossier would only add a hairball hub.
const PERSON_MIN_THOUGHTS = 3;
// Individual file nodes per project (0.70.0); the rest stay in the bundle count.
const FILES_PER_PROJECT = 10;
const SELF = 'Me';

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * The layers beyond thoughts, as extra nodes + cross-layer edges (kind
 * 'ontology', with `rel`): dossiers (Horgony; Repos → Tárgy), one file bundle
 * per project (Tárgy), commitments (Vállalás). Thought nodes already carry
 * their layer from buildGraph. Reads only what is stored — no new search.
 */
export async function buildOntology() {
  const [thoughts, dossiers, commitments, repos, catalog, repoDocs] = await Promise.all([
    scrollFilteredRaw({ must_not: [
      { key: 'kind', match: { any: ['chunk', 'dossier', 'repo_doc'] } },
      { key: 'status', match: { value: 'archived' } },
    ] }, 256),
    scrollFilteredRaw({ must: [{ key: 'kind', match: { value: 'dossier' } }] }, 256),
    listCommitments({ limit: 1000 }),
    readJson(REPOS_STATUS_PATH),
    readJson(CATALOG_PATH),
    payloadFieldRows(['repo', 'path', 'project', 'heading', 'branch', 'effective_date'], { must: [{ key: 'kind', match: { value: 'repo_doc' } }] }),
  ]);

  const nodes = [];
  const edges = [];
  const edge = (source, target, rel) => edges.push({ source, target, kind: 'ontology', rel, weight: 1 });

  // Name → dossier id per dossier type, via the dossier name and its aliases.
  const index = { person: new Map(), project: new Map(), topic: new Map() };
  const personCount = new Map();
  for (const t of thoughts) for (const p of t.people || []) personCount.set(nameKey(p), (personCount.get(nameKey(p)) || 0) + 1);

  const reposByDossier = new Map((repos ? repos.repos : []).map((r) => [r.dossier, r]));
  const repoNodes = [];
  const repoDossierBySlug = new Map();
  for (const d of dossiers) {
    if (d.dossier_type === 'person' && (d.name === SELF || (personCount.get(nameKey(d.name)) || 0) < PERSON_MIN_THOUGHTS)) continue;
    const node = {
      id: d.id, entity: 'dossier', title: d.name, layer: layerOf(d),
      type: `${d.dossier_type} dossier`, source: 'vault', created_at: d.effective_date,
      people: [], projects: [], topics: [], openable: true,
    };
    if (d.dossier_type === 'repo') {
      const r = reposByDossier.get(d.name);
      node.entity = 'repo';
      node.detail = !r ? ['repos-status.json: no entry']
        : r.error ? [r.error]
          : [`${r.repo} · ${r.version ? `v${r.version}` : 'no package.json version'}`, `last commit ${r.last_commit.date.slice(0, 10)}`, ...r.drift];
      if (r && r.project) repoNodes.push({ id: d.id, project: r.project.replace(/^["'[]+|["'\]]+$/g, '') });
      if (r && r.repo) repoDossierBySlug.set(r.repo, d.id);
    } else {
      for (const name of [d.name, ...(d.aliases || [])]) index[d.dossier_type].set(nameKey(name), d.id);
    }
    nodes.push(node);
  }

  // Thought → anchor (rel: tag). Only to anchors that made it into the graph.
  for (const t of thoughts) {
    const targets = new Set();
    for (const [field, type] of [['projects', 'project'], ['people', 'person'], ['topics', 'topic']]) {
      for (const v of t[field] || []) {
        const id = index[type].get(nameKey(v));
        if (id) targets.add(id);
      }
    }
    for (const id of targets) edge(t.id, id, 'tag');
  }

  for (const r of repoNodes) {
    const id = index.project.get(nameKey(r.project));
    if (id) edge(r.id, id, 'repo');
  }

  // One file bundle per project: 1090 single files would outnumber thoughts.
  if (catalog) {
    const bundles = new Map();
    for (const f of catalog.records) {
      for (const p of f.projects) {
        const b = bundles.get(p) || { count: 0, latest: '' };
        b.count += 1;
        if (f.modified > b.latest) b.latest = f.modified;
        bundles.set(p, b);
      }
    }
    for (const [project, b] of bundles) {
      const id = `files:${project}`;
      nodes.push({
        id, entity: 'filebundle', title: `Fájlok · ${project}`, layer: 'targy',
        type: 'file bundle', source: 'files', created_at: b.latest, count: b.count,
        people: [], projects: [project], topics: [],
        detail: [`${b.count} files`, `latest ${b.latest.slice(0, 10)}`, `find_files(project="${project}")`],
      });
      const target = index.project.get(nameKey(project));
      if (target) edge(id, target, 'files');
    }
  }

  // 0.70.0: each project's most recent files as their own nodes, beside the
  // bundle — what the bundle holds becomes reachable, not just countable.
  if (catalog) {
    const byProject = new Map();
    for (const f of catalog.records) for (const p of f.projects) {
      if (!byProject.has(p)) byProject.set(p, []);
      byProject.get(p).push(f);
    }
    for (const [project, list] of byProject) {
      for (const f of list.sort((a, b) => b.modified.localeCompare(a.modified)).slice(0, FILES_PER_PROJECT)) {
        const id = `file:${f.id}:${project}`;
        nodes.push({
          id, entity: 'file', title: f.name, layer: 'targy', type: f.kind, source: 'files',
          created_at: f.modified, people: [], projects: [project], topics: [], link: f.link,
          detail: [`${f.kind} · ${f.modified.slice(0, 10)}`, f.link],
        });
        edge(id, `files:${project}`, 'file');
      }
    }
  }

  // 0.70.0: repo documentation (server/repo-docs.js) — one node per file, its
  // heading sections listed in `sections` so a search hit on a section maps
  // onto the node. Edge to the repo's dossier.
  const docFiles = new Map();
  for (const [sid, [repo, path, project, heading, branch, date]] of repoDocs) {
    const key = `${repo}:${path}`;
    if (!docFiles.has(key)) docFiles.set(key, { repo, path, project, branch, date, headings: [], sections: [] });
    const d = docFiles.get(key);
    d.headings.push(heading);
    d.sections.push(sid);
    if (date > d.date) d.date = date;
  }
  for (const [key, d] of docFiles) {
    const id = `repodoc:${key}`;
    nodes.push({
      id, entity: 'repodoc', title: `${d.repo.split('/')[1]}/${d.path}`, layer: 'targy', type: 'repo doc', source: 'repo',
      created_at: d.date, people: [], projects: d.project ? [d.project] : [], topics: [], sections: d.sections,
      link: `https://github.com/${d.repo}/blob/${d.branch}/${d.path}`,
      detail: [`${d.sections.length} fejezet`, ...d.headings.slice(0, 5), `https://github.com/${d.repo}/blob/${d.branch}/${d.path}`],
    });
    const dossierId = repoDossierBySlug.get(d.repo);
    if (dossierId) edge(id, dossierId, 'doc');
  }

  // Commitment → its source thought(s) and its owner/counterparty/projects.
  const bySourceId = new Map(thoughts.filter((t) => t.source_id).map((t) => [`${t.source}:${t.source_id}`, t.id]));
  const thoughtIds = new Set(thoughts.map((t) => t.id));
  for (const c of commitments.commitments) {
    nodes.push({
      id: c.id, entity: 'commitment', title: c.title, layer: 'vallalas',
      type: `commitment · ${c.status}`, source: c.kind, created_at: c.created_at,
      status: c.status, people: [], projects: c.projects || [], topics: [],
      detail: [`${c.status}${c.overdue ? ' · overdue' : ''}`, `due ${c.due || '—'}`, `owner ${c.owner}`, `${c.sources[0].source}:${c.sources[0].ref}`],
    });
    const sourceThoughts = new Set();
    for (const s of c.sources) {
      const id = bySourceId.get(`${s.source}:${s.ref}`);
      if (id) sourceThoughts.add(id);
    }
    for (const r of c.candidate_refs || []) if (thoughtIds.has(r.thought_id)) sourceThoughts.add(r.thought_id);
    for (const id of sourceThoughts) edge(c.id, id, 'source');
    const anchors = new Set();
    for (const p of [c.owner, ...(c.counterparty || [])]) {
      const id = index.person.get(nameKey(p));
      if (id) anchors.add(id);
    }
    for (const p of c.projects || []) {
      const id = index.project.get(nameKey(p));
      if (id) anchors.add(id);
    }
    for (const id of anchors) edge(c.id, id, 'owner');
  }

  const degree = new Map();
  for (const e of edges) for (const id of [e.source, e.target]) degree.set(id, (degree.get(id) || 0) + 1);
  for (const n of nodes) { n.degree = degree.get(n.id) || 0; n.community = -1; }

  const byLayer = {};
  for (const n of nodes) byLayer[n.layer] = (byLayer[n.layer] || 0) + 1;
  return {
    layers: LAYERS,
    nodes,
    edges,
    stats: { node_count: nodes.length, edge_count: edges.length, by_layer: byLayer, repos_status: !!repos, files_catalog: !!catalog },
  };
}
