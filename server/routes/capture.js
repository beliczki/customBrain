import { Router } from 'express';
import { embedText } from '../embeddings.js';
import { sparseEncodeDoc } from '../sparse.js';
import { extractMetadata, checkContradiction } from '../metadata.js';
import { upsertPoint, searchVector, updatePayload, findBySourceId, getById, deleteChunksByParent, upsertChunks } from '../qdrant.js';
import { getVaultContext } from '../drive-context.js';
import { computeEffectiveDate } from '../effective-date.js';
import { reprocessToArtifacts, buildChunkPoints, CHUNK_THRESHOLD } from '../chunking.js';

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

  // Long thoughts get the multi-vector treatment (Sonnet summary + topic
  // chunks); short ones stay single-vector (one topic, one vector). The main
  // point's vector is the summary embedding for long thoughts, the full-text
  // embedding for short ones.
  let isLong = false;
  let vector, sparseVector, metadata, summary = null, chunkSpecs = null;
  if (text.length > CHUNK_THRESHOLD) {
    try {
      const art = await reprocessToArtifacts(text, vaultCtx);
      vector = art.mainVector;
      sparseVector = art.mainSparse;
      metadata = art.metadata;
      summary = art.summary;
      chunkSpecs = art.chunkSpecs;
      isLong = true;
    } catch (err) {
      // Chunking is an enhancement, not a requirement. If Sonnet errors or
      // yields 0 chunks, fall back to the single-vector path so the capture
      // still succeeds (auto-intake must not fail on a transient model hiccup).
      console.warn(`Chunking failed for long capture (${err.message}); single-vector fallback.`);
    }
  }
  if (!isLong) {
    [vector, metadata] = await Promise.all([
      embedText(text, 'RETRIEVAL_DOCUMENT'),
      extractMetadata(text, vaultCtx),
    ]);
    sparseVector = sparseEncodeDoc(text);
  }

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

  const now = new Date().toISOString();
  const payload = {
    // For long thoughts the stored text leads with the summary (UI shows it
    // first), original below the delimiter — same shape v2 reprocess produced.
    text: isLong ? `${summary}\n\n---\n\n${text}` : text,
    title: metadata.title || '',
    people: metadata.people || [],
    topics: metadata.topics || [],
    projects: metadata.projects || [],
    type: metadata.type || 'note',
    action_items: metadata.action_items || [],
    status: 'active',
    source,
    source_id: sourceId,
    created_at: now,
    ...(isLong && {
      has_v2_summary: true,
      pipeline_version: 'v2',
      chunk_count: chunkSpecs.length,
      summary_appended_at: now,
    }),
    ...(supersedes && { supersedes }),
    ...extraPayload,
  };
  // effective_date = when the CONTENT happened (email date, meeting date),
  // not when the brain captured it. Used by search time-decay and Recent
  // ordering. Computed AFTER extraPayload spread so source-specific fields
  // (last_internal_date, meeting_date, published_at) are visible.
  payload.effective_date = computeEffectiveDate(payload);

  const id = await upsertPoint(vector, sparseVector, payload);
  if (isLong) {
    await deleteChunksByParent(id); // belt-and-suspenders; a fresh id has none
    await upsertChunks(
      buildChunkPoints(id, chunkSpecs, {
        parent_title: payload.title,
        parent_source: source,
        created_at: now,
      })
    );
  }
  return {
    ok: true,
    id,
    metadata,
    ...(isLong && { chunk_count: chunkSpecs.length }),
    ...(supersedes && { supersedes, archived: supersedes }),
  };
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
// `chunk` (default true) — when false, the caller manages its own text
// representation and we must NOT re-summarize/re-chunk (e.g. the coworker
// summary path in summary.js passes already-summary-wrapped text). The Gmail
// intake passes raw thread text → chunk:true so long threads get the
// multi-vector treatment.
export async function refreshCapture(id, newText, { extraPayload = {}, chunk = true } = {}) {
  const existing = await getById(id);
  if (!existing) throw new Error(`Thought ${id} not found`);

  const vaultCtx = await getVaultContext();
  let isLong = false;
  let vector, sparseVector, metadata, summary = null, chunkSpecs = null;
  if (chunk && newText.length > CHUNK_THRESHOLD) {
    try {
      const art = await reprocessToArtifacts(newText, vaultCtx);
      vector = art.mainVector;
      sparseVector = art.mainSparse;
      metadata = art.metadata;
      summary = art.summary;
      chunkSpecs = art.chunkSpecs;
      isLong = true;
    } catch (err) {
      console.warn(`Chunking failed for refresh ${id} (${err.message}); single-vector fallback.`);
    }
  }
  if (!isLong) {
    [vector, metadata] = await Promise.all([
      embedText(newText, 'RETRIEVAL_DOCUMENT'),
      extractMetadata(newText, vaultCtx),
    ]);
    sparseVector = sparseEncodeDoc(newText);
  }

  const now = new Date().toISOString();
  const payload = {
    text: isLong ? `${summary}\n\n---\n\n${newText}` : newText,
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
    updated_at: now,
    refresh_count: (existing.refresh_count || 0) + 1,
    ...(isLong && {
      has_v2_summary: true,
      pipeline_version: 'v2',
      chunk_count: chunkSpecs.length,
      summary_appended_at: now,
    }),
    ...extraPayload,
  };
  payload.effective_date = computeEffectiveDate(payload);

  await upsertPoint(vector, sparseVector, payload, id);
  // Keep the chunk set consistent with the new text. Only when we own chunking
  // (chunk:true): purge stale chunks, then re-add if the new text is long.
  if (chunk) {
    await deleteChunksByParent(id);
    if (isLong) {
      await upsertChunks(
        buildChunkPoints(id, chunkSpecs, {
          parent_title: payload.title,
          parent_source: payload.source,
          created_at: payload.created_at,
        })
      );
    }
  }
  return {
    ok: true,
    id,
    refreshed: true,
    refresh_count: payload.refresh_count,
    ...(isLong && { chunk_count: chunkSpecs.length }),
  };
}
