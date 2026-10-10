// Re-cut CONTENT chunks of existing long thoughts from their original text
// (0.46.0). Before 0.46 the model rewrote content into "2-10 chunks ≤ 2000
// chars", so long thoughts kept only a condensed fraction of their text in any
// vector. This replaces only kind:'chunk' + chunk_kind:'content' points; the
// parent's text, summary, metadata and summary chunks are untouched (they may
// carry manual curation a full reprocess would overwrite).
//
// Usage: node scripts/rechunk-content.js [--limit N] [--dry-run] [--ids id1,id2]
// Idempotent: done thoughts carry content_chunking:'sections-v1' and are skipped.
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env') });
import { applySettingsToEnv } from '../server/config.js';
applySettingsToEnv();
import { QdrantClient } from '@qdrant/js-client-rest';
import { THOUGHTS } from '../server/collections.js';
import { CHUNK_THRESHOLD, buildChunkPoints } from '../server/chunking.js';
import { markContentSections } from '../server/reprocess-v2.js';
import { embedText } from '../server/embeddings.js';
import { sparseEncodeDoc } from '../server/sparse.js';
import { upsertChunks, updatePayload } from '../server/qdrant.js';

const q = new QdrantClient({ url: process.env.QDRANT_URL || 'http://localhost:6333' });
const args = process.argv.slice(2);
const arg = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const LIMIT = parseInt(arg('--limit'), 10) || Infinity;
const DRY = args.includes('--dry-run');
const IDS = arg('--ids') ? arg('--ids').split(',') : null;
const MARK = 'sections-v1';
const SEP = '\n\n---\n\n';

async function scrollAll(filter) {
  const out = [];
  let offset;
  do {
    const b = await q.scroll(THOUGHTS, { filter, limit: 256, offset, with_payload: true, with_vector: false });
    out.push(...b.points);
    offset = b.next_page_offset;
  } while (offset != null);
  return out;
}

// v2 and coworker summaries are prepended as `<summary>\n\n---\n\n<original>`.
// Splitting at the FIRST separator is safe either way: if a summary happened to
// contain one, the cut keeps a bit of summary with the original, never less.
function originalText(p) {
  const t = p.payload.text || '';
  if ((p.payload.has_v2_summary || p.payload.has_auto_summary) && t.includes(SEP)) return t.slice(t.indexOf(SEP) + SEP.length);
  return t;
}

const parents = (await scrollAll({ must_not: [{ key: 'kind', match: { any: ['chunk', 'dossier', 'repo_doc'] } }, { key: 'status', match: { value: 'archived' } }] }))
  .filter((p) => (IDS ? IDS.includes(p.id) : true))
  .filter((p) => originalText(p).length > CHUNK_THRESHOLD && p.payload.content_chunking !== MARK);
console.log(`rechunk: ${parents.length} long thoughts to re-cut${DRY ? ' (dry run)' : ''}; limit ${LIMIT}`);

let ok = 0, fail = 0;
for (const p of parents.slice(0, LIMIT)) {
  const original = originalText(p);
  try {
    const chunks = await markContentSections(original);
    const covered = chunks.reduce((n, c) => n + c.text.length, 0);
    if (DRY) { console.log(`  DRY ${p.id.slice(0, 8)} ${original.length} chars → ${chunks.length} chunks (${covered} chars) "${(p.payload.title || '').slice(0, 50)}"`); ok++; continue; }
    const specs = await Promise.all(chunks.map(async (c, i) => ({
      chunk_kind: 'content', chunk_index: i, chunk_label: c.label, chunk_text: c.text,
      dense: await embedText(c.text, 'RETRIEVAL_DOCUMENT'), bm25: sparseEncodeDoc(c.text),
    })));
    await q.delete(THOUGHTS, { filter: { must: [
      { key: 'kind', match: { value: 'chunk' } },
      { key: 'parent_id', match: { value: p.id } },
      { key: 'chunk_kind', match: { value: 'content' } },
    ] } });
    await upsertChunks(buildChunkPoints(p.id, specs, { parent_title: p.payload.title, parent_source: p.payload.source, created_at: p.payload.created_at }));
    const summaryChunks = (await q.count(THOUGHTS, { filter: { must: [{ key: 'parent_id', match: { value: p.id } }, { key: 'chunk_kind', match: { value: 'summary' } }] }, exact: true })).count;
    await updatePayload(p.id, { content_chunking: MARK, chunk_count: summaryChunks + specs.length });
    console.log(`  OK  ${p.id.slice(0, 8)} ${original.length} chars → ${specs.length} content chunks "${(p.payload.title || '').slice(0, 50)}"`);
    ok++;
  } catch (e) {
    console.log(`  FAIL ${p.id.slice(0, 8)} ${e.message.slice(0, 160)}`);
    fail++;
  }
}
console.log(`rechunk done: ok=${ok} fail=${fail}`);
