// Re-fetch full transcripts for Fireflies-source thoughts that were
// captured under the old MAX_TRANSCRIPT_CHARS=30000 slice and got their
// tail truncated. Calls the Fireflies API again, rebuilds the text with
// the new 180000-char cap, and refreshCapture's the point in place
// (preserving id, source_id, created_at).
//
// After this script runs, the restored long transcripts will need
// summaries — run `/summarize-long-thoughts` (the coworker-loop skill) once
// from a Claude Code session to fill them in.
//
// Usage (run from repo root, on the Hetzner host where .env exists):
//   node scripts/backfill-fireflies-transcripts.js --dry-run
//   node scripts/backfill-fireflies-transcripts.js
//
// --dry-run lists what would be refreshed and the size delta without
// hitting the embedder, Haiku, or Qdrant write paths.
//
// Idempotent: a thought is only refreshed if the freshly-fetched
// transcript would yield a meaningfully longer text (> 1000 chars more).

import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', 'server', '.env') });

import { getFirefliesTranscriptById } from '../agent/tools/fireflies.js';
import { scrollFilteredRaw } from '../server/qdrant.js';
import { refreshCapture } from '../server/routes/capture.js';

const MAX_TRANSCRIPT_CHARS = 180000;
const TRUNCATION_HINT_THRESHOLD = 29000; // old slice was 30000; threshold catches thoughts that ran into it
const MIN_DELTA_FOR_REFRESH = 1000; // skip if new text isn't at least this much longer

const DRY_RUN = process.argv.includes('--dry-run');

function buildText(t) {
  const head = [
    `# ${t.title || 'Untitled meeting'}`,
    `${t.date || '(no date)'} · ${t.duration_minutes}min`,
    `Participants: ${(t.participants || []).join(', ')}`,
    '',
  ].join('\n');
  const body = (t.transcript_text || '').slice(0, MAX_TRANSCRIPT_CHARS);
  return `${head}\n${body}`;
}

async function run() {
  console.log(`Fireflies transcript re-fetch backfill ${DRY_RUN ? '(DRY RUN)' : ''}`);

  const all = await scrollFilteredRaw(
    { must: [{ key: 'source', match: { value: 'fireflies' } }] },
    100,
  );
  console.log(`Found ${all.length} Fireflies-source thoughts`);

  // Candidates: text length suggests truncation by the old 30k slice.
  const candidates = all.filter((t) => (t.text?.length || 0) >= TRUNCATION_HINT_THRESHOLD);
  console.log(`${candidates.length} candidates with text length >= ${TRUNCATION_HINT_THRESHOLD} (likely truncated)\n`);

  let refreshed = 0;
  let skippedNoChange = 0;
  let skippedNotFound = 0;
  let failed = 0;

  for (const c of candidates) {
    const sourceId = c.source_id;
    if (!sourceId) {
      console.log(`  skip ${c.id}: no source_id`);
      continue;
    }

    try {
      const fresh = await getFirefliesTranscriptById(sourceId);
      if (!fresh || !fresh.transcript_text) {
        console.log(`  skip ${c.id} (${c.title}): Fireflies returned no transcript`);
        skippedNotFound++;
        continue;
      }

      const newText = buildText(fresh);
      const oldLen = c.text?.length || 0;
      const newLen = newText.length;
      const delta = newLen - oldLen;

      console.log(`\n${c.id} — ${c.title}`);
      console.log(`  old length: ${oldLen}  new length: ${newLen}  delta: +${delta}`);

      if (delta < MIN_DELTA_FOR_REFRESH) {
        console.log(`  skip: delta < ${MIN_DELTA_FOR_REFRESH}, not worth a refresh`);
        skippedNoChange++;
        continue;
      }

      if (DRY_RUN) {
        console.log('  [dry-run] would refresh');
        refreshed++;
        continue;
      }

      const result = await refreshCapture(c.id, newText);
      console.log(`  refreshed (refresh_count=${result.refresh_count})`);
      refreshed++;
    } catch (err) {
      console.error(`  failed ${c.id}: ${err.message}`);
      failed++;
    }
  }

  console.log(
    `\nDone: refreshed=${refreshed} skippedNoChange=${skippedNoChange} skippedNotFound=${skippedNotFound} failed=${failed}`,
  );
}

run().catch((err) => {
  console.error('Backfill crashed:', err.message);
  process.exit(1);
});
