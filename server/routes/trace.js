import { Router } from 'express';
import { buildBrainMap } from '../brain-map.js';
import { searchThoughts } from './search.js';
import { buildOntology } from './graph.js';
import { nameKey } from '../names.js';
import { spiderWalk } from '../spider.js';

const router = Router();

// Traversal replay (0.61.0, docs/bejaras-modszerek-terv-2026-10-10.md): one
// question, one method, and the steps that method took — replayed on the
// Graph's Ontológia view. `result` is exactly what the method returns today;
// the trace only explains it.
router.get('/trace', async (req, res) => {
  try {
    const { method, q } = req.query;
    if (!q) return res.status(400).json({ error: 'q is required' });
    if (!METHODS.includes(method)) return res.status(400).json({ error: `method must be one of ${METHODS.join(', ')}` });
    const out = await buildTrace(method, q);
    if (out.error) return res.status(400).json(out);
    res.json(out);
  } catch (err) {
    console.error('Trace error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;

const METHODS = ['search', 'map', 'spider'];

// The MCP `search` default (searchThoughts' own), so the replay shows what an
// agent calling without `limit` gets.
const SEARCH_LIMIT = 5;

/**
 * Resolve a method's name refs to graph node ids. Dossiers are matched by
 * name (nameKey, the same contract the ontology index uses); repos by their
 * dossier name; file bundles by project. A ref with no node on the graph —
 * a person under the 3-thought bar, a calendar event — keeps node_id null and
 * shows in the step list only.
 */
async function resolver() {
  const { nodes } = await buildOntology();
  const dossiers = new Map();
  const repos = new Map();
  const ids = new Set();
  for (const n of nodes) {
    ids.add(n.id);
    if (n.entity === 'dossier') dossiers.set(nameKey(n.title), n.id);
    if (n.entity === 'repo') repos.set(n.title, n.id);
  }
  return (ref) => {
    if (!ref) return null;
    if (ref.id) return ref.id;
    if (ref.dossier) return dossiers.get(nameKey(ref.dossier)) || null;
    if (ref.repo) return repos.get(ref.repo) || null;
    if (ref.files) return ids.has(`files:${ref.files}`) ? `files:${ref.files}` : null;
    throw new Error(`Unknown trace ref: ${JSON.stringify(ref)}`);
  };
}

export async function buildTrace(method, q) {
  let result;
  let steps;
  if (method === 'search') {
    result = await searchThoughts(q, SEARCH_LIMIT);
    steps = result.map((h) => ({ phase: 'search', ref: { id: h.id }, label: h.title, why: `${h.evidence} · ${h.score.toFixed(3)}` }));
  } else if (method === 'spider') {
    ({ result, trace: steps } = await spiderWalk(q));
  } else {
    const { trace, ...pkg } = await buildBrainMap({ question: q, withTrace: true });
    if (pkg.error) return { error: pkg.error };
    result = pkg;
    steps = trace;
  }
  const resolve = await resolver();
  return {
    method,
    q,
    result,
    trace: steps.map(({ ref, from, ...s }, i) => ({
      step: i + 1, ...s, cut: !!s.cut, node_id: resolve(ref), from_id: resolve(from || null),
    })),
  };
}
