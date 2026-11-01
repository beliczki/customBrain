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
// Optimal-string-alignment distance: a swapped pair counts as one typo.
function typoDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

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

  // A misspelt name ("ParlamanetAI") matched nothing, so spider had no anchor
  // and map/search no boost. Second pass for words nothing above recognised:
  // one typo in a 7-8 letter name part, two from 9 letters, same first letter,
  // and the nearest parts must all belong to ONE name. The word must look like
  // a name (capitalised, or 9+ letters), so Hungarian inflections of everyday
  // words ("számlát" ≠ ERSTE Számlák) stay out. A person goes to candidates:
  // one name part alone never proves who is meant.
  const nameParts = new Map(); // token → Set of `${bucket}|${canonical}`
  for (const [bucket, names, aliases] of [['projects', vault.projects, vault.projectAliases], ['topics', vault.topicCanonicals, vault.topicAliases], ['candidates', vault.people, vault.aliases]]) {
    for (const [name, canonical] of [...names.map((n) => [n, n]), ...Object.entries(aliases || {})]) {
      for (const t of nameKey(name).split(' ').filter(Boolean)) {
        if (!nameParts.has(t)) nameParts.set(t, new Set());
        nameParts.get(t).add(`${bucket}|${canonical}`);
      }
    }
  }
  for (const k of keys) {
    if (k.length < 7 || !(capitalised.has(k) || k.length >= 9)) continue;
    if ([...nameParts.keys()].some((t) => k === t || (t.length >= 4 && k.startsWith(t)))) continue;
    let best = Infinity;
    let nearest = new Set();
    for (const [t, own] of nameParts) {
      if (t.length < 7 || t[0] !== k[0]) continue;
      const dist = typoDistance(k, t);
      if (dist > (t.length >= 9 ? 2 : 1) || dist > best) continue;
      if (dist < best) { best = dist; nearest = new Set(); }
      for (const o of own) nearest.add(o);
    }
    if (nearest.size === 1) {
      const [bucket, canonical] = [...nearest][0].split('|');
      found[bucket].add(canonical);
    }
  }
  for (const p of found.people) found.candidates.delete(p);
  return Object.fromEntries(Object.entries(found).map(([k, v]) => [k, [...v]]));
}
