// Daily cron — refreshes state/repos-status.json from GitHub (read-only token)
// for every repo a Repos/ dossier links. Drift between the dossier and the
// code is reported there, never fixed by writing into the dossier.

import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env') });
import { applySettingsToEnv } from '../server/config.js';
applySettingsToEnv();

import { buildReposStatus } from '../server/repos-status.js';
import { syncRepoDocs } from '../server/repo-docs.js';

async function run() {
  const startTime = Date.now();
  try {
    const out = await buildReposStatus();
    const errors = out.repos.filter((r) => r.error);
    const drifting = out.repos.filter((r) => r.drift.length);
    console.log(
      `[${new Date().toISOString()}] Repos status: ${out.repos.length} repos, ${errors.length} unreadable, ${drifting.length} drifting, ${((Date.now() - startTime) / 1000).toFixed(1)}s`
    );
    for (const r of errors) console.log(`  ! ${r.dossier}: ${r.error}`);
    for (const r of drifting) console.log(`  ~ ${r.dossier}: ${r.drift.join(' · ')}`);
    // 0.70.0: the repos' own docs (README, ROADMAP, tasks, docs) into the brain.
    for (const d of await syncRepoDocs(out.repos)) {
      console.log(d.skipped ? `  docs ${d.repo}: skipped (${d.skipped})` : `  docs ${d.repo}: ${d.files} files, ${d.indexed} re-indexed (${d.sections} sections), ${d.deleted} points deleted`);
    }
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Repos status failed:`, err.message);
    console.error(err);
    process.exit(1);
  }
}

run();
