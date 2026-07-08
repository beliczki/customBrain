import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env') });
import { applySettingsToEnv } from '../server/config.js';
applySettingsToEnv();

import { searchThoughts, searchThoughtsMulti } from '../server/routes/search.js';
import { quickLookup } from '../server/quick-lookup.js';

/**
 * Prove-it harness (second-brain playbook principle 5). Runs the same real
 * queries through every USER-FACING retrieval path and compares:
 *   - wall time per path
 *   - correctness vs the p8.2 gold annotations (hit@5, min_rank)
 *   - response payload bytes — the token-cost proxy for the consuming agent
 *     (what an MCP client actually pays to read the result)
 *
 * Paths compared:
 *   hybrid — search_brain simple mode (dense+BM25 RRF, chunk rollup, decay)
 *   multi  — search_brain typed mode (explicit lex+vec legs, JS RRF fusion)
 *   quick  — quick_lookup on the query as a topic/person filter (zero-model;
 *            only meaningful for metadata-shaped queries — reported for
 *            completeness, expected to lose on content queries)
 *
 * The in-session token half of the PDF's test (fresh default session vs brain
 * path, compared via /context) cannot run server-side — the harness prints
 * ready-made prompts for that manual comparison at the end.
 *
 * Read-only. Snapshot to tasks/prove-brain-<date>.json (audit-trail convention).
 *
 * Usage: node scripts/prove-brain.js [--hit-at 5] [--annotations tasks/p8.2-annotations.json]
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const HIT_AT = Number(arg('--hit-at', '5'));
const ANNOTATIONS_PATH = resolve(REPO_ROOT, arg('--annotations', 'tasks/p8.2-annotations.json'));

// Same real queries as scripts/p8-probe.js so results are comparable across
// harnesses and the gold annotations apply.
const QUERIES = [
  'Boris Cherny',
  'ERSTE Adform SZA frissítés 150e kaphatsz uj template új feed',
  'Bizi captcha hard gate egyeztetés',
  'customBrain dev next steps',
  'ERSTE Cseperedő számla status',
  'Amundi follow-up',
  'Telex adaptive AV csomag',
  'Pörköláb David Erste programmatic',
];

const annotationsByQuery = new Map();
if (existsSync(ANNOTATIONS_PATH)) {
  const data = JSON.parse(readFileSync(ANNOTATIONS_PATH, 'utf-8'));
  for (const a of data.annotations || []) {
    annotationsByQuery.set(a.query, { right_answer_ids: a.right_answer_ids || [], exclude: !!a.exclude_from_winrate });
  }
  console.log(`Loaded ${annotationsByQuery.size} annotations`);
} else {
  console.log('No annotations file — running timing/size only');
}

const idMatchesAny = (id, prefixes) => (prefixes || []).some((p) => String(id).startsWith(p));

function correctness(hits, rightIds) {
  if (!rightIds?.length) return { hit_at_k: null, min_rank: null };
  let minRank = null;
  hits.forEach((h, i) => {
    if (idMatchesAny(h.id, rightIds) && minRank === null) minRank = i + 1;
  });
  return { hit_at_k: minRank !== null && minRank <= HIT_AT, min_rank: minRank };
}

async function timed(fn) {
  const t0 = performance.now();
  const result = await fn();
  return { ms: Math.round(performance.now() - t0), result };
}

async function run() {
  const rows = [];
  for (const query of QUERIES) {
    const annot = annotationsByQuery.get(query);
    const paths = {};

    const hybrid = await timed(() => searchThoughts(query, HIT_AT));
    paths.hybrid = {
      ms: hybrid.ms,
      bytes: JSON.stringify(hybrid.result).length,
      evidence: hybrid.result.map((r) => r.evidence),
      ...correctness(hybrid.result, annot?.right_answer_ids),
    };

    const multi = await timed(() => searchThoughtsMulti(
      [{ type: 'lex', q: query }, { type: 'vec', q: query }], HIT_AT));
    paths.multi = {
      ms: multi.ms,
      bytes: JSON.stringify(multi.result).length,
      evidence: multi.result.map((r) => r.evidence),
      ...correctness(multi.result, annot?.right_answer_ids),
    };

    const quick = await timed(() => quickLookup({ topic: query, limit: HIT_AT }));
    paths.quick = {
      ms: quick.ms,
      bytes: JSON.stringify(quick.result).length,
      count: quick.result.count,
      ...correctness(quick.result.thoughts || [], annot?.right_answer_ids),
    };

    rows.push({ query, excluded: !!annot?.exclude, paths });
    console.log(`\n"${query}"`);
    for (const [name, p] of Object.entries(paths)) {
      const corr = p.hit_at_k === null ? 'no-gold' : p.hit_at_k ? `HIT@${HIT_AT} (rank ${p.min_rank})` : 'miss';
      console.log(`  ${name.padEnd(6)} ${String(p.ms).padStart(5)}ms ${String(p.bytes).padStart(7)}B  ${corr}`);
    }
  }

  const scored = rows.filter((r) => !r.excluded && r.paths.hybrid.hit_at_k !== null);
  const summary = {};
  for (const path of ['hybrid', 'multi', 'quick']) {
    const hits = scored.filter((r) => r.paths[path].hit_at_k).length;
    summary[path] = {
      [`hit@${HIT_AT}`]: `${hits}/${scored.length}`,
      avg_ms: Math.round(rows.reduce((s, r) => s + r.paths[path].ms, 0) / rows.length),
      avg_bytes: Math.round(rows.reduce((s, r) => s + r.paths[path].bytes, 0) / rows.length),
    };
  }
  console.log('\n── Summary ──');
  console.table(summary);

  const outPath = join(REPO_ROOT, 'tasks', `prove-brain-${new Date().toISOString().slice(0, 10)}.json`);
  writeFileSync(outPath, JSON.stringify({ generated_at: new Date().toISOString(), hit_at: HIT_AT, summary, rows }, null, 2));
  console.log(`Snapshot: ${outPath}`);

  console.log(`
── Manual half: in-session token test (PDF principle 5) ──
Run each prompt in (a) a FRESH default Claude session with no brain MCP, and
(b) a session with the brain connector. Compare /context tokens + wall clock:

1. "What is the current status of the ERSTE Cseperedő invoice?"
2. "Summarize my last discussion about Bizi captcha gating."
3. "How many meetings did I have about customBrain since June 1?"  (brain side: quick_lookup should answer this with ZERO model-visible search text)
4. Save-a-memory: "Remember: <any new fact>" — default session has nowhere durable; brain side = one capture_thought call.

Expected honest result: default wins on facts already in always-loaded context;
the brain wins on buried facts, multi-thought questions, and memory writes.`);
}

run().catch((err) => { console.error(err); process.exit(1); });
