// Daily Qdrant snapshot + Google Drive upload with retention.
// Schedule (Hetzner crontab):  0 3 * * *  cd /root/customBrain && /usr/bin/node cron/qdrant-backup.js >> /var/log/brain-backup.log 2>&1
//
// Tunables: LOCAL_KEEP, DRIVE_KEEP, DRIVE_BACKUPS_FOLDER below.
// Restore docs: scripts/restore-from-snapshot.js

import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { mkdirSync, createReadStream, readdirSync, statSync, unlinkSync, writeFileSync, existsSync } from 'node:fs';
import { google } from 'googleapis';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(SCRIPT_DIR, '..', 'server', '.env') });

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION = 'thoughts';
const BACKUPS_DIR = resolve(SCRIPT_DIR, '..', 'backups');
const LOCAL_KEEP = 3;          // local: count-based, last N snapshots (immediate-recovery safety net)
const DRIVE_KEEP_DAYS = 14;    // Drive: age-based, delete anything older than N days
const DRIVE_BACKUPS_FOLDER = 'customBrain Backups';

function log(line) { console.log(`[${new Date().toISOString()}] ${line}`); }

function getDriveClient() {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_DRIVE_CLIENT_ID,
    process.env.GOOGLE_DRIVE_CLIENT_SECRET
  );
  oauth2.setCredentials({ refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN });
  return google.drive({ version: 'v3', auth: oauth2 });
}

async function getOrCreateFolder(drive, parentId, name) {
  const res = await drive.files.list({
    q: `'${parentId}' in parents and name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
  });
  if (res.data.files.length > 0) return res.data.files[0].id;
  const folder = await drive.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
    fields: 'id',
  });
  return folder.data.id;
}

async function createSnapshot() {
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/snapshots`, { method: 'POST' });
  if (!res.ok) throw new Error(`Snapshot create failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.result.name;
}

async function downloadSnapshot(name, localPath) {
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/snapshots/${name}`);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  writeFileSync(localPath, buffer);
  return buffer.length;
}

async function deleteQdrantSnapshot(name) {
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/snapshots/${name}`, { method: 'DELETE' });
  if (!res.ok) log(`WARN: failed to delete Qdrant-internal snapshot ${name}: ${res.status}`);
}

async function listQdrantSnapshots() {
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/snapshots`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.result.map(s => s.name);
}

async function uploadToDrive(drive, folderId, localPath, fileName) {
  const res = await drive.files.create({
    requestBody: { name: fileName, parents: [folderId] },
    media: { mimeType: 'application/octet-stream', body: createReadStream(localPath) },
    fields: 'id, size',
  });
  return res.data;
}

function rotateLocal() {
  const files = readdirSync(BACKUPS_DIR)
    .filter(f => f.endsWith('.snapshot'))
    .map(f => ({ name: f, mtime: statSync(join(BACKUPS_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  const toDelete = files.slice(LOCAL_KEEP);
  for (const f of toDelete) {
    unlinkSync(join(BACKUPS_DIR, f.name));
    log(`Rotated local (deleted): ${f.name}`);
  }
  return { kept: files.length - toDelete.length, deleted: toDelete.length };
}

async function rotateDrive(drive, folderId) {
  const cutoff = Date.now() - DRIVE_KEEP_DAYS * 24 * 60 * 60 * 1000;
  const res = await drive.files.list({
    q: `'${folderId}' in parents and name contains '.snapshot' and trashed=false`,
    fields: 'files(id, name, createdTime)',
    pageSize: 200,
    orderBy: 'createdTime desc',
  });
  const files = res.data.files;
  const toDelete = files.filter(f => new Date(f.createdTime).getTime() < cutoff);
  for (const f of toDelete) {
    await drive.files.delete({ fileId: f.id });
    log(`Rotated Drive (deleted, older than ${DRIVE_KEEP_DAYS}d): ${f.name}`);
  }
  return { kept: files.length - toDelete.length, deleted: toDelete.length };
}

async function run() {
  const startTime = Date.now();
  log('=== Qdrant backup started ===');

  if (!existsSync(BACKUPS_DIR)) {
    mkdirSync(BACKUPS_DIR, { recursive: true });
    log(`Created backups dir: ${BACKUPS_DIR}`);
  }

  log(`Triggering snapshot on ${COLLECTION}...`);
  const snapshotName = await createSnapshot();
  log(`Snapshot created: ${snapshotName}`);

  const localPath = join(BACKUPS_DIR, snapshotName);
  log(`Downloading to ${localPath}...`);
  const bytes = await downloadSnapshot(snapshotName, localPath);
  log(`Downloaded ${(bytes / 1024).toFixed(1)} KB`);

  await deleteQdrantSnapshot(snapshotName);
  log(`Cleared Qdrant-internal snapshot ${snapshotName}`);

  const drive = getDriveClient();
  const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!rootFolderId) throw new Error('GOOGLE_DRIVE_FOLDER_ID missing in env');
  log('Connecting to Google Drive...');
  const backupsFolderId = await getOrCreateFolder(drive, rootFolderId, DRIVE_BACKUPS_FOLDER);

  log(`Uploading to Drive folder "${DRIVE_BACKUPS_FOLDER}"...`);
  const driveFile = await uploadToDrive(drive, backupsFolderId, localPath, snapshotName);
  log(`Uploaded: id=${driveFile.id} size=${driveFile.size}`);

  const localRot = rotateLocal();
  const driveRot = await rotateDrive(drive, backupsFolderId);
  log(`Local: kept ${localRot.kept}, deleted ${localRot.deleted}`);
  log(`Drive: kept ${driveRot.kept}, deleted ${driveRot.deleted}`);

  const qSnaps = await listQdrantSnapshots();
  if (qSnaps.length > 0) {
    log(`WARN: ${qSnaps.length} stale Qdrant-internal snapshot(s) remain: ${qSnaps.join(', ')}`);
  }

  log(`=== Done in ${((Date.now() - startTime) / 1000).toFixed(1)}s ===`);
}

run().catch(err => {
  log(`FATAL: ${err.message}`);
  console.error(err);
  process.exit(1);
});
