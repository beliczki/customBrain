import { Router } from 'express';
import { embedText } from '../embeddings.js';
import { searchVector } from '../qdrant.js';

const router = Router();

router.get('/search', async (req, res) => {
  const { q, limit } = req.query;
  if (!q) return res.status(400).json({ error: 'q parameter required' });

  try {
    const results = await searchThoughts(q, parseInt(limit) || 5);
    res.json(results);
  } catch (err) {
    console.error('Search error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;

export async function searchThoughts(query, limit = 5) {
  const vector = await embedText(query);
  return searchVector(vector, limit);
}
