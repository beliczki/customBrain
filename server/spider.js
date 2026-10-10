// spider (0.63.0) — the third retrieval method beside `search` and `map`
// (docs/bejaras-modszerek-terv-2026-10-10.md, 2. pont). It starts from the
// question's search hits and recognised anchors, then walks the brain graph
// best-first: each step expands the highest-scored node not yet visited.
//
//   score(neighbour) = score(parent) × edge weight × DECAY / √degree(parent)
//
// The √degree is the hub penalty: without it every question drains into the
// biggest dossier (ERSTE has 50+ links). The graph is the one the Graph tab
// shows — buildGraph (thought↔thought) + buildOntology (dossiers, file
// bundles, commitments, cross-layer edges) — so a replay lights real edges.
// No LLM call; one embedding (the search). Not an MCP tool yet: it has to
// prove itself against `map` in the UI first.

import { buildGraph, buildOntology } from './routes/graph.js';
import { searchThoughts } from './routes/search.js';
import { matchAnchors } from './brain-map.js';
import { getVaultContext } from './drive-context.js';
import { nameKey } from './names.js';
import { LAYERS } from './ontology.js';

// Hand-set starting values, like brain_map's MAX — the AUTORESEARCH knobs.
const MAX_STEPS = 25;
const MIN_SCORE = 0.05;
const DECAY = 0.85;
const SEEDS = 10; // search hits the walk starts from
const CANDIDATES = 10; // frontier left over, shown as "would have gone here"
const EDGE_WEIGHT = {
  semantic: (e) => e.score, // cosine, ≥ SEMANTIC_MIN_SCORE in buildGraph
  metadata: (e) => Math.min(1, e.weight / 3), // shared tags
  supersedes: () => 0.3,
  ontology: (e) => ({ tag: 0.6, source: 0.8, owner: 0.8, repo: 0.5, files: 0.5 })[e.rel],
};
const EDGE_LABEL = (e) => (e.kind === 'ontology' ? e.rel : e.kind);

export async function spiderWalk(question) {
  const [graph, ontology, hits, vault] = await Promise.all([
    buildGraph(), buildOntology(), searchThoughts(question, SEEDS), getVaultContext(),
  ]);

  const nodes = new Map();
  for (const n of [...graph.nodes, ...ontology.nodes]) if (!n.archived) nodes.set(n.id, n);
  const adj = new Map([...nodes.keys()].map((id) => [id, []]));
  for (const e of [...graph.edges, ...ontology.edges]) {
    if (!adj.has(e.source) || !adj.has(e.target)) continue;
    const w = EDGE_WEIGHT[e.kind](e);
    adj.get(e.source).push({ to: e.target, w, e });
    adj.get(e.target).push({ to: e.source, w, e });
  }

  // frontier: id → best { score, from, why } offer so far
  const frontier = new Map();
  const offer = (id, score, from, why) => {
    const cur = frontier.get(id);
    if (!cur || score > cur.score) frontier.set(id, { score, from, why });
  };

  // Seeds: search hits, scaled so the best hit is 1.0 (RRF scores are tiny
  // and only their order means anything), and anchor dossiers at 1.0.
  const top = hits.length ? hits[0].score : 1;
  for (const h of hits) if (nodes.has(h.id)) offer(h.id, h.score / top, null, `keresés: ${h.evidence}`);
  const anchors = matchAnchors(question, vault);
  const dossierByName = new Map(ontology.nodes.filter((n) => n.entity === 'dossier').map((n) => [nameKey(n.title), n.id]));
  for (const [bucket, label] of [['projects', 'projekt'], ['people', 'ember'], ['topics', 'téma']]) {
    for (const name of anchors[bucket]) {
      const id = dossierByName.get(nameKey(name));
      if (id) offer(id, 1, null, `a kérdésben: ${label}`);
    }
  }

  const visited = new Map(); // id → step
  const trace = [];
  while (trace.length < MAX_STEPS && frontier.size) {
    const [id, best] = [...frontier.entries()].reduce((a, b) => (b[1].score > a[1].score ? b : a));
    if (best.score < MIN_SCORE) break;
    frontier.delete(id);
    const node = nodes.get(id);
    visited.set(id, trace.length + 1);
    trace.push({
      phase: 'walk', ref: { id }, from: best.from ? { id: best.from } : null, label: node.title,
      why: `${best.why} · ${best.score.toFixed(3)}`, score: best.score, layer: node.layer,
    });
    const damp = DECAY / Math.sqrt(Math.max(1, adj.get(id).length));
    for (const { to, w, e } of adj.get(id)) {
      if (visited.has(to)) continue;
      offer(to, best.score * w * damp, id, `${EDGE_LABEL(e)} ← ${node.title}`);
    }
  }

  const left = [...frontier.entries()].sort((a, b) => b[1].score - a[1].score).slice(0, CANDIDATES);
  for (const [id, f] of left) {
    const node = nodes.get(id);
    trace.push({
      phase: 'frontier', ref: { id }, from: f.from ? { id: f.from } : null, label: node.title,
      why: `${f.why} · ${f.score.toFixed(3)} · nem lépett ide (${trace.length >= MAX_STEPS ? `max ${MAX_STEPS} lépés` : `küszöb ${MIN_SCORE}`})`,
      score: f.score, layer: node.layer, cut: true,
    });
  }

  const walked = trace.filter((t) => t.phase === 'walk');
  return {
    result: {
      question,
      layers: LAYERS.map((l) => ({
        key: l.key, label: l.label,
        items: walked.filter((t) => t.layer === l.key).map((t) => ({ id: t.ref.id, title: t.label, step: walked.indexOf(t) + 1, score: t.score, why: t.why })),
      })),
      candidates: left.map(([id, f]) => ({ id, title: nodes.get(id).title, layer: nodes.get(id).layer, score: f.score, why: f.why })),
      stopped: walked.length >= MAX_STEPS ? 'max_steps' : 'min_score',
      params: { MAX_STEPS, MIN_SCORE, DECAY, SEEDS },
    },
    trace,
  };
}
