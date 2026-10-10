// MCP call log (0.58.0) — one line per tools/call in state/mcp-calls.jsonl,
// the source of the Runs tab's replay (docs/bejaras-visszajatszas-terv-2026-10-10.md).
// Same shape of store as anthropic-usage.jsonl: append-only, no DB.
//
// Written from applyScopeGate (server/mcp-scopes.js), which already wraps every
// tool registration across mcp.js, mcp-stdio.js and agent/register.js — so the
// log covers every tool without touching a call site. Only HTTP callers log
// (they carry a token name); stdio is local and its file would sit on the Mac.
//
// No full result text is stored: args are clipped, and the result keeps only
// its size plus the {id, title} pairs it handed the agent — enough to replay
// what was reached, not to re-serve it.

import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const LOG_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'state', 'mcp-calls.jsonl');

const ARG_MAX_CHARS = 300;
const REFS_MAX = 50;
// Hand-set: two calls from one caller further apart than this are two runs.
// The stateless transport has no session id to group by.
const RUN_GAP_MS = 10 * 60 * 1000;

function clipArgs(value) {
  if (typeof value === 'string') {
    return value.length > ARG_MAX_CHARS ? `${value.slice(0, ARG_MAX_CHARS)}… [${value.length} chars]` : value;
  }
  if (Array.isArray(value)) return value.map(clipArgs);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clipArgs(v)]));
  return value;
}

// Every {id, title} object anywhere in the result, in order, deduplicated.
function collectRefs(node, out, seen) {
  if (out.length >= REFS_MAX || !node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const n of node) collectRefs(n, out, seen); return; }
  if (node.id != null && typeof node.title === 'string' && !seen.has(String(node.id))) {
    seen.add(String(node.id));
    out.push({ id: String(node.id), title: node.title });
  }
  for (const v of Object.values(node)) collectRefs(v, out, seen);
}

function resultRefs(result) {
  const text = result.content.filter((c) => c.type === 'text').map((c) => c.text).join('');
  let parsed;
  // Tool results are JSON.stringify'd payloads; a plain-text result simply
  // has no refs to collect.
  try { parsed = JSON.parse(text); } catch { return { result_chars: text.length, refs: [] }; }
  const refs = [];
  collectRefs(parsed, refs, new Set());
  return { result_chars: text.length, refs };
}

export function logMcpCall({ caller, tool, args, startedAt, result, error }) {
  const entry = {
    ts: new Date(startedAt).toISOString(),
    caller,
    tool,
    args: clipArgs(args),
    ms: Date.now() - startedAt,
    ok: !error,
    ...(error ? { error: error.message } : resultRefs(result)),
  };
  appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n');
}

/** Calls of the last `days` days, grouped into runs per caller, newest run first. */
export function readAgentRuns({ days = 7 } = {}) {
  if (!existsSync(LOG_PATH)) return { runs: [] };
  const since = Date.now() - days * 86400000;
  const calls = readFileSync(LOG_PATH, 'utf8').split('\n').filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((c) => new Date(c.ts).getTime() >= since)
    .sort((a, b) => a.ts.localeCompare(b.ts));

  const open = new Map(); // caller → run still accepting calls
  const runs = [];
  for (const c of calls) {
    const t = new Date(c.ts).getTime();
    let run = open.get(c.caller);
    if (!run || t - new Date(run.end).getTime() > RUN_GAP_MS) {
      run = { id: `${c.caller}@${c.ts}`, caller: c.caller, start: c.ts, end: c.ts, steps: [] };
      open.set(c.caller, run);
      runs.push(run);
    }
    run.steps.push({ ...c, offset_ms: t - new Date(run.start).getTime() });
    run.end = c.ts;
  }
  return { run_gap_minutes: RUN_GAP_MS / 60000, runs: runs.reverse() };
}
