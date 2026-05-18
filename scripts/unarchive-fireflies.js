import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env') });

import { scrollFiltered, updatePayload } from '../server/qdrant.js';

// One-off: the 2026-04-19 Fireflies backfill triggered the conflict
// detection's false-positive mode on recurring meetings (weekly syncs,
// biweekly statuses). The checkContradiction prompt conflated "different
// content about the same recurring topic" with "logical contradiction".
// The prompt has been tightened, but the existing archived rows need
// to be restored to active.
//
// Safe scope: only source='fireflies' + status='archived'. Different
// meeting instances are never a true logical contradiction; at most
// they are related records of distinct events.

async function run() {
  const archived = await scrollFiltered(
    {
      must: [
        { key: 'source', match: { value: 'fireflies' } },
        { key: 'status', match: { value: 'archived' } },
      ],
    },
    100,
  );

  console.log(`Found ${archived.length} archived Fireflies captures`);

  let restored = 0;
  let failed = 0;

  for (const p of archived) {
    try {
      await updatePayload(p.id, {
        status: 'active',
        archived_at: null,
        archived_reason: null,
      });
      console.log(`  restored: ${p.id} (${p.title})`);
      restored++;
    } catch (err) {
      failed++;
      console.error(`  failed: ${p.id} — ${err.message}`);
    }
  }

  console.log(`\nDone: restored=${restored} failed=${failed}`);
}

run().catch((err) => {
  console.error('Unarchive crashed:', err.message);
  process.exit(1);
});
