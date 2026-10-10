// Machine-read repo facts for the Repos layer (0.55.0): version, last commit,
// and how stale the agent-facing docs are against the code. The Repos/ dossiers
// on Drive stay hand/session-written; this file never writes into them — it
// sits beside them in state/repos-status.json so a drift between the two is
// visible instead of overwritten.
import { writeFile, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchRepoDossiers } from './drive-context.js';

export const REPOS_STATUS_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'state', 'repos-status.json');

// The docs an agent reads before touching a repo. Stale ones mislead it.
const AGENT_DOCS = ['CLAUDE.md', 'AGENTS.md', 'ROADMAP.md'];
// Hand-set starting value: this many commits since a doc last changed flags it.
const DOC_DRIFT_COMMITS = 20;

async function gh(path) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub ${res.status} on ${path}`);
  return res.json();
}

// Commits on the default branch since an ISO date, counted up to 100 (one
// page). Beyond that the exact number does not change the verdict.
async function commitsSince(slug, since) {
  const list = await gh(`/repos/${slug}/commits?since=${encodeURIComponent(since)}&per_page=100`);
  return list ? list.length : 0;
}

async function repoStatus(slug) {
  const meta = await gh(`/repos/${slug}`);
  // A fine-grained token answers 404 for repos outside its selection, the
  // same as for a repo that does not exist — say so, don't guess which.
  if (!meta) return { error: 'not found or not in the token\'s repository selection' };

  const [last] = await gh(`/repos/${slug}/commits?per_page=1`);
  const pkg = await gh(`/repos/${slug}/contents/package.json`);
  const version = pkg ? JSON.parse(Buffer.from(pkg.content, 'base64').toString('utf8')).version || null : null;

  const docs = {};
  for (const doc of AGENT_DOCS) {
    const commits = await gh(`/repos/${slug}/commits?path=${doc}&per_page=1`);
    if (!commits || !commits.length) continue; // the repo has no such doc
    const date = commits[0].commit.committer.date;
    docs[doc] = { last_changed: date, commits_since: await commitsSince(slug, date) };
  }

  return {
    default_branch: meta.default_branch,
    pushed_at: meta.pushed_at,
    last_commit: { sha: last.sha.slice(0, 7), date: last.commit.committer.date, message: last.commit.message.split('\n')[0] },
    version,
    docs,
  };
}

function driftOf(dossierVersion, status) {
  const drift = [];
  if (dossierVersion && status.version && dossierVersion !== status.version) {
    drift.push(`dossier says ${dossierVersion}, package.json is ${status.version}`);
  }
  for (const [doc, d] of Object.entries(status.docs)) {
    if (d.commits_since >= DOC_DRIFT_COMMITS) drift.push(`${doc}: ${d.commits_since >= 100 ? '100+' : d.commits_since} commits since last change (${d.last_changed.slice(0, 10)})`);
  }
  return drift;
}

export async function buildReposStatus() {
  if (!process.env.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN is not set (Settings → GitHub)');
  const { files, failures } = await fetchRepoDossiers();
  // A dossier that failed to download would silently drop its repo from the
  // status, which then reads as "no repo for this project".
  if (failures.length) throw new Error(`Repos dossiers unreadable: ${failures.join(', ')}`);

  const repos = [];
  for (const d of files) {
    const url = d.body.match(/^repo:\s*(\S+)/m);
    if (!url) { repos.push({ dossier: d.name, error: 'dossier has no repo: line' }); continue; }
    const slug = url[1].replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '');
    const project = d.body.match(/^project:\s*(.+)$/m);
    const dossierVersion = d.body.match(/Verzió:\s*v?(\d+\.\d+\.\d+)/);
    const status = await repoStatus(slug);
    repos.push({
      dossier: d.name,
      repo: slug,
      project: project ? project[1].trim() : null,
      dossier_modified: d.modifiedTime,
      dossier_version: dossierVersion ? dossierVersion[1] : null,
      ...status,
      drift: status.error ? [] : driftOf(dossierVersion && dossierVersion[1], status),
    });
  }

  const out = { generated_at: new Date().toISOString(), doc_drift_commits: DOC_DRIFT_COMMITS, repos };
  const tmp = `${REPOS_STATUS_PATH}.tmp`;
  await writeFile(tmp, JSON.stringify(out, null, 2));
  await rename(tmp, REPOS_STATUS_PATH);
  return out;
}
