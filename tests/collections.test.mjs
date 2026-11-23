// Rule: collection names live only in server/collections.js, and every
// collection is either backed up or explicitly listed as not backed up.
// Why: for 118 nights the backup cron snapshotted a dead collection because the
// name was typed in two places (see the header of server/collections.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const collections = await import('../server/collections.js');
const named = Object.entries(collections).filter(([, value]) => typeof value === 'string');
const liveNames = named.map(([, value]) => value);

// One-shot scripts that are records of a past run. They name the collection
// they ran against on purpose; nobody runs them again.
const HISTORICAL = {
  'scripts/reprocess-v2-prototype.js': 'prototype of the 2026-05 reprocess, superseded by scripts/rechunk-content.js',
  'scripts/backfill-task-types.js': 'one-time re-embedding of 2026-05',
  'scripts/migrate-to-hybrid-collection.js': 'the 2026-05 migration itself; source and destination are its arguments',
};

const literalOf = (line) => liveNames.filter((n) => [`'${n}'`, `"${n}"`, `\`${n}\``].some((q) => line.includes(q)));

test('every collection is on the backup list or on the explicit exception list', () => {
  assert.ok(Array.isArray(collections.BACKED_UP), 'BACKED_UP must be an array');
  assert.ok(Array.isArray(collections.NOT_BACKED_UP), 'NOT_BACKED_UP must be an array: a collection left out of the backup has to be left out on purpose');
  assert.ok(named.length > 0, 'server/collections.js exports no collection name');
  for (const [key, name] of named) {
    const backedUp = collections.BACKED_UP.includes(name);
    const excepted = collections.NOT_BACKED_UP.includes(name);
    assert.ok(backedUp || excepted, `${key} ('${name}') is neither in BACKED_UP nor in NOT_BACKED_UP`);
    assert.ok(!(backedUp && excepted), `${key} ('${name}') is in both lists`);
  }
});

test('the two lists name only exported collections', () => {
  for (const name of [...collections.BACKED_UP, ...collections.NOT_BACKED_UP]) {
    assert.ok(liveNames.includes(name), `'${name}' is on a list but is not an exported collection name`);
  }
});

test('only server/collections.js types a live collection name', () => {
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'server', 'cron', 'agent', 'scripts'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((f) => /\.(js|mjs)$/.test(f));
  assert.ok(files.length > 20, 'the file listing looks empty');
  const offenders = [];
  for (const file of files) {
    if (file === 'server/collections.js' || file in HISTORICAL) continue;
    readFileSync(join(ROOT, file), 'utf8').split('\n').forEach((line, i) => {
      if (literalOf(line).length) offenders.push(`${file}:${i + 1}`);
    });
  }
  assert.deepEqual(offenders, [], 'import the name from server/collections.js instead of typing it');
});

test('the historical list has no stale entry', () => {
  for (const file of Object.keys(HISTORICAL)) {
    const source = readFileSync(join(ROOT, file), 'utf8');
    assert.ok(source.split('\n').some((line) => literalOf(line).length), `${file} no longer types a collection name: remove it from HISTORICAL`);
  }
});
