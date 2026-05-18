// Dry-run test for reprocessThought. NO MUTATION.
// Usage: node scripts/test-reprocess-v2.js <thought_id>

import dotenv from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env') });

import { getById } from '../server/qdrant.js';
import { getVaultContext } from '../server/drive-context.js';
import { reprocessThought } from '../server/reprocess-v2.js';

const id = process.argv[2];
if (!id) {
  console.error('Usage: node scripts/test-reprocess-v2.js <thought_id>');
  process.exit(1);
}

console.log(`\n=== Fetching thought ${id} ===`);
const thought = await getById(id);
if (!thought) {
  console.error(`Thought ${id} not found`);
  process.exit(1);
}
console.log(`Title: ${thought.title}`);
console.log(`Source: ${thought.source}`);
console.log(`Text length: ${thought.text.length} chars`);
console.log(`Current projects: ${JSON.stringify(thought.projects)}`);
console.log(`Current people: ${JSON.stringify(thought.people)}`);
console.log(`Current topics: ${JSON.stringify(thought.topics)}`);

console.log(`\n=== Loading vault context ===`);
const vaultCtx = await getVaultContext();
console.log(`Projects in vault: ${vaultCtx.projects?.length || 0}`);
console.log(`Project aliases: ${Object.keys(vaultCtx.projectAliases || {}).length}`);
console.log(`People in vault: ${vaultCtx.people?.length || 0}`);
console.log(`People aliases: ${Object.keys(vaultCtx.aliases || {}).length}`);

console.log(`\n=== Calling Haiku reprocessThought ===`);
const t0 = Date.now();
const result = await reprocessThought(thought.text, vaultCtx);
const ms = Date.now() - t0;
console.log(`Done in ${ms}ms`);
console.log(`stop_reason: ${result._stop_reason}`);
console.log(`Usage: input=${result._usage?.input_tokens}, output=${result._usage?.output_tokens}`);
// Sonnet 4.6 pricing
const inCost = (result._usage?.input_tokens || 0) / 1_000_000 * 3.0;
const outCost = (result._usage?.output_tokens || 0) / 1_000_000 * 15.0;
console.log(`Cost: ~$${(inCost + outCost).toFixed(4)}`);

console.log(`\n=== METADATA (new vs old) ===`);
console.log(`title:    OLD="${thought.title}"`);
console.log(`          NEW="${result.metadata?.title}"`);
console.log(`projects: OLD=${JSON.stringify(thought.projects)}`);
console.log(`          NEW=${JSON.stringify(result.metadata?.projects)}`);
console.log(`people:   OLD=${JSON.stringify(thought.people)}`);
console.log(`          NEW=${JSON.stringify(result.metadata?.people)}`);
if (result._rejected_people?.length) {
  console.log(`          REJECTED (hallucinated): ${JSON.stringify(result._rejected_people)}`);
}
console.log(`topics:   OLD=${JSON.stringify(thought.topics)}`);
console.log(`          NEW=${JSON.stringify(result.metadata?.topics)}`);
console.log(`type:     OLD=${thought.type}  NEW=${result.metadata?.type}`);
console.log(`actions:  NEW=${JSON.stringify(result.metadata?.action_items)}`);

console.log(`\n=== SUMMARY (${result.summary?.length || 0} chars) ===`);
console.log(result.summary);

console.log(`\n=== TYPEOF SUMMARY_CHUNKS: ${typeof result.summary_chunks} ===`);
console.log(`isArray: ${Array.isArray(result.summary_chunks)}`);
if (typeof result.summary_chunks === 'string') {
  console.log('--- raw string content (first 500) ---');
  console.log(result.summary_chunks.slice(0, 500));
} else {
  console.log(`length: ${result.summary_chunks?.length}`);
  console.log(JSON.stringify(result.summary_chunks, null, 2).slice(0, 2000));
}

console.log(`\n=== TYPEOF CONTENT_CHUNKS: ${typeof result.content_chunks} ===`);
console.log(`isArray: ${Array.isArray(result.content_chunks)}`);
if (typeof result.content_chunks === 'string') {
  console.log('--- raw string content (first 500) ---');
  console.log(result.content_chunks.slice(0, 500));
} else {
  console.log(`length: ${result.content_chunks?.length}`);
  console.log(JSON.stringify(result.content_chunks, null, 2).slice(0, 2000));
}

console.log(`\n=== DONE — no mutations made ===`);
