const BASE = '';

export async function capture(text, secret) {
  const res = await fetch(`${BASE}/capture`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ text }),
  });
  return res.json();
}

export async function search(q, limit = 5) {
  const res = await fetch(`${BASE}/search?q=${encodeURIComponent(q)}&limit=${limit}`);
  return res.json();
}

export async function recent(limit = 10) {
  const res = await fetch(`${BASE}/recent?limit=${limit}`);
  return res.json();
}

export async function deleteThought(id) {
  const res = await fetch(`${BASE}/thoughts/${id}`, { method: 'DELETE' });
  return res.json();
}

export async function stats() {
  const res = await fetch(`${BASE}/stats`);
  return res.json();
}

export async function exportToObsidian({ filter_topic, filter_days } = {}) {
  const res = await fetch(`${BASE}/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filter_topic, filter_days }),
  });
  return res.json();
}
