import { captureThought } from '../../server/routes/capture.js';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(__dirname, 'data', 'drafts.json');

function load() {
  if (!existsSync(DATA_FILE)) return { pending: [], approved: [], rejected: [] };
  return JSON.parse(readFileSync(DATA_FILE, 'utf-8'));
}

function save(data) {
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

export function listDrafts(status = 'pending') {
  const data = load();
  return data[status] || [];
}

export function saveDraft({ source, summary, original, metadata }) {
  const data = load();
  const draft = {
    id: randomUUID(),
    source,
    summary,
    original,
    metadata: metadata || {},
    created_at: new Date().toISOString(),
  };
  data.pending.push(draft);
  save(data);
  return draft;
}

export async function approveDraft(id) {
  const data = load();
  const idx = data.pending.findIndex((d) => d.id === id);
  if (idx === -1) return null;
  const [draft] = data.pending.splice(idx, 1);
  draft.approved_at = new Date().toISOString();

  // Auto-capture to brain
  const captureResult = await captureThought(draft.summary);
  draft.brain_id = captureResult.id;

  data.approved.push(draft);
  save(data);
  return { draft, captured: captureResult };
}

export function rejectDraft(id) {
  const data = load();
  const idx = data.pending.findIndex((d) => d.id === id);
  if (idx === -1) return null;
  const [draft] = data.pending.splice(idx, 1);
  draft.rejected_at = new Date().toISOString();
  data.rejected.push(draft);
  save(data);
  return draft;
}
