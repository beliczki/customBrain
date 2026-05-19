// OAuth 2.0 endpoints for the MCP server (since 0.25.0).
// Implements:
//   - Discovery (RFC 8414) at /.well-known/oauth-authorization-server
//   - Authorization endpoint (consent page + code issuance) at /oauth/authorize
//   - Token endpoint at /oauth/token (PKCE OR client_secret_basic OR client_secret_post)
//   - Dynamic Client Registration (RFC 7591) at /oauth/register
//
// See tasks/todo.md (0.25.0 OAuth) for the design rationale.

import { Router } from 'express';
import { URL } from 'node:url';
import {
  listClients,
  getClientByClientId,
  createClient,
  revokeClient,
  authenticateClient,
  issueCode,
  consumeCode,
} from '../oauth-store.js';
import { createToken as createMcpToken } from '../mcp-token-store.js';
import { isBlocked as rateLimitCheck, recordSuccess as rateLimitOk, recordFailure as rateLimitBad } from '../rate-limiter.js';

const router = Router();

const ISSUER = process.env.OAUTH_ISSUER || 'https://brain.beliczki.hu';
const TOKEN_TTL_SECONDS = 365 * 24 * 60 * 60; // 1 year, see todo.md scope
const SCOPES_SUPPORTED = ['full'];

// ─── Discovery ──────────────────────────────────────────────────────────
// RFC 8414. Public endpoint, no auth required.
router.get('/.well-known/oauth-authorization-server', (req, res) => {
  res.json({
    issuer: ISSUER,
    authorization_endpoint: `${ISSUER}/oauth/authorize`,
    token_endpoint: `${ISSUER}/oauth/token`,
    registration_endpoint: `${ISSUER}/oauth/register`,
    scopes_supported: SCOPES_SUPPORTED,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_basic', 'client_secret_post'],
    code_challenge_methods_supported: ['S256'],
    service_documentation: `${ISSUER}/`,
  });
});

// ─── Authorization endpoint (GET = consent page) ────────────────────────
router.get('/oauth/authorize', (req, res) => {
  const { client_id, redirect_uri, response_type, state, scope, code_challenge, code_challenge_method } = req.query;

  const errors = [];
  if (response_type !== 'code') errors.push('response_type must be "code"');
  if (!client_id) errors.push('client_id required');
  if (!redirect_uri) errors.push('redirect_uri required');

  const client = client_id ? getClientByClientId(client_id) : null;
  if (client_id && !client) errors.push('unknown client_id');
  if (client && !client.redirect_uris.includes(redirect_uri)) {
    errors.push('redirect_uri not registered for this client');
  }
  if (client?.token_endpoint_auth_method === 'none') {
    if (!code_challenge) errors.push('code_challenge required for public client');
    if (code_challenge_method !== 'S256') errors.push('code_challenge_method must be S256');
  }

  if (errors.length > 0) {
    return res.status(400).send(consentErrorPage(errors));
  }
  res.send(consentPage({ client, redirect_uri, state, scope, code_challenge, code_challenge_method }));
});

// ─── Authorization endpoint (POST = process consent) ────────────────────
router.post('/oauth/authorize', (req, res) => {
  const { client_id, redirect_uri, state, scope, code_challenge, code_challenge_method, decision } = req.body || {};

  // Re-validate everything (the GET form is unauthenticated; never trust it)
  const client = getClientByClientId(client_id);
  if (!client) return res.status(400).send(consentErrorPage(['unknown client_id']));
  if (!client.redirect_uris.includes(redirect_uri)) {
    return res.status(400).send(consentErrorPage(['redirect_uri not registered for this client']));
  }
  if (decision !== 'approve') {
    // User denied — redirect back with error per OAuth spec
    const url = new URL(redirect_uri);
    url.searchParams.set('error', 'access_denied');
    if (state) url.searchParams.set('state', state);
    return res.redirect(url.toString());
  }

  // Single-user "user authentication" via OAUTH_USER + OAUTH_PASSWORD (Settings UI).
  // Kept separate from UI_SECRET on purpose: leak of an OAuth credential must
  // not compromise the UI master, and vice versa.

  // Rate limit also applied here (the global auth middleware bypasses /oauth/*
  // so the consent POST would otherwise be brute-forceable). Same ladder, same
  // per-IP state — coherent with /stats etc. (since 0.25.0).
  const ip = req.ip;
  const limit = rateLimitCheck(ip);
  if (limit.blocked) {
    return res.status(429).send(consentErrorPage([
      `Too many failed auth attempts. Try again in ${limit.retry_after_seconds}s.`,
    ]));
  }

  const { oauth_user, oauth_password } = req.body || {};
  if (!process.env.OAUTH_USER || !process.env.OAUTH_PASSWORD) {
    return res.status(503).send(consentErrorPage([
      'OAuth is not configured. Set OAUTH_USER and OAUTH_PASSWORD in Settings → OAuth before authorizing connectors.',
    ]));
  }
  if (oauth_user !== process.env.OAUTH_USER || oauth_password !== process.env.OAUTH_PASSWORD) {
    rateLimitBad(ip);
    return res.status(401).send(consentErrorPage(['Wrong username or password.']));
  }
  rateLimitOk(ip);

  // All checks pass — issue auth code, redirect to client
  const code = issueCode({
    client_id,
    redirect_uri,
    scope: scope || 'full',
    state,
    code_challenge: code_challenge || null,
    code_challenge_method: code_challenge_method || null,
  });
  const url = new URL(redirect_uri);
  url.searchParams.set('code', code);
  if (state) url.searchParams.set('state', state);
  res.redirect(url.toString());
});

// ─── Token endpoint ─────────────────────────────────────────────────────
router.post('/oauth/token', async (req, res) => {
  // Extract client credentials from Basic header OR body (or none for PKCE)
  let client_id;
  let client_secret;
  const basic = req.headers.authorization;
  if (basic && basic.startsWith('Basic ')) {
    try {
      const decoded = Buffer.from(basic.slice(6), 'base64').toString('utf-8');
      const idx = decoded.indexOf(':');
      if (idx > 0) {
        client_id = decodeURIComponent(decoded.slice(0, idx));
        client_secret = decodeURIComponent(decoded.slice(idx + 1));
      }
    } catch { /* fall through to body */ }
  }
  if (!client_id && req.body?.client_id) client_id = req.body.client_id;
  if (!client_secret && req.body?.client_secret) client_secret = req.body.client_secret;

  const { grant_type, code, redirect_uri, code_verifier } = req.body || {};
  if (grant_type !== 'authorization_code') {
    return res.status(400).json({ error: 'unsupported_grant_type' });
  }
  if (!code) return res.status(400).json({ error: 'invalid_request', error_description: 'code required' });
  if (!client_id) return res.status(400).json({ error: 'invalid_request', error_description: 'client_id required' });

  // Consume the code (one-time use)
  const codeEntry = consumeCode(code);
  if (!codeEntry) {
    return res.status(400).json({ error: 'invalid_grant', error_description: 'code expired or already used' });
  }
  if (codeEntry.client_id !== client_id) {
    return res.status(400).json({ error: 'invalid_grant', error_description: 'code was issued to a different client' });
  }
  if (codeEntry.redirect_uri !== redirect_uri) {
    return res.status(400).json({ error: 'invalid_grant', error_description: 'redirect_uri mismatch' });
  }

  // Authenticate the client
  const auth = await authenticateClient({
    client_id,
    client_secret,
    code_verifier,
    code_challenge: codeEntry.code_challenge,
    code_challenge_method: codeEntry.code_challenge_method,
  });
  if (!auth.ok) {
    return res.status(401).json({ error: 'invalid_client', error_description: auth.error });
  }

  // Mint an access token via the existing mcp-token-store (transparently flows
  // through to /mcp/http's bearer validation).
  const expires_at = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString();
  const tokenName = `OAuth: ${auth.client.name}`;
  const tokenRecord = createMcpToken(tokenName, {
    oauth_client_id: auth.client.client_id,
    expires_at,
  });

  res.json({
    access_token: tokenRecord.token,
    token_type: 'Bearer',
    expires_in: TOKEN_TTL_SECONDS,
    scope: codeEntry.scope,
  });
});

// ─── Dynamic Client Registration (RFC 7591) ─────────────────────────────
// Public endpoint per spec — anyone can register a client. Returns the
// client_id (+ client_secret if confidential). For PKCE-only clients
// (token_endpoint_auth_method='none'), no secret is returned.
router.post('/oauth/register', async (req, res) => {
  try {
    const body = req.body || {};
    const name = body.client_name || 'Auto-registered client';
    const redirect_uris = body.redirect_uris;
    // Default to PKCE-only (most modern clients including Claude Desktop)
    const auth_method = body.token_endpoint_auth_method || 'none';
    const grant_types = body.grant_types || ['authorization_code'];

    if (!grant_types.includes('authorization_code')) {
      return res.status(400).json({ error: 'invalid_client_metadata', error_description: 'grant_types must include authorization_code' });
    }

    const created = await createClient({
      name,
      redirect_uris,
      token_endpoint_auth_method: auth_method,
      auto_registered: true,
    });

    // RFC 7591 response shape
    const response = {
      client_id: created.client_id,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      token_endpoint_auth_method: auth_method,
      grant_types,
      response_types: ['code'],
      redirect_uris,
      client_name: name,
    };
    if (created.client_secret) {
      response.client_secret = created.client_secret;
      response.client_secret_expires_at = 0; // 0 = never expires
    }
    res.status(201).json(response);
  } catch (err) {
    res.status(400).json({ error: 'invalid_client_metadata', error_description: err.message });
  }
});

// ─── Management API (master UI_SECRET only — for the Settings UI) ───────
router.get('/oauth/clients', (req, res) => {
  res.json({ clients: listClients() });
});

router.post('/oauth/clients', async (req, res) => {
  try {
    const created = await createClient({
      name: req.body?.name,
      redirect_uris: req.body?.redirect_uris,
      token_endpoint_auth_method: req.body?.token_endpoint_auth_method,
      client_id: req.body?.client_id || null,
      auto_registered: false,
    });
    res.status(201).json({ client: created });
  } catch (err) {
    const status = err.message.includes('already') ? 409 : 400;
    res.status(status).json({ error: err.message });
  }
});

router.delete('/oauth/clients/:id', (req, res) => {
  const ok = revokeClient(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

export default router;

// ─── Consent page (server-rendered HTML) ─────────────────────────────────
function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function consentPage({ client, redirect_uri, state, scope, code_challenge, code_challenge_method }) {
  return `<!DOCTYPE html>
<html lang="hu">
<head>
<meta charset="utf-8"/>
<title>customBrain — OAuth engedélyezés</title>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, system-ui, sans-serif; margin: 0; padding: 0;
         min-height: 100vh; display: flex; align-items: center; justify-content: center;
         background: #0d1117; color: #c9d1d9; }
  .card { background: #161b22; border: 1px solid #30363d; padding: 32px;
          max-width: 480px; width: 90%; border-radius: 6px; }
  h1 { font-size: 18px; margin: 0 0 16px; }
  .client { background: #0d1117; border: 1px solid #30363d; padding: 12px 16px;
            border-radius: 4px; margin-bottom: 16px; }
  .client__name { font-weight: 600; color: #f0f6fc; }
  .client__detail { font-size: 12px; color: #8b949e; margin-top: 4px; word-break: break-all; }
  .scope { display: inline-block; padding: 2px 8px; background: #1f2937;
           border-radius: 12px; font-size: 11px; color: #d1d5db; margin-top: 8px; }
  label { display: block; font-size: 13px; margin-bottom: 6px; color: #c9d1d9; }
  input[type=password] { width: 100%; padding: 10px; background: #0d1117;
                         border: 1px solid #30363d; color: #c9d1d9; font-size: 14px;
                         border-radius: 4px; box-sizing: border-box; }
  .row { display: flex; gap: 8px; margin-top: 20px; }
  button { flex: 1; padding: 10px; font-size: 14px; cursor: pointer; border: 0;
           border-radius: 4px; font-weight: 600; }
  .approve { background: #238636; color: white; }
  .approve:hover { background: #2ea043; }
  .deny { background: transparent; color: #c9d1d9; border: 1px solid #30363d; }
  .deny:hover { background: #21262d; }
  .note { font-size: 11px; color: #8b949e; margin-top: 16px; }
</style>
</head>
<body>
<div class="card">
  <h1>OAuth engedélyezés</h1>
  <div class="client">
    <div class="client__name">${escapeHtml(client.name)}</div>
    <div class="client__detail">redirect: ${escapeHtml(redirect_uri)}</div>
    <div class="client__detail">client_id: ${escapeHtml(client.client_id)}</div>
    <span class="scope">${escapeHtml(scope || 'full')}</span>
  </div>
  <form method="POST" action="/oauth/authorize">
    <input type="hidden" name="client_id" value="${escapeHtml(client.client_id)}"/>
    <input type="hidden" name="redirect_uri" value="${escapeHtml(redirect_uri)}"/>
    <input type="hidden" name="state" value="${escapeHtml(state || '')}"/>
    <input type="hidden" name="scope" value="${escapeHtml(scope || 'full')}"/>
    <input type="hidden" name="code_challenge" value="${escapeHtml(code_challenge || '')}"/>
    <input type="hidden" name="code_challenge_method" value="${escapeHtml(code_challenge_method || '')}"/>
    <label for="oauth_user">Felhasználónév</label>
    <input type="text" id="oauth_user" name="oauth_user" autocomplete="username" autofocus required style="width: 100%; padding: 10px; background: #0d1117; border: 1px solid #30363d; color: #c9d1d9; font-size: 14px; border-radius: 4px; box-sizing: border-box; margin-bottom: 12px;"/>
    <label for="oauth_password">Jelszó</label>
    <input type="password" id="oauth_password" name="oauth_password" autocomplete="current-password" required/>
    <div class="row">
      <button type="submit" name="decision" value="deny" class="deny">Mégse</button>
      <button type="submit" name="decision" value="approve" class="approve">Engedélyezem</button>
    </div>
  </form>
  <p class="note">A jóváhagyás után a kliens egy 1-évre szóló access tokent kap, ami a Settings → MCP tokens listában is megjelenik. Bármikor revokálható onnan.</p>
</div>
</body>
</html>`;
}

function consentErrorPage(errors) {
  return `<!DOCTYPE html>
<html lang="hu">
<head>
<meta charset="utf-8"/>
<title>OAuth hiba</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; background: #0d1117;
         color: #c9d1d9; display: flex; align-items: center; justify-content: center;
         min-height: 100vh; margin: 0; }
  .card { background: #161b22; border: 1px solid #30363d; padding: 32px;
          max-width: 480px; width: 90%; border-radius: 6px; }
  h1 { color: #f85149; font-size: 18px; margin: 0 0 16px; }
  ul { margin: 0 0 20px; padding-left: 20px; }
  li { margin: 4px 0; }
  .row { display: flex; gap: 8px; }
  button, a.btn { flex: 1; padding: 10px; font-size: 14px; cursor: pointer; border: 0;
                  border-radius: 4px; font-weight: 600; text-align: center;
                  text-decoration: none; display: inline-block; color: #c9d1d9;
                  background: transparent; border: 1px solid #30363d; box-sizing: border-box; }
  button:hover, a.btn:hover { background: #21262d; }
  .primary { background: #238636; color: white; border: 0; }
  .primary:hover { background: #2ea043; }
</style>
</head>
<body>
<div class="card">
  <h1>OAuth kérés visszautasítva</h1>
  <ul>${errors.map((e) => `<li>${escapeHtml(e)}</li>`).join('')}</ul>
  <div class="row">
    <button type="button" onclick="if(history.length>1){history.back()}else{window.close()}">Vissza</button>
    <button type="button" class="primary" onclick="window.close()">Bezárás</button>
  </div>
</div>
</body>
</html>`;
}
