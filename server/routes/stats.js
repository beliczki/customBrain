import { Router } from 'express';
import { getAllPayloads } from '../qdrant.js';

const router = Router();

router.get('/stats', async (req, res) => {
  try {
    const results = await getStats();
    res.json(results);
  } catch (err) {
    console.error('Stats error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;

export async function getStats() {
  const payloads = await getAllPayloads();

  const total = payloads.length;
  const typeCounts = {};
  const topicCounts = {};
  const dailyCounts = {};

  for (const p of payloads) {
    const type = p.type || 'unknown';
    typeCounts[type] = (typeCounts[type] || 0) + 1;

    for (const topic of p.topics || []) {
      topicCounts[topic] = (topicCounts[topic] || 0) + 1;
    }

    const day = (p.created_at || '').slice(0, 10) || 'unknown';
    dailyCounts[day] = (dailyCounts[day] || 0) + 1;
  }

  const topTopics = Object.entries(topicCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([topic, count]) => ({ topic, count }));

  return { total, by_type: typeCounts, top_topics: topTopics, daily_counts: dailyCounts };
}
