import { Router } from 'express';
import { embedText } from '../embeddings.js';
import { extractMetadata, checkContradiction } from '../metadata.js';
import { upsertPoint, searchVector, updatePayload } from '../qdrant.js';
import { getVaultContext } from '../drive-context.js';

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

export async function captureThought(text, { conflictThreshold = 0.85 } = {}) {
  const vaultCtx = await getVaultContext();

  const [vector, metadata] = await Promise.all([
    embedText(text),
    extractMetadata(text, vaultCtx),
  ]);

  // Check near-duplicates for contradictions (top 3, not just top 1)
  let supersedes = null;
  const nearMatches = await searchVector(vector, 3);
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
    created_at: new Date().toISOString(),
    ...(supersedes && { supersedes }),
  };

  const id = await upsertPoint(vector, payload);
  return { ok: true, id, metadata, ...(supersedes && { supersedes, archived: supersedes }) };
}
