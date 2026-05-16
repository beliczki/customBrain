// Reprocess prototype: re-Haiku (Sonnet 4.6) + multi-vector chunking + in-place upsert.
// Targets the N most recent thoughts. NO BACKUP — destructive in-place.
// Usage: node scripts/reprocess-v2-prototype.js [count]   (default count=20)

import dotenv from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', 'server', '.env') });

import crypto from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { QdrantClient } from '@qdrant/js-client-rest';
import { getVaultContext } from '../server/drive-context.js';
import { reprocessThought } from '../server/reprocess-v2.js';
import { embedText } from '../server/embeddings.js';

const qdrant = new QdrantClient({ url: process.env.QDRANT_URL || 'http://localhost:6333' });
const COLLECTION = 'thoughts';
const COUNT = parseInt(process.argv[2], 10) || 20;
const LOG_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'state', `reprocess-v2-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`);

async function fetchRecentThoughts() {
  // Default: skip thoughts already at pipeline_version=v2 (avoid re-Sonnet on
  // already-processed ones). Pass `--force` to include v2.
  const force = process.argv.includes('--force');
  const mustNot = [{ key: 'kind', match: { value: 'chunk' } }];
  if (!force) mustNot.push({ key: 'pipeline_version', match: { value: 'v2' } });

  const res = await qdrant.scroll(COLLECTION, {
    limit: COUNT,
    with_payload: true,
    with_vector: false,
    order_by: { key: 'created_at', direction: 'desc' },
    filter: { must_not: mustNot },
  });
  return res.points.map((p) => ({ id: p.id, ...p.payload }));
}

async function countChunksFor(parentIds) {
  const res = await qdrant.count(COLLECTION, {
    filter: {
      must: [
        { key: 'kind', match: { value: 'chunk' } },
        { key: 'parent_id', match: { any: parentIds } },
      ],
    },
    exact: true,
  });
  return res.count;
}

async function purgeOldChunks(parentIds) {
  if (!parentIds.length) return 0;
  const before = await countChunksFor(parentIds);
  if (before === 0) return 0;
  await qdrant.delete(COLLECTION, {
    filter: {
      must: [
        { key: 'kind', match: { value: 'chunk' } },
        { key: 'parent_id', match: { any: parentIds } },
      ],
    },
  });
  return before;
}

function logEntry(entry) {
  writeFileSync(LOG_PATH, JSON.stringify(entry) + '\n', { flag: 'a' });
}

async function processOne(thought, vaultCtx) {
  console.log(`\n[${thought.id}] ${thought.title || '(no title)'}`);
  console.log(`  source=${thought.source}  chars=${thought.text?.length || 0}`);

  const t0 = Date.now();
  const result = await reprocessThought(thought.text, vaultCtx);
  const sonnetMs = Date.now() - t0;
  console.log(`  Sonnet: ${sonnetMs}ms, stop=${result._stop_reason}, in=${result._usage.input_tokens} out=${result._usage.output_tokens}`);

  if (result._stop_reason === 'max_tokens') console.log(`  ⚠ MAX_TOKENS hit`);
  if (result._rejected_people?.length) console.log(`  ⚠ rejected_people: ${result._rejected_people.join(', ')}`);
  if (result._recovered_summary_chunks) console.log(`  ⚠ recovered summary_chunks from stringified JSON`);
  if (result._recovered_content_chunks) console.log(`  ⚠ recovered content_chunks from stringified JSON`);

  const summaryChunks = result.summary_chunks || [];
  const contentChunks = result.content_chunks || [];
  const totalChunks = summaryChunks.length + contentChunks.length;

  if (totalChunks === 0) {
    throw new Error(`No chunks produced for thought ${thought.id} — refusing to upsert`);
  }

  // Embed: main vector = summary embed (architectural decision in tasks/todo.md)
  const tEmbed = Date.now();
  const [mainVector, summaryChunkVectors, contentChunkVectors] = await Promise.all([
    embedText(result.summary),
    Promise.all(summaryChunks.map((c) => embedText(c.text))),
    Promise.all(contentChunks.map((c) => embedText(c.text))),
  ]);
  const embedMs = Date.now() - tEmbed;
  console.log(`  Gemini: ${embedMs}ms, embeds=${1 + summaryChunkVectors.length + contentChunkVectors.length}`);

  const now = new Date().toISOString();
  // New text in payload = summary + delimiter + original (UI sees summary first)
  const newText = `${result.summary}\n\n---\n\n${thought.text}`;

  // Build updated payload — preserve all original fields, override with new metadata
  const { id: _omitId, ...originalPayload } = thought;
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
    chunk_count: totalChunks,
  };

  await qdrant.upsert(COLLECTION, {
    points: [{ id: thought.id, vector: mainVector, payload: updatedPayload }],
  });

  const chunkPoints = [
    ...summaryChunks.map((c, i) => ({
      id: crypto.randomUUID(),
      vector: summaryChunkVectors[i],
      payload: {
        kind: 'chunk',
        chunk_kind: 'summary',
        parent_id: thought.id,
        chunk_index: i,
        chunk_label: c.label,
        chunk_text: c.text,
        pipeline_version: 'v2',
        parent_title: result.metadata.title,
        parent_source: thought.source,
        created_at: now,
      },
    })),
    ...contentChunks.map((c, i) => ({
      id: crypto.randomUUID(),
      vector: contentChunkVectors[i],
      payload: {
        kind: 'chunk',
        chunk_kind: 'content',
        parent_id: thought.id,
        chunk_index: i,
        chunk_label: c.label,
        chunk_text: c.text,
        pipeline_version: 'v2',
        parent_title: result.metadata.title,
        parent_source: thought.source,
        created_at: now,
      },
    })),
  ];

  await qdrant.upsert(COLLECTION, { points: chunkPoints });

  const inCost = (result._usage.input_tokens / 1_000_000) * 3.0;
  const outCost = (result._usage.output_tokens / 1_000_000) * 15.0;
  const cost = inCost + outCost;

  console.log(`  ✓ summary_chunks=${summaryChunks.length}, content_chunks=${contentChunks.length}, cost=$${cost.toFixed(4)}`);

  logEntry({
    id: thought.id,
    title_old: thought.title,
    title_new: result.metadata.title,
    projects_old: thought.projects,
    projects_new: result.metadata.projects,
    people_old: thought.people,
    people_new: result.metadata.people,
    rejected_people: result._rejected_people || [],
    topics_old: thought.topics,
    topics_new: result.metadata.topics,
    type_old: thought.type,
    type_new: result.metadata.type,
    text_chars_old: thought.text?.length || 0,
    summary_chars: result.summary?.length || 0,
    chunks_summary: summaryChunks.length,
    chunks_content: contentChunks.length,
    cost,
    sonnet_ms: sonnetMs,
    embed_ms: embedMs,
    stop_reason: result._stop_reason,
    timestamp: now,
  });

  return { id: thought.id, chunks: totalChunks, cost, ms: sonnetMs + embedMs };
}

async function main() {
  console.log('=== reprocess-v2 prototype ===\n');
  console.log(`Target: ${COUNT} most recent thoughts (in-place, no backup)`);
  console.log(`Log: ${LOG_PATH}\n`);

  console.log('Loading vault context...');
  const vaultCtx = await getVaultContext();
  console.log(`  projects=${vaultCtx.projects.length} (${Object.keys(vaultCtx.projectAliases).length} aliases)`);
  console.log(`  people=${vaultCtx.people.length} (${Object.keys(vaultCtx.aliases).length} aliases)`);

  console.log(`\nFetching ${COUNT} most recent thoughts...`);
  const thoughts = await fetchRecentThoughts();
  console.log(`  got ${thoughts.length}`);

  if (thoughts.length === 0) {
    console.error('No thoughts found');
    process.exit(1);
  }

  const ids = thoughts.map((t) => t.id);
  const purged = await purgeOldChunks(ids);
  if (purged > 0) console.log(`  purged ${purged} existing v2 chunks for re-run`);

  const tStart = Date.now();
  let totalCost = 0;
  let totalChunks = 0;
  let failed = 0;

  for (const [i, t] of thoughts.entries()) {
    console.log(`\n--- [${i + 1}/${thoughts.length}] ---`);
    try {
      const r = await processOne(t, vaultCtx);
      totalCost += r.cost;
      totalChunks += r.chunks;
    } catch (err) {
      console.error(`  ✗ FAILED: ${err.message}`);
      failed++;
      logEntry({ id: t.id, error: err.message, timestamp: new Date().toISOString() });
    }
  }

  const totalMin = (Date.now() - tStart) / 60000;
  console.log(`\n=== DONE in ${totalMin.toFixed(1)} min ===`);
  console.log(`Thoughts processed: ${thoughts.length - failed}/${thoughts.length}`);
  console.log(`Chunks created: ${totalChunks}`);
  console.log(`Total Sonnet cost: $${totalCost.toFixed(2)}`);
  if (failed > 0) console.log(`Failed: ${failed}`);
  console.log(`\nLog: ${LOG_PATH}`);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
