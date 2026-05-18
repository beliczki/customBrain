// One-time migration on Hetzner: move .env + service-account.json from server/
// to repo root, then strip .env down to just CAPTURE_SECRET.
//
// settings.json already has all 17 non-CAPTURE_SECRET values (verified
// 2026-05-18 — applySettingsToEnv has been overriding env for a while), so no
// value-copy is needed. The migration is purely file-relocation + strip.
//
// Idempotent: each step checks the current state and skips if already done.
// Safe to re-run. Run after `git pull` of the matching code changes (new
// dotenv paths + new SA resolution base).
//
// Usage: node scripts/migrate-env-to-root.js [--dry-run]

import { readFileSync, writeFileSync, renameSync, existsSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(MODULE_DIR, '..');
const DRY_RUN = process.argv.includes('--dry-run');

const OLD_ENV = resolve(REPO_ROOT, 'server', '.env');
const NEW_ENV = resolve(REPO_ROOT, '.env');
const OLD_SA = resolve(REPO_ROOT, 'server', 'service-account.json');
const NEW_SA = resolve(REPO_ROOT, 'service-account.json');

function log(label, status, detail) {
  const tag = status === 'OK' ? '✓' : status === 'SKIP' ? '·' : status === 'PLAN' ? '→' : '✗';
  console.log(`${tag} ${label.padEnd(40)} ${detail || ''}`);
}

function parseEnv(content) {
  const out = {};
  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function stepMoveEnv() {
  if (existsSync(NEW_ENV) && !existsSync(OLD_ENV)) {
    log('move .env to root', 'SKIP', '(already at root)');
    return;
  }
  if (!existsSync(OLD_ENV)) {
    log('move .env to root', 'FAIL', `neither ${OLD_ENV} nor ${NEW_ENV} found — bootstrap missing`);
    process.exit(1);
  }
  if (existsSync(NEW_ENV) && existsSync(OLD_ENV)) {
    log('move .env to root', 'FAIL', `both ${OLD_ENV} AND ${NEW_ENV} exist — refuse to overwrite, resolve manually`);
    process.exit(1);
  }
  if (DRY_RUN) {
    log('move .env to root', 'PLAN', `${OLD_ENV} → ${NEW_ENV}`);
    return;
  }
  renameSync(OLD_ENV, NEW_ENV);
  log('move .env to root', 'OK', `${OLD_ENV} → ${NEW_ENV}`);
}

function stepStripEnv() {
  if (!existsSync(NEW_ENV)) {
    log('strip .env to CAPTURE_SECRET', 'FAIL', `${NEW_ENV} missing — run move step first`);
    process.exit(1);
  }
  const content = readFileSync(NEW_ENV, 'utf-8');
  const parsed = parseEnv(content);
  if (!parsed.CAPTURE_SECRET) {
    log('strip .env to CAPTURE_SECRET', 'FAIL', `CAPTURE_SECRET not present in ${NEW_ENV} — refusing to overwrite`);
    process.exit(1);
  }
  const targetContent = `# Bootstrap secret only. All other config (API keys, Google Drive OAuth,
# Fireflies, Gmail labels, etc.) is managed via the Settings UI tab and
# stored in state/settings.json. See README for setup.
CAPTURE_SECRET=${parsed.CAPTURE_SECRET}
`;
  if (content === targetContent) {
    log('strip .env to CAPTURE_SECRET', 'SKIP', '(already stripped)');
    return;
  }
  const otherKeys = Object.keys(parsed).filter((k) => k !== 'CAPTURE_SECRET');
  if (DRY_RUN) {
    log('strip .env to CAPTURE_SECRET', 'PLAN', `would remove ${otherKeys.length} keys: ${otherKeys.join(', ')}`);
    return;
  }
  writeFileSync(NEW_ENV, targetContent, 'utf-8');
  log('strip .env to CAPTURE_SECRET', 'OK', `removed ${otherKeys.length} keys (${otherKeys.join(', ')}) — should already be in settings.json`);
}

function stepMoveServiceAccount() {
  if (existsSync(NEW_SA) && !existsSync(OLD_SA)) {
    log('move service-account.json', 'SKIP', '(already at root)');
    return;
  }
  if (!existsSync(OLD_SA) && !existsSync(NEW_SA)) {
    log('move service-account.json', 'SKIP', '(not present in either location; Drive features will fail until file exists)');
    return;
  }
  if (existsSync(NEW_SA) && existsSync(OLD_SA)) {
    log('move service-account.json', 'FAIL', `both ${OLD_SA} AND ${NEW_SA} exist — refuse to overwrite, resolve manually`);
    process.exit(1);
  }
  if (DRY_RUN) {
    log('move service-account.json', 'PLAN', `${OLD_SA} → ${NEW_SA}`);
    return;
  }
  renameSync(OLD_SA, NEW_SA);
  log('move service-account.json', 'OK', `${OLD_SA} → ${NEW_SA}`);
}

console.log(`\n=== migrate-env-to-root ${DRY_RUN ? '(DRY RUN)' : ''} ===`);
console.log(`Repo root: ${REPO_ROOT}\n`);

stepMoveServiceAccount();
stepMoveEnv();
stepStripEnv();

console.log(`\n${DRY_RUN ? 'No changes made (dry run).' : 'Migration complete. Restart pm2 to pick up the new layout.'}`);
