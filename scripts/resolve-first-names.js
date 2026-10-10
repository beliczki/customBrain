// Resolve bare first names in stored thoughts from their project context
// (0.66.0) — the retro half of names.resolveFirstNames, which capture now runs
// on every new thought. "Csaba" on an ERSTE Számlák thread becomes Brunner
// Csaba only when exactly one person of that project carries the name; every
// other bare name stays as written.
//
// Dry run by default: lists every bare name with what it would become and
// why it stays. --apply saves a before/after snapshot to
// tasks/first-names-<date>.json (the rollback record) and writes the people
// arrays; `updated_at` is untouched so thoughts don't come back as commitment
// candidates.
//
// Usage: node scripts/resolve-first-names.js [--apply]

import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { applySettingsToEnv } from '../server/config.js';
import { getVaultContext } from '../server/drive-context.js';
import { nameKey, resolveFirstNames } from '../server/names.js';
import { payloadFieldRows, updatePayload } from '../server/qdrant.js';
import { getProjectPeople } from '../server/project-people.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: join(ROOT, '.env') });
applySettingsToEnv();

const APPLY = process.argv.includes('--apply');

const vault = await getVaultContext();
// An empty context (Drive error) would resolve nothing and look like success.
if (vault.people.length < 200) throw new Error(`vault context has only ${vault.people.length} people — Drive read failed?`);
const projectPeople = await getProjectPeople(vault);

const changes = [];
const kept = new Map(); // "name @ projects" → count
for (const [id, [people, projects, title]] of await payloadFieldRows(['people', 'projects', 'title'])) {
  const before = people || [];
  if (!before.some((n) => n !== 'Me' && nameKey(n).split(' ').length === 1)) continue;
  const after = resolveFirstNames(before, projects, { people: vault.people, projectPeople });
  for (const n of before) {
    if (n === 'Me' || nameKey(n).split(' ').length > 1 || after.includes(n) === false) continue;
    const k = `${n} @ ${(projects || []).join(', ') || '—'}`;
    kept.set(k, (kept.get(k) || 0) + 1);
  }
  if (after.length === before.length && after.every((n, i) => n === before[i])) continue;
  changes.push({ id, title, projects, before, after });
}

console.log(`first-names: ${changes.length} thoughts to change${APPLY ? '' : ' (dry run)'}`);
for (const c of changes) {
  const moved = c.before.filter((n) => !c.after.includes(n)).map((n) => `${n} → ${c.after.find((a) => nameKey(a).split(' ').includes(nameKey(n)))}`);
  console.log(`  ${moved.join(', ')}  [${(c.projects || []).join(', ')}]  ${c.title}`);
}
console.log(`\nLeft as written (no single person of the project carries the name): ${kept.size}`);
for (const [k, n] of [...kept].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${k}`);

if (!APPLY) process.exit(0);

const snap = join(ROOT, 'tasks', `first-names-${new Date().toISOString().slice(0, 10)}.json`);
writeFileSync(snap, JSON.stringify(changes, null, 2));
console.log(`\nSnapshot: ${snap}`);
for (const c of changes) await updatePayload(c.id, { people: c.after });
console.log(`Applied ${changes.length}/${changes.length}`);
process.exit(0);
