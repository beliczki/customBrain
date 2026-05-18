import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env') });

import { getFirefliesTranscripts } from '../agent/tools/fireflies.js';
import { findBySourceId } from '../server/qdrant.js';
import { captureThought } from '../server/routes/capture.js';

// Same cap as the live webhook handler — keeps embedding + Haiku within
// sensible bounds for very long meetings.
const MAX_TRANSCRIPT_CHARS = 30000;

// How far back to pull. Default: last 90 days. Override with SINCE_DATE env var
// or first arg (ISO date, e.g. "2026-02-01").
const SINCE_DATE =
  process.argv[2] ||
  process.env.SINCE_DATE ||
  new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0];

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
  console.log(`Fireflies backfill — since ${SINCE_DATE}`);

  const transcripts = await getFirefliesTranscripts(SINCE_DATE);
  console.log(`Fetched ${transcripts.length} transcripts from Fireflies`);

  let captured = 0;
  let skippedDup = 0;
  let skippedEmpty = 0;
  let failed = 0;

  for (const t of transcripts) {
    if (!t.id) {
      skippedEmpty++;
      continue;
    }
    if (!t.transcript_text || t.transcript_text.length < 100) {
      console.log(`  skip-empty: ${t.title} (${t.transcript_text?.length || 0} chars)`);
      skippedEmpty++;
      continue;
    }

    try {
      const existing = await findBySourceId('fireflies', t.id);
      if (existing) {
        skippedDup++;
        continue;
      }

      console.log(`\nCapturing: ${t.title}`);
      console.log(`  date: ${t.date}  duration: ${t.duration_minutes}min  participants: ${t.participants?.length || 0}`);
      console.log(`  transcript chars: ${t.transcript_text.length}${t.transcript_text.length > MAX_TRANSCRIPT_CHARS ? ' (will truncate)' : ''}`);

      const text = buildText(t);
      const result = await captureThought(text, {
        source: 'fireflies',
        sourceId: t.id,
      });

      if (result.duplicate) {
        skippedDup++;
      } else {
        captured++;
        console.log(`  new point id: ${result.id}`);
      }
    } catch (err) {
      failed++;
      console.error(`  failed: ${t.id} (${t.title}) — ${err.message}`);
    }
  }

  console.log(
    `\nFireflies backfill done: captured=${captured} skippedDup=${skippedDup} skippedEmpty=${skippedEmpty} failed=${failed}`,
  );
}

run().catch((err) => {
  console.error('Fireflies backfill crashed:', err.message);
  process.exit(1);
});
