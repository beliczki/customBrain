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

function applyTimeDecay(results) {
  const now = Date.now();
  return results
    .map((r) => {
      const days = (now - new Date(r.created_at).getTime()) / 86400000;
      const decay = 1 / (1 + days / 30);
      return { ...r, cosine_score: r.score, score: r.score * decay };
    })
    .sort((a, b) => b.score - a.score);
}

export async function searchThoughts(query, limit = 5) {
  const vector = await embedText(query);
  const results = await searchVector(vector, limit);
  return applyTimeDecay(results);
}
