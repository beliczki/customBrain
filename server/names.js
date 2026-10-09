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
