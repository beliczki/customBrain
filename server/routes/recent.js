import { Router } from 'express';
import { scrollRecent, deletePoint } from '../qdrant.js';

const router = Router();

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

router.delete('/thoughts/:id', async (req, res) => {
  try {
    await deletePoint(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;

export async function getRecent(limit = 10) {
  return scrollRecent(limit);
}
