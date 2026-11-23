// Rule: an MCP tool change is made in BOTH server/mcp.js and server/mcp-stdio.js,
// and every tool has a row in TOOL_SCOPES.
// The two files register the same tools separately; this test reads them as
// text, so it needs no server, no Qdrant and no .env.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

const http = read('server/mcp.js');
const stdio = read('server/mcp-stdio.js');
const agent = read('agent/register.js');
const scopesSource = read('server/mcp-scopes.js');

const toolNames = (source) => [...source.matchAll(/server\.tool\(\s*'([a-z0-9_]+)'/g)].map((m) => m[1]);

// The lines from the first `server.tool(` to `registerAgentTools(server, z);`,
// with indentation removed: mcp.js registers inside a function, mcp-stdio.js at
// the top level, and that is the only difference allowed.
function registrationBlock(source, file) {
  const lines = source.split('\n').map((line) => line.trim());
  const start = lines.indexOf('server.tool(');
  const end = lines.indexOf('registerAgentTools(server, z);');
  assert.ok(start >= 0 && end > start, `${file}: cannot find the registration block`);
  return lines.slice(start, end).filter(Boolean);
}

function scopeRows() {
  const start = scopesSource.indexOf('export const TOOL_SCOPES = {');
  const end = scopesSource.indexOf('\n};', start);
  assert.ok(start >= 0 && end > start, 'cannot find TOOL_SCOPES in server/mcp-scopes.js');
  return [...scopesSource.slice(start, end).matchAll(/^\s*([a-z0-9_]+):\s*'/gm)].map((m) => m[1]);
}

const clip = (line) => (line.length > 150 ? `${line.slice(0, 150)}…` : line);

test('mcp.js and mcp-stdio.js register the same tools in the same order', () => {
  assert.ok(toolNames(http).length > 10, 'found too few tools in server/mcp.js');
  assert.deepEqual(toolNames(stdio), toolNames(http));
});

test('the two registration blocks are identical apart from indentation', () => {
  const a = registrationBlock(http, 'server/mcp.js');
  const b = registrationBlock(stdio, 'server/mcp-stdio.js');
  const onlyHttp = a.filter((line) => !b.includes(line)).map(clip);
  const onlyStdio = b.filter((line) => !a.includes(line)).map(clip);
  assert.deepEqual({ onlyInMcpJs: onlyHttp, onlyInMcpStdioJs: onlyStdio }, { onlyInMcpJs: [], onlyInMcpStdioJs: [] });
  assert.deepEqual(b, a, 'same lines, different order');
});

test('every registered tool has a scope, and every scope row has a tool', () => {
  const registered = [...toolNames(http), ...toolNames(agent)].sort();
  assert.equal(new Set(registered).size, registered.length, 'a tool is registered twice');
  assert.deepEqual(scopeRows().sort(), registered);
});
