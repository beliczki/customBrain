// Migrate current .env values into state/settings.json. Idempotent: existing
// settings.json values are preserved; only missing keys are added from process.env.
//
// Usage:
//   node scripts/migrate-env-to-settings.js            # write + verify
//   node scripts/migrate-env-to-settings.js --dry-run  # show what would happen
//
// After running, verify in the Settings UI. Only then consider deleting .env.

import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env') });

import { SETTINGS_SCHEMA, isSecret } from '../server/config-schema.js';
import { loadSettings, saveSettings, SETTINGS_PATH } from '../server/config.js';

const dryRun = process.argv.includes('--dry-run');

const stored = loadSettings() || {};
const toWrite = {};
const reasons = [];

for (const entry of SETTINGS_SCHEMA) {
  const fromEnv = process.env[entry.key];
  const fromStored = stored[entry.key];

  if (fromStored != null && fromStored !== '') {
    reasons.push(`KEEP    ${entry.key.padEnd(38)} (already in settings.json)`);
    continue;
  }
  if (!fromEnv) {
    reasons.push(`SKIP    ${entry.key.padEnd(38)} (not in .env)`);
    continue;
  }
  toWrite[entry.key] = fromEnv;
  const display = isSecret(entry.key)
    ? `${fromEnv.slice(0, 3)}…${fromEnv.slice(-3)} (${fromEnv.length} chars)`
    : fromEnv;
  reasons.push(`WRITE   ${entry.key.padEnd(38)} ← ${display}`);
}

console.log(`Settings file: ${SETTINGS_PATH}`);
console.log(`Mode: ${dryRun ? 'DRY-RUN (no write)' : 'LIVE'}`);
console.log('');
for (const line of reasons) console.log(line);
console.log('');
console.log(`Summary: ${Object.keys(toWrite).length} keys would be written.`);

if (Object.keys(toWrite).length === 0) {
  console.log('Nothing to migrate. Exiting.');
  process.exit(0);
}

if (dryRun) {
  console.log('Dry-run complete. Re-run without --dry-run to apply.');
  process.exit(0);
}

const result = saveSettings(toWrite);
console.log('');
console.log(`Wrote ${Object.keys(toWrite).length} keys to ${SETTINGS_PATH}`);
console.log(`File _updated_at: ${result._updated_at}`);
console.log('');
console.log('NEXT STEPS:');
console.log('  1. Verify in UI: open Settings tab on brain.beliczki.hu — confirm every value shows correctly.');
console.log('  2. Restart server to load from settings.json: pm2 restart custombrain');
console.log('  3. Only AFTER both above succeed, you may delete .env (settings.json now wins).');
console.log('  4. settings.json is gitignored (state/) — back it up separately.');
