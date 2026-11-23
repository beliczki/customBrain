// Recall probe: pure functions. No imports, no Qdrant, no network, so that
// `npm test` can run them on the Mac. scripts/recall-probe.js wires them to the
// real store and the real `searchThoughts`.
//
// A probe is a verbatim excerpt of one entry (a "thought" in the code) plus the
// ids that count as the right answer. The measurement: does `search` return one
// of those ids in the top 1 / 3 / 10. No human gold: the source entry is the
// gold. Known bias: an excerpt rewards exact-word matching, so the result is a
// floor ("can every part of the stored text be found by its own words"), not a
// measure of real questions.

// The same separator server/routes/search.js uses between a stored summary and
// the original text. tests/recall-probes.test.mjs fails if the two drift apart.
export const SUMMARY_SEP = '\n\n---\n\n';

const POSITIONS = ['start', 'middle', 'end'];
const MIN_ENTRY_WORDS = 30; // shorter than this, the excerpt would be the entry
const MIN_REAL_WORDS = 8; // an excerpt of numbers and links tests nothing
const MIN_PER_STRATUM = 5;

/** mulberry32: a small seeded generator, so a probe set can be rebuilt exactly. */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The text as it came in: a stored summary in front of it is derived, not source. */
export function originalText(entry) {
  const text = entry.text || '';
  if (!(entry.has_v2_summary || entry.has_auto_summary)) return text;
  const at = text.indexOf(SUMMARY_SEP);
  return at < 0 ? text : text.slice(at + SUMMARY_SEP.length);
}

export function lengthBucket(chars) {
  if (chars < 2000) return 'short';
  return chars < 8000 ? 'medium' : 'long';
}

export function ageBucket(dateIso, now) {
  const days = (now - new Date(dateIso).getTime()) / 86400000;
  if (days <= 30) return '0-30';
  if (days <= 90) return '31-90';
  return days <= 365 ? '91-365' : '365+';
}

const wordsOf = (text) => text.split(/\s+/).filter(Boolean);
const normalize = (text) => wordsOf(text.toLowerCase()).join(' ');
const realWords = (words) => words.filter((w) => /\p{L}{3,}/u.test(w)).length;

/**
 * 12–20 consecutive words from the start, the middle or the end of a text.
 * Returns null when the text is too short or the part holds no real words.
 */
export function cutExcerpt(text, position, random, { minWords = 12, maxWords = 20 } = {}) {
  const words = wordsOf(text);
  const n = words.length;
  if (n < MIN_ENTRY_WORDS) return null;
  const length = minWords + Math.floor(random() * (maxWords - minWords + 1));
  const drift = Math.floor(random() * n * 0.1);
  let start;
  if (position === 'start') start = drift;
  else if (position === 'end') start = n - length - drift;
  else start = Math.floor(n / 2 - length / 2) + drift - Math.floor(n * 0.05);
  // A window of numbers or links: step on a few times before giving up.
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const from = Math.min(Math.max(start + (position === 'end' ? -attempt : attempt) * length, 0), n - length);
    const window = words.slice(from, from + length);
    if (realWords(window) >= MIN_REAL_WORDS) return window.join(' ');
  }
  return null;
}

/** Ids of the entries whose text holds the excerpt (spacing and case ignored). */
export function entriesContaining(excerpt, entries) {
  const needle = normalize(excerpt);
  return entries.filter((e) => normalize(e.text || '').includes(needle)).map((e) => e.id);
}

function shuffle(items, random) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

const sum = (numbers) => numbers.reduce((a, b) => a + b, 0);

// How many probes each stratum gives: a floor for the small ones, the rest in
// proportion to what each still has (largest remainder).
function allocate(counts, size) {
  const quota = counts.map((c) => Math.min(c, MIN_PER_STRATUM));
  if (sum(quota) > size) {
    const turn = counts.map(() => 0);
    let left = size;
    while (left > 0) {
      let moved = false;
      for (let i = 0; i < counts.length && left > 0; i += 1) {
        if (turn[i] < counts[i]) { turn[i] += 1; left -= 1; moved = true; }
      }
      if (!moved) break;
    }
    return turn;
  }
  const spare = counts.map((c, i) => c - quota[i]);
  const left = Math.min(size - sum(quota), sum(spare));
  if (left > 0) {
    const exact = spare.map((s) => (s / sum(spare)) * left);
    const add = exact.map(Math.floor);
    let rest = left - sum(add);
    const order = exact.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
    for (const [, i] of order) {
      if (rest <= 0) break;
      if (add[i] < spare[i]) { add[i] += 1; rest -= 1; }
    }
    add.forEach((a, i) => { quota[i] += a; });
  }
  return quota;
}

/**
 * A frozen probe set: a seeded sample stratified by source and length, one
 * excerpt per entry. `entries`: { id, text, source, status, created_at,
 * effective_date, has_v2_summary, has_auto_summary }. Archived entries are never
 * the source of a probe, but they count as a right answer when they hold the
 * same excerpt.
 */
export function buildProbeSet(entries, { seed, size, heldOutShare = 1 / 3, now }) {
  const random = seededRandom(seed);
  const strata = new Map();
  for (const entry of entries) {
    if (entry.status === 'archived') continue;
    const original = originalText(entry);
    if (wordsOf(original).length < MIN_ENTRY_WORDS) continue;
    const key = `${entry.source || 'manual'}|${lengthBucket(original.length)}`;
    if (!strata.has(key)) strata.set(key, []);
    strata.get(key).push({ entry, original });
  }
  const keys = [...strata.keys()].sort();
  for (const key of keys) shuffle(strata.get(key), random);
  const quota = allocate(keys.map((key) => strata.get(key).length), size);

  const picked = [];
  keys.forEach((key, k) => {
    let taken = 0;
    for (const { entry, original } of strata.get(key)) {
      if (taken >= quota[k]) break;
      const first = picked.length % POSITIONS.length;
      const tryOrder = [0, 1, 2].map((step) => POSITIONS[(first + step) % POSITIONS.length]);
      let query = null;
      let position = null;
      for (const candidate of tryOrder) {
        query = cutExcerpt(original, candidate, random);
        if (query) { position = candidate; break; }
      }
      if (!query) continue;
      const [source, length] = key.split('|');
      picked.push({
        source_id: entry.id,
        expected_ids: entriesContaining(query, entries),
        query,
        source,
        length,
        position,
        entry_date: entry.effective_date || entry.created_at,
      });
      taken += 1;
    }
  });

  const heldOut = new Set(shuffle(picked.map((_, i) => i), random).slice(0, Math.round(picked.length * heldOutShare)));
  const probes = picked.map((probe, i) => ({ id: `p${String(i + 1).padStart(3, '0')}`, ...probe, held_out: heldOut.has(i) }));
  return { version: 1, seed, created_at: new Date(now).toISOString(), size: probes.length, probes };
}

/**
 * Run every probe through `search(query, limit)` (the real searchThoughts on
 * the server, a fake in the tests). One at a time: the point is the answer the
 * agent would get, not throughput.
 */
export async function runProbes(probes, search, { limit = 10 } = {}) {
  const results = [];
  for (const probe of probes) {
    const hits = await search(probe.query, limit);
    const index = hits.findIndex((hit) => probe.expected_ids.includes(String(hit.id)));
    results.push({
      id: probe.id,
      rank: index < 0 ? null : index + 1,
      evidence: index < 0 ? null : hits[index].evidence,
      top_id: hits.length ? String(hits[0].id) : null,
    });
  }
  return results;
}

/** Wilson 95% score interval: honest at small n and near 100%. */
export function wilson(hits, n, z = 1.96) {
  if (!n) return null;
  const p = hits / n;
  const denominator = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denominator;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denominator;
  return { lower: Math.max(0, centre - margin), upper: Math.min(1, centre + margin) };
}

export function summarize(probes, results, { now, ks = [1, 3, 10] }) {
  const rows = probes.map((probe, i) => {
    if (results[i].id !== probe.id) throw new Error(`result ${i} belongs to ${results[i].id}, not to ${probe.id}`);
    return { probe, rank: results[i].rank, evidence: results[i].evidence, age: ageBucket(probe.entry_date, now) };
  });
  const stat = (subset) => ({
    n: subset.length,
    hit_at: Object.fromEntries(ks.map((k) => {
      const hits = subset.filter((row) => row.rank !== null && row.rank <= k).length;
      return [k, { hits, rate: subset.length ? hits / subset.length : null, ci: wilson(hits, subset.length) }];
    })),
  });
  // Groups in their natural order where they have one, alphabetical otherwise.
  const groupBy = (keyOf, order = []) => {
    const groups = {};
    for (const row of rows) (groups[keyOf(row)] ||= []).push(row);
    const keys = Object.keys(groups).sort((a, b) => order.indexOf(a) - order.indexOf(b) || a.localeCompare(b));
    return Object.fromEntries(keys.map((key) => [key, stat(groups[key])]));
  };
  const evidence = {};
  for (const row of rows) if (row.rank !== null) evidence[row.evidence] = (evidence[row.evidence] || 0) + 1;
  return {
    ks,
    all: stat(rows),
    by: {
      source: groupBy((row) => row.probe.source),
      length: groupBy((row) => row.probe.length, ['short', 'medium', 'long']),
      position: groupBy((row) => row.probe.position, POSITIONS),
      age: groupBy((row) => row.age, ['0-30', '31-90', '91-365', '365+']),
      part: groupBy((row) => (row.probe.held_out ? 'held-out' : 'tuning'), ['tuning', 'held-out']),
    },
    evidence,
    misses: rows.filter((row) => row.rank === null).map((row) => ({
      probe_id: row.probe.id,
      source_id: row.probe.source_id,
      source: row.probe.source,
      length: row.probe.length,
      position: row.probe.position,
      age: row.age,
    })),
  };
}

const percent = (x) => (x === null ? '   –  ' : `${(x * 100).toFixed(1)}%`);

/** The summary as a table for the terminal. It prints no entry text. */
export function formatSummary(summary, { limit, set }) {
  const last = summary.ks[summary.ks.length - 1];
  const line = (label, s) => {
    const ci = s.hit_at[last].ci;
    const cells = summary.ks.map((k) => percent(s.hit_at[k].rate).padStart(7)).join('');
    return `${label.padEnd(16)}${String(s.n).padStart(5)}${cells}   ${ci ? `[${(ci.lower * 100).toFixed(1)}, ${(ci.upper * 100).toFixed(1)}]` : ''}`;
  };
  const out = [
    `Recall probe: ${summary.all.n} probes, top ${limit}; set seed ${set.seed}, built ${set.created_at.slice(0, 10)}`,
    `${''.padEnd(16)}${'n'.padStart(5)}${summary.ks.map((k) => `@${k}`.padStart(7)).join('')}   95% CI of @${last}`,
    line('all', summary.all),
  ];
  for (const [group, stats] of Object.entries(summary.by)) {
    out.push(group);
    for (const [key, s] of Object.entries(stats)) out.push(line(`  ${key}`, s));
  }
  out.push(`found by: ${Object.entries(summary.evidence).map(([tag, count]) => `${tag} ${count}`).join(', ') || '–'}`);
  out.push(`missed in the top ${last}: ${summary.misses.length}`);
  for (const miss of summary.misses) out.push(`  ${miss.probe_id}  ${miss.source_id}  [${miss.source}, ${miss.length}, ${miss.position}, ${miss.age} days]`);
  return out.join('\n');
}
