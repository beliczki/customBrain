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
