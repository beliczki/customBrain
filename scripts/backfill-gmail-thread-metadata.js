import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env') });

import { QdrantClient } from '@qdrant/js-client-rest';

/**
 * One-off migration: backfill `thread_id` and `last_internal_date` on all
 * existing `source=gmail` points so the 0.7.0 history-API cron can decide
 * whether a thread has new messages.
 *
 * Strategy: for each gmail point, `thread_id = source_id` (we've always
 * used the Gmail threadId as sourceId), and `last_internal_date =
 * Date.parse(created_at)` as a conservative lower bound — any message
 * arriving after the original capture will have a higher internalDate
 * and so will trigger a refresh.
 *
 * Idempotent: skips points that already have `thread_id` set.
 *
 * Usage:
 *   node scripts/backfill-gmail-thread-metadata.js         (dry run)
 *   node scripts/backfill-gmail-thread-metadata.js --apply
 */

const APPLY = process.argv.includes('--apply');
const COLLECTION = 'thoughts';

const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL || 'http://localhost:6333',
});

async function run() {
  let offset = undefined;
  let scanned = 0;
  let needsUpdate = 0;
  let updated = 0;
  const samples = [];

  while (true) {
    const batch = await qdrant.scroll(COLLECTION, {
      limit: 100,
      with_payload: true,
      filter: {
        must: [{ key: 'source', match: { value: 'gmail' } }],
      },
      offset,
    });

    for (const p of batch.points) {
      scanned++;
      const payload = p.payload || {};
      if (payload.thread_id && payload.last_internal_date) continue;

      const threadId = payload.source_id;
      if (!threadId) {
        console.warn(`  skip ${p.id}: no source_id`);
        continue;
      }
      const createdMs = payload.created_at ? Date.parse(payload.created_at) : 0;
      if (!createdMs) {
        console.warn(`  skip ${p.id}: no parseable created_at (${payload.created_at})`);
        continue;
      }

      needsUpdate++;
      if (samples.length < 5) {
        samples.push({
          id: p.id,
          title: payload.title,
          threadId,
          last_internal_date: createdMs,
        });
      }

      if (APPLY) {
        await qdrant.setPayload(COLLECTION, {
          points: [p.id],
          payload: {
            thread_id: threadId,
            last_internal_date: createdMs,
          },
        });
        updated++;
      }
    }

    if (!batch.next_page_offset) break;
    offset = batch.next_page_offset;
  }

  console.log(`\nScanned ${scanned} gmail captures.`);
  console.log(`${needsUpdate} need backfill (${scanned - needsUpdate} already have thread_id+last_internal_date).`);
  if (samples.length) {
    console.log('\nSample:');
    for (const s of samples) {
      console.log(`  ${s.id}  thread=${s.threadId}  date=${new Date(s.last_internal_date).toISOString()}  ${s.title || ''}`);
    }
  }
  if (APPLY) {
    console.log(`\nApplied: updated ${updated} points.`);
  } else {
    console.log('\nDry run. Re-run with --apply to commit.');
  }
}

run().catch((err) => {
  console.error('Backfill crashed:', err.message);
  process.exit(1);
});
