// Rule: AGENTS.md stays under the size limit. Codex reads a project AGENTS.md
// only up to 32 768 bytes and drops the rest silently, and the last section of
// the file is Deploy. The pre-commit hook enforces the limit where it is
// enabled; this test enforces it wherever `npm test` runs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
// `project_doc_max_bytes = 32768` in codex-cli 0.171.0-alpha.13 (checked 2026-11-23).
const CODEX_LIMIT = 32768;

const hook = readFileSync(join(ROOT, '.githooks/pre-commit'), 'utf8');
const limit = Number((hook.match(/-gt (\d+)/) || [])[1]);

test('the pre-commit hook states a limit below the Codex cut', () => {
  assert.ok(Number.isInteger(limit) && limit > 0, 'cannot read the limit from .githooks/pre-commit');
  assert.ok(limit < CODEX_LIMIT, `the limit (${limit}) must stay below ${CODEX_LIMIT}`);
});

// Codex gives one budget to every AGENTS.md between the repo root and the
// working directory, so a nested AGENTS.md would eat into it. The hook measures
// the root file only; this test adds them all up.
test('the AGENTS.md files of the repo are together under the limit', () => {
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '--', 'AGENTS.md', '**/AGENTS.md'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
  assert.ok(files.includes('AGENTS.md'), 'the root AGENTS.md is missing from the listing');
  const sizes = files.map((file) => [file, statSync(join(ROOT, file)).size]);
  const total = sizes.reduce((sum, [, size]) => sum + size, 0);
  assert.ok(total <= limit, `AGENTS.md files total ${total} bytes (${sizes.map(([f, s]) => `${f}: ${s}`).join(', ')}), the limit is ${limit}: trim`);
});

test('the Size line in AGENTS.md states the same limit', () => {
  const stated = (readFileSync(join(ROOT, 'AGENTS.md'), 'utf8').match(/Keep it under ([\d ]+) B/) || [])[1];
  assert.ok(stated, 'cannot find the Size line in AGENTS.md');
  assert.equal(Number(stated.replace(/ /g, '')), limit);
});
