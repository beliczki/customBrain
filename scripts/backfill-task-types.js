// Phase 1 backfill: re-embed every point in thoughts_v2 with task_type=RETRIEVAL_DOCUMENT
// and mark it with payload.embed_task_type so subsequent runs skip migrated points.
//
// Idempotent: safe to re-run, only re-embeds points missing the marker.
// Preserves existing sparse `bm25` vector (no re-tokenize) — only dense gets recomputed.
//
// Usage: node scripts/backfill-task-types.js [--force] [--limit N]
//   --force   re-embed every point even if already marked
//   --limit N stop after N points (smoke test)

import dotenv from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env') });

import { QdrantClient } from '@qdrant/js-client-rest';
import { embedText } from '../server/embeddings.js';

const qdrant = new QdrantClient({ url: process.env.QDRANT_URL || 'http://localhost:6333' });
const COLLECTION = 'thoughts_v2';
const TASK_TYPE = 'RETRIEVAL_DOCUMENT';
const CONCURRENCY = 8;
const FORCE = process.argv.includes('--force');
const LIMIT_IDX = process.argv.indexOf('--limit');
const LIMIT = LIMIT_IDX >= 0 ? Number(process.argv[LIMIT_IDX + 1]) : Infinity;

async function scrollAll() {
  const all = [];
  let offset = undefined;
  while (true) {
    const batch = await qdrant.scroll(COLLECTION, {
      limit: 200,
      with_payload: true,
      with_vector: ['bm25'], // preserve sparse; we recompute dense
      offset,
    });
    all.push(...batch.points);
    if (!batch.next_page_offset) break;
    offset = batch.next_page_offset;
  }
  return all;
}

function getEmbedSource(point) {
  // For chunks the embedded text is `chunk_text`; for thought-points it's
  // either the v2 summary (post-reprocess) or the raw text. Mirror what
  // reprocess-v2-prototype.js and capture.js write so the new dense vector
  // represents the same semantic content as the original embed.
  if (point.payload.kind === 'chunk') {
    return point.payload.chunk_text || point.payload.text || '';
  }
  // For thoughts: if it went through v2, the text starts with the summary
  // followed by a `---` delimiter then the original. The MAIN vector was
  // embedded from the summary alone (see reprocess-v2-prototype.js:99).
  // For pre-v2 thoughts, the whole text is what was embedded originally.
  const text = point.payload.text || '';
  if (point.payload.has_v2_summary && text.includes('\n\n---\n\n')) {
    return text.split('\n\n---\n\n')[0];
  }
  return text;
}

async function reembedOne(point) {
  const source = getEmbedSource(point);
  if (!source || source.length === 0) {
    console.warn(`  [${point.id}] empty source text — skipping`);
    return { skipped: true };
  }
  const newDense = await embedText(source, TASK_TYPE);
  const bm25Vector = point.vector?.bm25;
  if (!bm25Vector) {
    throw new Error(`Point ${point.id} missing bm25 vector — cannot preserve it`);
  }
  await qdrant.upsert(COLLECTION, {
    points: [{
      id: point.id,
      vector: { dense: newDense, bm25: bm25Vector },
      payload: { ...point.payload, embed_task_type: TASK_TYPE },
    }],
  });
  return { ok: true };
}

async function runWithConcurrency(items, limit, fn) {
  let i = 0;
  const results = [];
  async function worker() {
    while (i < items.length) {
      const myIdx = i++;
      try {
        const r = await fn(items[myIdx]);
        results[myIdx] = r;
      } catch (err) {
        results[myIdx] = { error: err.message };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function main() {
  console.log(`=== backfill-task-types → ${TASK_TYPE} ===`);
  console.log(`Collection: ${COLLECTION}`);
  console.log(`Force: ${FORCE}, Limit: ${LIMIT === Infinity ? 'all' : LIMIT}`);
  console.log(`Concurrency: ${CONCURRENCY}\n`);

  console.log('Scrolling collection...');
  const all = await scrollAll();
  console.log(`  total points: ${all.length}`);

  const toProcess = (FORCE
    ? all
    : all.filter((p) => p.payload.embed_task_type !== TASK_TYPE)
  ).slice(0, LIMIT === Infinity ? all.length : LIMIT);

  console.log(`  to re-embed: ${toProcess.length} (${all.length - toProcess.length} already marked / skipped)\n`);

  if (toProcess.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  const tStart = Date.now();
  let done = 0;
  let failed = 0;
  let skipped = 0;

  const PROGRESS_EVERY = 25;
  const results = await runWithConcurrency(toProcess, CONCURRENCY, async (point) => {
    const r = await reembedOne(point);
    done++;
    if (r.error) failed++;
    else if (r.skipped) skipped++;
    if (done % PROGRESS_EVERY === 0) {
      const elapsed = (Date.now() - tStart) / 1000;
      const rate = done / elapsed;
      const eta = ((toProcess.length - done) / rate).toFixed(0);
      console.log(`  [${done}/${toProcess.length}] ${rate.toFixed(1)} pts/s, ETA ${eta}s, failed=${failed}, skipped=${skipped}`);
    }
    return r;
  });

  const elapsed = (Date.now() - tStart) / 1000;
  console.log(`\n=== DONE in ${elapsed.toFixed(1)}s ===`);
  console.log(`  Processed: ${results.length - failed - skipped}`);
  console.log(`  Failed:    ${failed}`);
  console.log(`  Skipped:   ${skipped}`);

  if (failed > 0) {
    console.log('\nFailures:');
    results.forEach((r, i) => {
      if (r?.error) console.log(`  [${toProcess[i].id}] ${r.error}`);
    });
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
