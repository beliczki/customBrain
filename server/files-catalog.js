import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { stripAccents } from './names.js';

// Files catalog (0.51.0): one JSON of document-type files on Drive and in the
// attachments of brain/captured Gmail threads — name, where it lives, project,
// direction. Metadata only: no content extraction, no embeddings. Written by
// scripts/build-files-catalog.js, read by the find_files MCP tool.
export const CATALOG_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'state', 'files-catalog.json');

const MIME_KIND = {
  'application/vnd.google-apps.presentation': 'presentation',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'presentation',
  'application/vnd.ms-powerpoint': 'presentation',
  'application/vnd.google-apps.document': 'document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
  'application/msword': 'document',
  'application/vnd.google-apps.spreadsheet': 'spreadsheet',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'spreadsheet',
  'application/vnd.ms-excel': 'spreadsheet',
  'application/pdf': 'pdf',
  'text/markdown': 'markdown',
  'text/x-markdown': 'markdown',
};
export const DOCUMENT_MIMES = Object.keys(MIME_KIND);

// Gmail often labels attachments application/octet-stream, so there the
// extension decides.
const EXT_KIND = {
  pptx: 'presentation', ppt: 'presentation',
  docx: 'document', doc: 'document',
  xlsx: 'spreadsheet', xls: 'spreadsheet',
  pdf: 'pdf', md: 'markdown',
};

export function fileKind(mime, name) {
  if (MIME_KIND[mime]) return MIME_KIND[mime];
  const ext = String(name).toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  return EXT_KIND[ext] || null;
}

// Copies and re-exports of one document share a key: "Copy of X - 13 June,
// 11:29.xlsx", "X.xlsx.xlsx", "X.md.docx" and "X (1).xlsx" all group with X.
export function variantKey(name) {
  let s = String(name);
  while (/\.(pptx?|docx?|xlsx?|pdf|md)$/i.test(s)) s = s.replace(/\.[a-z]+$/i, '');
  while (/^copy of /i.test(s)) s = s.replace(/^copy of /i, '');
  s = s.replace(/ - \d{1,2} [A-Za-z]+, \d{1,2}:\d{2}$/, '').replace(/\s*\(\d+\)$/, '');
  return stripAccents(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

const norm = (s) => stripAccents(String(s || '')).toLowerCase();

// Same curve as search's applyTimeDecay (server/routes/search.js): older
// files rank lower but never reach zero — the past stays findable, it is just
// not the most probable target of a query.
const HALF_LIFE_DAYS = 90;
// How well the query hits the file: exact name > name prefix > name substring
// > path only. Hand-set starting values; the autoresearch loop (ROADMAP) is
// where these and the half-life get calibrated per brain instance.
const MATCH_STRENGTH = { exact: 1, prefix: 0.8, name: 0.6, path: 0.3 };

function matchStrength(r, q) {
  const name = norm(r.name);
  if (variantKey(r.name) === variantKey(q) || name === q) return MATCH_STRENGTH.exact;
  if (name.startsWith(q)) return MATCH_STRENGTH.prefix;
  if (name.includes(q)) return MATCH_STRENGTH.name;
  return MATCH_STRENGTH.path;
}

/**
 * Filter the catalog and rank it: match strength × recency decay when there is
 * a query, recency alone otherwise. The catalog is a static snapshot and the
 * order is total (score desc, then id), so offset paging is stable.
 */
export async function findFiles({ query, project, source, kind, direction, thread_id, since, until, limit = 25, offset = 0 } = {}) {
  let catalog;
  try {
    catalog = JSON.parse(await readFile(CATALOG_PATH, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { error: 'Files catalog not built yet — run node scripts/build-files-catalog.js on the server' };
    }
    throw err;
  }
  const matches = catalog.records.filter((r) => {
    if (query && !norm(`${r.name} ${r.path}`).includes(norm(query))) return false;
    if (project && !r.projects.some((p) => norm(p).includes(norm(project)))) return false;
    if (source && r.source !== source) return false;
    if (kind && r.kind !== kind) return false;
    if (direction && r.direction !== direction) return false;
    if (thread_id && r.thread_id !== thread_id) return false;
    if (since && r.modified < since) return false;
    if (until && r.modified > until) return false;
    return true;
  });
  const now = Date.now();
  const q = query ? norm(query) : null;
  const ranked = matches.map((r) => {
    const ageDays = Math.max(0, Math.floor((now - new Date(r.modified).getTime()) / 86400000));
    const decay = 1 / (1 + ageDays / HALF_LIFE_DAYS);
    const score = (q ? matchStrength(r, q) : 1) * decay;
    return { ...r, score: Number(score.toFixed(4)), age_days: ageDays };
  });
  ranked.sort((a, b) => (b.score - a.score) || a.id.localeCompare(b.id));
  const page = ranked.slice(offset, offset + limit);
  return {
    generated_at: catalog.generated_at,
    total: matches.length,
    returned: page.length,
    next_offset: offset + page.length < matches.length ? offset + page.length : null,
    files: page,
  };
}
