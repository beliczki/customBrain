import { Router } from 'express';
import { embedText } from '../embeddings.js';
import { sparseEncodeDoc } from '../sparse.js';
import { extractMetadata, checkContradiction } from '../metadata.js';
import { upsertPoint, searchVector, updatePayload, findBySourceId, getById, deleteChunksByParent, upsertChunks } from '../qdrant.js';
import { getVaultContext } from '../drive-context.js';
import { computeEffectiveDate } from '../effective-date.js';
import { reprocessToArtifacts, buildChunkPoints } from '../chunking.js';

const router = Router();

router.post('/capture', async (req, res) => {
  const { text, conflict_threshold } = req.body;
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'text field required' });
  }

  try {
    const opts = conflict_threshold != null ? { conflictThreshold: conflict_threshold } : {};
    const result = await captureThought(text, opts);
    res.json(result);
  } catch (err) {
    console.error('Capture error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;

// conflictThreshold = 0.97 calibrated 2026-05-17 against the post-task-type
// RETRIEVAL_DOCUMENT cosine distribution. See tasks/p8.2-threshold-calibration.json:
// median nearest-non-self cosine in the new space is 0.899, with a long tail of
// same-topic recurring content (weekly Bizi syncs, monthly ERSTE status emails)
// that legitimately scores 0.94-0.96 without being paraphrases. 0.97 captures the
// outlier tip where actual duplicates live (true dupes scored 0.985+), keeps
// Haiku contradiction-check cost down, and accepts that paraphrases in the
// 0.92-0.96 range will pass through un-flagged. Old default 0.85 was calibrated
// for pre-task-type embeddings and would now trigger on every capture.
export async function captureThought(text, { conflictThreshold = 0.97, source = 'manual', sourceId = null, extraPayload = {} } = {}) {
  if (sourceId) {
    const existing = await findBySourceId(source, sourceId);
    if (existing) {
      return { ok: true, id: existing.id, duplicate: true, source, source_id: sourceId };
    }
  }

  const vaultCtx = await getVaultContext();

  // Capture is always a FAST single-vector write (embedding + Haiku metadata).
  // Multi-vector chunking (Sonnet summary + topic chunks) is too slow to run
  // synchronously here — a long article would block the HTTP response past the
  // nginx 60s gateway timeout and break the Chrome extension. Chunking is done
  // asynchronously by cron/backfill-chunks.js (enrichWithChunks), which upgrades
  // long single-vector thoughts to multi-vector within minutes.
  const [vector, metadata] = await Promise.all([
    embedText(text, 'RETRIEVAL_DOCUMENT'),
    extractMetadata(text, vaultCtx),
  ]);
  const sparseVector = sparseEncodeDoc(text);

  // Check near-duplicates for contradictions (top 3, not just top 1).
  // Note: the new-thought vector is RETRIEVAL_DOCUMENT and stored vectors are
  // also RETRIEVAL_DOCUMENT → doc-vs-doc cosine, exactly what asymmetric
  // retrieval was tuned for. Threshold (default 0.85) was calibrated empirically
  // post-task-type migration; see scripts/calibrate-conflict-threshold.js +
  // tasks/p8.2-threshold-calibration.json.
  // Over-fetch and exclude chunks — only THOUGHT-points can be archived /
  // superseded; a chunk archive is meaningless.
  let supersedes = null;
  const nearMatches = (await searchVector(vector, 10)).filter((m) => m.kind !== 'chunk').slice(0, 3);
  const candidates = nearMatches.filter((m) => m.score > conflictThreshold);
  console.log(`Conflict check: ${candidates.length} candidates above ${conflictThreshold} (scores: ${nearMatches.map((m) => m.score.toFixed(3)).join(', ')})`);
  for (const existing of candidates) {
    try {
      const check = await checkContradiction(text, existing.text);
      console.log(`vs "${existing.title}": ${JSON.stringify(check)}`);
      if (check.contradicts) {
        await updatePayload(existing.id, {
          status: 'archived',
          archived_at: new Date().toISOString(),
          archived_reason: check.reason,
        });
        supersedes = existing.id;
        console.log(`Archived thought ${existing.id} (${existing.title}): ${check.reason}`);
        break; // archive one at a time
      }
    } catch (err) {
      console.error(`Conflict check failed for ${existing.id}: ${err.message}`);
    }
  }

  const payload = {
    text,
    title: metadata.title || '',
    people: metadata.people || [],
    topics: metadata.topics || [],
    projects: metadata.projects || [],
    type: metadata.type || 'note',
    action_items: metadata.action_items || [],
    status: 'active',
    source,
    source_id: sourceId,
    created_at: new Date().toISOString(),
    ...(supersedes && { supersedes }),
    ...extraPayload,
  };
  // effective_date = when the CONTENT happened (email date, meeting date),
  // not when the brain captured it. Used by search time-decay and Recent
  // ordering. Computed AFTER extraPayload spread so source-specific fields
  // (last_internal_date, meeting_date, published_at) are visible.
  payload.effective_date = computeEffectiveDate(payload);

  const id = await upsertPoint(vector, sparseVector, payload);
  return { ok: true, id, metadata, ...(supersedes && { supersedes, archived: supersedes }) };
}

/**
 * Background chunk enrichment — upgrades an existing single-vector thought to
 * multi-vector (summary point + topic chunks). Called by the chunking cron, NOT
 * at capture time: reprocessToArtifacts runs Sonnet, which is too slow to block
 * an HTTP capture. Reads the thought's current (raw) text, so it must run before
 * the thought is itself summary-wrapped (the cron only targets thoughts without
 * has_v2_summary / has_auto_summary). Throws on model error / 0 chunks; the cron
 * logs and moves on, leaving the thought single-vector.
 */
export async function enrichWithChunks(id) {
  const existing = await getById(id);
  if (!existing) return { ok: false, reason: 'not found' };
  const original = existing.text || '';

  const vaultCtx = await getVaultContext();
  const art = await reprocessToArtifacts(original, vaultCtx);

  const now = new Date().toISOString();
  const { id: _omitId, ...prev } = existing;
  const payload = {
    ...prev,
    text: `${art.summary}\n\n---\n\n${original}`,
    title: art.metadata.title || existing.title || '',
    people: art.metadata.people || [],
    projects: art.metadata.projects || [],
    topics: art.metadata.topics || [],
    type: art.metadata.type || existing.type || 'note',
    action_items: art.metadata.action_items || [],
    has_v2_summary: true,
    pipeline_version: 'v2',
    chunk_count: art.chunkSpecs.length,
    summary_appended_at: now,
  };
  payload.effective_date = computeEffectiveDate(payload);

  await upsertPoint(art.mainVector, art.mainSparse, payload, id);
  await deleteChunksByParent(id);
  await upsertChunks(
    buildChunkPoints(id, art.chunkSpecs, {
      parent_title: payload.title,
      parent_source: payload.source,
      created_at: payload.created_at,
    })
  );
  return { ok: true, id, chunk_count: art.chunkSpecs.length };
}

/**
 * Atomic in-place refresh of an existing thought. Used by the Gmail intake
 * cron when a thread-labeled capture gains new messages, and by
 * update_thought_text_with_summary to wrap a thought with a coworker-
 * generated summary. We keep the same Qdrant point id (preserves source_id
 * dedup and any references), but replace text + vector + metadata.
 *
 * Preserves: id, source, source_id, created_at. Sets: updated_at,
 * refresh_count (incremented). Re-extracts all Haiku metadata fields from
 * the new text — manual curation via P10 tools can be lost on refresh.
 *
 * Note: the stale-summary detection (has_auto_summary set + summary_appended_at
 * < updated_at) is intentional. Refresh bumps updated_at, so any thought with
 * a summary becomes "stale" until the coworker loop re-summarizes it. We do
 * NOT strip the existing summary from the text on refresh — leaving it in
 * place avoids burning a subscription call on every Gmail thread refresh.
 */
// Like captureThought, this is a FAST single-vector write. Multi-vector
// chunking is handled asynchronously by the chunking cron, not here. The text
// changed, so existing chunks are purged; the cron re-chunks if the new text is
// long (the new payload carries no has_v2_summary, so it's re-eligible).
export async function refreshCapture(id, newText, { extraPayload = {} } = {}) {
  const existing = await getById(id);
  if (!existing) throw new Error(`Thought ${id} not found`);

  const vaultCtx = await getVaultContext();
  const [vector, metadata] = await Promise.all([
    embedText(newText, 'RETRIEVAL_DOCUMENT'),
    extractMetadata(newText, vaultCtx),
  ]);
  const sparseVector = sparseEncodeDoc(newText);

  const payload = {
    text: newText,
    title: metadata.title || '',
    people: metadata.people || [],
    topics: metadata.topics || [],
    projects: metadata.projects || [],
    type: metadata.type || 'note',
    action_items: metadata.action_items || [],
    status: existing.status || 'active',
    source: existing.source,
    source_id: existing.source_id,
    created_at: existing.created_at,
    updated_at: new Date().toISOString(),
    refresh_count: (existing.refresh_count || 0) + 1,
    ...extraPayload,
  };
  payload.effective_date = computeEffectiveDate(payload);

  await upsertPoint(vector, sparseVector, payload, id);
  await deleteChunksByParent(id); // stale chunks; cron re-chunks if long
  return { ok: true, id, refreshed: true, refresh_count: payload.refresh_count };
}
