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

function getSaDrive() {
  const saPath = process.env.GOOGLE_SERVICE_ACCOUNT_PATH ||
    new URL('./service-account.json', import.meta.url).pathname;
  const sa = JSON.parse(readFileSync(saPath, 'utf-8'));
  const auth = new google.auth.JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  return google.drive({ version: 'v3', auth });
}

function getDrive() {
  // Try OAuth2 first
  if (process.env.GOOGLE_DRIVE_REFRESH_TOKEN) {
    return google.drive({ version: 'v3', auth: getOAuth2Client() });
  }
  return getSaDrive();
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

async function listPeopleWithAliases(drive, folderId) {
  try {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and name contains '.md' and trashed=false`,
      fields: 'files(id, name)',
      pageSize: 100,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });
    const people = [];
    const aliases = {};
    for (const file of res.data.files) {
      const canonical = file.name.replace('.md', '');
      people.push(canonical);
      try {
        const content = await drive.files.get(
          { fileId: file.id, alt: 'media' },
          { responseType: 'text' }
        );
        const text = typeof content.data === 'string' ? content.data : '';
        for (const line of text.split('\n')) {
          const match = line.match(/^alias:\s*(.+)/i);
          if (match) {
            const alias = match[1].trim().replace(/^\[\[|]]$/g, '');
            aliases[alias] = canonical;
          }
        }
      } catch {
        // skip files that can't be read
      }
    }
    return { people, aliases };
  } catch {
    return { people: [], aliases: {} };
  }
}

export async function getVaultContext() {
  if (cachedContext && Date.now() - cacheTime < CACHE_TTL) {
    return cachedContext;
  }

  try {
    // SA sees all files regardless of owner (OAuth2 misses some)
    const drive = getSaDrive();
    const peopleFolderId = process.env.GOOGLE_DRIVE_PEOPLE_FOLDER_ID;
    const projectsFolderId = process.env.GOOGLE_DRIVE_PROJECTS_FOLDER_ID;

    const { people, aliases } = peopleFolderId
      ? await listPeopleWithAliases(drive, peopleFolderId)
      : { people: [], aliases: {} };
    const projects = projectsFolderId ? await listMdFiles(drive, projectsFolderId) : [];

    cachedContext = { people, projects, aliases };
    cacheTime = Date.now();
    console.log(`Vault context loaded: ${people.length} people, ${Object.keys(aliases).length} aliases, ${projects.length} projects`);
    return cachedContext;
  } catch (err) {
    console.error('Failed to load vault context:', err.message);
    return { people: [], projects: [] };
  }
}
