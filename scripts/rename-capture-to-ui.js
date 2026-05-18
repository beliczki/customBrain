// One-time migration: rename CAPTURE_SECRET → UI_SECRET in BOTH locations
// where the value lives on Hetzner — the root .env file and state/settings.json.
//
// Idempotent: each location is a no-op if UI_SECRET is already present (and
// CAPTURE_SECRET is gone). Safe to re-run.
//
// Run AFTER `git pull` of the 0.24.0 code, BEFORE pm2 start — the new server
// reads process.env.UI_SECRET and will 401 everything if only the old name exists.
//
// Usage: node scripts/rename-capture-to-ui.js [--dry-run]

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(MODULE_DIR, '..');
const DRY_RUN = process.argv.includes('--dry-run');

const ENV_PATH = resolve(REPO_ROOT, '.env');
const SETTINGS_PATH = resolve(REPO_ROOT, 'state', 'settings.json');

function log(label, status, detail) {
  const tag = status === 'OK' ? '✓' : status === 'SKIP' ? '·' : status === 'PLAN' ? '→' : '✗';
  console.log(`${tag} ${label.padEnd(40)} ${detail || ''}`);
}

function renameInEnv() {
  if (!existsSync(ENV_PATH)) {
    log('rename in .env', 'FAIL', `${ENV_PATH} not found`);
    process.exit(1);
  }
  const content = readFileSync(ENV_PATH, 'utf-8');
  const hasUi = /^UI_SECRET=/m.test(content);
  const hasCapture = /^CAPTURE_SECRET=/m.test(content);

  if (hasUi && !hasCapture) {
    log('rename in .env', 'SKIP', '(UI_SECRET already present, no CAPTURE_SECRET)');
    return;
  }
  if (hasUi && hasCapture) {
    log('rename in .env', 'FAIL', 'both UI_SECRET and CAPTURE_SECRET present — manual cleanup required');
    process.exit(1);
  }
  if (!hasCapture) {
    log('rename in .env', 'FAIL', 'neither UI_SECRET nor CAPTURE_SECRET found — bootstrap missing');
    process.exit(1);
  }

  // Rename CAPTURE_SECRET= → UI_SECRET= at line start; preserve value & comments
  const renamed = content.replace(/^CAPTURE_SECRET=/m, 'UI_SECRET=');

  // Also update the explanatory comments if they reference the old name
  const headerCommentFixed = renamed.replace(
    /^# Why CAPTURE_SECRET stays here:/m,
    '# Why UI_SECRET stays here:'
  );

  if (DRY_RUN) {
    log('rename in .env', 'PLAN', `would rename CAPTURE_SECRET → UI_SECRET in ${ENV_PATH}`);
    return;
  }
  writeFileSync(ENV_PATH, headerCommentFixed, 'utf-8');
  log('rename in .env', 'OK', `${ENV_PATH}`);
}

function renameInSettings() {
  if (!existsSync(SETTINGS_PATH)) {
    log('rename in settings.json', 'SKIP', '(settings.json not present — nothing to migrate)');
    return;
  }
  const data = JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8'));
  const hasUi = data.UI_SECRET != null;
  const hasCapture = data.CAPTURE_SECRET != null;

  if (hasUi && !hasCapture) {
    log('rename in settings.json', 'SKIP', '(UI_SECRET already present, no CAPTURE_SECRET)');
    return;
  }
  if (!hasCapture) {
    log('rename in settings.json', 'SKIP', '(CAPTURE_SECRET not present, nothing to rename)');
    return;
  }
  if (hasUi && hasCapture) {
    log('rename in settings.json', 'FAIL', 'both UI_SECRET and CAPTURE_SECRET present — manual cleanup required');
    process.exit(1);
  }

  if (DRY_RUN) {
    log('rename in settings.json', 'PLAN', `would copy CAPTURE_SECRET → UI_SECRET and delete CAPTURE_SECRET`);
    return;
  }
  data.UI_SECRET = data.CAPTURE_SECRET;
  delete data.CAPTURE_SECRET;
  data._updated_at = new Date().toISOString();
  writeFileSync(SETTINGS_PATH, JSON.stringify(data, null, 2), 'utf-8');
  log('rename in settings.json', 'OK', `${SETTINGS_PATH}`);
}

console.log(`\n=== rename-capture-to-ui ${DRY_RUN ? '(DRY RUN)' : ''} ===\n`);
renameInEnv();
renameInSettings();
console.log(`\n${DRY_RUN ? 'No changes (dry run).' : 'Done. Restart pm2 to pick up the new env var name.'}`);
