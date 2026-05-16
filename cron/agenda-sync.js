// Hourly cron — refreshes state/agenda-cache.json so the UI Agenda tab and
// MCP get_agenda tool always have today + 7 days warm. Subtask breakdown
// happens later in a Claude session, not here.

import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', 'server', '.env') });

import { syncAgenda } from '../server/agenda.js';

async function run() {
  const startTime = Date.now();
  try {
    const cache = await syncAgenda({ daysAhead: 7 });
    console.log(
      `[${new Date().toISOString()}] Agenda synced: ${cache.event_count} events, ${cache.enriched_count} enriched, ${((Date.now() - startTime) / 1000).toFixed(1)}s`
    );
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Agenda sync failed:`, err.message);
    console.error(err);
    process.exit(1);
  }
}

run();
