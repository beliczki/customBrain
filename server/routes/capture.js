import { Router } from 'express';
import { embedText } from '../embeddings.js';
import { extractMetadata } from '../metadata.js';
import { upsertPoint } from '../qdrant.js';
import { getVaultContext } from '../drive-context.js';

const router = Router();

router.post('/capture', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${process.env.CAPTURE_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { text } = req.body;
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'text field required' });
  }

  try {
    const result = await captureThought(text);
    res.json(result);
  } catch (err) {
    console.error('Capture error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;

export async function captureThought(text) {
  const vaultCtx = await getVaultContext();

  const [vector, metadata] = await Promise.all([
    embedText(text),
    extractMetadata(text, vaultCtx),
  ]);

  const payload = {
    text,
    title: metadata.title || '',
    people: metadata.people || [],
    topics: metadata.topics || [],
    projects: metadata.projects || [],
    type: metadata.type || 'note',
    action_items: metadata.action_items || [],
    created_at: new Date().toISOString(),
  };

  const id = await upsertPoint(vector, payload);
  return { ok: true, id, metadata };
}
