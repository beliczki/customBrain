// One-shot: backfill meeting_date on all source='fireflies' thoughts.
// Parses the meeting date OUT of the existing text payload (it's already
// embedded there by buildText). Zero Fireflies API calls.
//
// Recognized formats:
//   1. Standard:  line "2026-03-25T14:30:00.000Z · 20min"
//   2. Coworker-summary-prefixed:  "(2026-03-11, 68 perc)" inside header
//
// Usage: node scripts/backfill-fireflies-meeting-date.js [--dry-run]

import dotenv from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', 'server', '.env') });

import { QdrantClient } from '@qdrant/js-client-rest';
import { computeEffectiveDate } from '../server/effective-date.js';

const qdrant = new QdrantClient({ url: process.env.QDRANT_URL || 'http://localhost:6333' });
const COLLECTION = 'thoughts';
const DRY_RUN = process.argv.includes('--dry-run');

const ISO_RE = /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)/;
const DATE_ONLY_RE = /\((\d{4}-\d{2}-\d{2})[,)\s]/;

function parseMeetingDate(text) {
  if (!text) return null;
  const head = text.split('\n').slice(0, 10).join('\n');

  const iso = head.match(ISO_RE);
  if (iso) return new Date(iso[1]).toISOString();

  const dateOnly = head.match(DATE_ONLY_RE);
  if (dateOnly) {
    // Pure date — treat as start-of-day UTC (no time-of-day info available)
    return new Date(`${dateOnly[1]}T00:00:00.000Z`).toISOString();
  }
  return null;
}

async function fetchFirefliesThoughts() {
  const all = [];
  let offset;
  while (true) {
    const batch = await qdrant.scroll(COLLECTION, {
      limit: 200,
      with_payload: true,
      with_vector: false,
      offset,
      filter: {
        must: [{ key: 'source', match: { value: 'fireflies' } }],
        must_not: [{ key: 'kind', match: { value: 'chunk' } }],
      },
    });
    all.push(...batch.points);
    if (!batch.next_page_offset) break;
    offset = batch.next_page_offset;
  }
  return all;
}

async function main() {
  console.log(`=== Fireflies meeting_date backfill (text-parse, no API) ${DRY_RUN ? '(dry run)' : ''} ===\n`);
  const points = await fetchFirefliesThoughts();
  console.log(`Found ${points.length} fireflies thoughts\n`);

  const counts = { updated: 0, parse_failed: 0, already_set: 0 };

  for (const p of points) {
    const title = (p.payload.title || '(no title)').slice(0, 55);

    if (p.payload.meeting_date) {
      counts.already_set++;
      continue;
    }

    const meetingDate = parseMeetingDate(p.payload.text);
    if (!meetingDate) {
      counts.parse_failed++;
      console.log(`  ✗ ${title}  (no date pattern in first 10 lines)`);
      continue;
    }

    const newPayload = { ...p.payload, meeting_date: meetingDate };
    const effectiveDate = computeEffectiveDate(newPayload);

    const oldEd = (p.payload.effective_date || '').slice(0, 10);
    const newEd = effectiveDate.slice(0, 10);
    const shiftMarker = oldEd !== newEd ? ` (shifted ${oldEd} → ${newEd})` : '';

    if (!DRY_RUN) {
      await qdrant.setPayload(COLLECTION, {
        points: [p.id],
        payload: { meeting_date: meetingDate, effective_date: effectiveDate },
      });
    }
    counts.updated++;
    console.log(`  ✓ ${title}  →  meeting=${meetingDate.slice(0, 10)}${shiftMarker}`);
  }

  console.log(`\n=== SUMMARY ===`);
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
