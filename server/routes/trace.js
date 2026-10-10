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
//
// ?stream=1 (0.64.0): NDJSON instead — {type:'phase'} lines as each stage
// starts and ends (with its time), then one {type:'result'} line, or
// {type:'error'}. The Search tab uses it to say what is happening meanwhile.
router.get('/trace', async (req, res) => {
  const { method, q, stream } = req.query;
  if (!q) return res.status(400).json({ error: 'q is required' });
  if (!METHODS.includes(method)) return res.status(400).json({ error: `method must be one of ${METHODS.join(', ')}` });
  if (stream === '1') {
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no'); // nginx must pass lines through as written
    const send = (obj) => res.write(JSON.stringify(obj) + '\n');
    try {
      const out = await buildTrace(method, q, send);
      send(out.error ? { type: 'error', error: out.error } : { type: 'result', ...out });
    } catch (err) {
      console.error('Trace error:', err.message);
      send({ type: 'error', error: err.message });
    }
    return res.end();
  }
  try {
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

/**
 * Time one stage and report it: {type:'phase', name, label, status:'start'}
 * then {..., status:'done', ms, note}. `note(value)` describes the outcome.
 */
export function phase(emit, name, label, promise, note = () => null) {
  emit({ type: 'phase', name, label, status: 'start' });
  const t = Date.now();
  return promise.then((value) => {
    emit({ type: 'phase', name, label, status: 'done', ms: Date.now() - t, note: note(value) });
    return value;
  });
}

export async function buildTrace(method, q, emit = () => {}) {
  let result;
  let steps;
  if (method === 'search') {
    result = await phase(emit, 'search', 'keresés', searchThoughts(q, SEARCH_LIMIT), (r) => `${r.length} találat`);
    steps = result.map((h) => ({ phase: 'search', ref: { id: h.id }, label: h.title, why: `${h.evidence} · ${h.score.toFixed(3)}` }));
  } else if (method === 'spider') {
    ({ result, trace: steps } = await spiderWalk(q, emit));
  } else {
    const { trace, ...pkg } = await phase(emit, 'map', 'csomag összeállítása', buildBrainMap({ question: q, withTrace: true }), (m) => (m.trace ? `${m.trace.length} lépés` : null));
    if (pkg.error) return { error: pkg.error };
    result = pkg;
    steps = trace;
  }
  // Only name refs (map's dossiers, repos, file bundles) need the ontology
  // index; search and spider already speak node ids. Skipping it also keeps
  // spider from firing a Qdrant scroll straight after buildGraph's blocking
  // cosine pass, which lands on a keep-alive socket Qdrant has already closed.
  const byName = steps.some((st) => [st.ref, st.from].some((r) => r && !r.id));
  const resolve = byName ? await phase(emit, 'resolve', 'nevek → gráf-csomópontok', resolver()) : (ref) => (ref ? ref.id : null);
  return {
    method,
    q,
    result,
    trace: steps.map(({ ref, from, ...s }, i) => ({
      step: i + 1, ...s, cut: !!s.cut, node_id: resolve(ref), from_id: resolve(from || null),
    })),
  };
}
