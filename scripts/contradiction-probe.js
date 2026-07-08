import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import crypto from 'node:crypto';
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env') });
import { applySettingsToEnv } from '../server/config.js';
applySettingsToEnv();

import { getAllWithVectors } from '../server/qdrant.js';

/**
 * Contradiction probe (gbrain steal, adapted). READ-ONLY — never mutates
 * Qdrant; emits paste-ready review commands instead.
 *
 * The capture-time checkContradiction() only sees near-duplicates (cosine >
 * 0.85) at the moment of capture. This probe retroactively samples the
 * SEMANTIC NEIGHBORHOOD BELOW the near-dup band (0.70–0.92) — pairs about the
 * same subject worded differently, where logical conflicts hide from the
 * embedding-based dedup — and asks Haiku to judge each pair with a
 * six-verdict enum. `temporal_supersession` exists because most raw
 * "contradictions" in a diary-like brain are legitimate change-over-time
 * (gbrain measured ~60%), not conflicts.
 *
 * Judge calls are cached by content hash (tasks/contradiction-cache.json), so
 * re-runs only pay for new/changed pairs. Reports a Wilson 95% CI on the
 * contradiction rate with a build-more decision gate: CI lower bound < 5% →
 * this probe is enough, don't build deeper lint tooling; > 15% → worth it.
 *
 * Usage:
 *   node scripts/contradiction-probe.js                # 20 closest pairs
 *   node scripts/contradiction-probe.js --max-pairs 50
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_PATH = join(ROOT, 'tasks', 'contradiction-cache.json');
const MIN_COSINE = 0.70;
const MAX_COSINE = 0.92; // above this the health-check duplicate scan already flags the pair
const TEXT_BUDGET = 1500; // chars per side sent to the judge

const VERDICTS = ['no_conflict', 'naming_variant', 'temporal_supersession', 'stale_value', 'direct_contradiction', 'needs_human_review'];
const CONFLICT_VERDICTS = new Set(['stale_value', 'direct_contradiction']);

function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

function pairHash(a, b) {
  return crypto.createHash('sha256')
    .update(`${a.id}|${b.id}|${crypto.createHash('sha256').update(a.payload.text || '').digest('hex')}|${crypto.createHash('sha256').update(b.payload.text || '').digest('hex')}`)
    .digest('hex');
}

// Wilson 95% score interval — honest uncertainty at small n.
function wilson(hits, n, z = 1.96) {
  if (n === 0) return { lower: 0, upper: 1 };
  const p = hits / n;
  const denom = 1 + (z * z) / n;
  const center = p + (z * z) / (2 * n);
  const spread = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return { lower: Math.max(0, (center - spread) / denom), upper: Math.min(1, (center + spread) / denom) };
}

async function judgePair(a, b) {
  const fmt = (p) => {
    const t = p.payload;
    const date = String(t.effective_date || t.created_at || '').slice(0, 10);
    return `title: ${t.title}\ndate: ${date}\ntype: ${t.type} · source: ${t.source || 'manual'}\ntext:\n${(t.text || '').slice(0, TEXT_BUDGET)}`;
  };
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: `Two thoughts from a personal knowledge base cover overlapping subject matter. Judge their relationship. Return ONLY valid JSON:
{"verdict": one of ${JSON.stringify(VERDICTS)}, "severity": "low"|"medium"|"high", "reasoning": "<1-2 sentences>", "suggested_resolution": "<1 sentence: what the owner should do, or 'nothing'>"}

Verdict definitions:
- no_conflict: related topics, no factual tension. THE DEFAULT — pick this unless clearly otherwise.
- naming_variant: same entity under different names/spellings; facts agree.
- temporal_supersession: both were true at their respective dates; the newer one legitimately updates the older (project status changed, decision evolved). NOT an error.
- stale_value: the older thought states a value/fact as current that the newer one shows is outdated, AND a reader hitting only the old one would be misled.
- direct_contradiction: mutually exclusive claims about the same entity at the same time — both cannot be true.
- needs_human_review: genuinely ambiguous; you cannot tell without the owner.

Severity: low = cosmetic; medium = could mislead retrieval; high = actively wrong answer if retrieved alone.

THOUGHT A:
${fmt(a)}

THOUGHT B:
${fmt(b)}`,
      }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const raw = data.content?.[0]?.text || '{}';
  const match = raw.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(match ? match[0] : raw);
  if (!VERDICTS.includes(parsed.verdict)) parsed.verdict = 'needs_human_review';
  return parsed;
}

async function run() {
  const argIdx = process.argv.indexOf('--max-pairs');
  const maxPairs = argIdx > -1 ? Number(process.argv[argIdx + 1]) : 20;

  console.log(`Contradiction probe — sampling up to ${maxPairs} pairs in cosine band [${MIN_COSINE}, ${MAX_COSINE})\n`);

  const all = await getAllWithVectors();
  const active = all.filter((p) => p.payload.status !== 'archived' && Array.isArray(p.vector));
  console.log(`${active.length} active thoughts with vectors`);

  // All pairs in the band, closest first — the closer the pair, the more
  // likely they discuss the same fact and can conflict.
  const candidates = [];
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const score = cosine(active[i].vector, active[j].vector);
      if (score >= MIN_COSINE && score < MAX_COSINE) {
        candidates.push({ a: active[i], b: active[j], score });
      }
    }
  }
  candidates.sort((x, y) => y.score - x.score);
  const sample = candidates.slice(0, maxPairs);
  console.log(`${candidates.length} candidate pairs in band; judging top ${sample.length}\n`);

  const cache = existsSync(CACHE_PATH) ? JSON.parse(readFileSync(CACHE_PATH, 'utf-8')) : {};
  let cacheHits = 0;

  const results = [];
  for (const { a, b, score } of sample) {
    const key = pairHash(a, b);
    let judgment;
    if (cache[key]) {
      judgment = cache[key];
      cacheHits++;
    } else {
      judgment = await judgePair(a, b);
      cache[key] = judgment;
      writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2)); // persist incrementally — a crash mid-run keeps paid calls
    }
    results.push({
      a_id: a.id, a_title: a.payload.title,
      b_id: b.id, b_title: b.payload.title,
      cosine: Math.round(score * 1000) / 1000,
      ...judgment,
    });
    const mark = CONFLICT_VERDICTS.has(judgment.verdict) ? '⚠' : judgment.verdict === 'needs_human_review' ? '?' : '·';
    console.log(`${mark} [${judgment.verdict}/${judgment.severity}] ${(a.payload.title || '').slice(0, 40)} ↔ ${(b.payload.title || '').slice(0, 40)} (${score.toFixed(3)})`);
  }

  const conflicts = results.filter((r) => CONFLICT_VERDICTS.has(r.verdict));
  const ci = wilson(conflicts.length, results.length);
  const byVerdict = {};
  for (const r of results) byVerdict[r.verdict] = (byVerdict[r.verdict] || 0) + 1;

  console.log(`\n── Results ──`);
  console.log(`Verdicts: ${Object.entries(byVerdict).map(([k, v]) => `${k}=${v}`).join(' · ')} (${cacheHits} from cache)`);
  console.log(`Conflict rate: ${conflicts.length}/${results.length} — Wilson 95% CI [${(ci.lower * 100).toFixed(1)}%, ${(ci.upper * 100).toFixed(1)}%]`);
  console.log(ci.lower > 0.15
    ? `Decision gate: CI lower bound > 15% — deeper lint tooling would pay off.`
    : ci.upper < 0.05
      ? `Decision gate: CI upper bound < 5% — this probe is enough, do NOT build more.`
      : `Decision gate: inconclusive band — rerun with more pairs before deciding.`);

  if (conflicts.length) {
    console.log(`\n── Paste-ready review (NOTHING auto-applied) ──`);
    for (const c of conflicts) {
      console.log(`\n# ${c.verdict} (${c.severity}): ${c.a_title} ↔ ${c.b_title}`);
      console.log(`#   ${c.reasoning}`);
      console.log(`#   → ${c.suggested_resolution}`);
      console.log(`#   inspect: get_thought ${c.a_id} / get_thought ${c.b_id}`);
    }
  }

  const outPath = join(ROOT, 'tasks', `contradiction-probe-${new Date().toISOString().slice(0, 10)}.json`);
  writeFileSync(outPath, JSON.stringify({
    generated_at: new Date().toISOString(),
    band: [MIN_COSINE, MAX_COSINE],
    pairs_in_band: candidates.length,
    judged: results.length,
    cache_hits: cacheHits,
    by_verdict: byVerdict,
    conflict_rate: results.length ? conflicts.length / results.length : 0,
    wilson_ci_95: ci,
    results,
  }, null, 2));
  console.log(`\nSnapshot: ${outPath}`);
}

run().catch((err) => { console.error(err); process.exit(1); });
