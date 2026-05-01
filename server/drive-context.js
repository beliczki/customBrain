import { google } from 'googleapis';
import { readFileSync } from 'node:fs';
import { isAbsolute, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

function resolveSaPath() {
  const envPath = process.env.GOOGLE_SERVICE_ACCOUNT_PATH;
  if (envPath) {
    return isAbsolute(envPath) ? envPath : resolve(MODULE_DIR, envPath);
  }
  return resolve(MODULE_DIR, 'service-account.json');
}

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
  const sa = JSON.parse(readFileSync(resolveSaPath(), 'utf-8'));
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


/**
 * List *.md files in a Drive folder and parse `alias:` and `email:` lines
 * from each file. Returns canonical names (filename without .md), an
 * alias → canonical map, and an email → canonical map.
 *
 * Used for both People/ and Projects/ folders. `email:` is only meaningful
 * for People (drives outbound-mail auto-labeling) but parsed for both
 * uniformly; Projects-folder emails simply go unused today.
 */
async function listWithAliases(drive, folderId, { withDocuments = false } = {}) {
  try {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and name contains '.md' and trashed=false`,
      fields: 'files(id, name)',
      pageSize: 100,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });
    const names = [];
    const aliases = {};
    const emails = {};
    const documents = withDocuments ? {} : null;
    for (const file of res.data.files) {
      const canonical = file.name.replace('.md', '');
      names.push(canonical);
      try {
        const content = await drive.files.get(
          { fileId: file.id, alt: 'media' },
          { responseType: 'text' }
        );
        const text = typeof content.data === 'string' ? content.data : '';
        if (withDocuments) documents[canonical] = text;
        for (const line of text.split('\n')) {
          const aliasMatch = line.match(/^alias:\s*(.+)/i);
          if (aliasMatch) {
            const values = aliasMatch[1]
              .split(',')
              .map((v) => v.trim().replace(/^\[\[|]]$/g, ''))
              .filter(Boolean);
            for (const alias of values) {
              if (alias !== canonical) aliases[alias] = canonical;
            }
            continue;
          }
          const emailMatch = line.match(/^email:\s*(.+)/i);
          if (emailMatch) {
            const values = emailMatch[1]
              .split(',')
              .map((v) => v.trim().toLowerCase())
              .filter((v) => v.includes('@'));
            for (const email of values) {
              emails[email] = canonical;
            }
          }
        }
      } catch {
        // skip files that can't be read
      }
    }
    // Detect and break circular alias loops (A→B and B→A). Keeps the direction
    // toward the earlier-alphabetical canonical (deterministic tie-breaker).
    // If only one of the two names is actually a filename in this folder, the
    // filename wins; the other direction is removed.
    const namesSet = new Set(names);
    for (const [alias, canonical] of Object.entries(aliases)) {
      const reverse = aliases[canonical];
      if (reverse === alias) {
        const aliasIsFile = namesSet.has(alias);
        const canonicalIsFile = namesSet.has(canonical);
        let drop;
        if (aliasIsFile && !canonicalIsFile) drop = alias;
        else if (canonicalIsFile && !aliasIsFile) drop = canonical;
        else drop = [alias, canonical].sort()[1];
        const kept = drop === alias ? canonical : alias;
        delete aliases[drop];
        console.warn(`Alias loop broken: "${alias}" ↔ "${canonical}" — kept canonical "${kept}"`);
      }
    }
    return { names, aliases, emails, ...(documents && { documents }) };
  } catch {
    return { names: [], aliases: {}, emails: {} };
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

    const peopleResult = peopleFolderId
      ? await listWithAliases(drive, peopleFolderId)
      : { names: [], aliases: {} };
    const projectsResult = projectsFolderId
      ? await listWithAliases(drive, projectsFolderId, { withDocuments: true })
      : { names: [], aliases: {}, documents: {} };

    cachedContext = {
      people: peopleResult.names,
      aliases: peopleResult.aliases,
      peopleEmails: peopleResult.emails,
      projects: projectsResult.names,
      projectAliases: projectsResult.aliases,
      projectDocs: projectsResult.documents || {},
    };
    cacheTime = Date.now();
    console.log(
      `Vault context loaded: ${peopleResult.names.length} people (${Object.keys(peopleResult.aliases).length} aliases, ${Object.keys(peopleResult.emails).length} emails), ${projectsResult.names.length} projects (${Object.keys(projectsResult.aliases).length} aliases)`,
    );
    return cachedContext;
  } catch (err) {
    console.error('Failed to load vault context:', err.message);
    return { people: [], projects: [], aliases: {}, projectAliases: {}, peopleEmails: {} };
  }
}
