const BASE = '';

function authHeaders() {
  const token = localStorage.getItem('capture_secret');
  return token ? { Authorization: `Bearer ${token}` } : {};
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
  return res.json();
}

export async function recent(limit = 10) {
  const res = await fetch(`${BASE}/recent?limit=${limit}`, {
    headers: authHeaders(),
  });
  return res.json();
}

export async function getThought(id) {
  const res = await fetch(`${BASE}/thoughts/${id}`, { headers: authHeaders() });
  if (res.status === 404) return null;
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
  return res.json();
}

export async function healthCheck() {
  const res = await fetch(`${BASE}/health-check`, { headers: authHeaders() });
  return res.json();
}

export async function agenda(days = 7) {
  const res = await fetch(`${BASE}/agenda?days=${days}`, { headers: authHeaders() });
  if (res.status === 404) return null;
  return res.json();
}

export async function agendaSync(days = 7) {
  const res = await fetch(`${BASE}/agenda/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ days }),
  });
  return res.json();
}

export async function getSettings(reveal = false) {
  const res = await fetch(`${BASE}/settings${reveal ? '?reveal=true' : ''}`, { headers: authHeaders() });
  return res.json();
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
