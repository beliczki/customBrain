// spider (0.63.0) — the third retrieval method beside `search` and `map`
// (docs/bejaras-modszerek-terv-2026-10-10.md, 2. pont). It starts from the
// question's search hits and recognised anchors, then walks the brain graph.
// Since 0.68.0 it walks six lenses in parallel waves (LENSES below): each
// wave every lens expands its own best node, and every visited node is
// expanded in all lenses, so the walk crosses between them.
//
//   score(neighbour) = score(parent) × edge weight × DECAY / √degree(parent)
//                      × recency(neighbour)            (thoughts only, 0.65.0)
//
// The √degree is the hub penalty: without it every question drains into the
// biggest dossier (ERSTE has 50+ links). recency is search's own rule
// (recencyFactor): without it the ~15 thoughts one tag edge reaches all tie,
// and which of them fit in MAX_STEPS was arbitrary — a May auto-reply got in
// while that week's working thread fell off. Dossiers, commitments and file
// bundles carry no content date and are not decayed. The graph is the one the Graph tab
// shows — buildGraph (thought↔thought) + buildOntology (dossiers, file
// bundles, commitments, cross-layer edges) — so a replay lights real edges.
// No LLM call; one embedding (the search). Not an MCP tool yet: it has to
// prove itself against `map` in the UI first.

import { buildOntology } from './routes/graph.js';
import { getCachedGraph } from './graph-cache.js';
import { phase } from './phase.js';
import { searchThoughts, recencyFactor } from './routes/search.js';
import { matchAnchors } from './brain-map.js';
import { getVaultContext } from './drive-context.js';
import { nameKey } from './names.js';
import { LAYERS } from './ontology.js';

// Hand-set starting values, like brain_map's MAX — the AUTORESEARCH knobs.
const MAX_STEPS = 36; // ~5 waves of six lenses after the starting points
const MIN_SCORE = 0.05;
const DECAY = 0.85;
const SEEDS = 10; // search hits considered as starting points
const GATE = 0.3; // a lens steps only if its candidate reaches this share of the wave's best
const SEED_VISITS = 5; // of those, visited in round 0; the rest wait in the ontology frontier
const CANDIDATES = 10; // frontier left over, shown as "would have gone here"
const EDGE_WEIGHT = {
  semantic: (e) => e.score, // cosine, ≥ SEMANTIC_MIN_SCORE in buildGraph
  metadata: (e) => Math.min(1, e.weight / 3), // shared tags
  supersedes: () => 0.3,
  ontology: (e) => ({ tag: 0.6, source: 0.8, owner: 0.8, repo: 0.5, files: 0.5, file: 0.5, doc: 0.6 })[e.rel],
};
const EDGE_LABEL = (e) => (e.kind === 'ontology' ? e.rel : e.kind);

// The lenses (0.68.0): the Graph tab's groupings as walkable graphs. Each wave
// every lens takes its own best step, so the walk sets off in several
// directions at once; a node several lenses reach scores higher (cross-check).
// `keys(n, week)` = the groups a thought belongs to in that lens.
const LENSES = [
  { key: 'ontology', label: 'ontológia' },
  { key: 'project', label: 'projekt', keys: (n) => n.projects, show: (k) => `projekt: ${k}` },
  { key: 'person', label: 'ember', keys: (n) => n.people.filter((p) => p !== 'Me'), show: (k) => `ember: ${k}` },
  { key: 'source', label: 'forrás', topical: true, keys: (n, week) => [`${n.source}|${week(n)}`], show: (k) => `${k.split('|')[0]}, ugyanazon a héten` },
  { key: 'type', label: 'típus', topical: true, keys: (n, week) => [`${n.type}|${week(n)}`], show: (k) => `${k.split('|')[0]}, ugyanazon a héten` },
  // Louvain runs on thoughts only. A file, repo doc or commitment joins the
  // cluster most of its project's thoughts are in (0.73.1) — otherwise a walk
  // that runs through repo docs left the cluster lens nothing to step from.
  { key: 'cluster', label: 'klaszter', keys: (n, week, ctx) => (n.community >= 0 ? [String(n.community)] : ctx.projectClusters(n)), show: (k) => `klaszter ${k}` },
];

/**
 * recency: false walks on edge weights alone — map's KORÁBBI uses it, since
 * its job is to see past the window that recency (rightly) favours.
 */
export async function spiderWalk(question, emit = () => {}, { recency = true } = {}) {
  const hhmm = (iso) => new Date(iso).toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Budapest' });
  const [{ graph }, ontology, hits, vault] = await Promise.all([
    phase(emit, 'graph', 'gráf', getCachedGraph(), (c) => `${c.graph.nodes.length} thought, ${c.graph.edges.length} él · építve ${hhmm(c.built_at)}`),
    phase(emit, 'ontology', 'rétegek (dossziék, vállalások, fájlok)', buildOntology(), (o) => `${o.nodes.length} csomópont`),
    phase(emit, 'search', 'keresés (kiindulópontok)', searchThoughts(question, SEEDS), (h) => `${h.length} találat`),
    phase(emit, 'vault', 'horgonynevek', getVaultContext()),
  ]);
  emit({ type: 'phase', name: 'walk', label: 'bejárás', status: 'start' });
  const walkStart = Date.now();

  const nodes = new Map();
  for (const n of [...graph.nodes, ...ontology.nodes]) if (!n.archived) nodes.set(n.id, n);

  // ── Lens graphs ──
  // ontology: the content/structure edges (semantic, supersedes, cross-layer).
  const adj = new Map([...nodes.keys()].map((id) => [id, []]));
  for (const e of [...graph.edges, ...ontology.edges]) {
    if (e.kind === 'metadata') continue; // shared tags are the project/person lenses now
    if (!adj.has(e.source) || !adj.has(e.target)) continue;
    const w = EDGE_WEIGHT[e.kind](e);
    adj.get(e.source).push({ to: e.target, w, e });
    adj.get(e.target).push({ to: e.source, w, e });
  }
  // The group lenses: membership in the same project / person / cluster, and
  // the same source or type within the same week (a whole "gmail" or "note"
  // group says nothing; the same week's thread does).
  const week = (n) => Math.floor(new Date(n.effective_date || n.created_at).getTime() / (7 * 86400000));
  const groups = Object.fromEntries(LENSES.filter((l) => l.keys).map((l) => [l.key, new Map()]));
  // project → the community most of its thoughts belong to
  const projectCluster = new Map();
  {
    const counts = new Map();
    for (const n of graph.nodes) {
      if (n.archived || n.community < 0) continue;
      for (const p of n.projects) {
        const k = `${p}\u0000${n.community}`;
        counts.set(k, (counts.get(k) || 0) + 1);
      }
    }
    const best = new Map();
    for (const [k, c] of counts) {
      const [p, comm] = k.split('\u0000');
      if (!best.has(p) || c > best.get(p)[1]) best.set(p, [comm, c]);
    }
    for (const [p, [comm]] of best) projectCluster.set(p, comm);
  }
  const ctx = { projectClusters: (n) => [...new Set(n.projects.filter((p) => projectCluster.has(p)).map((p) => projectCluster.get(p)))] };
  const keysOf = (lens, n) => {
    if (n.entity === 'dossier') { // a dossier opens its own group: the cross into project/person
      if (lens.key === 'project' && n.type === 'project dossier') return [n.title];
      if (lens.key === 'person' && n.type === 'person dossier') return [n.title];
      return [];
    }
    return lens.keys(n, week, ctx);
  };
  // 0.70.0: files, repo docs and commitments join the groups too (they carry
  // projects, a source and a type), so the project lens reaches a project's
  // repo tasks and files, not only its thoughts. Dossiers open groups instead.
  for (const n of nodes.values()) {
    if (n.entity === 'dossier' || n.entity === 'repo') continue;
    for (const lens of LENSES) {
      if (!lens.keys) continue;
      for (const k of lens.keys(n, week, ctx)) {
        if (!groups[lens.key].has(k)) groups[lens.key].set(k, []);
        groups[lens.key].get(k).push(n.id);
      }
    }
  }
  const resolveGroup = (lens, k) => groups[lens].get(k) || groups[lens].get([...groups[lens].keys()].find((g) => nameKey(g) === nameKey(k)));

  // frontier per lens: id → best { score, from, why } in that lens
  const frontier = Object.fromEntries(LENSES.map((l) => [l.key, new Map()]));
  const offer = (lens, id, score, from, why) => {
    const f = frontier[lens];
    const cur = f.get(id);
    if (!cur || score > cur.score) f.set(id, { score, from, why });
  };
  // Several lenses reaching one node is the cross-check: their scores combine
  // as independent evidence (1 − Π(1 − s)), so agreement lifts a node.
  // A lens that has not reached the node contributes 0 — not reached is a real state here.
  const lensScore = (lens, id) => { const o = frontier[lens].get(id); return o ? o.score : 0; };
  const combined = (id) => 1 - LENSES.reduce((p, l) => p * (1 - lensScore(l.key, id)), 1);
  const agreeing = (id) => LENSES.filter((l) => lensScore(l.key, id) >= MIN_SCORE).map((l) => l.label);

  const visited = new Map(); // id → step
  const trace = [];
  const now = Date.now();
  // Files and repo docs carry a real date (modified / last commit) and decay
  // like thoughts (0.73.1); exempting them made the cluster lens prefer old
  // files over that week's threads. Dossiers and commitments have no content
  // date.
  const dated = (n) => !n.entity || n.entity === 'file' || n.entity === 'repodoc' || n.entity === 'filebundle'; // a bundle dates by its newest file
  const age = (n) => (recency && dated(n) ? recencyFactor(n, now) : 1);
  const visit = (id, round, lens, score, from, why, agree = 1) => {
    for (const l of LENSES) frontier[l.key].delete(id);
    visited.set(id, trace.length + 1);
    const node = nodes.get(id);
    trace.push({ phase: 'walk', round, lens, agree, ref: { id }, from: from ? { id: from } : null, label: node.title, why: `${why} · ${score.toFixed(3)}`, score, layer: node.layer });
  };
  // Same source / type in the same week only counts on the same thread: the
  // neighbour must share a project or a person (not Me) with where it came
  // from. Measured on "confai": without this the week's gmail and meetings
  // walked straight into unrelated ERSTE campaigns.
  const sharesTopic = (a, b) => (a.projects || []).some((p) => (b.projects || []).includes(p))
    || (a.people || []).some((p) => p !== 'Me' && (b.people || []).includes(p));
  // Expand a visited node in every lens — that is how a walk crosses over.
  const expand = (id, base) => {
    const node = nodes.get(id);
    const damp = DECAY / Math.sqrt(Math.max(1, adj.get(id).length));
    for (const { to, w, e } of adj.get(id)) {
      if (!visited.has(to)) offer('ontology', to, base * w * damp * age(nodes.get(to)), id, `[ontológia] ${EDGE_LABEL(e)} ← ${node.title}`);
    }
    for (const lens of LENSES) {
      if (!lens.keys) continue;
      for (const k of keysOf(lens, node)) {
        const members = resolveGroup(lens.key, k);
        if (!members) continue;
        const w = DECAY / Math.sqrt(members.length);
        for (const m of members) {
          if (lens.topical && !sharesTopic(node, nodes.get(m))) continue;
          if (m !== id && !visited.has(m)) offer(lens.key, m, base * w * age(nodes.get(m)), id, `[${lens.label}] ${lens.show(k)} ← ${node.title}`);
        }
      }
    }
  };

  // ── Round 0: the starting points ──
  // Search hits scaled so the best is 1.0 (RRF scores only mean something as
  // an order); the top SEED_VISITS are visited, the rest wait in the ontology
  // frontier. Anchor dossiers from the question are visited at 1.0.
  const top = hits.length ? hits[0].score : 1;
  const starts = [];
  // A hit on a repo-doc section starts from that doc's file node.
  const sectionNode = new Map();
  for (const n of ontology.nodes) if (n.entity === 'repodoc') for (const sid of n.sections) sectionNode.set(sid, n.id);
  const seen = new Set();
  hits.map((h) => ({ ...h, node: nodes.has(h.id) ? h.id : sectionNode.get(h.id) }))
    .filter((h) => h.node && !seen.has(h.node) && seen.add(h.node))
    .forEach((h) => {
      // A weak_semantic hit (only the fusion lifted it) is not a starting
      // point: on "confai" a calendar note full of ERSTE/RMT tags started the
      // walk and filled the tag cloud. It waits in the frontier instead, and
      // is reached if the walk leads there.
      if (h.evidence !== 'weak_semantic' && starts.length < SEED_VISITS) starts.push([h.node, h.score / top, `keresés: ${h.evidence}`]);
      else offer('ontology', h.node, h.score / top, null, `[ontológia] keresés: ${h.evidence}`);
    });
  const anchors = matchAnchors(question, vault);
  const dossierByName = new Map(ontology.nodes.filter((n) => n.entity === 'dossier').map((n) => [nameKey(n.title), n.id]));
  for (const [bucket, label] of [['projects', 'projekt'], ['people', 'ember'], ['topics', 'téma']]) {
    for (const name of anchors[bucket]) {
      const id = dossierByName.get(nameKey(name));
      if (id && !starts.some((s0) => s0[0] === id)) starts.push([id, 1, `a kérdésben: ${label}`]);
    }
  }
  for (const [id, score, why] of starts) visit(id, 0, 'start', score, null, why);
  for (const [id, score] of starts) expand(id, score);

  // ── Waves: every lens takes its own best step, in parallel ──
  // Why a lens did or did not step, per wave — shown under an empty column.
  const diag = Object.fromEntries(LENSES.map((l) => [l.key, { stepped: 0, gated: 0, below: 0, empty: 0, capped: 0, best: 0, bestShare: 0 }]));
  let round = 0;
  while (trace.length < MAX_STEPS) {
    round += 1;
    const picks = [];
    for (const lens of LENSES) {
      let best = null;
      for (const [id, o] of frontier[lens.key]) {
        if (picks.some((p) => p.id === id)) continue;
        if (!best || o.score > best.o.score) best = { id, o };
      }
      // The threshold is on the combined score, not the lens's own: a big group
      // (an ERSTE cluster of ~150) makes every single-lens offer tiny (DECAY/√150
      // ≈ 0.07 × the parent), so the cluster lens never stepped on "ERSTE SZA".
      // With combined, a lens steps where the other views back the candidate.
      if (!best) { diag[lens.key].empty += 1; continue; }
      const c = combined(best.id);
      diag[lens.key].best = Math.max(diag[lens.key].best, c);
      if (c >= MIN_SCORE) picks.push({ id: best.id, lens: lens.key, o: best.o });
      else diag[lens.key].below += 1;
    }
    if (!picks.length) break;
    // Relevance gate: a lens steps only when its candidate holds up against
    // the wave's best. Without it the coarse lenses (same source/type that
    // week) always took a step and dragged "confai" into ERSTE campaigns,
    // which the project lens then followed — a cross-over nothing justified.
    const best = Math.max(...picks.map((p) => combined(p.id)));
    const gated = picks.filter((p) => combined(p.id) >= GATE * best);
    for (const p of picks) {
      const d = diag[p.lens];
      d.bestShare = Math.max(d.bestShare, combined(p.id) / best);
      if (!gated.includes(p)) d.gated += 1;
    }
    // When the step budget cannot take every lens, the lens that has stepped
    // least goes first — in LENSES order the cluster lens was always last and
    // lost the final wave to the budget (measured on "confai").
    gated.sort((a, b) => (diag[a.lens].stepped - diag[b.lens].stepped) || (combined(b.id) - combined(a.id)));
    const taken = [];
    for (const p of gated) {
      if (trace.length >= MAX_STEPS) { diag[p.lens].capped += 1; continue; }
      const score = combined(p.id);
      const agree = agreeing(p.id);
      visit(p.id, round, p.lens, score, p.o.from, `${p.o.why}${agree.length > 1 ? ` · ${agree.length} lencse: ${agree.join(', ')}` : ''}`, agree.length);
      taken.push([p.id, score]);
      diag[p.lens].stepped += 1;
    }
    for (const [id, score] of taken) expand(id, score);
  }

  const left = [...new Set(LENSES.flatMap((l) => [...frontier[l.key].keys()]))]
    .map((id) => [id, combined(id)])
    .sort((a, b) => b[1] - a[1])
    .slice(0, CANDIDATES)
    .map(([id, score]) => {
      const best = LENSES.map((l) => frontier[l.key].get(id)).filter(Boolean).sort((a, b) => b.score - a.score)[0];
      return [id, { score, from: best.from, why: best.why }];
    });
  for (const [id, f] of left) {
    const node = nodes.get(id);
    trace.push({
      phase: 'frontier', ref: { id }, from: f.from ? { id: f.from } : null, label: node.title,
      why: `${f.why} · ${f.score.toFixed(3)} · nem lépett ide (${trace.length >= MAX_STEPS ? `max ${MAX_STEPS} lépés` : `küszöb ${MIN_SCORE}`})`,
      score: f.score, layer: node.layer, cut: true,
    });
  }

  const walked = trace.filter((t) => t.phase === 'walk');
  // Same line shape as map's ELŐZMÉNYEK, so map can list spider's finds as-is.
  const lineOf = (n) => ({
    id: n.id, title: n.title, entity: n.entity || null,
    date: String(n.effective_date || n.created_at || '').slice(0, 10), type: n.type, source: n.source,
    // 0.69.0: what the stats panel weighs (word cloud)
    topics: n.topics, people: n.people, projects: n.projects, // every graph and ontology node carries the three arrays
    link: n.link || null, // files and repo docs open on Drive / GitHub, not in the thought modal
  });
  emit({ type: 'phase', name: 'walk', label: 'bejárás', status: 'done', ms: Date.now() - walkStart, note: `${walked.length} lépés` });
  return {
    result: {
      question,
      layers: LAYERS.map((l) => ({
        key: l.key, label: l.label,
        items: walked.filter((t) => t.layer === l.key).map((t) => ({ ...lineOf(nodes.get(t.ref.id)), step: walked.indexOf(t) + 1, score: t.score, why: t.why, lens: t.lens, round: t.round, agree: t.agree, from: t.from ? t.from.id : null })),
      })),
      lenses: LENSES.map((l) => ({ key: l.key, label: l.label, diag: diag[l.key] })),
      // Same line shape as the walked items (tags included) — the client's hover
      // matching reads `topics` on every item; a bare candidate crashed it.
      candidates: left.map(([id, f]) => ({ ...lineOf(nodes.get(id)), layer: nodes.get(id).layer, score: f.score, why: f.why })),
      stopped: walked.length >= MAX_STEPS ? 'max_steps' : 'min_score',
      params: { MAX_STEPS, MIN_SCORE, DECAY, SEEDS, SEED_VISITS, GATE, lenses: LENSES.map((l) => l.key), recency },
      rounds: Math.max(0, ...trace.filter((t) => t.phase === 'walk').map((t) => t.round)),
    },
    trace,
  };
}
