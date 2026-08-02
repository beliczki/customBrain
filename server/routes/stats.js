import { Router } from 'express';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAllPayloads } from '../qdrant.js';

const router = Router();

// Single source of truth for "what version is customBrain". The client used to
// bake its own client/package.json version in at build time, which silently
// drifted whenever we shipped a server-only change without rebuilding the SPA.
// It now reads this off the /stats response it already fetches on mount.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const VERSION = JSON.parse(readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf-8')).version;

router.get('/stats', async (req, res) => {
  try {
    const results = await getStats();
    // Deliberately added on the route, not in getStats() — the MCP brain_stats
    // tool calls getStats() directly and its response shape stays untouched.
    res.json({ ...results, version: VERSION });
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
