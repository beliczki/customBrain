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

/**
 * Anchors named in a question, matched word by word, order- and
 * accent-insensitive (the nameKey contract). Hungarian inflects names
 * ("Országtuninggal", "Kun Miklóssal"), so a name word of 4+ letters also
 * matches as the START of a question word; shorter ones must match exactly. A one-word PERSON name is never
 * an anchor on its own — bare first names misfire ("Attila" → Barta Attila,
 * "Me" in an English sentence) — it is returned as a candidate instead.
 * An all-caps one-word project/topic ("MET") must match case-sensitively, or
 * every English "met" would anchor it.
 */
export function matchAnchors(question, vault) {
  const words = String(question).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const keys = words.map((w) => stripAccents(w).toLowerCase());
  const raw = new Set(words);
  const hit = (t) => keys.some((k) => k === t || (t.length >= 4 && k.startsWith(t)));
  const found = { projects: new Set(), people: new Set(), topics: new Set(), candidates: new Set() };

  // 0.76.0: a project/topic word that belongs to ONE canonical only (and is
  // 5+ letters) can name it on its own — "Országtuning" is RMT Országtuning,
  // while "ERSTE", shared by seven ERSTE dossiers, names none of them alone.
  const owners = new Map(); // token → Set of canonicals
  for (const [names, aliases] of [[vault.projects, vault.projectAliases], [vault.topicCanonicals, vault.topicAliases]]) {
    for (const [name, canonical] of [...names.map((n) => [n, n]), ...Object.entries(aliases || {})]) {
      for (const t of nameKey(name).split(' ').filter(Boolean)) {
        if (!owners.has(t)) owners.set(t, new Set());
        owners.get(t).add(canonical);
      }
    }
  }
  // …and it must look like a name in the question: capitalised there, or 8+
  // letters (rarely an everyday word). "market research" must not name ERSTE
  // Market; "Market", "Országtuning" or "országtuning" may.
  const capitalised = new Set(words.filter((w) => /^\p{Lu}/u.test(w)).map((w) => stripAccents(w).toLowerCase()));
  const looksNamed = (t) => t.length >= 8 || [...capitalised].some((k) => k === t || k.startsWith(t));
  const uniqueHit = (tokens) => tokens.some((t) => t.length >= 5 && owners.get(t).size === 1 && hit(t) && looksNamed(t));

  const scan = (bucket, names, aliases) => {
    const entries = [...names.map((n) => [n, n]), ...Object.entries(aliases || {})];
    for (const [name, canonical] of entries) {
      const tokens = nameKey(name).split(' ').filter(Boolean);
      if (!tokens.length) continue;
      if (!tokens.every(hit)) {
        if (bucket !== 'people' && tokens.length > 1 && uniqueHit(tokens)) found[bucket].add(canonical);
        continue;
      }
      if (tokens.length === 1) {
        if (bucket === 'people') { found.candidates.add(canonical); continue; }
        if (/^\p{Lu}{2,}$/u.test(name) && !raw.has(name)) continue;
      }
      found[bucket].add(canonical);
    }
  };
  scan('projects', vault.projects, vault.projectAliases);
  scan('people', vault.people, vault.aliases);
  scan('topics', vault.topicCanonicals, vault.topicAliases);
  for (const p of found.people) found.candidates.delete(p);
  return Object.fromEntries(Object.entries(found).map(([k, v]) => [k, [...v]]));
}
