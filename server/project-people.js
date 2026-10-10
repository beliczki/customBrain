// Who belongs to a project (0.66.0) — the context names.resolveFirstNames
// decides bare first names with. Two sources:
//   - the Projects dossier's `people:` frontmatter (hand-curated);
//   - people tagged together with the project on at least MIN_CO thoughts.
// Built from payload fields only (no text, no vectors) and cached like the
// vault context, so capture in any process can afford it.

import { payloadFieldRows } from './qdrant.js';
import { resolveAliases } from './names.js';

const MIN_CO = 2;
const CACHE_TTL = 60 * 60 * 1000;
let cached = null;
let cachedAt = 0;

// `people:` entries are wikilinks: "[[People/Miklos Kun|Miklos Kun]]".
function dossierPeople(doc) {
  const fm = /^---\n([\s\S]*?)\n---/.exec(doc || '');
  if (!fm) return [];
  const block = /^people:\s*\n((?:\s+-.*\n?)*)/m.exec(fm[1]);
  if (!block) return [];
  return [...block[1].matchAll(/-\s*"?\[\[(?:People\/)?([^|\]]+)(?:\|[^\]]*)?\]\]"?/g)].map((m) => m[1].trim());
}

export async function getProjectPeople(vault) {
  if (cached && Date.now() - cachedAt < CACHE_TTL) return cached;
  const map = new Map();
  const add = (project, person) => {
    if (!map.has(project)) map.set(project, new Set());
    map.get(project).add(person);
  };
  for (const [project, doc] of Object.entries(vault.projectDocs)) {
    for (const p of resolveAliases(dossierPeople(doc), vault.aliases, vault.people)) add(project, p);
  }
  const counts = new Map(); // "project\u0000person" → n
  for (const [, [people, projects]] of await payloadFieldRows(['people', 'projects'])) {
    for (const pr of projects || []) for (const p of people || []) {
      const k = `${pr}\u0000${p}`;
      counts.set(k, (counts.get(k) || 0) + 1);
    }
  }
  for (const [k, n] of counts) {
    if (n < MIN_CO) continue;
    const [project, person] = k.split('\u0000');
    add(project, person);
  }
  cached = map;
  cachedAt = Date.now();
  return map;
}
