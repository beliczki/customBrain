// One-shot: backfill effective_date on all thought-points that don't have it.
// Safe to re-run (idempotent — only writes when computed date differs or is missing).
//
// Usage: node scripts/backfill-effective-date.js [--dry-run]

import dotenv from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', 'server', '.env') });

import { QdrantClient } from '@qdrant/js-client-rest';
import { computeEffectiveDate } from '../server/effective-date.js';

const qdrant = new QdrantClient({ url: process.env.QDRANT_URL || 'http://localhost:6333' });
const COLLECTION = 'thoughts';
const DRY_RUN = process.argv.includes('--dry-run');

async function fetchAll() {
  const all = [];
  let offset;
  while (true) {
    const batch = await qdrant.scroll(COLLECTION, {
      limit: 200,
      with_payload: true,
      with_vector: false,
      offset,
      // Don't filter chunks — they should also carry effective_date for
      // consistency, falling back to parent's created_at via the helper.
    });
    all.push(...batch.points);
    if (!batch.next_page_offset) break;
    offset = batch.next_page_offset;
  }
  return all;
}

async function main() {
  console.log(`=== effective_date backfill ${DRY_RUN ? '(dry run)' : ''} ===\n`);
  const points = await fetchAll();
  console.log(`Loaded ${points.length} points`);

  let toUpdate = 0;
  let unchanged = 0;
  let bySource = {};

  for (const p of points) {
    const current = p.payload.effective_date;
    const computed = computeEffectiveDate(p.payload);
    const src = p.payload.source || (p.payload.kind === 'chunk' ? 'chunk' : 'unknown');
    bySource[src] = bySource[src] || { update: 0, skip: 0 };

    if (current === computed) {
      unchanged++;
      bySource[src].skip++;
      continue;
    }
    toUpdate++;
    bySource[src].update++;
    if (!DRY_RUN) {
      await qdrant.setPayload(COLLECTION, {
        points: [p.id],
        payload: { effective_date: computed },
      });
    }
  }

  console.log(`\nBy source:`);
  for (const [src, n] of Object.entries(bySource)) {
    console.log(`  ${src.padEnd(12)} update=${n.update}  skip=${n.skip}`);
  }
  console.log(`\nTOTAL: ${toUpdate} updated, ${unchanged} unchanged ${DRY_RUN ? '(dry run — nothing written)' : ''}`);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
