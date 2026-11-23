// The recall probe (scripts/recall-probe.js) asks the brain with a verbatim
// excerpt of an entry and checks that `search` returns that entry. The script
// needs the server; everything it computes is in server/recall-probes.js, pure
// functions tested here on made-up entries.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import {
  SUMMARY_SEP, seededRandom, originalText, cutExcerpt, lengthBucket, ageBucket,
  entriesContaining, buildProbeSet, runProbes, summarize, wilson, formatSummary,
} from '../server/recall-probes.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DAY = 86400000;
const NOW = Date.parse('2026-11-23T12:00:00Z');

// `count` distinct, word-like tokens that belong to one entry only.
const words = (tag, count) => Array.from({ length: count }, (_, i) => `word${tag}item${String.fromCharCode(97 + (i % 26))}${i}`).join(' ');

function entry(n, { source = 'gmail', wordCount = 200, daysOld = 10, status, summary } = {}) {
  const body = words(`n${n}`, wordCount);
  return {
    id: `id-${n}`,
    text: summary ? `${summary}${SUMMARY_SEP}${body}` : body,
    source,
    status,
    has_v2_summary: Boolean(summary),
    created_at: new Date(NOW - daysOld * DAY).toISOString(),
    effective_date: new Date(NOW - daysOld * DAY).toISOString(),
  };
}

function corpus() {
  const entries = [];
  let n = 0;
  for (const source of ['gmail', 'fireflies', 'manual', 'youtube']) {
    for (const wordCount of [100, 300, 800]) {
      for (let i = 0; i < 12; i += 1) entries.push(entry(n += 1, { source, wordCount, daysOld: (n * 7) % 400 }));
    }
  }
  return entries;
}

test('the summary separator is the one search uses', () => {
  const source = readFileSync(join(ROOT, 'server/routes/search.js'), 'utf8');
  assert.ok(source.includes(`const SUMMARY_SEP = ${JSON.stringify(SUMMARY_SEP).replace(/"/g, "'")};`), 'server/routes/search.js defines another separator');
});

test('seededRandom repeats for the same seed and differs for another', () => {
  const a = seededRandom(7); const b = seededRandom(7); const c = seededRandom(8);
  const seqA = [a(), a(), a()]; const seqB = [b(), b(), b()]; const seqC = [c(), c(), c()];
  assert.deepEqual(seqA, seqB);
  assert.notDeepEqual(seqA, seqC);
  assert.ok(seqA.every((x) => x >= 0 && x < 1));
});

test('originalText drops a stored summary and keeps plain text whole', () => {
  assert.equal(originalText({ text: `short summary${SUMMARY_SEP}the original`, has_v2_summary: true }), 'the original');
  assert.equal(originalText({ text: `# Title\n\n## Summary\nabc${SUMMARY_SEP}the rest`, has_auto_summary: true }), 'the rest');
  assert.equal(originalText({ text: `first part${SUMMARY_SEP}second part` }), `first part${SUMMARY_SEP}second part`, 'no summary flag: the separator is part of the text');
  assert.equal(originalText({ text: 'plain' }), 'plain');
});

test('cutExcerpt returns 12 to 20 consecutive words from the asked part of the text', () => {
  const text = words('x', 1000);
  const all = text.split(' ');
  for (const [position, from, to] of [['start', 0, 0.15], ['middle', 0.4, 0.6], ['end', 0.85, 1]]) {
    const excerpt = cutExcerpt(text, position, seededRandom(3));
    const parts = excerpt.split(' ');
    assert.ok(parts.length >= 12 && parts.length <= 20, `${position}: ${parts.length} words`);
    assert.ok(text.includes(excerpt), `${position}: not a consecutive slice`);
    const at = all.indexOf(parts[0]) / all.length;
    assert.ok(at >= from && at <= to, `${position}: starts at ${at.toFixed(2)}`);
  }
});

test('cutExcerpt refuses a text that is too short or has no real words', () => {
  assert.equal(cutExcerpt(words('s', 20), 'start', seededRandom(1)), null);
  assert.equal(cutExcerpt(Array.from({ length: 300 }, (_, i) => String(i)).join(' '), 'middle', seededRandom(1)), null);
});

test('buckets', () => {
  assert.deepEqual([lengthBucket(100), lengthBucket(2000), lengthBucket(8000)], ['short', 'medium', 'long']);
  assert.deepEqual([5, 60, 200, 500].map((d) => ageBucket(new Date(NOW - d * DAY).toISOString(), NOW)), ['0-30', '31-90', '91-365', '365+']);
});

test('entriesContaining finds every entry that holds the excerpt, whatever the spacing and case', () => {
  const entries = [{ id: 'a', text: 'Alpha  beta\ngamma delta' }, { id: 'b', text: 'x alpha beta gamma y' }, { id: 'c', text: 'alpha gamma' }];
  assert.deepEqual(entriesContaining('alpha BETA gamma', entries), ['a', 'b']);
});

test('buildProbeSet is repeatable, sized, stratified, and never samples an archived entry', () => {
  const entries = [...corpus(), entry(9001, { status: 'archived', wordCount: 600 }), entry(9002, { wordCount: 10 })];
  const a = buildProbeSet(entries, { seed: 11, size: 60, now: NOW });
  const b = buildProbeSet(entries, { seed: 11, size: 60, now: NOW });
  const c = buildProbeSet(entries, { seed: 12, size: 60, now: NOW });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.probes.map((p) => p.query), c.probes.map((p) => p.query));
  assert.equal(a.probes.length, 60);
  assert.equal(new Set(a.probes.map((p) => p.source_id)).size, 60, 'an entry was sampled twice');
  assert.ok(!a.probes.some((p) => p.source_id === 'id-9001' || p.source_id === 'id-9002'));
  assert.equal(a.probes.filter((p) => p.held_out).length, 20, 'a third is held out');
  const strata = new Set(a.probes.map((p) => `${p.source}|${p.length}`));
  assert.equal(strata.size, 12, 'every source × length stratum is present');
  assert.deepEqual([...new Set(a.probes.map((p) => p.position))].sort(), ['end', 'middle', 'start']);
  for (const p of a.probes) assert.ok(p.expected_ids.includes(p.source_id));
});

test('buildProbeSet cuts from the original text, never from the summary', () => {
  const entries = Array.from({ length: 30 }, (_, i) => entry(i + 1, { wordCount: 400, summary: words('summaryonly', 60) }));
  const set = buildProbeSet(entries, { seed: 5, size: 20, now: NOW });
  assert.equal(set.probes.length, 20);
  assert.ok(!set.probes.some((p) => p.query.includes('summaryonly')));
});

test('an excerpt that also stands in another entry accepts either as a hit', () => {
  const shared = words('shared', 300);
  const entries = [{ ...entry(5001), text: shared }, { ...entry(5002), text: `${words('lead', 5)} ${shared}`, status: 'archived' }, ...corpus()];
  const set = buildProbeSet(entries, { seed: 2, size: entries.length - 1, now: NOW });
  const probe = set.probes.find((p) => p.source_id === 'id-5001');
  assert.deepEqual([...probe.expected_ids].sort(), ['id-5001', 'id-5002']);
});

test('runProbes and summarize: ranks, Hit@k, breakdowns and misses', async () => {
  const set = buildProbeSet(corpus(), { seed: 4, size: 30, now: NOW });
  // A fake search: probe 0 is found first, probe 1 third, probe 2 tenth, probe 3 not at all, the rest first.
  const search = async (query, limit) => {
    const i = set.probes.findIndex((p) => p.query === query);
    const hit = { id: set.probes[i].source_id, evidence: 'bm25_exact' };
    const filler = Array.from({ length: limit }, (_, k) => ({ id: `other-${k}`, evidence: 'weak_semantic' }));
    if (i === 3) return filler;
    const rank = { 1: 3, 2: 10 }[i] || 1;
    return [...filler.slice(0, rank - 1), hit, ...filler.slice(rank)].slice(0, limit);
  };
  const results = await runProbes(set.probes, search, { limit: 10 });
  assert.deepEqual(results.slice(0, 4).map((r) => r.rank), [1, 3, 10, null]);
  const summary = summarize(set.probes, results, { now: NOW });
  assert.equal(summary.all.n, 30);
  assert.deepEqual([summary.all.hit_at[1].hits, summary.all.hit_at[3].hits, summary.all.hit_at[10].hits], [27, 28, 29]);
  assert.equal(summary.misses.length, 1);
  assert.equal(summary.misses[0].probe_id, set.probes[3].id);
  for (const group of ['source', 'length', 'position', 'age', 'part']) {
    const total = Object.values(summary.by[group]).reduce((sum, g) => sum + g.n, 0);
    assert.equal(total, 30, `the ${group} groups do not add up`);
  }
  assert.deepEqual(summary.evidence, { bm25_exact: 29 });
  const text = formatSummary(summary, { limit: 10, set });
  assert.match(text, /all\s+30\s+90\.0%\s+93\.3%\s+96\.7%/);
});

test('wilson interval', () => {
  const ci = wilson(9, 10);
  assert.ok(Math.abs(ci.lower - 0.596) < 0.002 && Math.abs(ci.upper - 0.982) < 0.002, JSON.stringify(ci));
  assert.equal(wilson(0, 0), null);
});

// --- question probes: the same entries, asked the way a person would ask ---

test('longestSharedRun counts the longest run of consecutive words a question shares with a text', async () => {
  const { longestSharedRun } = await import('../server/recall-probes.js');
  const text = 'Anna azt kérte, hogy a nyári kampány határidejét toljuk el két héttel, mert a kreatív még nincs kész.';
  assert.equal(longestSharedRun('Mit kért Anna a nyári kampány határidejét illetően?', text), 4);
  assert.equal(longestSharedRun('Mennyivel csúszik Anna szerint a vakációs akció leadása?', text), 1);
  assert.equal(longestSharedRun('A NYÁRI KAMPÁNY, határidejét?', text), 4, 'case and punctuation do not hide a copy');
  assert.equal(longestSharedRun('', text), 0);
});

test('buildQuestionSet pairs each question with its verbatim probe and inherits the right answers', async () => {
  const { buildQuestionSet } = await import('../server/recall-probes.js');
  const verbatim = buildProbeSet(corpus(), { seed: 4, size: 30, now: NOW });
  const [a, b, c] = verbatim.probes;
  const answers = [
    { probe_id: a.id, source_id: a.source_id, question: 'Mit döntöttünk az első ügyben?' },
    { probe_id: b.id, source_id: b.source_id, question: null, skip_reason: 'only a link' },
    { probe_id: c.id, source_id: c.source_id, question: '  Mi lett a harmadikkal?  ' },
  ];
  const set = buildQuestionSet(verbatim, answers, { now: NOW });
  assert.equal(set.kind, 'question');
  assert.deepEqual(set.probes.map((p) => p.id), [`q${a.id.slice(1)}`, `q${c.id.slice(1)}`]);
  assert.deepEqual(set.skipped, [{ probe_id: b.id, reason: 'only a link' }]);
  const first = set.probes[0];
  assert.deepEqual(
    [first.source_id, first.expected_ids, first.source, first.length, first.entry_date, first.held_out, first.position, first.paired_with],
    [a.source_id, a.expected_ids, a.source, a.length, a.entry_date, a.held_out, 'question', a.id],
  );
  assert.equal(set.probes[1].query, 'Mi lett a harmadikkal?');
});

test('buildQuestionSet refuses a mixed-up or repeated answer', async () => {
  const { buildQuestionSet } = await import('../server/recall-probes.js');
  const verbatim = buildProbeSet(corpus(), { seed: 4, size: 30, now: NOW });
  const [a, b] = verbatim.probes;
  assert.throws(() => buildQuestionSet(verbatim, [{ probe_id: 'p999', source_id: a.source_id, question: 'x y z' }], { now: NOW }), /p999/);
  assert.throws(() => buildQuestionSet(verbatim, [{ probe_id: a.id, source_id: b.source_id, question: 'x y z' }], { now: NOW }), /belongs to/);
  const twice = [{ probe_id: a.id, source_id: a.source_id, question: 'x y z' }, { probe_id: a.id, source_id: a.source_id, question: 'x y z' }];
  assert.throws(() => buildQuestionSet(verbatim, twice, { now: NOW }), /twice/);
});

test('question probes run and summarize like the others', async () => {
  const { buildQuestionSet } = await import('../server/recall-probes.js');
  const verbatim = buildProbeSet(corpus(), { seed: 4, size: 30, now: NOW });
  const answers = verbatim.probes.slice(0, 6).map((p, i) => ({ probe_id: p.id, source_id: p.source_id, question: `kérdés ${i}` }));
  const set = buildQuestionSet(verbatim, answers, { now: NOW });
  const results = await runProbes(set.probes, async (query) => {
    const probe = set.probes.find((p) => p.query === query);
    return query === 'kérdés 5' ? [] : [{ id: probe.source_id, evidence: 'high_dense' }];
  }, { limit: 10 });
  const summary = summarize(set.probes, results, { now: NOW });
  assert.equal(summary.all.hit_at[10].hits, 5);
  assert.deepEqual(Object.keys(summary.by.position), ['question']);
  assert.match(formatSummary(summary, { limit: 10, set }), /^Recall probe \(questions\): 6 probes/);
});

test('quotesTitle: a question that contains the whole title', async () => {
  const { quotesTitle } = await import('../server/recall-probes.js');
  assert.equal(quotesTitle('Mi áll a customBrain — Session-riport bejegyzésben?', 'customBrain — Session-riport'), true);
  assert.equal(quotesTitle('Mit írtam a customBrain legutóbbi riportjában?', 'customBrain — Session-riport'), false);
  assert.equal(quotesTitle('Mi a helyzet a Birddel?', 'Bird'), false, 'a one-word title is a name, not a quote');
});
