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
  try {
    const result = await rebuildVault();
    res.json(result);
  } catch (err) {
    console.error('Export error:', err.message);
    res.status(500).json({ error: err.message });
  }
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

export async function rebuildVault() {
  const drive = getDriveClient();
  const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  const folderId = await getOrCreateSubfolder(drive, rootFolderId, 'customBrain');

  // Step 1: Delete all existing .md files in the subfolder
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

  for (let i = 0; i < existingFiles.length; i += 10) {
    const batch = existingFiles.slice(i, i + 10);
    await Promise.all(batch.map((f) => drive.files.delete({ fileId: f.id })));
  }

  // Step 2: Fetch all thoughts from Qdrant
  const thoughts = await scrollFiltered();

  if (thoughts.length === 0) {
    return { ok: true, rebuilt: true, deleted: existingFiles.length, exported_count: 0, files: [] };
  }

  // Step 3: Build filenames and link index
  const filenames = thoughts.map(thoughtFilename);
  const linkIndex = buildLinkIndex(thoughts, filenames);

  // Step 4: Write all thoughts as .md files
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
  }

  // Step 5: Create stub .md files in People/ and Projects/ folders
  const allPeople = new Set();
  const allProjects = new Set();
  for (const t of thoughts) {
    for (const p of t.people || []) allPeople.add(p);
    for (const pr of t.projects || []) allProjects.add(pr);
  }

  async function writeStubs(folderName, names) {
    if (names.size === 0) return;
    // Only write into existing folders — never create them
    const folderRes = await drive.files.list({
      q: `'${rootFolderId}' in parents and name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id)',
    });
    if (folderRes.data.files.length === 0) return;
    const subfolderId = folderRes.data.files[0].id;

    // List existing files to avoid overwriting hand-written content
    const existingNames = new Set();
    let pt;
    do {
      const res = await drive.files.list({
        q: `'${subfolderId}' in parents and name contains '.md' and trashed=false`,
        fields: 'nextPageToken, files(name)',
        pageSize: 100,
        pageToken: pt,
      });
      for (const f of res.data.files) existingNames.add(f.name);
      pt = res.data.nextPageToken;
    } while (pt);

    // Only create stubs for names that don't have a file yet
    for (const name of names) {
      if (existingNames.has(`${name}.md`)) continue;

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
    }
  }

  await writeStubs('People', allPeople);
  await writeStubs('Projects', allProjects);

  return {
    ok: true,
    rebuilt: true,
    deleted: existingFiles.length,
    exported_count: files.length,
    files,
  };
}

export const exportThoughts = rebuildVault;
