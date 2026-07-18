import crypto from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { embedText } from './embeddings.js';
import { sparseEncodeDoc } from './sparse.js';
import { fetchDossiers } from './drive-context.js';
import { upsertPoint, scrollFilteredRaw, deletePointsByIds } from './qdrant.js';
import { CHUNK_THRESHOLD } from './chunking.js';

/**
 * Dossier indexing (Option B). Makes the canonical People/Projects/Topics `.md`
 * dossiers retrievable by search_brain — today they are only read at capture
 * time for Haiku metadata and are invisible to search, so the richest curated
 * truth Robert maintains never surfaces.
 *
 * Each dossier becomes one Qdrant point (kind:'dossier') with a DETERMINISTIC id
 * derived from its path, so re-indexing a changed file OVERWRITES its point
 * (no duplicates) and deletion is targetable. A content-hash manifest gates
 * re-embedding so unchanged files are never needlessly re-embedded.
 *
 * Refresh triggers (all call reindexDossiers):
 *   - on-demand: POST /reindex + the reindex_dossiers MCP tool (call after an
 *     agent/human edits an .md)
 *   - scheduled: cron/export.js runs reindexDossiers({reconcile:true}) hourly
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_PATH = join(REPO_ROOT, 'state', 'dossier-index-manifest.json');

function loadManifest() {
  try {
    return JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

function saveManifest(m) {
  mkdirSync(dirname(MANIFEST_PATH), { recursive: true });
  writeFileSync(MANIFEST_PATH, JSON.stringify(m, null, 2));
}

// Deterministic UUID-shaped id from the dossier path so re-index overwrites the
// same point. Qdrant accepts UUID-format string ids.
function dossierPointId(path) {
  const h = crypto.createHash('md5').update(`dossier:${path}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/**
 * (Re)index canonical dossiers into Qdrant.
 *
 * @param {object} opts
 * @param {string[]} [opts.paths]  Only these dossier paths (e.g. ['Projects/Bizi']).
 * @param {string[]} [opts.types]  Only these types ('person'|'project'|'topic').
 * @param {boolean}  [opts.reconcile]  Force re-embed all in scope AND delete
 *                                     points for dossiers no longer on Drive.
 * @returns {{indexed:number, skipped:number, deleted:number, flagged:Array, total:number}}
 */
export async function reindexDossiers({ paths = null, types = null, reconcile = false } = {}) {
  const dossiers = await fetchDossiers();
  const manifest = loadManifest();
  const inScope = dossiers.filter((d) =>
    (!types || types.includes(d.type)) &&
    (!paths || paths.includes(d.path)));

  const flagged = [];
  let indexed = 0;
  let skipped = 0;

  for (const d of inScope) {
    // Flag (don't fail) project dossiers larger than the chunk threshold —
    // verbatim indexing is fine, but very long files may want chunking later.
    if (d.type === 'project' && d.body.length > CHUNK_THRESHOLD) {
      flagged.push({ path: d.path, length: d.body.length });
    }

    const prev = manifest[d.path];
    if (!reconcile && prev && prev.hash === d.hash) {
      skipped++;
      continue;
    }

    // Embed name + aliases + body so entity-name queries ("who is Porkoláb")
    // match even when the body is sparse.
    const embedInput = [d.name, d.aliases.join(' '), d.body].filter(Boolean).join('\n');
    const [dense, sparse] = [await embedText(embedInput, 'RETRIEVAL_DOCUMENT'), sparseEncodeDoc(embedInput)];
    const id = dossierPointId(d.path);
    const payload = {
      kind: 'dossier',
      dossier_type: d.type,
      path: d.path,
      name: d.name,
      title: d.name,
      text: d.body,
      aliases: d.aliases,
      source: 'vault',
      status: 'active',
      created_at: d.modifiedTime,
      updated_at: d.modifiedTime,
      effective_date: d.modifiedTime,
    };
    await upsertPoint(dense, sparse, payload, id);
    manifest[d.path] = { hash: d.hash, mtime: d.modifiedTime, id };
    indexed++;
  }

  let deleted = 0;
  if (reconcile) {
    // Delete points for dossier files that no longer exist on Drive (renames /
    // deletions the per-path update path can't catch), and prune the manifest.
    const existing = await scrollFilteredRaw({ must: [{ key: 'kind', match: { value: 'dossier' } }] }, 200);
    const currentPaths = new Set(dossiers.map((d) => d.path));
    const toDelete = existing.filter((p) => !currentPaths.has(p.path)).map((p) => p.id);
    if (toDelete.length) {
      await deletePointsByIds(toDelete);
      deleted = toDelete.length;
    }
    for (const p of Object.keys(manifest)) {
      if (!currentPaths.has(p)) delete manifest[p];
    }
  }

  saveManifest(manifest);
  if (flagged.length) {
    console.warn(`[dossier-index] ${flagged.length} project dossier(s) exceed CHUNK_THRESHOLD (${CHUNK_THRESHOLD}) — consider chunking: ${flagged.map((f) => `${f.path}(${f.length})`).join(', ')}`);
  }
  console.log(`[dossier-index] indexed ${indexed}, skipped ${skipped}, deleted ${deleted}, flagged ${flagged.length} (total dossiers ${dossiers.length})`);
  return { indexed, skipped, deleted, flagged, total: dossiers.length };
}
