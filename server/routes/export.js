import { Router } from 'express';
import { google } from 'googleapis';
import { readFileSync } from 'node:fs';
import { scrollFiltered } from '../qdrant.js';

const router = Router();

function getDriveClient() {
  if (process.env.GOOGLE_DRIVE_REFRESH_TOKEN) {
    const oauth2 = new google.auth.OAuth2(
      process.env.GOOGLE_DRIVE_CLIENT_ID,
      process.env.GOOGLE_DRIVE_CLIENT_SECRET
    );
    oauth2.setCredentials({ refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN });
    return google.drive({ version: 'v3', auth: oauth2 });
  }
  const saPath = process.env.GOOGLE_SERVICE_ACCOUNT_PATH || './service-account.json';
  const sa = JSON.parse(readFileSync(saPath, 'utf-8'));
  const auth = new google.auth.JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  return google.drive({ version: 'v3', auth });
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function thoughtFilename(t) {
  if (t.title) {
    return `${slugify(t.title)}.md`;
  }
  const date = (t.created_at || '').slice(0, 10);
  const slug = slugify(t.text.split(/\s+/).slice(0, 4).join(' '));
  return `${date}-${slug}.md`;
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function buildLinkIndex(thoughts, filenames) {
  const personToFiles = {};
  const topicToFiles = {};
  const projectToFiles = {};

  for (let i = 0; i < thoughts.length; i++) {
    const t = thoughts[i];
    const fn = filenames[i].replace('.md', '');

    for (const p of t.people || []) {
      if (!personToFiles[p]) personToFiles[p] = [];
      personToFiles[p].push(fn);
    }
    for (const tp of t.topics || []) {
      if (!topicToFiles[tp]) topicToFiles[tp] = [];
      topicToFiles[tp].push(fn);
    }
    for (const pr of t.projects || []) {
      if (!projectToFiles[pr]) projectToFiles[pr] = [];
      projectToFiles[pr].push(fn);
    }
  }

  return { personToFiles, topicToFiles, projectToFiles };
}

function buildLinksSection(thought, filename, linkIndex) {
  const myName = filename.replace('.md', '');
  const lines = [];

  // Links to related thoughts (same customBrain folder)
  const relatedThoughts = new Set();
  for (const p of thought.people || []) {
    for (const fn of linkIndex.personToFiles[p] || []) {
      if (fn !== myName) relatedThoughts.add(`[[${fn}]]`);
    }
  }
  for (const tp of thought.topics || []) {
    for (const fn of linkIndex.topicToFiles[tp] || []) {
      if (fn !== myName) relatedThoughts.add(`[[${fn}]]`);
    }
  }
  for (const pr of thought.projects || []) {
    for (const fn of linkIndex.projectToFiles[pr] || []) {
      if (fn !== myName) relatedThoughts.add(`[[${fn}]]`);
    }
  }

  if (relatedThoughts.size > 0) {
    lines.push('\n## Related thoughts');
    for (const link of relatedThoughts) lines.push(`- ${link}`);
  }

  if (lines.length === 0) return '';
  return lines.join('\n');
}

function toFrontmatter(thought) {
  const lines = ['---'];
  if (thought.people?.length) {
    lines.push('people:');
    for (const p of thought.people) lines.push(`  - "[[../People/${p}|${p}]]"`);
  }
  if (thought.topics?.length) {
    lines.push('topics:');
    for (const t of thought.topics) lines.push(`  - "${t}"`);
  }
  if (thought.projects?.length) {
    lines.push('projects:');
    for (const p of thought.projects) lines.push(`  - "[[../Projects/${p}|${p}]]"`);
  }
  if (thought.type) lines.push(`type: "${thought.type}"`);
  if (thought.action_items?.length) {
    lines.push('action_items:');
    for (const a of thought.action_items) lines.push(`  - "${a}"`);
  }
  lines.push(`captured_at: "${thought.created_at}"`);
  lines.push('---');
  return lines.join('\n');
}

router.post('/export', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const onLog = (line) => {
    res.write(`data: ${JSON.stringify({ type: 'log', line })}\n\n`);
  };

  try {
    const result = await rebuildVault(onLog);
    res.write(`data: ${JSON.stringify({ type: 'result', ...result })}\n\n`);
  } catch (err) {
    console.error('Export error:', err.message);
    res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
  }
  res.end();
});

export default router;

async function getOrCreateSubfolder(drive, parentId, name) {
  const res = await drive.files.list({
    q: `'${parentId}' in parents and name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
  });
  if (res.data.files.length > 0) return res.data.files[0].id;

  const folder = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
  });
  return folder.data.id;
}

export async function rebuildVault(onLog) {
  const startTime = Date.now();
  const ts = () => `${((Date.now() - startTime) / 1000).toFixed(1)}s`;
  const emit = (line) => { if (onLog) onLog(line); };

  const drive = getDriveClient();
  const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  emit(`[${ts()}] Connecting to Google Drive...`);
  const folderId = await getOrCreateSubfolder(drive, rootFolderId, 'customBrain');
  emit(`[${ts()}] Found customBrain folder`);

  // Step 1: Delete all existing .md files
  emit(`[${ts()}] Scanning for old files...`);
  let existingFiles = [];
  let pageToken;
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and name contains '.md' and trashed=false`,
      fields: 'nextPageToken, files(id, name)',
      pageSize: 100,
      pageToken,
    });
    existingFiles.push(...res.data.files);
    pageToken = res.data.nextPageToken;
  } while (pageToken);

  emit(`[${ts()}] Deleting ${existingFiles.length} old files...`);
  for (let i = 0; i < existingFiles.length; i += 10) {
    const batch = existingFiles.slice(i, i + 10);
    await Promise.all(batch.map((f) => drive.files.delete({ fileId: f.id })));
  }
  emit(`[${ts()}] Old files deleted`);

  // Step 2: Fetch all thoughts from Qdrant
  emit(`[${ts()}] Fetching thoughts from Qdrant...`);
  const thoughts = await scrollFiltered();
  emit(`[${ts()}] Found ${thoughts.length} thoughts`);

  if (thoughts.length === 0) {
    emit(`[${ts()}] Nothing to export`);
    return { ok: true, rebuilt: true, deleted: existingFiles.length, exported_count: 0, files: [] };
  }

  // Step 3: Build filenames and link index
  const filenames = thoughts.map(thoughtFilename);
  const linkIndex = buildLinkIndex(thoughts, filenames);
  emit(`[${ts()}] Built link index`);

  // Step 4: Write all thoughts as .md files
  emit(`[${ts()}] Writing ${thoughts.length} thought files...`);
  const files = [];
  for (let i = 0; i < thoughts.length; i++) {
    const t = thoughts[i];
    const filename = filenames[i];

    const frontmatter = toFrontmatter(t);
    const links = buildLinksSection(t, filename, linkIndex);
    const dateStr = formatDate(t.created_at);
    const content = `${frontmatter}\n\n*${dateStr}*\n\n${t.text}\n${links}\n`;

    await drive.files.create({
      requestBody: {
        name: filename,
        mimeType: 'text/markdown',
        parents: [folderId],
      },
      media: {
        mimeType: 'text/markdown',
        body: content,
      },
    });

    files.push(filename);
    emit(`[${ts()}]   ✓ ${filename}`);
  }

  // Step 5: People & Projects
  const allPeople = new Set();
  const allProjects = new Set();
  for (const t of thoughts) {
    for (const p of t.people || []) allPeople.add(p);
    for (const pr of t.projects || []) allProjects.add(pr);
  }

  const typeCounts = {};
  for (const t of thoughts) {
    const type = t.type || 'unknown';
    typeCounts[type] = (typeCounts[type] || 0) + 1;
  }

  async function writeStubs(folderName, names, envFolderId) {
    if (names.size === 0) return { total: 0, created: [], existing: [] };
    if (!envFolderId) {
      emit(`[${ts()}] Skipping ${folderName}/ — no folder ID configured`);
      return { total: names.size, created: [], existing: [...names] };
    }
    emit(`[${ts()}] Syncing ${folderName}/ (${names.size} entries)...`);
    const subfolderId = envFolderId;

    const existingNames = new Set();
    let pt;
    do {
      const res = await drive.files.list({
        q: `'${subfolderId}' in parents and name contains '.md' and trashed=false`,
        fields: 'nextPageToken, files(name)',
        pageSize: 100,
        pageToken: pt,
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
      });
      for (const f of res.data.files) existingNames.add(f.name);
      pt = res.data.nextPageToken;
    } while (pt);

    const created = [];
    const existing = [];
    for (const name of names) {
      if (existingNames.has(`${name}.md`)) {
        existing.push(name);
        continue;
      }

      const related = thoughts
        .filter((t) => (t.people || []).includes(name) || (t.projects || []).includes(name))
        .map((t) => thoughtFilename(t).replace('.md', ''));
      const backlinks = related.map((fn) => `- [[../customBrain/${fn}]]`).join('\n');
      const content = `# ${name}\n\n## Mentions\n${backlinks}\n`;

      await drive.files.create({
        requestBody: {
          name: `${name}.md`,
          mimeType: 'text/markdown',
          parents: [subfolderId],
        },
        media: { mimeType: 'text/markdown', body: content },
      });
      created.push(name);
      emit(`[${ts()}]   + ${folderName}/${name}.md (new)`);
    }
    if (created.length === 0) emit(`[${ts()}]   No new ${folderName.toLowerCase()} entries`);
    return { total: names.size, created, existing };
  }

  const peopleResult = await writeStubs('People', allPeople, process.env.GOOGLE_DRIVE_PEOPLE_FOLDER_ID);
  const projectsResult = await writeStubs('Projects', allProjects, process.env.GOOGLE_DRIVE_PROJECTS_FOLDER_ID);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  emit(`[${elapsed}s] ── Export complete ──`);
  emit(`  ${files.length} thoughts · ${existingFiles.length} deleted · ${peopleResult.created.length} new people · ${projectsResult.created.length} new projects`);
  emit(`  Types: ${Object.entries(typeCounts).map(([k, v]) => `${k}(${v})`).join(' · ')}`);
  emit(`  People: ${[...allPeople].join(', ')}`);
  emit(`  Projects: ${[...allProjects].join(', ')}`);
  emit(`  Duration: ${elapsed}s`);

  return {
    ok: true,
    rebuilt: true,
    deleted: existingFiles.length,
    exported_count: files.length,
    files,
    by_type: typeCounts,
    people: {
      total: allPeople.size,
      all: [...allPeople],
      created: peopleResult.created,
      existing: peopleResult.existing,
    },
    projects: {
      total: allProjects.size,
      all: [...allProjects],
      created: projectsResult.created,
      existing: projectsResult.existing,
    },
  };
}

export const exportThoughts = rebuildVault;
