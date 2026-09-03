const BASE = '';

// localStorage key renamed from 'capture_secret' → 'ui_secret' in 0.24.0
// for parity with the env var rename. Old entries are NOT auto-migrated:
// stale tokens get re-prompted at App mount via the validation fetch in
// App.jsx, so a one-time re-login on first 0.24.0 load is the cutover UX.
function authHeaders() {
  const token = localStorage.getItem('ui_secret');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// A non-OK response still carries a JSON body — `{ error: … }` — and handing
// that back as data is how a 429 turned into "l.map is not a function" in
// Recent instead of a message on screen. Every fetcher whose result feeds
// rendering goes through this: parse on success, throw on anything else, and
// prefer the server's own message (the rate limiter's, for instance, says how
// many seconds are left) over a bare status code.
async function jsonOrThrow(res, label) {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || `${label} HTTP ${res.status}`);
  }
  return res.json();
}

export async function capture(text) {
  const res = await fetch(`${BASE}/capture`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify({ text }),
  });
  return res.json();
}

export async function search(q, limit = 5) {
  const res = await fetch(`${BASE}/search?q=${encodeURIComponent(q)}&limit=${limit}`, {
    headers: authHeaders(),
  });
  return jsonOrThrow(res, 'search');
}

export async function recent(limit = 10) {
  const res = await fetch(`${BASE}/recent?limit=${limit}`, {
    headers: authHeaders(),
  });
  return jsonOrThrow(res, 'recent');
}

export async function getThought(id) {
  const res = await fetch(`${BASE}/thoughts/${id}`, { headers: authHeaders() });
  if (res.status === 404) return null;
  return jsonOrThrow(res, 'thought');
}

export async function thoughtAnatomy(id) {
  const res = await fetch(`${BASE}/thoughts/${id}/anatomy`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`anatomy HTTP ${res.status}`);
  return res.json();
}

export async function searchExplain(q, id) {
  const res = await fetch(
    `${BASE}/search/explain?q=${encodeURIComponent(q)}&id=${encodeURIComponent(id)}`,
    { headers: authHeaders() }
  );
  if (!res.ok) throw new Error(`explain HTTP ${res.status}`);
  return res.json();
}

export async function deleteThought(id) {
  const res = await fetch(`${BASE}/thoughts/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  return res.json();
}

export async function stats() {
  const res = await fetch(`${BASE}/stats`, {
    headers: authHeaders(),
  });
  return jsonOrThrow(res, 'stats');
}

export async function getGraph() {
  const res = await fetch(`${BASE}/graph`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`graph HTTP ${res.status}`);
  return res.json();
}

export async function healthCheck() {
  const res = await fetch(`${BASE}/health-check`, { headers: authHeaders() });
  return jsonOrThrow(res, 'health-check');
}

export async function agenda(days = 7) {
  const res = await fetch(`${BASE}/agenda?days=${days}`, { headers: authHeaders() });
  if (res.status === 404) return null;
  return jsonOrThrow(res, 'agenda');
}

export async function agendaSync(days = 7) {
  const res = await fetch(`${BASE}/agenda/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ days }),
  });
  return jsonOrThrow(res, 'agenda sync');
}

export async function getSettings(reveal = false) {
  const res = await fetch(`${BASE}/settings${reveal ? '?reveal=true' : ''}`, { headers: authHeaders() });
  return jsonOrThrow(res, 'settings');
}

export async function saveSettings(partial) {
  const res = await fetch(`${BASE}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(partial),
  });
  return res.json();
}

export async function restartServer() {
  const res = await fetch(`${BASE}/settings/restart`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return res.json();
}

// Poll until server responds (used after restart to know when it's back).
export async function waitForServer(timeoutMs = 30000, intervalMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/stats`, { headers: authHeaders() });
      if (res.ok) return true;
    } catch { /* still down */ }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

export async function exportToObsidian({ filter_topic, filter_days } = {}, onLog) {
  const res = await fetch(`${BASE}/export`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify({ filter_topic, filter_days }),
  });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = JSON.parse(line.slice(6));
      if (data.type === 'log' && onLog) {
        onLog(data.line);
      } else if (data.type === 'result') {
        result = data;
      } else if (data.type === 'error') {
        throw new Error(data.error);
      }
    }
  }

  return result;
}

// === MCP tokens (named bearer tokens for /mcp/http) ===

export async function listMcpTokens({ revealId } = {}) {
  const qs = revealId ? `?reveal_id=${encodeURIComponent(revealId)}` : '';
  const res = await fetch(`${BASE}/mcp-tokens${qs}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Failed to list MCP tokens (HTTP ${res.status})`);
  return res.json();
}

export async function createMcpToken(name) {
  const res = await fetch(`${BASE}/mcp-tokens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ name }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export async function revokeMcpToken(id) {
  const res = await fetch(`${BASE}/mcp-tokens/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// === OAuth clients (Grok, Claude Desktop, any MCP connector that needs OAuth) ===

export async function listOAuthClients() {
  const res = await fetch(`${BASE}/oauth/clients`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Failed to list OAuth clients (HTTP ${res.status})`);
  return res.json();
}

export async function createOAuthClient({ name, redirect_uris, token_endpoint_auth_method, client_id }) {
  const res = await fetch(`${BASE}/oauth/clients`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ name, redirect_uris, token_endpoint_auth_method, client_id }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export async function revokeOAuthClient(id) {
  const res = await fetch(`${BASE}/oauth/clients/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}
