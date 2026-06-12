// One-time migration (runs hourly via crontab over ~24h): backfill the
// multi-vector treatment onto existing LONG single-vector thoughts. Each run
// reprocesses the next N (default 10) thoughts with text > CHUNK_THRESHOLD and
// no has_v2_summary, via refreshCapture (Sonnet summary + topic chunks). The
// !has_v2_summary filter makes it self-terminating: once every long thought is
// v2, runs become no-ops. Remove the crontab entry when "remaining=0".
//
//   0 * * * * cd /root/customBrain && /usr/bin/node scripts/backfill-chunks.js 10 >> /var/log/brain-backfill.log 2>&1
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env') });
import { applySettingsToEnv } from '../server/config.js';
applySettingsToEnv();

import { getById } from '../server/qdrant.js';
import { refreshCapture } from '../server/routes/capture.js';
import { QdrantClient } from '@qdrant/js-client-rest';

const q = new QdrantClient({ url: process.env.QDRANT_URL || 'http://localhost:6333' });
const COLLECTION = 'thoughts_v2';
const N = parseInt(process.argv[2], 10) || 10;

async function scrollThoughts() {
  const all = [];
  let offset;
  while (true) {
    const b = await q.scroll(COLLECTION, {
      limit: 100,
      with_payload: true,
      offset,
      filter: { must_not: [{ key: 'kind', match: { value: 'chunk' } }] },
    });
    all.push(...b.points);
    if (!b.next_page_offset) break;
    offset = b.next_page_offset;
  }
  return all;
}

const stamp = new Date().toISOString();
const pts = await scrollThoughts();
const remaining = pts
  .filter((p) => (p.payload.text || '').length > 1500 && !p.payload.has_v2_summary)
  .sort((a, b) => new Date(b.payload.effective_date || b.payload.created_at) - new Date(a.payload.effective_date || a.payload.created_at));

console.log(`[${stamp}] backfill: ${remaining.length} long single-vector thoughts remain; processing ${Math.min(N, remaining.length)}`);
if (remaining.length === 0) {
  console.log(`[${stamp}] nothing to do — backfill complete. Safe to remove the crontab entry.`);
  process.exit(0);
}

const batch = remaining.slice(0, N);
let ok = 0, fail = 0;
for (const t of batch) {
  try {
    const r = await refreshCapture(t.id, t.payload.text);
    const after = await getById(t.id);
    console.log(`  OK  chunks=${r.chunk_count ?? '-'}  ${after.source}  "${(after.title || '').slice(0, 50)}"`);
    ok++;
  } catch (e) {
    console.log(`  FAIL ${t.id} ${e.message.slice(0, 90)} | "${(t.payload.title || '').slice(0, 40)}"`);
    fail++;
  }
}
console.log(`[${stamp}] batch done: ok=${ok} fail=${fail} | remaining after this run: ~${remaining.length - ok}`);
