import crypto from 'node:crypto';
import { reprocessThought } from './reprocess-v2.js';
import { embedText } from './embeddings.js';
import { sparseEncodeDoc } from './sparse.js';

// Thoughts longer than this get the multi-vector treatment (Sonnet reprocess →
// summary + topic chunks, each its own dense+bm25 vector). Shorter thoughts are
// genuinely single-topic — one vector is correct, and a Sonnet call per tiny
// capture would be wasted cost/latency. Threshold mirrors reprocess-v2's own
// "< 1000 chars = trivial" shortcut with headroom.
export const CHUNK_THRESHOLD = 1500;

/**
 * Heavy compute for the multi-vector path: Sonnet reprocess (metadata + summary
 * + topic chunks) followed by embedding the summary and every chunk. Does NOT
 * touch Qdrant — returns artifacts so the caller owns payload assembly
 * (effective_date, source fields, supersedes, etc.).
 *
 * Returns:
 *   {
 *     summary, metadata,
 *     mainVector, mainSparse,           // for the parent/thought point (summary-embedded)
 *     chunkSpecs: [{ chunk_kind, chunk_index, chunk_label, chunk_text, dense, bm25 }],
 *     _usage, _stop_reason
 *   }
 */
export async function reprocessToArtifacts(text, vaultCtx) {
  const result = await reprocessThought(text, vaultCtx);
  const summaryChunks = result.summary_chunks || [];
  const contentChunks = result.content_chunks || [];
  if (summaryChunks.length + contentChunks.length === 0) {
    throw new Error('reprocess produced 0 chunks — refusing to upsert');
  }

  const [mainVector, summaryVectors, contentVectors] = await Promise.all([
    embedText(result.summary, 'RETRIEVAL_DOCUMENT'),
    Promise.all(summaryChunks.map((c) => embedText(c.text, 'RETRIEVAL_DOCUMENT'))),
    Promise.all(contentChunks.map((c) => embedText(c.text, 'RETRIEVAL_DOCUMENT'))),
  ]);

  const chunkSpecs = [
    ...summaryChunks.map((c, i) => ({
      chunk_kind: 'summary',
      chunk_index: i,
      chunk_label: c.label,
      chunk_text: c.text,
      dense: summaryVectors[i],
      bm25: sparseEncodeDoc(c.text),
    })),
    ...contentChunks.map((c, i) => ({
      chunk_kind: 'content',
      chunk_index: i,
      chunk_label: c.label,
      chunk_text: c.text,
      dense: contentVectors[i],
      bm25: sparseEncodeDoc(c.text),
    })),
  ];

  return {
    summary: result.summary,
    metadata: result.metadata,
    mainVector,
    mainSparse: sparseEncodeDoc(result.summary),
    chunkSpecs,
    _usage: result._usage,
    _stop_reason: result._stop_reason,
  };
}

/**
 * Turn chunkSpecs into Qdrant point objects ready for upsertChunks. Parent
 * fields are denormalized onto each chunk so search rollup can read them
 * without a parent fetch.
 */
export function buildChunkPoints(parentId, chunkSpecs, { parent_title, parent_source, created_at }) {
  return chunkSpecs.map((s) => ({
    id: crypto.randomUUID(),
    vector: { dense: s.dense, bm25: s.bm25 },
    payload: {
      kind: 'chunk',
      chunk_kind: s.chunk_kind,
      parent_id: parentId,
      chunk_index: s.chunk_index,
      chunk_label: s.chunk_label,
      chunk_text: s.chunk_text,
      pipeline_version: 'v2',
      parent_title,
      parent_source,
      created_at,
    },
  }));
}
