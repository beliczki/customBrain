import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env') });
import { applySettingsToEnv } from '../server/config.js';
applySettingsToEnv();

import { getYoutubeLikes } from '../agent/tools/youtube.js';
import { fetchVideoSummary } from '../agent/tools/youtube-gemini.js';
import { captureThought } from '../server/routes/capture.js';
import { findBySourceId } from '../server/qdrant.js';

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
  ];
  if (item.video_summary) {
    // Gemini already produced a structured summary with its own headers —
    // use it as the primary body. Description becomes a small footer.
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
  // No date window: process the full likes playlist (capped at 50 by the API)
  // every run and rely on source_id dedup to skip already-captured videos. A
  // trailing like-date window silently dropped videos liked during cron
  // downtime or before the cron existed; dedup early-returns before any
  // embedding/Haiku cost, so re-scanning the playlist each run is cheap.
  const items = await getYoutubeLikes();
  console.log(`YouTube intake: ${items.length} liked items (full playlist)`);

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
      // Dedup BEFORE the expensive Gemini summary. Since the cron now scans the
      // whole playlist every run (no date window), most items are already
      // captured — skipping them here avoids ~45 wasted Gemini calls per run.
      // captureThought re-checks the same (source, source_id) as a safety net.
      if (await findBySourceId('youtube', item.video_id)) {
        skipped++;
        continue;
      }

      // Gemini summary AFTER the filter — skip for music/etc, no wasted API calls
      console.log(`  summarizing: ${item.title}`);
      try {
        item.video_summary = await fetchVideoSummary(item.video_id);
      } catch (err) {
        console.warn(`  Gemini failed for ${item.video_id}: ${err.message}`);
      }

      const text = buildText(item);
      const result = await captureThought(text, {
        source: 'youtube',
        sourceId: item.video_id,
        extraPayload: {
          ...(item.published_at && { published_at: item.published_at }),
        },
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
