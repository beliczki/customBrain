// Named MCP bearer tokens. UI_SECRET (env, renamed from CAPTURE_SECRET in 0.24.0)
// authorizes the UI and the non-MCP HTTP surface; the tokens listed here are the
// ONLY way to reach the MCP transport from outside. See `tasks/todo.md` (MCP
// token management) for the auth-split decision.
//
// Storage: state/mcp-tokens.json — same pattern as state/agenda-cache.json,
// state/gmail-watermark.json, state/settings.json. Atomic write (.tmp + rename).
// Cleartext at rest; same risk profile as service-account.json and .env, and
// the file is readable only by the user that runs node.

import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const STORE_PATH = resolve(MODULE_DIR, '..', 'state', 'mcp-tokens.json');

// Last-used disk-write throttle: per-token, only flush if (now - prev) > this.
// Keeps the validation hot-path off the disk while still giving the UI a
// meaningful "last used" timestamp.
const LAST_USED_FLUSH_MS = 5 * 60 * 1000;

let cache = null; // in-memory mirror of the file; load on first access

function ensureDir() {
  const dir = dirname(STORE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function loadFromDisk() {
  if (!existsSync(STORE_PATH)) return { tokens: [] };
  try {
    return JSON.parse(readFileSync(STORE_PATH, 'utf-8'));
  } catch (err) {
    // Corrupt file shouldn't lock MCP forever — log and return empty so the
    // user can rebuild from UI. Bailing out would mean SSH-only recovery.
    console.error(`[mcp-token-store] corrupt ${STORE_PATH}: ${err.message} — treating as empty`);
    return { tokens: [] };
  }
}

function flush() {
  ensureDir();
  const tmp = `${STORE_PATH}.tmp`;
  writeFileSync(tmp, JSON.stringify(cache, null, 2), 'utf-8');
  renameSync(tmp, STORE_PATH);
}

function getCache() {
  if (cache === null) cache = loadFromDisk();
  return cache;
}

function maskToken(token) {
  if (!token || token.length < 8) return '••••';
  return `••••${token.slice(-4)}`;
}

function publicShape(t, { reveal = false } = {}) {
  return {
    id: t.id,
    name: t.name,
    token: reveal ? t.token : maskToken(t.token),
    created_at: t.created_at,
    last_used_at: t.last_used_at,
    // OAuth metadata (since 0.25.0). null for manually-minted tokens.
    oauth_client_id: t.oauth_client_id || null,
    expires_at: t.expires_at || null,
  };
}

/**
 * Validate an incoming bearer token against the named list.
 * Returns the token record on match (and updates last_used_at throttled),
 * or null on miss / expiry.
 * Since 0.25.0: tokens with expires_at < now are treated as no-match.
 */
export function validateToken(token) {
  if (!token) return null;
  const store = getCache();
  const found = store.tokens.find((t) => t.token === token);
  if (!found) return null;
  if (found.expires_at && new Date(found.expires_at).getTime() < Date.now()) {
    return null;
  }
  const now = Date.now();
  const prev = found.last_used_at ? new Date(found.last_used_at).getTime() : 0;
  if (now - prev > LAST_USED_FLUSH_MS) {
    found.last_used_at = new Date(now).toISOString();
    flush();
  }
  return found;
}

/**
 * Public list — masked tokens by default. Pass `{ reveal: true }` to get the
 * raw value (used by the per-row Show/Hide toggle in the UI).
 */
export function listTokens({ reveal = false, revealId = null } = {}) {
  const store = getCache();
  return store.tokens.map((t) => {
    const shouldReveal = reveal || (revealId && t.id === revealId);
    return publicShape(t, { reveal: shouldReveal });
  });
}

export function createToken(name, { oauth_client_id = null, expires_at = null } = {}) {
  if (!name || typeof name !== 'string' || name.trim() === '') {
    throw new Error('Token name required');
  }
  const store = getCache();
  const trimmed = name.trim();
  // OAuth-minted tokens MAY share names with prior tokens (e.g., re-auth from
  // the same client) — disambiguate by appending a short suffix when oauth.
  let finalName = trimmed;
  if (store.tokens.some((t) => t.name === finalName)) {
    if (oauth_client_id) {
      finalName = `${trimmed} (${new Date().toISOString().slice(0, 16).replace('T', ' ')})`;
    } else {
      throw new Error(`Token with name "${trimmed}" already exists`);
    }
  }
  const record = {
    id: crypto.randomUUID(),
    name: finalName,
    token: crypto.randomBytes(32).toString('hex'),
    created_at: new Date().toISOString(),
    last_used_at: null,
    oauth_client_id,
    expires_at,
  };
  store.tokens.push(record);
  flush();
  return publicShape(record, { reveal: true });
}

export function revokeToken(id) {
  const store = getCache();
  const idx = store.tokens.findIndex((t) => t.id === id);
  if (idx === -1) return false;
  store.tokens.splice(idx, 1);
  flush();
  return true;
}
