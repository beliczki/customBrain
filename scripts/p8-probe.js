import { writeFileSync, mkdirSync } from 'node:fs';
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

async function runQuery(query) {
  const dense = await embedText(query);
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

  return {
    query,
    sparse_token_count: sparse.indices.length,
    dense: denseRes.points.map(projectHit),
    bm25: bm25Res.points.map(projectHit),
    hybrid: hybridRes.points.map(projectHit),
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

const out = {
  k: K,
  collection: COLLECTION,
  top_per_leg: TOP,
  hybrid_overfetch_per_leg: OVERFETCH,
  run_at: new Date().toISOString(),
  query_count: QUERIES.length,
  queries: results,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf-8');
console.log(`\nWrote ${OUT_REL} (k=${K}, ${QUERIES.length} queries)`);
