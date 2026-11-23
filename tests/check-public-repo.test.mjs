// Rule: this repo is public, so no IP, ssh data or server path goes into it.
// scripts/check-public-repo.js reads a diff and reports such added lines; the
// pre-commit hook feeds it the staged diff.
//
// The examples below are made up, and they are assembled from parts on
// purpose: written out, they would trip the very check they test when this
// file is committed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { findProblems } from '../scripts/check-public-repo.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const glue = (...parts) => parts.join('');

const diffOf = (file, lines, start = 10) => [
  `diff --git a/${file} b/${file}`,
  `--- a/${file}`,
  `+++ b/${file}`,
  `@@ -${start},0 +${start},${lines.length} @@`,
  ...lines.map((line) => `+${line}`),
].join('\n');

const kinds = (lines, denylist) => findProblems(diffOf('notes.md', lines), denylist).map((p) => p.kind);

const PUBLIC_IP = ['8', '8', '4', '4'].join('.');

test('a public IPv4 address is reported, with file and line', () => {
  const problems = findProblems(diffOf('docs/x.md', ['fine', `the box is at ${PUBLIC_IP} today`], 40));
  assert.equal(problems.length, 1);
  assert.deepEqual({ file: problems[0].file, line: problems[0].line, kind: problems[0].kind }, { file: 'docs/x.md', line: 41, kind: 'ip-address' });
});

test('loopback, any-address, netmask, documentation ranges and versions are not reported', () => {
  const harmless = [
    glue('127', '.0.0.1:6333'),
    glue('0', '.0.0.0'),
    glue('255', '.255.255.0'),
    glue('192', '.0.2.10'),
    glue('203', '.0.113.7'),
    'bump 0.78.0 to 0.78.1',
    'Chrome 120.0.6099.109',
  ];
  assert.deepEqual(kinds(harmless), []);
});

test('ssh data is reported', () => {
  assert.deepEqual(kinds([glue('ss', 'h -', 'i somekey host')]), ['ssh-identity']);
  assert.deepEqual(kinds([glue('log in as ro', 'ot@', 'box.example')]), ['user-at-host']);
  assert.deepEqual(kinds([glue('the key is ~/', '.ssh', '/somefile')]), ['ssh-folder']);
  assert.deepEqual(kinds([glue('use id', '_ed25519', '_box')]), ['key-file']);
  assert.deepEqual(kinds([glue('-----BEGIN OPENSSH PRIV', 'ATE KEY-----')]), ['private-key']);
});

test('server paths are reported, system paths are not', () => {
  for (const path of [glue('/ro', 'ot/app/server'), glue('/var/', 'www/site'), glue('/ho', 'me/someone/app'), glue('/m', 'nt/volume/data'), glue('/o', 'pt/app/bin')]) {
    assert.deepEqual(kinds([`cd ${path} && ls`]), ['server-path'], path);
  }
  assert.deepEqual(kinds(['/usr/bin/node cron/export.js >> /var/log/brain-export.log', 'see https://example.com/root/page', '/tmp/x and /proc/<pid>/exe']), []);
});

test('only added lines count', () => {
  const diff = [
    'diff --git a/a.md b/a.md',
    '--- a/a.md',
    '+++ b/a.md',
    '@@ -3,2 +3,2 @@',
    `-old line with ${PUBLIC_IP}`,
    ` context line with ${PUBLIC_IP}`,
    '+new line, clean',
  ].join('\n');
  assert.deepEqual(findProblems(diff), []);
});

test('a local denylist entry is reported, case-insensitively', () => {
  assert.deepEqual(kinds(['deploy to Harbour-Seven tonight'], ['harbour-seven']), ['denylist']);
  assert.deepEqual(kinds(['deploy tonight'], ['harbour-seven']), []);
});

test('the pre-commit hook runs the check', () => {
  assert.match(readFileSync(join(ROOT, '.githooks/pre-commit'), 'utf8'), /check-public-repo\.js/);
});
