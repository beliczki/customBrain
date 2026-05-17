import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(MODULE_DIR, '..');
dotenv.config({ path: join(REPO_ROOT, 'server', '.env') });

const { QdrantClient } = await import('@qdrant/js-client-rest');
const { embedText } = await import('../server/embeddings.js');
const { sparseEncodeQuery } = await import('../server/sparse.js');

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
}
const K = Number(arg('--k', '60'));
const OUT_REL = arg('--out', `tasks/p8-probe-k${K}.json`);
const OUT = resolve(REPO_ROOT, OUT_REL);
const TOP = Number(arg('--top', '10'));
const OVERFETCH = TOP * 4;
const QUERY_TASK_TYPE = arg('--query-task-type', undefined); // undefined → embedText default
const HIT_AT = Number(arg('--hit-at', '5'));
const ANNOTATIONS_REL = arg('--annotations', 'tasks/p8.2-annotations.json');
const ANNOTATIONS_PATH = resolve(REPO_ROOT, ANNOTATIONS_REL);

const COLLECTION = 'thoughts_v2';
const qdrant = new QdrantClient({ url: process.env.QDRANT_URL || 'http://localhost:6333' });

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

// Load annotations (right-answer ID sets per query) — soft requirement; probe still runs without
const annotationsByQuery = new Map();
if (existsSync(ANNOTATIONS_PATH)) {
  const data = JSON.parse(readFileSync(ANNOTATIONS_PATH, 'utf-8'));
  for (const a of data.annotations || []) {
    annotationsByQuery.set(a.query, {
      right_answer_ids: a.right_answer_ids || [],
      exclude_from_winrate: !!a.exclude_from_winrate,
      note: a.note || null,
    });
  }
  console.log(`Loaded ${annotationsByQuery.size} annotations from ${ANNOTATIONS_REL}`);
} else {
  console.log(`No annotations file at ${ANNOTATIONS_REL} — running without right-answer metrics`);
}

function projectHit(p, rank) {
  return {
    rank: rank + 1,
    score: Number(p.score.toFixed(4)),
    id: p.id,
    kind: p.payload.kind || 'thought',
    title: p.payload.title || p.payload.parent_title || null,
    parent_id: p.payload.parent_id || null,
    chunk_label: p.payload.chunk_label || null,
    source: p.payload.source || p.payload.parent_source || null,
    effective_date: (p.payload.effective_date || p.payload.created_at || '').slice(0, 10),
  };
}

// Annotations store 8-char id prefixes (e.g. "65f02ce1") for readability.
// Match by prefix against full point ids (which are UUIDs).
function idMatchesAny(id, prefixes) {
  if (!prefixes || prefixes.length === 0) return false;
  return prefixes.some((p) => id.startsWith(p));
}

function rightAnswerMetrics(hits, rightAnswerIds) {
  if (!rightAnswerIds || rightAnswerIds.length === 0) return null;
  let minRank = null;
  let countInTopN = 0;
  const matchedRanks = [];
  for (const h of hits) {
    if (idMatchesAny(h.id, rightAnswerIds)) {
      if (minRank === null) minRank = h.rank;
      matchedRanks.push(h.rank);
      if (h.rank <= HIT_AT) countInTopN++;
    }
  }
  return {
    min_rank: minRank,
    hit_at_N: minRank !== null && minRank <= HIT_AT,
    matched_ranks: matchedRanks,
    count_in_topN: countInTopN,
    set_size: rightAnswerIds.length,
  };
}

function bandSpread(hits) {
  // Spread between top hit and bottom hit of the dense list — wider = better discrimination
  if (!hits || hits.length < 2) return null;
  const scores = hits.map((h) => h.score);
  const max = Math.max(...scores);
  const min = Math.min(...scores);
  return Number((max - min).toFixed(4));
}

async function runQuery(query) {
  const dense = QUERY_TASK_TYPE ? await embedText(query, QUERY_TASK_TYPE) : await embedText(query);
  const sparse = sparseEncodeQuery(query);

  const [denseRes, bm25Res, hybridRes] = await Promise.all([
    qdrant.query(COLLECTION, { query: dense, using: 'dense', limit: TOP, with_payload: true }),
    qdrant.query(COLLECTION, { query: sparse, using: 'bm25', limit: TOP, with_payload: true }),
    qdrant.query(COLLECTION, {
      prefetch: [
        { query: dense, using: 'dense', limit: OVERFETCH },
        { query: sparse, using: 'bm25', limit: OVERFETCH },
      ],
      query: { rrf: { k: K } },
      limit: TOP,
      with_payload: true,
    }),
  ]);

  const dense_hits = denseRes.points.map(projectHit);
  const bm25_hits = bm25Res.points.map(projectHit);
  const hybrid_hits = hybridRes.points.map(projectHit);

  const annot = annotationsByQuery.get(query);
  const right_answer_ids = annot?.right_answer_ids || [];

  return {
    query,
    annotation: annot
      ? {
          right_answer_ids: annot.right_answer_ids,
          exclude_from_winrate: annot.exclude_from_winrate,
          note: annot.note,
        }
      : null,
    sparse_token_count: sparse.indices.length,
    band_spread: {
      dense: bandSpread(dense_hits),
      bm25: bandSpread(bm25_hits),
      hybrid: bandSpread(hybrid_hits),
    },
    metrics: {
      dense: rightAnswerMetrics(dense_hits, right_answer_ids),
      bm25: rightAnswerMetrics(bm25_hits, right_answer_ids),
      hybrid: rightAnswerMetrics(hybrid_hits, right_answer_ids),
    },
    dense: dense_hits,
    bm25: bm25_hits,
    hybrid: hybrid_hits,
  };
}

const results = [];
for (const q of QUERIES) {
  process.stdout.write(`  query: ${q.slice(0, 60).padEnd(60)} ... `);
  const t0 = Date.now();
  try {
    const r = await runQuery(q);
    results.push(r);
    console.log(`ok (${Date.now() - t0}ms)`);
  } catch (err) {
    console.log(`FAIL: ${err.message}`);
    results.push({ query: q, error: err.message });
  }
}

// Aggregate win rate over queries that are not excluded
const evalable = results.filter((r) => r.annotation && !r.annotation.exclude_from_winrate);
const winsHybrid = evalable.filter((r) => r.metrics?.hybrid?.hit_at_N).length;
const winsDense = evalable.filter((r) => r.metrics?.dense?.hit_at_N).length;
const winsBm25 = evalable.filter((r) => r.metrics?.bm25?.hit_at_N).length;

const out = {
  k: K,
  query_task_type: QUERY_TASK_TYPE || '(default — no taskType field sent)',
  hit_at: HIT_AT,
  collection: COLLECTION,
  top_per_leg: TOP,
  hybrid_overfetch_per_leg: OVERFETCH,
  run_at: new Date().toISOString(),
  query_count: QUERIES.length,
  evaluable_count: evalable.length,
  winrate: {
    dense: `${winsDense}/${evalable.length}`,
    bm25: `${winsBm25}/${evalable.length}`,
    hybrid: `${winsHybrid}/${evalable.length}`,
  },
  queries: results,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf-8');
console.log(`\nWrote ${OUT_REL}`);
console.log(`  k=${K}, query_task_type=${QUERY_TASK_TYPE || '(default)'}, hit_at=${HIT_AT}`);
console.log(`  Winrate (right-answer in top-${HIT_AT}): dense ${winsDense}/${evalable.length}, bm25 ${winsBm25}/${evalable.length}, hybrid ${winsHybrid}/${evalable.length}`);
