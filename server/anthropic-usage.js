// Anthropic token ledger. Every Messages API call appends one line to
// state/anthropic-usage.jsonl. The calls run in four processes (pm2 server,
// gmail/youtube/export crons, backfill-chunks), so stdout would scatter across
// four log files; one shared JSONL keeps them in one place. Cost is computed at
// read time (summarizeUsage for the Stats tab, scripts/anthropic-usage-report.js
// for the CLI), never stored, so a price change never corrupts recorded history.
//
// Why this exists: Aug 31 – Sep 12 2026 a backfill-chunks ↔ dossier-reindex
// loop re-chunked the same dossiers with Sonnet every hour (~8M tokens/day).
// The Console showed the spend but not which call site produced it.

import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const USAGE_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'state', 'anthropic-usage.jsonl');

export function logAnthropicUsage(site, json) {
  const u = json.usage;
  appendFileSync(USAGE_PATH, JSON.stringify({
    ts: new Date().toISOString(),
    site,
    model: json.model,
    input_tokens: u.input_tokens,
    output_tokens: u.output_tokens,
    cache_read_input_tokens: u.cache_read_input_tokens || 0,
    cache_creation_input_tokens: u.cache_creation_input_tokens || 0,
  }) + '\n');
}

// $/MTok, first-party API rates (checked 2026-09-29). Cache reads bill at 0.1x
// input, cache writes (5-min TTL) at 1.25x input. Matched by prefix because the
// response carries the dated model id (claude-haiku-4-5-20251001).
export const PRICES = [
  { prefix: 'claude-haiku-4-5', in: 1, out: 5 },
  { prefix: 'claude-sonnet-4-6', in: 3, out: 15 },
  // Chunking since 0.47.0 (claude-api skill price table, cached 2026-10-06).
  { prefix: 'claude-sonnet-5-5', in: 2, out: 10 },
  // Up to 100K-token prompts; $0.50 / $2.50 above — our longest is ~57K.
  { prefix: 'claude-haiku-5-5', in: 0.1, out: 0.5 },
];

export function costUsd(r) {
  const p = PRICES.find((x) => r.model.startsWith(x.prefix));
  if (!p) throw new Error(`No price for model ${r.model} — add it to PRICES in server/anthropic-usage.js`);
  return (r.input_tokens * p.in
    + r.cache_read_input_tokens * p.in * 0.1
    + r.cache_creation_input_tokens * p.in * 1.25
    + r.output_tokens * p.out) / 1e6;
}

export function readUsageRows() {
  // No file yet = no Anthropic call has happened since logging shipped.
  if (!existsSync(USAGE_PATH)) return [];
  return readFileSync(USAGE_PATH, 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

// Stats-tab view: per-day totals for the last 60 days, plus 30- and 60-day
// windows broken down by call site (a runaway site shows up at a glance).
export function summarizeUsage() {
  const dayStart = (n) => new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10);
  const since30 = dayStart(30);
  const since60 = dayStart(60);
  const empty = () => ({ calls: 0, input_tokens: 0, output_tokens: 0, usd: 0 });
  const add = (g, r, usd) => {
    g.calls += 1;
    g.input_tokens += r.input_tokens + r.cache_read_input_tokens + r.cache_creation_input_tokens;
    g.output_tokens += r.output_tokens;
    g.usd += usd;
  };

  const daily = {};
  const windows = { last_30: { total: empty(), by_site: {} }, last_60: { total: empty(), by_site: {} } };
  for (const r of readUsageRows()) {
    const day = r.ts.slice(0, 10);
    if (day < since60) continue;
    const usd = costUsd(r);
    add(daily[day] ||= empty(), r, usd);
    for (const [key, since] of [['last_30', since30], ['last_60', since60]]) {
      if (day < since) continue;
      add(windows[key].total, r, usd);
      add(windows[key].by_site[r.site] ||= empty(), r, usd);
    }
  }
  return {
    daily: Object.entries(daily).sort(([a], [b]) => b.localeCompare(a)).map(([day, g]) => ({ day, ...g })),
    ...windows,
  };
}
