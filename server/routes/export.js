import { Router } from 'express';
import { google } from 'googleapis';
import { getAllWithVectors } from '../qdrant.js';
import { getVaultContext } from '../drive-context.js';

// P1d — semantic autolinks. Per-thought cosine-neighbor section replaces the
// old metadata-based "Related thoughts" dump. Tune these two constants if the
// links feel too sparse or too noisy after a real-world rebuild.
const RELATED_MIN_SCORE = 0.75;
const RELATED_MAX = 3;

const router = Router();

// The service-account path is gone as of 0.39.0 — the OAuth2 client now carries
// the full `drive` scope, so it sees the whole vault (see server/drive-context.js).
function getDriveClient() {
  if (!process.env.GOOGLE_DRIVE_REFRESH_TOKEN) {
    throw new Error('GOOGLE_DRIVE_REFRESH_TOKEN is not set — Drive access unavailable');
  }
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_DRIVE_CLIENT_ID,
    process.env.GOOGLE_DRIVE_CLIENT_SECRET
  );
  oauth2.setCredentials({ refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN });
  return google.drive({ version: 'v3', auth: oauth2 });
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

/** In-memory cosine similarity on two equal-length vectors. */
function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Return top-N semantic neighbors for a thought. Replaces the former
 * metadata-based "every thought sharing any tag" link dump (P1d).
 * Filters self, archived thoughts, and anything below RELATED_MIN_SCORE.
 */
function semanticNeighbors(thought, allThoughts) {
  return allThoughts
    .filter((other) => other.id !== thought.id && other.payload?.status !== 'archived')
    .map((other) => ({
      id: other.id,
      title: other.payload.title,
      filename: other.filename, // set by caller
      score: cosine(thought.vector, other.vector),
    }))
    .filter((n) => n.score >= RELATED_MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, RELATED_MAX);
}

function buildLinksSection(thought, filename, allThoughts) {
  const neighbors = semanticNeighbors(thought, allThoughts);
  if (neighbors.length === 0) return '';
  const lines = ['\n## Related thoughts'];
  for (const n of neighbors) {
    const stem = n.filename.replace('.md', '');
    // Include cosine score as a small trailing marker so future-me can see
    // why the link is here. Readers in Obsidian still see it as a wikilink.
    lines.push(`- [[${stem}]]  *(${(n.score * 100).toFixed(0)}%)*`);
  }
  return lines.join('\n');
}

// YAML double-quoted scalar: `\` and `"` MUST be escaped, else the inner `"`
// closes the wrapper early and the whole frontmatter becomes invalid YAML
// (Obsidian renders the whole block as body text). Bug fix 0.19.x: previously
// values like an action_item containing `"Unknowns / not confirmed"` broke
// the entire file's Properties parsing.
function yamlQuote(s) {
  return `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function toFrontmatter(thought) {
  const lines = ['---'];
  if (thought.people?.length) {
    lines.push('people:');
    for (const p of thought.people) lines.push(`  - ${yamlQuote(`[[People/${p}|${p}]]`)}`);
  }
  if (thought.topics?.length) {
    lines.push('topics:');
    for (const t of thought.topics) lines.push(`  - ${yamlQuote(t)}`);
  }
  if (thought.projects?.length) {
    lines.push('projects:');
    for (const p of thought.projects) lines.push(`  - ${yamlQuote(`[[Projects/${p}|${p}]]`)}`);
  }
  if (thought.type) lines.push(`type: ${yamlQuote(thought.type)}`);
  if (thought.action_items?.length) {
    lines.push('action_items:');
    for (const a of thought.action_items) lines.push(`  - ${yamlQuote(a)}`);
  }
  lines.push(`captured_at: ${yamlQuote(thought.created_at)}`);
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

  // Step 2: Fetch all thoughts + vectors from Qdrant (vectors needed for
  // semantic autolinks below).
  emit(`[${ts()}] Fetching thoughts + vectors from Qdrant...`);
  const rawPoints = await getAllWithVectors();
  // Skip archived points entirely in the export
  const thoughts = rawPoints.filter((p) => p.payload.status !== 'archived');
  emit(`[${ts()}] Found ${thoughts.length} active thoughts (${rawPoints.length - thoughts.length} archived skipped)`);

  if (thoughts.length === 0) {
    emit(`[${ts()}] Nothing to export`);
    return { ok: true, rebuilt: true, deleted: existingFiles.length, exported_count: 0, files: [] };
  }

  // Step 3: Build filenames and attach to points for neighbor lookup
  const filenames = thoughts.map((p) => thoughtFilename(p.payload));
  thoughts.forEach((p, i) => { p.filename = filenames[i]; });
  emit(`[${ts()}] Filenames built — neighbor search will run per-thought (cosine)`);

  // Step 4: Write all thoughts as .md files with semantic Related thoughts.
  // Batched-parallel uploads (mirror the delete batch above) — sequential
  // awaits made this loop the dominant cost as N grew past a few hundred.
  emit(`[${ts()}] Writing ${thoughts.length} thought files...`);
  const files = new Array(thoughts.length);
  const UPLOAD_BATCH = 10;
  for (let i = 0; i < thoughts.length; i += UPLOAD_BATCH) {
    const batch = thoughts.slice(i, i + UPLOAD_BATCH);
    await Promise.all(batch.map(async (p, j) => {
      const idx = i + j;
      const t = p.payload;
      const filename = filenames[idx];

      const frontmatter = toFrontmatter(t);
      const links = buildLinksSection({ id: p.id, vector: p.vector, payload: t }, filename, thoughts);
      const dateStr = formatDate(t.created_at);
      const content = `${frontmatter}\n\n*${dateStr}*\n\n${t.text}\n${links}\n`;

      await drive.files.create({
        requestBody: {
          name: filename,
          mimeType: 'text/markdown',
          parents: [folderId],
          createdTime: t.created_at,
          modifiedTime: t.updated_at || t.created_at,
        },
        media: {
          mimeType: 'text/markdown',
          body: content,
        },
      });

      files[idx] = filename;
      emit(`[${ts()}]   ✓ ${filename}`);
    }));
  }

  // Step 4b: index.md — one line per thought (P7e revived, new rationale: the
  // original P7e died as a HUMAN-facing catalogue; this one is the AGENT-facing
  // routing map from the second-brain playbook — "check the index first, open
  // files second". Regenerated inside the atomic full rebuild, so it can never
  // drift from the vault. Zero model calls: title IS the one-liner (Haiku wrote
  // it at capture time).
  emit(`[${ts()}] Writing index.md (${thoughts.length} entries)...`);
  const indexLines = thoughts
    .slice()
    .sort((a, b) => String(b.payload.effective_date || b.payload.created_at || '')
      .localeCompare(String(a.payload.effective_date || a.payload.created_at || '')))
    .map((p) => {
      const t = p.payload;
      const stem = p.filename.replace('.md', '');
      const date = String(t.effective_date || t.created_at || '').slice(0, 10);
      const tags = [
        ...(t.people || []).map((x) => `@${x}`),
        ...(t.projects || []).map((x) => `#${x}`),
      ].join(' ');
      return `- [[${stem}]] — ${t.title || '(untitled)'} · ${t.type || 'unknown'} · ${date}${tags ? ` · ${tags}` : ''}`;
    });
  const indexContent = [
    '# Index — customBrain',
    '',
    '> Agent routing map: one line per thought (newest first). Check here first, open files second.',
    `> Regenerated on every vault rebuild (${new Date().toISOString().slice(0, 10)}) — cannot drift from the vault.`,
    '',
    ...indexLines,
    '',
  ].join('\n');
  await drive.files.create({
    requestBody: { name: 'index.md', mimeType: 'text/markdown', parents: [folderId] },
    media: { mimeType: 'text/markdown', body: indexContent },
  });
  emit(`[${ts()}]   ✓ index.md`);

  // Step 5: People & Projects
  const allPeople = new Set();
  const allProjects = new Set();
  for (const p of thoughts) {
    for (const person of p.payload.people || []) allPeople.add(person);
    for (const project of p.payload.projects || []) allProjects.add(project);
  }

  const typeCounts = {};
  for (const p of thoughts) {
    const type = p.payload.type || 'unknown';
    typeCounts[type] = (typeCounts[type] || 0) + 1;
  }

  // Load vault context so writeStubs can resolve non-canonical names via the
  // alias map. Without this check the export would create a brand-new
  // canonical .md for every accent/order variant Haiku slipped past capture
  // — that's how Hollósi István.md kept resurfacing alongside Istvan Hollosi.md.
  const vaultCtx = await getVaultContext();

  async function writeStubs(folderName, names, envFolderId, aliases, { skipAutoCreate = false } = {}) {
    if (names.size === 0) return { total: 0, created: [], existing: [], skipped: [] };
    if (!envFolderId) {
      emit(`[${ts()}] Skipping ${folderName}/ — no folder ID configured`);
      return { total: names.size, created: [], existing: [...names], skipped: [] };
    }
    emit(`[${ts()}] Syncing ${folderName}/ (${names.size} entries)...`);
    const subfolderId = envFolderId;

    const listDrive = getDriveClient();
    const existingNames = new Set();
    let pt;
    do {
      const res = await listDrive.files.list({
        q: `'${subfolderId}' in parents and trashed=false and mimeType != 'application/vnd.google-apps.folder'`,
        fields: 'nextPageToken, files(name)',
        pageSize: 100,
        pageToken: pt,
      });
      for (const f of res.data.files) {
        existingNames.add(f.name);
        existingNames.add(f.name.replace(/\.md$/, ''));
      }
      pt = res.data.nextPageToken;
    } while (pt);

    // Case-insensitive alias lookup mirroring metadata.js::resolveAliases.
    const aliasMap = aliases || {};
    const aliasLower = {};
    for (const [a, c] of Object.entries(aliasMap)) aliasLower[a.toLowerCase()] = c;

    const created = [];
    const existing = [];
    const skipped = [];
    for (const name of names) {
      const resolved = aliasLower[name.toLowerCase()] || name;
      if (existingNames.has(resolved) || existingNames.has(`${resolved}.md`)) {
        existing.push(name);
        continue;
      }
      if (skipAutoCreate) {
        emit(`[${ts()}]   ⚠ unknown ${folderName.toLowerCase()}: "${name}" — add to vault manually if real`);
        skipped.push(name);
        continue;
      }

      const related = thoughts
        .filter((p) => (p.payload.people || []).includes(name) || (p.payload.projects || []).includes(name))
        .map((p) => p.filename.replace('.md', ''));
      const backlinks = related.map((fn) => `- [[${fn}]]`).join('\n');
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
    if (created.length === 0 && skipped.length === 0) emit(`[${ts()}]   No new ${folderName.toLowerCase()} entries`);
    return { total: names.size, created, existing, skipped };
  }

  const peopleResult = await writeStubs(
    'People',
    allPeople,
    process.env.GOOGLE_DRIVE_PEOPLE_FOLDER_ID,
    vaultCtx.aliases,
  );
  const projectsResult = await writeStubs(
    'Projects',
    allProjects,
    process.env.GOOGLE_DRIVE_PROJECTS_FOLDER_ID,
    vaultCtx.projectAliases,
    { skipAutoCreate: true },
  );

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  emit(`[${elapsed}s] ── Export complete ──`);
  const skippedNote = projectsResult.skipped.length
    ? ` · ${projectsResult.skipped.length} unknown projects skipped`
    : '';
  emit(`  ${files.length} thoughts · ${existingFiles.length} deleted · ${peopleResult.created.length} new people · ${projectsResult.created.length} new projects${skippedNote}`);
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
      skipped: projectsResult.skipped,
    },
  };
}

export const exportThoughts = rebuildVault;
