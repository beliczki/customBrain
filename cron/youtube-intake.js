import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', 'server', '.env') });

import { getYoutubeLikes } from '../agent/tools/youtube.js';
import { captureThought } from '../server/routes/capture.js';

const BOOTSTRAP_WARN_THRESHOLD = 20;

// YouTube category IDs to skip: 10=Music (entertainment, not substantive content).
// Override via env: YOUTUBE_SKIP_CATEGORIES=10,23,24 (comma-separated).
const SKIP_CATEGORIES = new Set(
  (process.env.YOUTUBE_SKIP_CATEGORIES || '10').split(',').map((s) => s.trim()).filter(Boolean),
);

function buildText(item) {
  const lines = [
    `# ${item.title}`,
    `Channel: ${item.channel}`,
    `https://youtube.com/watch?v=${item.video_id}`,
    '',
    item.description || '',
  ];
  if (item.captions_text) {
    lines.push('', '## Transcript', '', item.captions_text);
  }
  return lines.join('\n').trim();
}

async function run() {
  const sinceDate = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
  const items = await getYoutubeLikes(sinceDate);
  console.log(`YouTube intake: ${items.length} liked items since ${sinceDate}`);

  let captured = 0;
  let skipped = 0;
  let filtered = 0;
  let failed = 0;

  for (const item of items) {
    if (item.category_id && SKIP_CATEGORIES.has(item.category_id)) {
      filtered++;
      console.log(`  filtered (cat=${item.category_id}): ${item.title}`);
      continue;
    }
    try {
      const text = buildText(item);
      const result = await captureThought(text, {
        source: 'youtube',
        sourceId: item.video_id,
      });
      if (result.duplicate) {
        skipped++;
      } else {
        captured++;
        console.log(`  captured: ${item.title} (${result.id})`);
      }
    } catch (err) {
      failed++;
      console.error(`  failed: ${item.video_id} — ${err.message}`);
    }
  }

  console.log(`YouTube intake done: captured=${captured} skipped=${skipped} filtered=${filtered} failed=${failed}`);
  if (captured > BOOTSTRAP_WARN_THRESHOLD) {
    console.warn(`Captured ${captured} in one run — likely bootstrap. Consider narrowing sinceDate.`);
  }
}

run().catch((err) => {
  console.error('YouTube intake crashed:', err.message);
  process.exit(1);
});
