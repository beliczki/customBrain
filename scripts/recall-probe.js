// Recall probe: does `search` find an entry when asked with its own words?
// READ-ONLY against Qdrant. No LLM call; one query embedding per probe.
//
// A probe is a verbatim 12–20 word excerpt of a stored entry (a "thought" in
// the code); the right answer is the entry it came from. The run goes through
// the real searchThoughts — hybrid search, chunk roll-up, time decay, dossier
// boost — so it measures what an agent gets, and reports Hit@1 / @3 / @10 by
// source, length, where in the text the excerpt sat, and the entry's age.
// What it cannot tell: how real questions do. An excerpt rewards exact words.
//
// Usage (on the server, in the repo folder):
//   node scripts/recall-probe.js --build [--size 150] [--seed N] [--force]
//       sample the store once and freeze the probe set
//   node scripts/recall-probe.js [--limit 10]
//       run the frozen set and print the table
//
// PRIVATE DATA: the probe set holds verbatim text of mails and meetings, and
// the run files name the entries. Both stay under state/ (gitignored). Only the
// printed table, which has no entry text, may be copied into the repo.
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { applySettingsToEnv } from '../server/config.js';
import { buildProbeSet, runProbes, summarize, formatSummary } from '../server/recall-probes.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: join(REPO_ROOT, '.env') });
applySettingsToEnv();

const SET_PATH = join(REPO_ROOT, 'state', 'recall-probes.json');
const RUNS_DIR = join(REPO_ROOT, 'state', 'recall-probe-runs');
const FIELDS = ['text', 'source', 'status', 'created_at', 'effective_date', 'has_v2_summary', 'has_auto_summary'];

const args = process.argv.slice(2);
const has = (name) => args.includes(name);
const valueOf = (name, fallback) => (has(name) ? args[args.indexOf(name) + 1] : fallback);

if (has('--build')) {
  if (existsSync(SET_PATH) && !has('--force')) {
    console.error('A probe set already exists (state/recall-probes.json). A new set cannot be compared with earlier runs; pass --force to replace it anyway.');
    process.exit(1);
  }
  // Server modules load only now, after the settings are in the environment.
  const { payloadFieldRows } = await import('../server/qdrant.js');
  const rows = await payloadFieldRows(FIELDS);
  const entries = rows.map(([id, values]) => ({ id: String(id), ...Object.fromEntries(FIELDS.map((field, i) => [field, values[i]])) }));
  const set = buildProbeSet(entries, { seed: Number(valueOf('--seed', '20261123')), size: Number(valueOf('--size', '150')), now: Date.now() });
  mkdirSync(dirname(SET_PATH), { recursive: true });
  writeFileSync(SET_PATH, JSON.stringify(set, null, 2));

  const strata = {};
  for (const probe of set.probes) strata[`${probe.source}|${probe.length}`] = (strata[`${probe.source}|${probe.length}`] || 0) + 1;
  console.log(`Probe set built: ${set.probes.length} probes from ${entries.length} entries, seed ${set.seed}.`);
  console.log(`Held out: ${set.probes.filter((probe) => probe.held_out).length}. More than one right answer: ${set.probes.filter((probe) => probe.expected_ids.length > 1).length}.`);
  for (const key of Object.keys(strata).sort()) console.log(`  ${key.padEnd(20)}${String(strata[key]).padStart(4)}`);
  console.log('Saved to state/recall-probes.json. It holds private text: never commit it.');
  process.exit(0);
}

if (!existsSync(SET_PATH)) {
  console.error('No probe set yet. Build one first: node scripts/recall-probe.js --build');
  process.exit(1);
}
const set = JSON.parse(readFileSync(SET_PATH, 'utf8'));
const limit = Number(valueOf('--limit', '10'));
const { searchThoughts } = await import('../server/routes/search.js');

const started = Date.now();
let done = 0;
const search = async (query, max) => {
  const hits = await searchThoughts(query, max);
  done += 1;
  if (done % 25 === 0) console.error(`  ${done}/${set.probes.length}`);
  return hits;
};
const results = await runProbes(set.probes, search, { limit });
const summary = summarize(set.probes, results, { now: started, ks: [1, 3, 10].filter((k) => k <= limit) });
console.log(formatSummary(summary, { limit, set }));

const runAt = new Date(started).toISOString();
const seconds = Math.round((Date.now() - started) / 1000);
const file = `${runAt.replace(/[:.]/g, '-')}.json`;
mkdirSync(RUNS_DIR, { recursive: true });
writeFileSync(join(RUNS_DIR, file), JSON.stringify({ run_at: runAt, seconds, limit, set: { seed: set.seed, created_at: set.created_at, size: set.size }, summary, results }, null, 2));
console.log(`\n${seconds} s. Run saved to state/recall-probe-runs/${file}`);
// The Qdrant client keeps sockets open; without an exit the process lingers.
process.exit(0);
