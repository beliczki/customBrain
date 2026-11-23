// The last step of search: what age and curation do to a fused score
// (server/rescore.js). One rule, used by search, typed search and spider.
//
// Measured 2026-11-23 with the recall probe: an entry older than 90 days, asked
// with its own words, was the first hit 3 times in 100 and missing from the top
// ten 35 times. These tests pin today's default (it must not change by
// accident) and hold the target as a `todo` until the default is changed on
// purpose.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { rescore, recencyFactor, DOSSIER_BOOST, UNNAMED_DOSSIER } from '../server/rescore.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DAY = 86400000;
const NOW = Date.parse('2026-11-23T12:00:00Z');
const daysAgo = (days) => new Date(NOW - days * DAY).toISOString();
const close = (a, b) => Math.abs(a - b) < 1e-9;

// One leg of RRF with k = 60 gives 1 / (60 + rank).
const rrf = (...ranks) => ranks.reduce((sum, rank) => sum + 1 / (60 + rank), 0);

test('recencyFactor: 1 today, a half at 90 days, a third at 180', () => {
  assert.ok(close(recencyFactor({ created_at: daysAgo(0) }, NOW), 1));
  assert.ok(close(recencyFactor({ created_at: daysAgo(90) }, NOW), 0.5));
  assert.ok(close(recencyFactor({ created_at: daysAgo(180) }, NOW), 1 / 3));
});

test('recencyFactor goes by the content date, not the capture date', () => {
  assert.ok(close(recencyFactor({ effective_date: daysAgo(90), created_at: daysAgo(0) }, NOW), 0.5));
});

test('default: an entry is multiplied by its recency factor and keeps its fused score as cosine_score', () => {
  const [hit] = rescore([{ id: 'a', kind: 'thought', score: 0.03, created_at: daysAgo(90) }], { now: NOW });
  assert.ok(close(hit.score, 0.015));
  assert.equal(hit.cosine_score, 0.03);
});

test('default: a dossier does not age; the query naming it decides its weight', () => {
  const dossier = { id: 'd', kind: 'dossier', title: 'Bird', score: 0.02, created_at: daysAgo(400) };
  const [named] = rescore([dossier], { now: NOW, isNamed: () => true });
  const [unnamed] = rescore([dossier], { now: NOW, isNamed: () => false });
  assert.ok(close(named.score, 0.02 * DOSSIER_BOOST));
  assert.ok(close(unnamed.score, 0.02 * UNNAMED_DOSSIER));
  assert.deepEqual([DOSSIER_BOOST, UNNAMED_DOSSIER], [1.5, 0.5]);
});

test('default: the result is sorted by the new score', () => {
  const out = rescore([
    { id: 'old-strong', kind: 'thought', score: 0.03, created_at: daysAgo(300) },
    { id: 'fresh-weak', kind: 'thought', score: 0.02, created_at: daysAgo(1) },
  ], { now: NOW });
  assert.deepEqual(out.map((hit) => hit.id), ['fresh-weak', 'old-strong']);
});

test('of two equally strong hits the fresher comes first', () => {
  const out = rescore([
    { id: 'older', kind: 'thought', score: rrf(3, 3), created_at: daysAgo(200) },
    { id: 'newer', kind: 'thought', score: rrf(3, 3), created_at: daysAgo(20) },
  ], { now: NOW });
  assert.deepEqual(out.map((hit) => hit.id), ['newer', 'older']);
});

test('recency: false leaves age out and keeps the dossier weights', () => {
  const out = rescore([
    { id: 'old-strong', kind: 'thought', score: 0.03, created_at: daysAgo(300) },
    { id: 'fresh-weak', kind: 'thought', score: 0.02, created_at: daysAgo(1) },
    { id: 'dossier', kind: 'dossier', title: 'x', score: 0.03, created_at: daysAgo(300) },
  ], { now: NOW, recency: false });
  assert.deepEqual(out.map((hit) => [hit.id, hit.score]), [['old-strong', 0.03], ['fresh-weak', 0.02], ['dossier', 0.03 * UNNAMED_DOSSIER]]);
});

const oldExact = { id: 'old-exact', kind: 'thought', score: rrf(1, 1), created_at: daysAgo(200) };
const freshLoose = { id: 'fresh-loose', kind: 'thought', score: rrf(20), created_at: daysAgo(5) };

test('without age, an old hit that is first on both legs beats a fresh hit that is twentieth on one', () => {
  assert.equal(rescore([freshLoose, oldExact], { now: NOW, recency: false })[0].id, 'old-exact');
});

test('by default, an old hit that is first on both legs beats a fresh hit that is twentieth on one',
  { todo: 'the target; today the fresh hit wins. Becomes a plain test when the default changes (tasks/todo.md, time-decay plan, slice 4)' },
  () => {
    assert.equal(rescore([freshLoose, oldExact], { now: NOW })[0].id, 'old-exact');
  });

test('the recency formula lives in server/rescore.js only', () => {
  const search = readFileSync(join(ROOT, 'server/routes/search.js'), 'utf8');
  assert.ok(!/days\s*\/\s*90/.test(search), 'server/routes/search.js still computes its own decay');
  assert.match(search, /from '\.\.\/rescore\.js'/);
});
