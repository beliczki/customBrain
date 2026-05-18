// Restore a Qdrant collection from a local .snapshot file.
//
// Usage:
//   node scripts/restore-from-snapshot.js <path-to-snapshot> [--dry-run]
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
//         cp /in/<snapshot>.snapshot /qdrant/storage/snapshots/thoughts/
//   - Start with restore flag (one-shot):
//       docker run --rm -v custombrain_qdrant_data:/qdrant/storage \
//         qdrant/qdrant:latest ./qdrant --snapshot /qdrant/storage/snapshots/thoughts/<snapshot>.snapshot:thoughts
//   - Then normal start: docker compose up -d qdrant

import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename, resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(SCRIPT_DIR, '..', '.env') });

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION = 'thoughts';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const snapshotPath = resolve(args.find(a => !a.startsWith('--')) || '');

if (!snapshotPath || !existsSync(snapshotPath)) {
  console.error(`Usage: node scripts/restore-from-snapshot.js <path> [--dry-run]`);
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
