import { Router } from 'express';
import { scrollRecent, deletePoint, getById, updatePayload } from '../qdrant.js';

const router = Router();

// Fields that can be changed via PATCH. Deliberately narrow: text, source,
// source_id, status, created_at, archived_* stay immutable via this path.
// Text editing + re-embed is a separate feature (see ROADMAP P7a).
const PATCH_ALLOWED_FIELDS = ['people', 'projects', 'topics', 'title', 'action_items'];

router.get('/recent', async (req, res) => {
  const { limit } = req.query;

  try {
    const results = await getRecent(parseInt(limit) || 10);
    res.json(results);
  } catch (err) {
    console.error('Recent error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/thoughts/:id', async (req, res) => {
  try {
    const thought = await getById(req.params.id);
    if (!thought) return res.status(404).json({ error: 'Not found' });
    res.json(thought);
  } catch (err) {
    console.error('Get thought error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/thoughts/:id', async (req, res) => {
  try {
    await deletePoint(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.patch('/thoughts/:id', async (req, res) => {
  try {
    const delta = {};
    for (const [key, val] of Object.entries(req.body || {})) {
      if (!PATCH_ALLOWED_FIELDS.includes(key)) {
        return res.status(400).json({
          error: `Field '${key}' cannot be updated via PATCH. Allowed: ${PATCH_ALLOWED_FIELDS.join(', ')}`,
        });
      }
      delta[key] = val;
    }
    if (Object.keys(delta).length === 0) {
      return res.status(400).json({ error: 'No updatable fields provided' });
    }
    const updated = await updateThought(req.params.id, delta);
    res.json({ ok: true, id: req.params.id, updated_fields: Object.keys(delta), thought: updated });
  } catch (err) {
    if (err.message?.includes('not found')) {
      return res.status(404).json({ error: err.message });
    }
    console.error('Update error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;

export async function getRecent(limit = 10) {
  return scrollRecent(limit);
}

export async function updateThought(id, delta) {
  // Enforce allowed fields here too so MCP callers can't bypass the HTTP guard.
  for (const key of Object.keys(delta)) {
    if (!PATCH_ALLOWED_FIELDS.includes(key)) {
      throw new Error(`Field '${key}' is not patchable`);
    }
  }
  const existing = await getById(id);
  if (!existing) throw new Error(`Thought ${id} not found`);
  await updatePayload(id, delta);
  return { ...existing, ...delta };
}
