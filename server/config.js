// Settings storage + boot-time process.env overlay.
//
// Source of truth: state/settings.json. Format: flat `{ KEY: "value", _updated_at: "..." }`.
//
// Boot flow:
//   1. dotenv reads .env into process.env (server/index.js, top of file)
//   2. applySettingsToEnv() reads settings.json and OVERRIDES matching process.env keys
//   3. Modules continue to read process.env.X — no refactor needed
//
// Save flow (HTTP PUT /settings):
//   1. saveSettings(partial) merges into existing settings.json
//   2. Caller triggers /settings/restart → process.exit(0) → PM2 brings up fresh process
//   3. New process re-runs the boot flow with the saved values
//
// If settings.json is missing or corrupted, the system falls back to .env transparently —
// no breakage for pre-0.17.0 deploys.

import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, chmodSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SETTINGS_SCHEMA } from './config-schema.js';

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
export const SETTINGS_PATH = resolve(MODULE_DIR, '..', 'state', 'settings.json');

const RESERVED_KEYS = new Set(['_updated_at']);

// UI_SECRET is the bootstrap master secret — by design it ONLY lives in .env,
// never in settings.json. If a key somehow appears in settings.json (legacy
// migration, manual edit, etc.) we refuse to overlay it onto process.env so
// the .env value remains authoritative. Rotating UI_SECRET = edit .env +
// `pm2 restart custombrain`. Documented in config-schema.js header comment.
const NEVER_OVERLAY = new Set(['UI_SECRET']);

export function loadSettings() {
  if (!existsSync(SETTINGS_PATH)) return null;
  try {
    return JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8'));
  } catch (err) {
    console.error(`[config] Failed to parse ${SETTINGS_PATH}: ${err.message}. Falling back to .env.`);
    return null;
  }
}

export function applySettingsToEnv() {
  const data = loadSettings();
  if (!data) return { applied: 0, source: 'env' };
  let count = 0;
  let skipped_never_overlay = 0;
  for (const [key, value] of Object.entries(data)) {
    if (RESERVED_KEYS.has(key)) continue;
    if (NEVER_OVERLAY.has(key)) { skipped_never_overlay++; continue; }
    if (value == null || value === '') continue;
    process.env[key] = String(value);
    count++;
  }
  if (skipped_never_overlay > 0) {
    console.log(`[config] Skipped ${skipped_never_overlay} never-overlay key(s) from settings.json (UI_SECRET stays env-only by design)`);
  }
  return { applied: count, source: 'settings.json' };
}

export function saveSettings(partial) {
  const dir = dirname(SETTINGS_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const current = loadSettings() || {};
  for (const [key, value] of Object.entries(partial || {})) {
    if (RESERVED_KEYS.has(key)) continue;
    if (value == null) {
      delete current[key];
    } else {
      current[key] = String(value);
    }
  }
  current._updated_at = new Date().toISOString();
  writeFileSync(SETTINGS_PATH, JSON.stringify(current, null, 2), 'utf-8');
  try { chmodSync(SETTINGS_PATH, 0o600); } catch { /* best effort */ }
  return current;
}

// UI/MCP helper — returns schema joined with current values. Masks secrets.
export function getSettingsForUI({ revealSecrets = false } = {}) {
  const stored = loadSettings() || {};
  const items = SETTINGS_SCHEMA.map((entry) => {
    const value = stored[entry.key] ?? process.env[entry.key] ?? '';
    const source = stored[entry.key] != null ? 'settings.json' : (process.env[entry.key] ? 'env' : 'unset');
    const has_value = value !== '';
    const display_value = entry.is_secret && !revealSecrets && has_value
      ? maskSecret(value)
      : value;
    return {
      key: entry.key,
      category: entry.category,
      label: entry.label,
      description: entry.description || null,
      is_secret: !!entry.is_secret,
      required: !!entry.required,
      default: entry.default ?? null,
      has_value,
      value: display_value,
      source,
    };
  });
  const updated_at = stored._updated_at || null;
  return { items, updated_at, settings_path: SETTINGS_PATH };
}

function maskSecret(value) {
  if (!value) return '';
  if (value.length <= 4) return '••••';
  return '••••••••' + value.slice(-4);
}

export function getStat() {
  if (!existsSync(SETTINGS_PATH)) return null;
  const s = statSync(SETTINGS_PATH);
  return { mtime: s.mtimeMs, size: s.size };
}
