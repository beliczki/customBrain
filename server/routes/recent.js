import { Router } from 'express';
import { scrollRecent, deletePoint, getById, updatePayload, getWithVectors, getChunksWithVectors } from '../qdrant.js';

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
    const fromLine = req.query.from_line ? parseInt(req.query.from_line) : null;
    const maxLines = req.query.max_lines ? parseInt(req.query.max_lines) : null;
    const thought = (fromLine || maxLines)
      ? await getThoughtSlice(req.params.id, fromLine || 1, maxLines)
      : await getById(req.params.id);
    if (!thought) return res.status(404).json({ error: 'Not found' });
    res.json(thought);
  } catch (err) {
    console.error('Get thought error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Retrieval anatomy: the thought's full point/vector structure (P18). Shows
// how many vectors represent the thought and what each chunk is.
router.get('/thoughts/:id/anatomy', async (req, res) => {
  try {
    const [main] = await getWithVectors([req.params.id]);
    if (!main) return res.status(404).json({ error: 'Not found' });
    const chunks = await getChunksWithVectors(req.params.id);

    const vinfo = (p) => ({
      dense_dim: Array.isArray(p.vector?.dense) ? p.vector.dense.length : 0,
      bm25_terms: p.vector?.bm25?.indices?.length ?? 0,
    });
    const kindRank = (k) => (k === 'summary' ? 0 : 1);
    const ordered = [...chunks].sort((a, b) =>
      kindRank(a.payload.chunk_kind) - kindRank(b.payload.chunk_kind) ||
      (a.payload.chunk_index ?? 0) - (b.payload.chunk_index ?? 0)
    );

    res.json({
      id: req.params.id,
      title: main.payload.title,
      source: main.payload.source,
      has_v2_summary: !!main.payload.has_v2_summary,
      chunk_count: chunks.length,
      main: { text_length: (main.payload.text || '').length, ...vinfo(main) },
      chunks: ordered.map((c) => ({
        id: c.id,
        chunk_kind: c.payload.chunk_kind,
        chunk_index: c.payload.chunk_index,
        chunk_label: c.payload.chunk_label,
        chunk_text: c.payload.chunk_text,
        ...vinfo(c),
      })),
      totals: {
        points: 1 + chunks.length,
        dense_vectors: 1 + chunks.length,
        sparse_vectors: 1 + chunks.length,
        summary_chunks: chunks.filter((c) => c.payload.chunk_kind === 'summary').length,
        content_chunks: chunks.filter((c) => c.payload.chunk_kind === 'content').length,
      },
    });
  } catch (err) {
    console.error('Anatomy error:', err.message);
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

/**
 * Fetch a thought with its text windowed to a line range (qmd `get` steal).
 * Long thoughts (Fireflies transcripts, refreshed Gmail threads) are tens of
 * thousands of chars — an agent paging through with from_line/max_lines pulls
 * exactly the slice it needs instead of the whole payload. 1-indexed.
 */
export async function getThoughtSlice(id, fromLine = 1, maxLines = null) {
  const thought = await getById(id);
  if (!thought) return null;
  const lines = (thought.text || '').split('\n');
  const start = Math.max(1, fromLine);
  const slice = maxLines != null ? lines.slice(start - 1, start - 1 + maxLines) : lines.slice(start - 1);
  return {
    ...thought,
    text: slice.join('\n'),
    text_slice: {
      from_line: start,
      lines_returned: slice.length,
      total_lines: lines.length,
      truncated: start - 1 + slice.length < lines.length,
    },
  };
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
