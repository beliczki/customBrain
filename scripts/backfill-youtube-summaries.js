import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', 'server', '.env') });

import { getYoutubeLikes } from '../agent/tools/youtube.js';
import { fetchVideoSummary } from '../agent/tools/youtube-gemini.js';
import { scrollFiltered, deletePoint } from '../server/qdrant.js';
import { captureThought } from '../server/routes/capture.js';

const SKIP_CATEGORIES = new Set(
  (process.env.YOUTUBE_SKIP_CATEGORIES || '10').split(',').map((s) => s.trim()).filter(Boolean),
);

function buildText(item) {
  const lines = [
    `# ${item.title}`,
    `Channel: ${item.channel}`,
    `https://youtube.com/watch?v=${item.video_id}`,
  ];
  if (item.video_summary) {
    lines.push('', item.video_summary);
    if (item.description) {
      lines.push('', '---', '', '## Original description', '', item.description);
    }
  } else {
    lines.push('', item.description || '');
  }
  return lines.join('\n').trim();
}

async function run() {
  const existing = await scrollFiltered(
    { must: [{ key: 'source', match: { value: 'youtube' } }] },
    100,
  );
  console.log(`Found ${existing.length} existing YouTube captures in Qdrant`);

  // scrollFiltered doesn't return source_id in its shape — need to query the
  // raw payload. But for our ~10-entry scale, re-fetch from Qdrant isn't worth
  // it: instead, match by title+channel after pulling fresh likes.
  const existingByTitle = new Map();
  for (const p of existing) {
    if (p.title) existingByTitle.set(p.title, p);
  }

  // Pull a wide window — any liked video in last year.
  const since = new Date(Date.now() - 365 * 86400000).toISOString().split('T')[0];
  const items = await getYoutubeLikes(since);
  console.log(`Fetched ${items.length} liked videos since ${since}`);

  let refreshed = 0;
  let skippedFilter = 0;
  let skippedNoExisting = 0;
  let failed = 0;

  for (const item of items) {
    if (item.category_id && SKIP_CATEGORIES.has(item.category_id)) {
      skippedFilter++;
      continue;
    }

    const match = existingByTitle.get(item.title);
    if (!match) {
      skippedNoExisting++;
      continue;
    }

    try {
      console.log(`\nRefreshing: ${item.title}`);
      console.log(`  old point id: ${match.id}`);

      // Gemini summary happens AFTER filter, only for items we're keeping
      console.log(`  fetching Gemini summary...`);
      try {
        item.video_summary = await fetchVideoSummary(item.video_id);
      } catch (err) {
        console.warn(`  Gemini failed, proceeding without summary: ${err.message}`);
      }
      console.log(`  summary length: ${item.video_summary?.length ?? 0}`);

      await deletePoint(match.id);
      const text = buildText(item);
      const result = await captureThought(text, {
        source: 'youtube',
        sourceId: item.video_id,
      });
      console.log(`  new point id: ${result.id}`);
      refreshed++;
    } catch (err) {
      console.error(`  failed: ${err.message}`);
      failed++;
    }
  }

  console.log(`\nBackfill done: refreshed=${refreshed} skippedFilter=${skippedFilter} skippedNoMatch=${skippedNoExisting} failed=${failed}`);
}

run().catch((err) => {
  console.error('Backfill crashed:', err.message);
  process.exit(1);
});
