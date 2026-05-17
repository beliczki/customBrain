// Calibrate the conflict-detection threshold in capture.js after Phase 1
// task_type migration. Asymmetric embeddings (RETRIEVAL_DOCUMENT for stored,
// RETRIEVAL_QUERY for queries) shift cosine ranges relative to the prior
// no-task-type default — the 0.85 hardcoded threshold was calibrated under
// the old regime and may no longer separate paraphrases from unrelated docs.
//
// Method: scroll all THOUGHT points (no chunks), for each compute the
// nearest non-self neighbor in the new doc-vs-doc space, print the
// distribution + top-20 highest-cosine pairs for user inspection. Output
// JSON has a recommended threshold + the raw data so the user can override.
//
// Usage: node scripts/calibrate-conflict-threshold.js [--top-pairs N]

import dotenv from 'dotenv';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(MODULE_DIR, '..');
dotenv.config({ path: join(REPO_ROOT, 'server', '.env') });

import { QdrantClient } from '@qdrant/js-client-rest';

const qdrant = new QdrantClient({ url: process.env.QDRANT_URL || 'http://localhost:6333' });
const COLLECTION = 'thoughts_v2';
const TOP_PAIRS_IDX = process.argv.indexOf('--top-pairs');
const TOP_PAIRS = TOP_PAIRS_IDX >= 0 ? Number(process.argv[TOP_PAIRS_IDX + 1]) : 20;
const OUT_PATH = resolve(REPO_ROOT, 'tasks', 'p8.2-threshold-calibration.json');

async function scrollThoughts() {
  const all = [];
  let offset = undefined;
  while (true) {
    const batch = await qdrant.scroll(COLLECTION, {
      limit: 200,
      with_payload: true,
      with_vector: ['dense'],
      offset,
      filter: { must_not: [{ key: 'kind', match: { value: 'chunk' } }] },
    });
    all.push(...batch.points);
    if (!batch.next_page_offset) break;
    offset = batch.next_page_offset;
  }
  return all;
}

async function nearestNonSelf(point) {
  const res = await qdrant.query(COLLECTION, {
    query: point.vector.dense,
    using: 'dense',
    limit: 3, // top-3 to give us room to skip self + skip chunks
    with_payload: true,
    filter: { must_not: [{ key: 'kind', match: { value: 'chunk' } }] },
  });
  // Skip the self-match (rank 0 should be the point itself with score ~1.0)
  const nonSelf = res.points.filter((p) => p.id !== point.id);
  return nonSelf[0] || null;
}

function histogram(scores, bucketSize = 0.05) {
  const buckets = new Map();
  for (const s of scores) {
    const bucket = Math.floor(s / bucketSize) * bucketSize;
    const key = bucket.toFixed(2);
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }
  const sorted = [...buckets.entries()].sort((a, b) => Number(a[0]) - Number(b[0]));
  return sorted.map(([bucket, count]) => ({ bucket: `≥${bucket}`, count }));
}

function suggestThreshold(scores) {
  // Heuristic: paraphrase pairs should be in the top tail. We want a threshold
  // that excludes 90% of pairs (i.e. only the top 10% trigger conflict check).
  // 10% of ~240 thoughts = 24 candidate pairs to check per capture — manageable.
  if (scores.length === 0) return null;
  const sorted = [...scores].sort((a, b) => b - a);
  const p90 = sorted[Math.floor(sorted.length * 0.10)];
  // Round down to 0.02 — gives a stable round number that still passes p90.
  return Math.floor(p90 * 50) / 50;
}

async function main() {
  console.log('=== calibrate-conflict-threshold ===');
  console.log(`Collection: ${COLLECTION}\n`);

  console.log('Scrolling all thought points...');
  const thoughts = await scrollThoughts();
  console.log(`  ${thoughts.length} thoughts\n`);

  if (thoughts.length === 0) {
    console.error('No thoughts found — nothing to calibrate against.');
    process.exit(1);
  }

  console.log('Computing nearest non-self neighbor for each (this is the conflict-check space)...');
  const pairs = [];
  const tStart = Date.now();
  for (let i = 0; i < thoughts.length; i++) {
    const t = thoughts[i];
    try {
      const neighbor = await nearestNonSelf(t);
      if (!neighbor) continue;
      pairs.push({
        source_id: t.id,
        source_title: t.payload.title || '(no title)',
        neighbor_id: neighbor.id,
        neighbor_title: neighbor.payload.title || '(no title)',
        cosine: Number(neighbor.score.toFixed(4)),
      });
    } catch (err) {
      console.warn(`  [${t.id}] failed: ${err.message}`);
    }
    if ((i + 1) % 50 === 0) {
      const elapsed = (Date.now() - tStart) / 1000;
      console.log(`  [${i + 1}/${thoughts.length}] ${(elapsed).toFixed(0)}s elapsed`);
    }
  }

  const scores = pairs.map((p) => p.cosine);
  scores.sort((a, b) => b - a);

  const stats = {
    n: scores.length,
    max: scores[0],
    p10: scores[Math.floor(scores.length * 0.10)],
    p25: scores[Math.floor(scores.length * 0.25)],
    median: scores[Math.floor(scores.length * 0.50)],
    p75: scores[Math.floor(scores.length * 0.75)],
    p90: scores[Math.floor(scores.length * 0.90)],
    min: scores[scores.length - 1],
    mean: scores.reduce((a, b) => a + b, 0) / scores.length,
  };

  const topPairs = pairs
    .sort((a, b) => b.cosine - a.cosine)
    .slice(0, TOP_PAIRS);

  const recommended = suggestThreshold(scores);

  const out = {
    collection: COLLECTION,
    run_at: new Date().toISOString(),
    note: 'Per-thought nearest non-self neighbor cosine. Distribution shows what "near-similar" looks like in the post-Phase-1 (RETRIEVAL_DOCUMENT) embedding space. Threshold above which conflict-detection triggers should be calibrated against THIS distribution, not against an arbitrary 0.85 default from the pre-task-type era.',
    stats,
    histogram: histogram(scores),
    recommended_threshold: recommended,
    recommendation_reason: `Threshold ${recommended} excludes ~90% of nearest-neighbor pairs from conflict-check (top 10% trigger). User should also eyeball top_pairs below — if pairs around the threshold look semantically unrelated, raise the threshold; if many real paraphrases sit below, lower it.`,
    top_pairs: topPairs,
  };

  writeFileSync(OUT_PATH, JSON.stringify(out, null, 2), 'utf-8');
  console.log(`\n=== DONE ===`);
  console.log(`Distribution: max=${stats.max} p90=${stats.p90} median=${stats.median} min=${stats.min}`);
  console.log(`Recommended threshold: ${recommended}`);
  console.log(`\nWrote ${OUT_PATH}`);
  console.log(`Inspect top_pairs in that file — eyeball check whether pairs around the threshold are actually paraphrases.`);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
