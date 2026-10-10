// Rewrite thought `people` arrays to the canonical dossier name (0.53.x).
// Old payloads carry accent/order variants ("Kun Miklos", "Béla Szabó") that
// capture now resolves via nameKey, but quick_lookup and the anchor layer
// compare stored strings — so one person still splits into several.
//
// Dry run by default: prints per-person counts, ambiguous groups, and writes
// nothing. --apply updates payloads and saves a before/after snapshot to
// tasks/people-migration-<date>.json (the rollback record).
//
// A name key shared by several dossiers (the People duplicates) resolves to
// the dossier an alias points at; if no alias decides it, the group is
// ambiguous and skipped — that is a People-folder decision, not ours.
//
// Usage: node scripts/migrate-people-names.js [--apply]
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFileSync } from 'node:fs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: join(ROOT, '.env') });
import { applySettingsToEnv } from '../server/config.js';
applySettingsToEnv();
import { QdrantClient } from '@qdrant/js-client-rest';
import { THOUGHTS } from '../server/collections.js';
import { getVaultContext } from '../server/drive-context.js';
import { nameKey } from '../server/names.js';
import { updatePayload } from '../server/qdrant.js';

const APPLY = process.argv.includes('--apply');
const q = new QdrantClient({ url: process.env.QDRANT_URL || 'http://localhost:6333' });

const vault = await getVaultContext();
// getVaultContext returns an empty context on a Drive error; migrating against
// that would be a silent no-op at best. The People folder holds ~300 dossiers.
if (vault.people.length < 200) throw new Error(`vault context has only ${vault.people.length} people — Drive read failed?`);

// key → canonical. Canonicals first, then aliases override, so an alias decides
// between duplicate dossiers sharing one key.
const byKey = new Map();
const canonicalsByKey = new Map();
for (const c of vault.people) {
  const k = nameKey(c);
  if (!canonicalsByKey.has(k)) canonicalsByKey.set(k, []);
  canonicalsByKey.get(k).push(c);
}
const aliasDecided = new Map();
for (const [alias, canonical] of Object.entries(vault.aliases)) {
  aliasDecided.set(nameKey(alias), canonical);
  aliasDecided.set(nameKey(canonical), canonical);
}
const ambiguous = new Map();
for (const [k, cs] of canonicalsByKey) {
  if (aliasDecided.has(k)) byKey.set(k, aliasDecided.get(k));
  else if (cs.length === 1) byKey.set(k, cs[0]);
  else ambiguous.set(k, cs);
}
for (const [k, c] of aliasDecided) if (!byKey.has(k) && !ambiguous.has(k)) byKey.set(k, c);

const points = [];
let offset;
do {
  const b = await q.scroll(THOUGHTS, {
    filter: { must_not: [{ key: 'kind', match: { any: ['chunk', 'dossier', 'repo_doc'] } }] },
    limit: 256, offset, with_payload: ['people', 'title'], with_vector: false,
  });
  points.push(...b.points);
  offset = b.next_page_offset;
} while (offset != null);

const changes = [];
const renames = new Map(); // "from → to" → count
const ambiguousHits = new Map();
for (const p of points) {
  const before = p.payload.people || [];
  if (!before.length) continue;
  const after = [...new Set(before.map((n) => {
    const k = nameKey(n);
    if (ambiguous.has(k)) { ambiguousHits.set(n, (ambiguousHits.get(n) || 0) + 1); return n; }
    return byKey.get(k) ?? n;
  }))];
  if (after.length === before.length && after.every((n, i) => n === before[i])) continue;
  for (const n of before) {
    const to = byKey.get(nameKey(n));
    if (to && to !== n) renames.set(`${n} → ${to}`, (renames.get(`${n} → ${to}`) || 0) + 1);
  }
  changes.push({ id: p.id, title: p.payload.title, before, after });
}

console.log(`people-migration: ${points.length} thoughts scanned, ${changes.length} to change${APPLY ? '' : ' (dry run)'}`);
console.log(`\nRenames (${renames.size}):`);
for (const [r, n] of [...renames].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${r}`);
console.log(`\nAmbiguous groups skipped (${ambiguous.size}) — several dossiers, no alias decides:`);
for (const [k, cs] of ambiguous) console.log(`  ${cs.join(' | ')}`);
console.log(`\nThought mentions left untouched because ambiguous: ${[...ambiguousHits].map(([n, c]) => `${n}(${c})`).join(', ') || 'none'}`);

if (!APPLY) process.exit(0);

const snap = join(ROOT, 'tasks', `people-migration-${new Date().toISOString().slice(0, 10)}.json`);
writeFileSync(snap, JSON.stringify(changes, null, 2));
console.log(`\nSnapshot: ${snap}`);
let ok = 0;
for (const c of changes) {
  await updatePayload(c.id, { people: c.after });
  ok++;
}
console.log(`Applied ${ok}/${changes.length}`);
