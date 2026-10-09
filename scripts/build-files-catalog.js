// Build state/files-catalog.json: document-type files on My Drive plus the
// real attachments of brain/captured Gmail threads. Read-only against Drive,
// Gmail and Qdrant; writes only the catalog file, and only when every source
// was read completely — a partial catalog would be taken as the truth.
//
//   node scripts/build-files-catalog.js
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFile, rename } from 'node:fs/promises';

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env') });
import { applySettingsToEnv } from '../server/config.js';
applySettingsToEnv();

import { getDrive, getGmail, getVaultContext } from '../server/drive-context.js';
import { findBySourceIdRaw } from '../server/qdrant.js';
import { resolveAliases } from '../server/names.js';
import { getHeader } from '../agent/tools/gmail.js';
import { CATALOG_PATH, DOCUMENT_MIMES, fileKind, variantKey } from '../server/files-catalog.js';

// Path segments whose whole subtree stays out: archives, the vault itself
// (already indexed as dossiers/thoughts), notebooks.
const EXCLUDED_SEGMENT = /^(_?archive\b.*|_customBrain|Colab Notebooks)$/i;

async function listAll(drive, q, fields) {
  const out = [];
  let pageToken = null;
  do {
    const res = await drive.files.list({
      q,
      fields: `nextPageToken, files(${fields})`,
      pageSize: 1000,
      ...(pageToken ? { pageToken } : {}),
    });
    out.push(...res.data.files);
    pageToken = res.data.nextPageToken || null;
  } while (pageToken);
  return out;
}

async function driveRecords(projectOf) {
  const drive = getDrive();
  const folders = await listAll(drive, "mimeType = 'application/vnd.google-apps.folder' and trashed = false and 'me' in owners", 'id, name, parents');
  const byId = new Map(folders.map((f) => [f.id, f]));
  const pathCache = new Map();
  const pathOf = (id) => {
    if (pathCache.has(id)) return pathCache.get(id);
    const f = byId.get(id);
    // A parent that is not one of my folders is the My Drive root (or a
    // folder someone else owns): the path starts there.
    const p = f ? [...pathOf(f.parents?.[0]), f.name] : [];
    pathCache.set(id, p);
    return p;
  };

  const mimeClause = DOCUMENT_MIMES.map((m) => `mimeType = '${m}'`).join(' or ');
  const files = await listAll(drive, `(${mimeClause}) and trashed = false and 'me' in owners`, 'id, name, mimeType, size, modifiedTime, parents, webViewLink, md5Checksum');
  console.log(`drive: ${folders.length} folders, ${files.length} document files`);

  const records = [];
  for (const f of files) {
    const segments = pathOf(f.parents?.[0]);
    if (segments.some((s) => EXCLUDED_SEGMENT.test(s))) continue;
    records.push({
      id: `drive:${f.id}`,
      source: 'drive',
      name: f.name,
      kind: fileKind(f.mimeType, f.name),
      mime: f.mimeType,
      size: f.size ? Number(f.size) : null, // Google-native files have no size
      modified: f.modifiedTime,
      path: segments.join('/'),
      link: f.webViewLink,
      projects: segments[0] === 'Data' && segments[1] ? projectOf(segments[1]) : [],
      direction: null,
      from: null,
      thread_id: null,
      md5: f.md5Checksum || null,
      variant_group: variantKey(f.name),
    });
  }
  return records;
}

// Every part with a filename and an attachment body. Signature images and other
// inline parts drop out at the document-kind filter, not here: Outlook sets
// Content-ID on real PDF attachments too, so an "inline" test would lose them.
function attachmentParts(part, out = []) {
  if (part.filename && part.body.attachmentId) out.push(part);
  for (const p of part.parts || []) attachmentParts(p, out);
  return out;
}

async function gmailRecords() {
  const gmail = getGmail();
  const capturedName = process.env.GMAIL_CAPTURED_LABEL || 'brain/captured';
  const labels = (await gmail.users.labels.list({ userId: 'me' })).data.labels;
  const captured = labels.find((l) => l.name === capturedName);
  if (!captured) throw new Error(`Gmail label "${capturedName}" not found`);
  const me = (await gmail.users.getProfile({ userId: 'me' })).data.emailAddress.toLowerCase();

  const threadIds = [];
  let pageToken = null;
  do {
    const res = await gmail.users.threads.list({ userId: 'me', labelIds: [captured.id], maxResults: 500, ...(pageToken ? { pageToken } : {}) });
    threadIds.push(...(res.data.threads || []).map((t) => t.id));
    pageToken = res.data.nextPageToken || null;
  } while (pageToken);
  console.log(`gmail: ${threadIds.length} ${capturedName} threads`);

  const records = [];
  // Gmail's per-user quota here is 6000 query-cost units per minute
  // (totalQueryCostPerMinutePerUser, read off the 403 on 2026-10-09), shared
  // with the 10-minute intake cron. Five parallel full-thread reads over the
  // 181 threads exhausted it, so threads are read one at a time at a fixed
  // pace that leaves the cron its share. No retry: a quota error still aborts
  // the run before anything is written.
  const THREAD_INTERVAL_MS = 1500;
  for (const threadId of threadIds) {
    const started = Date.now();
    const [thread, thought] = await Promise.all([
      gmail.users.threads.get({ userId: 'me', id: threadId, format: 'full', fields: 'messages(id,internalDate,payload)' }),
      findBySourceIdRaw('gmail', threadId),
    ]);
    for (const msg of thread.data.messages) {
      const from = getHeader(msg.payload.headers, 'From');
      for (const part of attachmentParts(msg.payload)) {
        const kind = fileKind(part.mimeType, part.filename);
        if (!kind) continue;
        records.push({
          id: `gmail:${msg.id}:${part.partId}`,
          source: 'gmail',
          name: part.filename,
          kind,
          mime: part.mimeType,
          size: part.body.size,
          modified: new Date(Number(msg.internalDate)).toISOString(),
          path: '',
          link: `https://mail.google.com/mail/u/0/#all/${threadId}`,
          // A captured thread normally has its thought; if it was deleted
          // from the brain, the attachment is still catalogued, unattributed.
          projects: thought ? thought.projects || [] : [],
          direction: from.toLowerCase().includes(me) ? 'delivered' : 'received',
          from,
          thread_id: threadId,
          md5: null,
          variant_group: variantKey(part.filename),
        });
      }
    }
    const wait = THREAD_INTERVAL_MS - (Date.now() - started);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }
  return records;
}

const vault = await getVaultContext();
// getVaultContext returns empty lists on failure; an empty project list here
// would silently null every project in the catalog.
if (!vault.projects.length) throw new Error('Vault context has no projects — refusing to build a catalog without project resolution');
const projectSet = new Set(vault.projects);
const projectOf = (folder) => {
  const [resolved] = resolveAliases([folder], vault.projectAliases, vault.projects);
  return projectSet.has(resolved) ? [resolved] : [];
};

const records = [...await driveRecords(projectOf), ...await gmailRecords()];
const tally = (values) => values.reduce((acc, v) => ({ ...acc, [v]: (acc[v] || 0) + 1 }), {});
const catalog = {
  generated_at: new Date().toISOString(),
  counts: {
    total: records.length,
    by_source: tally(records.map((r) => r.source)),
    by_kind: tally(records.map((r) => r.kind)),
    by_project: tally(records.flatMap((r) => (r.projects.length ? r.projects : ['(none)']))),
  },
  records,
};
const tmp = `${CATALOG_PATH}.tmp`;
await writeFile(tmp, JSON.stringify(catalog));
await rename(tmp, CATALOG_PATH);
console.log(JSON.stringify(catalog.counts, null, 2));
console.log(`written: ${CATALOG_PATH}`);
process.exit(0);
