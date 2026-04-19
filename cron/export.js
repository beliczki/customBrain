import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', 'server', '.env') });

import { rebuildVault } from '../server/routes/export.js';

// Full vault rebuild. Called hourly from crontab.
// The `filter_days` arg used to be passed here but was never implemented
// downstream (rebuildVault always exports all active thoughts) — the
// leftover object-as-argument broke onLog(). Fixed 2026-04-19.

async function run() {
  const onLog = (line) => console.log(line);
  try {
    const result = await rebuildVault(onLog);
    console.log(`Exported ${result.exported_count} thoughts to Google Drive`);
  } catch (err) {
    console.error('Cron export failed:', err.message);
    process.exit(1);
  }
}

run();
