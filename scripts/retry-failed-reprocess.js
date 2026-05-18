// Retry reprocess for specific thought IDs that failed in a batch.
// Has fallback: if Sonnet returns empty chunks twice, create a single
// "fő" chunk from the summary so the thought still gets v2 + chunked recall.
//
// Usage: node scripts/retry-failed-reprocess.js <id1> [<id2> ...]

import dotenv from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env') });

import crypto from 'node:crypto';
import { QdrantClient } from '@qdrant/js-client-rest';
import { getById } from '../server/qdrant.js';
import { getVaultContext } from '../server/drive-context.js';
import { reprocessThought } from '../server/reprocess-v2.js';
import { embedText } from '../server/embeddings.js';

const qdrant = new QdrantClient({ url: process.env.QDRANT_URL || 'http://localhost:6333' });
const COLLECTION = 'thoughts';

const ids = process.argv.slice(2);
if (!ids.length) {
  console.error('Usage: node scripts/retry-failed-reprocess.js <id1> [<id2> ...]');
  process.exit(1);
}

async function reprocessWithRetry(text, vaultCtx, attempt = 1) {
  const result = await reprocessThought(text, vaultCtx);
  const total = (result.summary_chunks?.length || 0) + (result.content_chunks?.length || 0);
  if (total === 0 && attempt < 2) {
    console.log(`  ⚠ no chunks on attempt ${attempt} — retrying once`);
    return reprocessWithRetry(text, vaultCtx, attempt + 1);
  }
  return { result, attempts: attempt };
}

async function processOne(id, vaultCtx) {
  console.log(`\n[${id}]`);
  const thought = await getById(id);
  if (!thought) {
    console.log(`  ✗ thought not found`);
    return false;
  }
  console.log(`  title: ${thought.title}`);
  console.log(`  source=${thought.source}  chars=${thought.text.length}`);

  let result, attempts;
  try {
    ({ result, attempts } = await reprocessWithRetry(thought.text, vaultCtx));
  } catch (err) {
    console.log(`  ✗ reprocess failed: ${err.message}`);
    return false;
  }

  let summaryChunks = result.summary_chunks || [];
  let contentChunks = result.content_chunks || [];

  // Fallback: if Sonnet refuses to chunk on a thought, synthesize a single
  // "fő" chunk from the summary so the thought still gets v2 + a chunk-vector.
  if (summaryChunks.length === 0 && contentChunks.length === 0) {
    if (!result.summary) {
      console.log(`  ✗ no summary either — cannot synthesize fallback chunk, skipping`);
      return false;
    }
    console.log(`  ⚠ synthesizing fallback chunk from summary (both chunk arrays empty)`);
    summaryChunks = [{ label: 'fő', text: result.summary }];
  }

  const [mainVector, sumVecs, conVecs] = await Promise.all([
    embedText(result.summary, 'RETRIEVAL_DOCUMENT'),
    Promise.all(summaryChunks.map((c) => embedText(c.text, 'RETRIEVAL_DOCUMENT'))),
    Promise.all(contentChunks.map((c) => embedText(c.text, 'RETRIEVAL_DOCUMENT'))),
  ]);

  const now = new Date().toISOString();
  const newText = `${result.summary}\n\n---\n\n${thought.text}`;
  const { id: _omit, ...originalPayload } = thought;
  const updatedPayload = {
    ...originalPayload,
    title: result.metadata.title,
    people: result.metadata.people,
    projects: result.metadata.projects,
    topics: result.metadata.topics,
    type: result.metadata.type,
    action_items: result.metadata.action_items,
    text: newText,
    has_v2_summary: true,
    summary_appended_at: now,
    pipeline_version: 'v2',
    chunk_count: summaryChunks.length + contentChunks.length,
  };

  await qdrant.upsert(COLLECTION, {
    points: [{ id, vector: mainVector, payload: updatedPayload }],
  });

  const chunkPoints = [
    ...summaryChunks.map((c, i) => ({
      id: crypto.randomUUID(),
      vector: sumVecs[i],
      payload: {
        kind: 'chunk', chunk_kind: 'summary', parent_id: id, chunk_index: i,
        chunk_label: c.label, chunk_text: c.text,
        pipeline_version: 'v2',
        parent_title: result.metadata.title, parent_source: thought.source,
        created_at: now,
      },
    })),
    ...contentChunks.map((c, i) => ({
      id: crypto.randomUUID(),
      vector: conVecs[i],
      payload: {
        kind: 'chunk', chunk_kind: 'content', parent_id: id, chunk_index: i,
        chunk_label: c.label, chunk_text: c.text,
        pipeline_version: 'v2',
        parent_title: result.metadata.title, parent_source: thought.source,
        created_at: now,
      },
    })),
  ];
  await qdrant.upsert(COLLECTION, { points: chunkPoints });

  const cost = (result._usage.input_tokens / 1e6) * 3 + (result._usage.output_tokens / 1e6) * 15;
  console.log(`  ✓ ${summaryChunks.length}+${contentChunks.length} chunks, attempts=${attempts}, cost=$${cost.toFixed(3)}`);
  return true;
}

async function main() {
  console.log(`Retrying ${ids.length} thought(s)...\n`);
  const vaultCtx = await getVaultContext();
  let ok = 0, fail = 0;
  for (const id of ids) {
    if (await processOne(id, vaultCtx)) ok++; else fail++;
  }
  console.log(`\n=== DONE: ${ok} succeeded, ${fail} failed ===`);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
