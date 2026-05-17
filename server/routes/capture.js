import { Router } from 'express';
import { embedText } from '../embeddings.js';
import { sparseEncodeDoc } from '../sparse.js';
import { extractMetadata, checkContradiction } from '../metadata.js';
import { upsertPoint, searchVector, updatePayload, findBySourceId, getById } from '../qdrant.js';
import { getVaultContext } from '../drive-context.js';
import { computeEffectiveDate } from '../effective-date.js';

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

export async function captureThought(text, { conflictThreshold = 0.85, source = 'manual', sourceId = null, extraPayload = {} } = {}) {
  if (sourceId) {
    const existing = await findBySourceId(source, sourceId);
    if (existing) {
      return { ok: true, id: existing.id, duplicate: true, source, source_id: sourceId };
    }
  }

  const vaultCtx = await getVaultContext();

  const [vector, metadata] = await Promise.all([
    embedText(text),
    extractMetadata(text, vaultCtx),
  ]);
  const sparseVector = sparseEncodeDoc(text);

  // Check near-duplicates for contradictions (top 3, not just top 1)
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
export async function refreshCapture(id, newText, { extraPayload = {} } = {}) {
  const existing = await getById(id);
  if (!existing) throw new Error(`Thought ${id} not found`);

  const vaultCtx = await getVaultContext();
  const [vector, metadata] = await Promise.all([
    embedText(newText),
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
  return { ok: true, id, refreshed: true, refresh_count: payload.refresh_count };
}
