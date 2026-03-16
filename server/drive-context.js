import { google } from 'googleapis';
import { readFileSync } from 'node:fs';

let cachedContext = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getDrive() {
  // Try OAuth2 first
  if (process.env.GOOGLE_DRIVE_REFRESH_TOKEN) {
    const oauth2 = new google.auth.OAuth2(
      process.env.GOOGLE_DRIVE_CLIENT_ID,
      process.env.GOOGLE_DRIVE_CLIENT_SECRET
    );
    oauth2.setCredentials({ refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN });
    return google.drive({ version: 'v3', auth: oauth2 });
  }
  // Fallback to service account
  const saPath = process.env.GOOGLE_SERVICE_ACCOUNT_PATH || './service-account.json';
  const sa = JSON.parse(readFileSync(saPath, 'utf-8'));
  const auth = new google.auth.JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  return google.drive({ version: 'v3', auth });
}

async function listMdFiles(drive, folderId) {
  try {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and name contains '.md' and trashed=false`,
      fields: 'files(id, name)',
      pageSize: 100,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });
    return res.data.files.map((f) => f.name.replace('.md', ''));
  } catch {
    return [];
  }
}

async function findSubfolder(drive, parentId, name) {
  const res = await drive.files.list({
    q: `'${parentId}' in parents and name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
  });
  return res.data.files[0]?.id || null;
}

export async function getVaultContext() {
  if (cachedContext && Date.now() - cacheTime < CACHE_TTL) {
    return cachedContext;
  }

  try {
    const drive = getDrive();
    const rootId = process.env.GOOGLE_DRIVE_FOLDER_ID;

    // Try both OAuth and SA - search all accessible folders
    const allFolders = await drive.files.list({
      q: `'${rootId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });

    let people = [];
    let projects = [];

    for (const folder of allFolders.data.files) {
      if (folder.name === 'People') {
        people = await listMdFiles(drive, folder.id);
      } else if (folder.name === 'Projects') {
        projects = await listMdFiles(drive, folder.id);
      }
    }

    // If OAuth didn't find them, try with service account
    if (people.length === 0 && projects.length === 0 && process.env.GOOGLE_SERVICE_ACCOUNT_PATH) {
      const saPath = process.env.GOOGLE_SERVICE_ACCOUNT_PATH;
      const sa = JSON.parse(readFileSync(saPath, 'utf-8'));
      const saAuth = new google.auth.JWT({
        email: sa.client_email,
        key: sa.private_key,
        scopes: ['https://www.googleapis.com/auth/drive'],
      });
      const saDrive = google.drive({ version: 'v3', auth: saAuth });

      const saFolders = await saDrive.files.list({
        q: `'${rootId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id, name)',
      });

      for (const folder of saFolders.data.files) {
        if (folder.name === 'People') {
          people = await listMdFiles(saDrive, folder.id);
        } else if (folder.name === 'Projects') {
          projects = await listMdFiles(saDrive, folder.id);
        }
      }
    }

    cachedContext = { people, projects };
    cacheTime = Date.now();
    console.log(`Vault context loaded: ${people.length} people, ${projects.length} projects`);
    return cachedContext;
  } catch (err) {
    console.error('Failed to load vault context:', err.message);
    return { people: [], projects: [] };
  }
}
