// Commitment layer (0.53.0) — see docs/commitments-terv-2026-10-10.md.
//
// Two tiers. A thought's `action_items` are CANDIDATES: Haiku extracts them at
// capture, they repeat across thoughts, carry no status, and a Gmail refresh
// rewrites them — so a status pinned to them cannot survive. A COMMITMENT is a
// separate point in its own collection: one owner, a status with history, and
// at least one direct source with a verbatim quote.
//
// No server-side LLM here. The calling session's agent turns candidates into
// commitments (dedup, owner, kind, due) and Robi approves; this module only
// lists and stores. `expired` is derived on read from event_ref, not written
// by a cron.

import { QdrantClient } from '@qdrant/js-client-rest';
import crypto from 'node:crypto';
import { COMMITMENTS } from './collections.js';
import { scrollFilteredRaw, updatePayload } from './qdrant.js';
import { embedText } from './embeddings.js';
import { sparseEncodeDoc } from './sparse.js';

const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL || 'http://localhost:6333',
});

export const STATUSES = ['open', 'waiting', 'done', 'dropped', 'expired'];
export const KINDS = ['penz', 'jog', 'ugyfel', 'belso'];
export const SOURCE_TYPES = ['gmail', 'fireflies', 'calendar', 'repo', 'manual', 'session'];
// List order inside the same urgency band: money and legal before client work
// before internal — the top of the manual pilot list was exactly these.
const KIND_RANK = { penz: 0, jog: 1, ugyfel: 2, belso: 3 };

async function scrollAll(filter) {
  const all = [];
  let offset;
  while (true) {
    const batch = await qdrant.scroll(COMMITMENTS, { limit: 256, with_payload: true, filter, offset });
    all.push(...batch.points);
    if (!batch.next_page_offset) break;
    offset = batch.next_page_offset;
  }
  return all.map((p) => ({ id: p.id, ...p.payload }));
}

// Open + its event has ended → expired. Read-time only; save_commitments can
// make it permanent with by='rule'.
function effectiveStatus(c, now) {
  if (c.status === 'open' && c.event_ref?.end && new Date(c.event_ref.end) < now) return 'expired';
  return c.status;
}

function urgencyCompare(a, b) {
  // Dated items first, earliest due first; undated last. Then by kind.
  if (a.due && b.due && a.due !== b.due) return a.due.localeCompare(b.due);
  if (a.due && !b.due) return -1;
  if (!a.due && b.due) return 1;
  return (KIND_RANK[a.kind] ?? 9) - (KIND_RANK[b.kind] ?? 9);
}

export async function listCommitments({ status, owner, project, kind, due_before, limit = 50, offset = 0 } = {}) {
  const must = [];
  if (owner) must.push({ key: 'owner', match: { value: owner } });
  if (kind) must.push({ key: 'kind', match: { value: kind } });
  const rows = await scrollAll(must.length ? { must } : undefined);

  const now = new Date();
  const projectLc = project?.toLowerCase();
  const matches = rows
    .map((c) => ({ ...c, status: effectiveStatus(c, now), stored_status: c.status }))
    .filter((c) => !status || c.status === status)
    .filter((c) => !projectLc || (c.projects || []).some((p) => p.toLowerCase().includes(projectLc)))
    .filter((c) => !due_before || (c.due && c.due <= due_before))
    .map((c) => ({ ...c, overdue: !!c.due && ['open', 'waiting'].includes(c.status) && new Date(c.due) < now }))
    .sort(urgencyCompare);

  const page = matches.slice(offset, offset + limit);
  return {
    total: matches.length,
    returned: page.length,
    next_offset: offset + limit < matches.length ? offset + limit : null,
    commitments: page,
  };
}

/**
 * Thoughts whose action_items nobody has turned into commitments yet: never
 * reviewed, or refreshed (updated_at) after the last review — a Gmail refresh
 * rewrites action_items, so its new candidates need a fresh look.
 */
export async function listCommitmentCandidates({ since, limit = 20, offset = 0 } = {}) {
  const filter = {
    must_not: [
      { key: 'kind', match: { value: 'chunk' } },
      { key: 'source', match: { value: 'vault' } },
    ],
  };
  if (since) filter.must = [{ key: 'effective_date', range: { gte: since } }];

  const thoughts = await scrollFilteredRaw(filter);
  const pending = thoughts
    .filter((t) => (t.action_items || []).length > 0)
    .filter((t) => !t.candidates_reviewed_at || (t.updated_at && t.updated_at > t.candidates_reviewed_at))
    .sort((a, b) => String(a.effective_date || a.created_at).localeCompare(String(b.effective_date || b.created_at)));

  const page = pending.slice(offset, offset + limit).map((t) => ({
    thought_id: t.id,
    title: t.title,
    source: t.source,
    source_id: t.source_id ?? null,
    type: t.type,
    effective_date: t.effective_date || t.created_at,
    projects: t.projects || [],
    people: t.people || [],
    action_items: t.action_items,
  }));

  // The agent dedups against what already exists, so hand it the live list.
  const existing = await listCommitments({ limit: 500 });
  const live = existing.commitments
    .filter((c) => ['open', 'waiting'].includes(c.status))
    .map((c) => ({ id: c.id, title: c.title, owner: c.owner, due: c.due ?? null, status: c.status }));

  return {
    total: pending.length,
    returned: page.length,
    next_offset: offset + limit < pending.length ? offset + limit : null,
    candidates: page,
    live_commitments: live,
  };
}

function validate(c) {
  const errors = [];
  if (!c.title) errors.push('title required');
  if (!c.owner) errors.push('owner required');
  if (!STATUSES.includes(c.status)) errors.push(`status must be one of ${STATUSES.join('|')}`);
  if (!KINDS.includes(c.kind)) errors.push(`kind must be one of ${KINDS.join('|')}`);
  if (!Array.isArray(c.sources) || c.sources.length === 0) errors.push('at least one source required');
  for (const s of c.sources || []) {
    if (!SOURCE_TYPES.includes(s.source)) errors.push(`source.source must be one of ${SOURCE_TYPES.join('|')}`);
    if (!s.ref) errors.push('source.ref required');
    if (!s.quote) errors.push('source.quote required (verbatim from the source)');
  }
  return errors;
}

function appendUnique(existing = [], added = [], key) {
  const seen = new Set(existing.map(key));
  return [...existing, ...added.filter((x) => !seen.has(key(x)))];
}

/**
 * Batch write. Each item without `id` creates; with `id` merges into the stored
 * commitment. A status change appends to status_history with `by` and
 * `evidence`. `reviewed_thought_ids` stamps candidates_reviewed_at on the
 * thoughts whose action_items this batch accounted for.
 */
export async function saveCommitments({ commitments = [], reviewed_thought_ids = [] }) {
  const now = new Date().toISOString();
  const results = [];

  for (const input of commitments) {
    const { id, by = 'agent', evidence = null, ...fields } = input;
    let stored = null;
    if (id) {
      const found = await qdrant.retrieve(COMMITMENTS, { ids: [id], with_payload: true });
      if (!found.length) { results.push({ id, ok: false, errors: ['not found'] }); continue; }
      stored = found[0].payload;
    }

    const merged = {
      ...(stored || { status: 'open', created_at: now, status_history: [], candidate_refs: [], sources: [] }),
      ...fields,
    };
    // Merging a new candidate into an existing commitment is the dedup path, so
    // sources and candidate_refs accumulate instead of being replaced.
    if (stored) {
      merged.sources = appendUnique(stored.sources, fields.sources, (s) => `${s.source}|${s.ref}|${s.quote}`);
      merged.candidate_refs = appendUnique(stored.candidate_refs, fields.candidate_refs, (r) => `${r.thought_id}|${r.text}`);
    }
    const errors = validate(merged);
    if (errors.length) { results.push({ id: id ?? null, title: merged.title, ok: false, errors }); continue; }

    if (!stored || stored.status !== merged.status) {
      merged.status_history = [...(stored?.status_history || []), { status: merged.status, at: now, by, evidence }];
    }
    merged.updated_at = now;
    merged.verified_at = now;

    const embedSource = `${merged.title}\n${merged.sources[0].quote}`;
    const dense = await embedText(embedSource, 'RETRIEVAL_DOCUMENT');
    const pointId = id || crypto.randomUUID();
    await qdrant.upsert(COMMITMENTS, {
      points: [{ id: pointId, vector: { dense, bm25: sparseEncodeDoc(embedSource) }, payload: merged }],
    });
    results.push({ id: pointId, title: merged.title, status: merged.status, ok: true, created: !stored });
  }

  for (const thoughtId of reviewed_thought_ids) {
    await updatePayload(thoughtId, { candidates_reviewed_at: now });
  }

  return {
    saved: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    reviewed_thoughts: reviewed_thought_ids.length,
    results,
  };
}
