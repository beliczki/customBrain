import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env') });
import { applySettingsToEnv } from '../server/config.js';
applySettingsToEnv();

import { rebuildVault } from '../server/routes/export.js';
import { reindexDossiers } from '../server/dossier-index.js';

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

  // Hourly dossier reconcile: re-embed changed dossiers and delete points for
  // removed files. Kept separate from the export try/block so a dossier-index
  // hiccup never fails the vault export (they're independent concerns).
  try {
    const r = await reindexDossiers({ reconcile: true });
    console.log(`Dossier reindex: indexed ${r.indexed}, skipped ${r.skipped}, deleted ${r.deleted}, flagged ${r.flagged.length}`);
  } catch (err) {
    console.error('Dossier reindex failed (export still succeeded):', err.message);
  }
}

run();
