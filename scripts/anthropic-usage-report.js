// Daily Anthropic spend from state/anthropic-usage.jsonl (written by
// server/anthropic-usage.js). Read-only.
//
//   node scripts/anthropic-usage-report.js          # last 14 days
//   node scripts/anthropic-usage-report.js 30       # last 30 days
//
// Prices live in server/anthropic-usage.js (shared with the Stats tab).
import { readUsageRows, costUsd } from '../server/anthropic-usage.js';

const DAYS = parseInt(process.argv[2], 10) || 14;
const since = new Date(Date.now() - DAYS * 86400_000).toISOString().slice(0, 10);

const rows = readUsageRows();

const groups = new Map(); // "day|model|site" -> totals
for (const r of rows) {
  const day = r.ts.slice(0, 10);
  if (day < since) continue;
  const usd = costUsd(r);
  const key = `${day}|${r.model}|${r.site}`;
  const g = groups.get(key) || { calls: 0, in: 0, out: 0, usd: 0 };
  g.calls += 1;
  g.in += r.input_tokens + r.cache_read_input_tokens + r.cache_creation_input_tokens;
  g.out += r.output_tokens;
  g.usd += usd;
  groups.set(key, g);
}

const fmt = (n) => n.toLocaleString('en-US');
let lastDay = null;
let dayUsd = 0;
let totalUsd = 0;
const flushDay = () => { if (lastDay) console.log(`  ${''.padEnd(52)} day total $${dayUsd.toFixed(2)}\n`); };
for (const key of [...groups.keys()].sort()) {
  const [day, model, site] = key.split('|');
  const g = groups.get(key);
  if (day !== lastDay) { flushDay(); console.log(day); lastDay = day; dayUsd = 0; }
  console.log(`  ${site.padEnd(22)} ${model.padEnd(28)} calls ${String(g.calls).padStart(5)}  in ${fmt(g.in).padStart(12)}  out ${fmt(g.out).padStart(10)}  $${g.usd.toFixed(2)}`);
  dayUsd += g.usd;
  totalUsd += g.usd;
}
flushDay();
console.log(`Total since ${since}: $${totalUsd.toFixed(2)}`);
