// OAuth 2.0 client + auth code storage for the customBrain MCP server.
// See tasks/todo.md (0.25.0 OAuth) for the design and scope rationale.
//
// Persistence:
//   - Clients: state/oauth-clients.json (atomic write, scrypt-hashed secrets).
//   - Auth codes: in-memory Map. 60s TTL. Lost on pm2 restart — acceptable since
//     the OAuth dance is sub-second and a restart mid-flow would invalidate the
//     authorization anyway.
//
// Token storage is in state/mcp-tokens.json (extended for OAuth in 0.25.0 with
// optional oauth_client_id + expires_at) — see server/mcp-token-store.js.

import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { promisify } from 'node:util';

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const STORE_PATH = resolve(MODULE_DIR, '..', 'state', 'oauth-clients.json');

const scryptAsync = promisify(crypto.scrypt);

// In-memory pending auth codes. Keyed by code string.
// Value: { client_id, redirect_uri, scope, state, code_challenge, code_challenge_method, expires_at }
const PENDING_CODES = new Map();
const CODE_TTL_MS = 60_000;

// Periodic prune of expired codes (low frequency — codes are short-lived).
setInterval(() => {
  const now = Date.now();
  for (const [code, entry] of PENDING_CODES) {
    if (entry.expires_at < now) PENDING_CODES.delete(code);
  }
}, 30_000).unref();

let cache = null;

function ensureDir() {
  const dir = dirname(STORE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function loadFromDisk() {
  if (!existsSync(STORE_PATH)) return { clients: [] };
  try {
    return JSON.parse(readFileSync(STORE_PATH, 'utf-8'));
  } catch (err) {
    console.error(`[oauth-store] corrupt ${STORE_PATH}: ${err.message} — treating as empty`);
    return { clients: [] };
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

// === Secret hashing (scrypt) ===

async function hashSecret(secret) {
  const salt = crypto.randomBytes(16);
  const derived = await scryptAsync(secret, salt, 64);
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

async function verifySecret(secret, hash) {
  if (!hash || !hash.startsWith('scrypt$')) return false;
  const [, saltHex, derivedHex] = hash.split('$');
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(derivedHex, 'hex');
  const actual = await scryptAsync(secret, salt, 64);
  // Length check first, then constant-time compare
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

// === Clients ===

function maskSecret(s) {
  if (!s) return null;
  return `••••${s.slice(-4)}`;
}

function publicClient(c) {
  return {
    id: c.id,
    name: c.name,
    client_id: c.client_id,
    token_endpoint_auth_method: c.token_endpoint_auth_method,
    redirect_uris: c.redirect_uris,
    auto_registered: !!c.auto_registered,
    created_at: c.created_at,
    last_used_at: c.last_used_at,
  };
}

export function listClients() {
  return getCache().clients.map(publicClient);
}

export function getClientByClientId(client_id) {
  return getCache().clients.find((c) => c.client_id === client_id) || null;
}

/**
 * Create a new OAuth client.
 * @param {object} opts
 * @param {string} opts.name — human-readable name (e.g., "Grok", "Claude Desktop")
 * @param {string[]} opts.redirect_uris — allowed redirect URIs
 * @param {'none'|'client_secret_basic'|'client_secret_post'} opts.token_endpoint_auth_method
 * @param {boolean} [opts.auto_registered=false] — true if created via DCR
 * @returns {Promise<{ id, client_id, client_secret|null, ...meta }>}
 *   client_secret is returned ONCE on creation; never readable again.
 */
export async function createClient({ name, redirect_uris, token_endpoint_auth_method, auto_registered = false }) {
  if (!name || typeof name !== 'string' || name.trim() === '') {
    throw new Error('name required');
  }
  if (!Array.isArray(redirect_uris) || redirect_uris.length === 0) {
    throw new Error('redirect_uris required (non-empty array)');
  }
  for (const uri of redirect_uris) {
    if (typeof uri !== 'string' || !uri.startsWith('http')) {
      throw new Error(`invalid redirect_uri: ${uri}`);
    }
  }
  const VALID_AUTH = ['none', 'client_secret_basic', 'client_secret_post'];
  if (!VALID_AUTH.includes(token_endpoint_auth_method)) {
    throw new Error(`token_endpoint_auth_method must be one of: ${VALID_AUTH.join(', ')}`);
  }

  const store = getCache();
  const trimmed = name.trim();
  if (store.clients.some((c) => c.name === trimmed)) {
    throw new Error(`Client with name "${trimmed}" already exists`);
  }

  const client_id = crypto.randomBytes(16).toString('hex');
  // No secret for PKCE-only clients
  const client_secret = token_endpoint_auth_method === 'none'
    ? null
    : crypto.randomBytes(32).toString('hex');
  const client_secret_hash = client_secret ? await hashSecret(client_secret) : null;

  const record = {
    id: crypto.randomUUID(),
    name: trimmed,
    client_id,
    client_secret_hash,
    token_endpoint_auth_method,
    redirect_uris,
    auto_registered,
    created_at: new Date().toISOString(),
    last_used_at: null,
  };
  store.clients.push(record);
  flush();
  return { ...publicClient(record), client_secret };
}

export function revokeClient(id) {
  const store = getCache();
  const idx = store.clients.findIndex((c) => c.id === id);
  if (idx === -1) return false;
  store.clients.splice(idx, 1);
  flush();
  return true;
}

/**
 * Validate that the request to /oauth/token is from a known client AND that the
 * presented credential (secret OR PKCE verifier) matches what's stored.
 *
 * For PKCE-only clients (token_endpoint_auth_method='none'), pass code_verifier
 * and the pending code's code_challenge (looked up via consumeCode).
 * For confidential clients, pass client_secret.
 */
export async function authenticateClient({ client_id, client_secret, code_verifier, code_challenge, code_challenge_method }) {
  const client = getClientByClientId(client_id);
  if (!client) return { ok: false, error: 'unknown_client' };

  if (client.token_endpoint_auth_method === 'none') {
    // PKCE required
    if (!code_verifier || !code_challenge) {
      return { ok: false, error: 'pkce_required' };
    }
    if (code_challenge_method !== 'S256') {
      return { ok: false, error: 'unsupported_challenge_method' };
    }
    const computed = crypto.createHash('sha256').update(code_verifier).digest('base64url');
    if (computed !== code_challenge) {
      return { ok: false, error: 'pkce_mismatch' };
    }
    touchClient(client);
    return { ok: true, client };
  }

  // client_secret_basic OR client_secret_post: both supply the secret
  if (!client_secret) {
    return { ok: false, error: 'client_secret_required' };
  }
  const matches = await verifySecret(client_secret, client.client_secret_hash);
  if (!matches) return { ok: false, error: 'invalid_client_secret' };
  touchClient(client);
  return { ok: true, client };
}

function touchClient(client) {
  client.last_used_at = new Date().toISOString();
  flush();
}

// === Auth codes (in-memory) ===

export function issueCode({ client_id, redirect_uri, scope, state, code_challenge, code_challenge_method }) {
  const code = crypto.randomBytes(32).toString('base64url');
  PENDING_CODES.set(code, {
    client_id,
    redirect_uri,
    scope,
    state,
    code_challenge: code_challenge || null,
    code_challenge_method: code_challenge_method || null,
    expires_at: Date.now() + CODE_TTL_MS,
  });
  return code;
}

/**
 * One-time use: consume the code (delete on read) and return its metadata.
 * Returns null if not found or expired.
 */
export function consumeCode(code) {
  const entry = PENDING_CODES.get(code);
  if (!entry) return null;
  PENDING_CODES.delete(code);
  if (entry.expires_at < Date.now()) return null;
  return entry;
}
