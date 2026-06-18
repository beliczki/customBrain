// Background chunking cron — the multi-vector treatment runs HERE, not at
// capture time (Sonnet is too slow to block an HTTP capture; doing it inline
// times out the nginx gateway and breaks the Chrome extension). Each run finds
// long single-vector thoughts (text > CHUNK_THRESHOLD, no has_v2_summary, no
// has_auto_summary coworker summary) and upgrades them to summary + topic chunks
// via enrichWithChunks. Idempotent and self-limiting: once a thought is chunked
// it carries has_v2_summary and is skipped. Permanent (runs every ~10 min):
//
//   */10 * * * * cd /root/customBrain && /usr/bin/node scripts/backfill-chunks.js 10 >> /var/log/brain-backfill.log 2>&1
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env') });
import { applySettingsToEnv } from '../server/config.js';
applySettingsToEnv();

import { enrichWithChunks } from '../server/routes/capture.js';
import { CHUNK_THRESHOLD } from '../server/chunking.js';
import { updatePayload } from '../server/qdrant.js';
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
const pending = pts
  .filter((p) => (p.payload.text || '').length > CHUNK_THRESHOLD && !p.payload.has_v2_summary && !p.payload.has_auto_summary && !p.payload.chunk_skipped)
  .sort((a, b) => new Date(b.payload.effective_date || b.payload.created_at) - new Date(a.payload.effective_date || a.payload.created_at));

if (pending.length === 0) {
  console.log(`[${stamp}] chunking: nothing pending.`);
  process.exit(0);
}
console.log(`[${stamp}] chunking: ${pending.length} long single-vector thoughts pending; processing ${Math.min(N, pending.length)}`);

let ok = 0, fail = 0;
for (const t of pending.slice(0, N)) {
  try {
    const r = await enrichWithChunks(t.id);
    console.log(`  OK  chunks=${r.chunk_count ?? '-'}  ${t.payload.source}  "${(t.payload.title || '').slice(0, 50)}"`);
    ok++;
  } catch (e) {
    // Deterministic model failure (Sonnet yields 0 chunks / malformed JSON for
    // this content). Mark it so we don't burn a Sonnet call retrying it every
    // run forever — it stays single-vector, still fully searchable.
    console.log(`  FAIL ${t.id} ${e.message.slice(0, 90)} | "${(t.payload.title || '').slice(0, 40)}"`);
    await updatePayload(t.id, { chunk_skipped: true, chunk_skip_reason: e.message.slice(0, 200) });
    fail++;
  }
}
console.log(`[${stamp}] chunking done: ok=${ok} fail=${fail} | pending after run: ~${pending.length - ok}`);
