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
 * Parse Obsidian-style YAML frontmatter from a Markdown file.
 *
 * Returns { frontmatter, body } when a frontmatter block is present
 * (file starts with `---\n…\n---`), otherwise null. The frontmatter
 * parser handles the subset Obsidian Properties actually writes:
 *   key: scalar
 *   key:
 *     - item1
 *     - item2
 *   key: [inline, array]
 *
 * Quote stripping handles both single and double quotes plus `[[wikilink]]`
 * wrappers (Obsidian wraps cross-vault references that way).
 */
function parseFrontmatter(text) {
  if (!text.startsWith('---\n') && !text.startsWith('---\r\n')) return null;
  const startLen = text.startsWith('---\r\n') ? 5 : 4;
  // Find closing `---` on its own line
  const closing = text.slice(startLen).match(/\r?\n---\r?\n|\r?\n---\s*$/);
  if (!closing) return null;
  const endIdx = startLen + closing.index;
  const yamlBlock = text.slice(startLen, endIdx);
  const body = text.slice(endIdx + closing[0].length);

  // Strip only surrounding quotes. Wikilink wrappers (`[[…]]`) are kept on
  // raw values; callers that consume aliases strip them at use-time so other
  // fields like `projects: [[Telekom]]` preserve their link form.
  const stripQuotes = (v) => v.replace(/^["']|["']$/g, '');

  const out = {};
  const lines = yamlBlock.split(/\r?\n/);
  let currentArrayKey = null;
  for (const raw of lines) {
    if (!raw.trim()) continue;
    const arrayItem = raw.match(/^\s+-\s+(.+)$/);
    if (arrayItem && currentArrayKey) {
      out[currentArrayKey].push(stripQuotes(arrayItem[1].trim()));
      continue;
    }
    const kv = raw.match(/^([a-zA-Z_][a-zA-Z0-9_-]*)\s*:\s*(.*)$/);
    if (!kv) { currentArrayKey = null; continue; }
    const [, key, valRaw] = kv;
    const val = valRaw.trim();
    if (val === '') {
      out[key] = [];
      currentArrayKey = key;
    } else if (val.startsWith('[') && val.endsWith(']')) {
      out[key] = val
        .slice(1, -1)
        .split(',')
        .map((s) => stripQuotes(s.trim()))
        .filter(Boolean);
      currentArrayKey = null;
    } else {
      out[key] = stripQuotes(val);
      currentArrayKey = null;
    }
  }
  return { frontmatter: out, body };
}

/**
 * List *.md files in a Drive folder and parse alias / email metadata
 * from each file. Returns canonical names (filename without .md), an
 * alias → canonical map, and an email → canonical map.
 *
 * Primary source: Obsidian YAML frontmatter `aliases:` and `email:` /
 * `emails:` fields — this is how Obsidian's Properties UI manages them.
 *
 * Legacy fallback: per-line `alias: X` and `email: X` in the body. Kept
 * so files predating the frontmatter migration still resolve. New writes
 * should always use frontmatter.
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

    // Fetch all file contents in parallel batches. Sequential 144 Drive
    // `files.get` calls took 60s+ in production; concurrency=10 brings it
    // to ~5-8s and keeps Drive happy below its per-user throttle.
    const PARALLEL = 10;
    const fileEntries = res.data.files;
    const fetched = new Array(fileEntries.length);
    for (let i = 0; i < fileEntries.length; i += PARALLEL) {
      const batch = fileEntries.slice(i, i + PARALLEL);
      const results = await Promise.all(batch.map(async (file) => {
        try {
          const content = await drive.files.get(
            { fileId: file.id, alt: 'media' },
            { responseType: 'text' }
          );
          return { file, text: typeof content.data === 'string' ? content.data : '' };
        } catch (err) {
          console.error(`drive-context: failed to fetch ${file.name}: ${err.message}`);
          return { file, text: '', error: err };
        }
      }));
      for (let j = 0; j < results.length; j++) {
        fetched[i + j] = results[j];
      }
    }

    for (const { file, text, error } of fetched) {
      const canonical = file.name.replace('.md', '');
      names.push(canonical);
      if (error) continue;
      try {
        if (withDocuments) documents[canonical] = text;

        // Primary: YAML frontmatter (Obsidian Properties native format)
        const fm = parseFrontmatter(text);
        const bodyForLegacy = fm ? fm.body : text;
        const stripWikilink = (a) => String(a).trim().replace(/^\[\[(?:[^|\]]*\|)?|]]$/g, '');
        if (fm) {
          const fa = fm.frontmatter.aliases;
          if (Array.isArray(fa)) {
            for (const rawAlias of fa) {
              const alias = stripWikilink(rawAlias);
              if (alias && alias !== canonical) aliases[alias] = canonical;
            }
          }
          const collectEmails = (val) => {
            if (!val) return;
            const arr = Array.isArray(val) ? val : [val];
            for (const e of arr) {
              const lower = String(e).trim().toLowerCase();
              if (lower.includes('@')) emails[lower] = canonical;
            }
          };
          collectEmails(fm.frontmatter.email);
          collectEmails(fm.frontmatter.emails);
        }

        // Legacy fallback: `alias: X` / `email: X` body lines (pre-frontmatter
        // migration files). Merges with frontmatter values rather than
        // replacing — both can coexist during the transition.
        for (const line of bodyForLegacy.split('\n')) {
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
      } catch (err) {
        console.error(`drive-context: failed to parse ${file.name}: ${err.message}`);
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
  } catch (err) {
    console.error(`drive-context: listWithAliases failed (folder ${folderId}): ${err.message}\n${err.stack}`);
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
    console.error('Failed to load vault context:', err.message, '\n', err.stack);
    return { people: [], projects: [], aliases: {}, projectAliases: {}, peopleEmails: {} };
  }
}
