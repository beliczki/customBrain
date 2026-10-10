// Repo documentation as a brain source (0.70.0,
// docs/repo-es-fajl-forras-terv-2026-10-10.md). What matters in a repo is what
// it says about itself — README, ROADMAP, CLAUDE/AGENTS, tasks, docs — not its
// commits or code. Each heading section becomes one Qdrant point
// (kind: 'repo_doc'); task files contribute only their OPEN items.
//
// Runs after buildReposStatus in the daily cron, over the repos that status
// could read. A file's blob sha (from the git tree listing) gates the work: an
// unchanged file is neither downloaded nor re-embedded.

import crypto from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { embedText } from './embeddings.js';
import { sparseEncodeDoc } from './sparse.js';
import { upsertPoint, deletePointsByIds } from './qdrant.js';

const MANIFEST_PATH = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'state', 'repo-docs-manifest.json');

// Which files are documentation. docs/ and tasks/ top level only; archives out.
const ROOT_DOCS = /^(README|ROADMAP|CLAUDE|AGENTS)\.md$/i;
const DIR_DOCS = /^(docs|tasks)\/[^/]+\.md$/;
const TASK_FILE = /^tasks\/|ROADMAP\.md$/i;
// Hand-set: bigger docs/ files are data (raw transcripts, programmes —
// confAi2 has 350–560 KB ones), not documentation. Task files and the ROADMAP
// are exempt: only their open items are kept, and confAi2's tasks/todo.md
// (~2400 lines) is exactly what must not be missed.
const MAX_FILE_BYTES = 100_000;
const MAX_SECTION_CHARS = 4000;
const MIN_SECTION_CHARS = 80;
const MAX_SECTIONS_PER_FILE = 40;

async function gh(path) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status} on ${path}`);
  return res.json();
}

function loadManifest() {
  try { return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')); } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
}

function pointId(key) {
  const h = crypto.createHash('md5').update(`repo_doc:${key}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** Split markdown at #/## headings; task files keep only open checkboxes. */
export function sections(path, md) {
  const out = [];
  let heading = path;
  let buf = [];
  const flush = () => {
    let text = buf.join('\n').trim();
    if (TASK_FILE.test(path) && /- \[[ xX]\]/.test(text)) {
      // A checklist section: only what is still open, done items are history.
      const open = text.split('\n').filter((l) => /^\s*[-*] \[ \]/.test(l));
      text = open.join('\n');
    }
    if (text.length >= MIN_SECTION_CHARS) out.push({ heading, text: text.slice(0, MAX_SECTION_CHARS) });
    buf = [];
  };
  for (const line of md.split('\n')) {
    const h = /^(#{1,2})\s+(.+)$/.exec(line);
    if (h) { flush(); heading = h[2].trim(); continue; }
    buf.push(line);
  }
  flush();
  return out.slice(0, MAX_SECTIONS_PER_FILE);
}

/**
 * Sync every readable repo's docs into Qdrant. `repos` = repos-status entries.
 * Returns per-repo counts; throws only on a failure that would make the
 * manifest lie (an upsert), never silently skips a listed file.
 */
export async function syncRepoDocs(repos) {
  const manifest = loadManifest();
  const report = [];
  for (const r of repos) {
    if (r.error) { report.push({ repo: r.repo || r.dossier, skipped: r.error }); continue; }
    const tree = await gh(`/repos/${r.repo}/git/trees/${r.default_branch}?recursive=1`);
    if (tree.truncated) throw new Error(`${r.repo}: git tree truncated — the file list is incomplete`);
    const files = tree.tree.filter((t) => t.type === 'blob' && (ROOT_DOCS.test(t.path) || DIR_DOCS.test(t.path))
      && !/archive/i.test(t.path) && (TASK_FILE.test(t.path) || t.size <= MAX_FILE_BYTES));
    let indexed = 0; let sectionsIndexed = 0; let deleted = 0;
    const seen = new Set();
    for (const f of files) {
      const key = `${r.repo}:${f.path}`;
      seen.add(key);
      const prev = manifest[key];
      if (prev && prev.sha === f.sha && prev.project === r.project) continue;
      const blob = await gh(`/repos/${r.repo}/git/blobs/${f.sha}`);
      const md = Buffer.from(blob.content, 'base64').toString('utf8');
      const [commit] = await gh(`/repos/${r.repo}/commits?path=${encodeURIComponent(f.path)}&per_page=1`);
      const date = commit.commit.committer.date;
      const ids = [];
      for (const [n, s] of sections(f.path, md).entries()) {
        const id = pointId(`${key}#${n}`);
        const title = `${r.repo.split('/')[1]}/${f.path} › ${s.heading}`;
        const input = `${title}\n${s.text}`;
        await upsertPoint(await embedText(input, 'RETRIEVAL_DOCUMENT'), sparseEncodeDoc(input), {
          kind: 'repo_doc', type: 'repo_doc', source: 'repo', status: 'active',
          repo: r.repo, project: r.project, path: f.path, heading: s.heading,
          branch: r.default_branch, title, text: s.text,
          created_at: date, updated_at: date, effective_date: date,
        }, id);
        ids.push(id);
      }
      const stale = (prev ? prev.ids : []).filter((id) => !ids.includes(id));
      if (stale.length) { await deletePointsByIds(stale); deleted += stale.length; }
      manifest[key] = { sha: f.sha, project: r.project, ids };
      indexed += 1; sectionsIndexed += ids.length;
    }
    // Files gone from the repo (renamed, deleted, now too big): the tree was
    // read whole (not truncated), so absence is real.
    for (const key of Object.keys(manifest)) {
      if (!key.startsWith(`${r.repo}:`) || seen.has(key)) continue;
      if (manifest[key].ids.length) await deletePointsByIds(manifest[key].ids);
      deleted += manifest[key].ids.length;
      delete manifest[key];
    }
    report.push({ repo: r.repo, files: files.length, indexed, sections: sectionsIndexed, deleted });
    // Saved per repo, so a failure later in the run does not re-embed this one.
    mkdirSync(dirname(MANIFEST_PATH), { recursive: true });
    writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  }
  return report;
}
