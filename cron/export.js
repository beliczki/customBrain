import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', 'server', '.env') });

import { exportThoughts } from '../server/routes/export.js';

// Export thoughts from the last 24 hours
// Intended to be run via system crontab: 0 * * * * node /app/cron/export.js

async function run() {
  try {
    const result = await exportThoughts({ filter_days: 1 });
    console.log(`Exported ${result.exported_count} thoughts to Google Drive`);
  } catch (err) {
    console.error('Cron export failed:', err.message);
    process.exit(1);
  }
}

run();
