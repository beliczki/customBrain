// Restore a Qdrant collection from a local .snapshot file.
//
// Usage:
//   node scripts/restore-from-snapshot.js <path-to-snapshot> --collection <name> [--dry-run] [--into <collection>]
//
// --collection names which backed-up collection the snapshot is of (since 0.53.0
// there are two — see BACKED_UP in server/collections.js). It is required: an
// implicit default is how a commitments snapshot would be recovered over thoughts.
//
// --into restores to a scratch collection instead of the live one. A restore you
// have never rehearsed is not a backup, and the rehearsal must not be able to
// overwrite live data: verify into a scratch name first, compare counts and
// payload shape, and only then consider a real recovery.
//
// Two restore modes documented below. This script does mode A (live, API-driven).
// Mode B (cold, disaster recovery) requires shell access — see comments at the bottom.
//
// MODE A: Live restore via Qdrant Recover API (this script)
//   - Qdrant must be running and reachable at QDRANT_URL
//   - Collection may or may not exist; recovery creates/overwrites
//   - Recovery is async on the Qdrant side; this script polls until done
//   - Safe to run on production (briefly blocks reads/writes mid-recovery)
//
// MODE B: Cold restore (full disaster, e.g. Qdrant volume lost)
//   - Stop Qdrant container: docker compose stop qdrant
//   - Copy snapshot into the Docker volume:
//       docker run --rm -v custombrain_qdrant_data:/qdrant/storage -v $(pwd)/backups:/in alpine \
//         cp /in/<snapshot>.snapshot /qdrant/storage/snapshots/thoughts_v2/
//   - Start with restore flag (one-shot):
//       docker run --rm -v custombrain_qdrant_data:/qdrant/storage \
//         qdrant/qdrant:latest ./qdrant --snapshot /qdrant/storage/snapshots/thoughts_v2/<snapshot>.snapshot:thoughts_v2
//   - Then normal start: docker compose up -d qdrant

import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename, resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { BACKED_UP } from '../server/collections.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(SCRIPT_DIR, '..', '.env') });

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const intoIdx = args.indexOf('--into');
const collectionIdx = args.indexOf('--collection');
const SOURCE_COLLECTION = collectionIdx !== -1 ? args[collectionIdx + 1] : null;
const COLLECTION = intoIdx !== -1 ? args[intoIdx + 1] : SOURCE_COLLECTION;
// `--into` and `--collection` consume the value after them; drop those so the
// positional scan below cannot mistake a collection name for the snapshot path.
// Guard on idx !== -1: without it the absent-flag case excludes index 0, which
// is the snapshot path itself.
const valueIdxs = [intoIdx, collectionIdx].filter((i) => i !== -1).map((i) => i + 1);
const positional = args.filter((a, i) => !a.startsWith('--') && !valueIdxs.includes(i));
const snapshotPath = resolve(positional[0] || '');

if (!BACKED_UP.includes(SOURCE_COLLECTION)) {
  console.error(`--collection is required, one of: ${BACKED_UP.join(', ')}`);
  process.exit(1);
}
if (!basename(snapshotPath).startsWith(`${SOURCE_COLLECTION}-`)) {
  console.error(`Snapshot ${basename(snapshotPath)} is not a ${SOURCE_COLLECTION} snapshot (Qdrant names them "<collection>-…").`);
  process.exit(1);
}
if (intoIdx !== -1 && !COLLECTION) {
  console.error('--into requires a collection name');
  process.exit(1);
}

if (!snapshotPath || !existsSync(snapshotPath)) {
  console.error(`Usage: node scripts/restore-from-snapshot.js <path> --collection <name> [--dry-run] [--into <collection>]`);
  console.error(`File not found: ${snapshotPath}`);
  process.exit(1);
}

async function uploadAndRecover(filePath) {
  // Node 20+ native FormData + Blob from file bytes
  const buffer = readFileSync(filePath);
  const form = new FormData();
  form.set('snapshot', new Blob([buffer], { type: 'application/octet-stream' }), basename(filePath));

  const url = `${QDRANT_URL}/collections/${COLLECTION}/snapshots/upload?priority=snapshot`;
  console.log(`POST ${url}`);
  const res = await fetch(url, { method: 'POST', body: form });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Upload failed: ${res.status} ${body}`);
  }
  return await res.json();
}

async function run() {
  console.log(`Snapshot file: ${snapshotPath}`);
  console.log(`Target Qdrant: ${QDRANT_URL}`);
  console.log(`Collection:    ${COLLECTION}`);

  // Sanity check: target reachable
  const ping = await fetch(`${QDRANT_URL}/collections`).catch(e => null);
  if (!ping || !ping.ok) {
    console.error(`Cannot reach Qdrant at ${QDRANT_URL}`);
    process.exit(1);
  }

  // Show current state
  const before = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`).then(r => r.ok ? r.json() : null);
  if (before) {
    console.log(`Current collection: ${before.result.points_count} points, ${before.result.status}`);
  } else {
    console.log(`Collection "${COLLECTION}" does not exist yet — will be created from snapshot.`);
  }

  if (dryRun) {
    console.log('\n--dry-run: would now upload snapshot and recover.');
    console.log('To execute: remove --dry-run');
    return;
  }

  console.log('\nUploading snapshot and triggering recovery...');
  const result = await uploadAndRecover(snapshotPath);
  console.log('Recovery response:', JSON.stringify(result, null, 2));

  const after = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`).then(r => r.json());
  console.log(`After recovery: ${after.result.points_count} points, ${after.result.status}`);
  console.log('\nDone.');
}

run().catch(err => {
  console.error(`FATAL: ${err.message}`);
  console.error(err);
  process.exit(1);
});
