// One comparison key for person/project/topic names, shared by alias
// resolution (metadata.js, reprocess-v2.js) and the people verifier.
// Accent- and order-insensitive: the model writes "Kun Miklos" for the vault's
// "Miklos Kun" whose meetings say "Miklós Kun" — exact lowercase matching
// rejected the real participant (reprocess A/B, 2026-10-09).
export function stripAccents(s) {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

export function nameKey(s) {
  return stripAccents(String(s)).toLowerCase().split(/\s+/).filter(Boolean).sort().join(' ');
}

// Map each name to its canonical form: via an alias, or a canonical spelled
// differently (accents, order, case). Unknown names pass through unchanged.
export function resolveAliases(names, aliases, canonicals = []) {
  if (!names?.length) return names;
  const byKey = new Map();
  for (const c of canonicals) byKey.set(nameKey(c), c);
  for (const [alias, canonical] of Object.entries(aliases || {})) {
    byKey.set(nameKey(canonical), canonical);
    byKey.set(nameKey(alias), canonical);
  }
  return [...new Set(names.map((n) => byKey.get(nameKey(n)) ?? n))];
}

const isBare = (name) => nameKey(name).split(' ').length === 1;

/**
 * Bare first names resolved by context (0.66.0). "Csaba" alone is not a
 * person; in an ERSTE Számlák thought it is Brunner Csaba, elsewhere someone
 * else. A one-word name becomes the full canonical name only when exactly one
 * canonical person carries that word AND belongs to one of the thought's
 * projects (`projectPeople`: project → Set of canonical names). Otherwise it
 * stays as written — a wrong guess would be worse than an open first name.
 * "Me" and anything already canonical pass through.
 */
export function resolveFirstNames(names, projects, { people, projectPeople }) {
  if (!names?.length) return names;
  const full = people.filter((p) => !isBare(p));
  const pool = new Set();
  for (const pr of projects || []) for (const p of projectPeople.get(pr) || []) pool.add(p);
  const out = names.map((n) => {
    if (n === 'Me' || !isBare(n)) return n;
    const word = nameKey(n);
    const hits = full.filter((p) => pool.has(p) && nameKey(p).split(' ').includes(word));
    return hits.length === 1 ? hits[0] : n;
  });
  return [...new Set(out)];
}
