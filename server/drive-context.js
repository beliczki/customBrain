import { google } from 'googleapis';
import { readFileSync } from 'node:fs';

let cachedContext = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getOAuth2Client() {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_DRIVE_CLIENT_ID,
    process.env.GOOGLE_DRIVE_CLIENT_SECRET
  );
  oauth2.setCredentials({ refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN });
  return oauth2;
}

function getDrive() {
  // Try OAuth2 first
  if (process.env.GOOGLE_DRIVE_REFRESH_TOKEN) {
    return google.drive({ version: 'v3', auth: getOAuth2Client() });
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

export function getGmail() {
  return google.gmail({ version: 'v1', auth: getOAuth2Client() });
}

export function getCalendar() {
  return google.calendar({ version: 'v3', auth: getOAuth2Client() });
}

export function getYouTube() {
  return google.youtube({ version: 'v3', auth: getOAuth2Client() });
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

export async function getVaultContext() {
  if (cachedContext && Date.now() - cacheTime < CACHE_TTL) {
    return cachedContext;
  }

  try {
    const drive = getDrive();
    const peopleFolderId = process.env.GOOGLE_DRIVE_PEOPLE_FOLDER_ID;
    const projectsFolderId = process.env.GOOGLE_DRIVE_PROJECTS_FOLDER_ID;

    const people = peopleFolderId ? await listMdFiles(drive, peopleFolderId) : [];
    const projects = projectsFolderId ? await listMdFiles(drive, projectsFolderId) : [];

    cachedContext = { people, projects };
    cacheTime = Date.now();
    console.log(`Vault context loaded: ${people.length} people, ${projects.length} projects`);
    return cachedContext;
  } catch (err) {
    console.error('Failed to load vault context:', err.message);
    return { people: [], projects: [] };
  }
}
