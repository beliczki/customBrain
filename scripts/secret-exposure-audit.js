import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env') });
import { applySettingsToEnv } from '../server/config.js';
applySettingsToEnv();

import { QdrantClient } from '@qdrant/js-client-rest';

/**
 * Read-only secret/credential exposure audit over the whole thoughts_v2
 * collection (thoughts AND chunks — chunk hits are attributed to parent_id).
 * Phase 0 gate of the truth-first professional-life plan
 * (docs/professional-life-upgrade-detailed.md §8 Phase 0): before any
 * retrieval-quality work, know whether the answer path can return
 * passwords, one-time codes, tokens, or auth links.
 *
 * NEVER mutates. The report contains MASKED snippets only (first/last 2
 * chars of the matched secret) — running the audit must not itself create
 * a second copy of any credential.
 *
 * Output: tasks/secret-exposure-<date>.json, hits grouped per thought,
 * sorted high-confidence first.
 *
 * Usage: node scripts/secret-exposure-audit.js
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COLLECTION = 'thoughts_v2';
const qdrant = new QdrantClient({ url: process.env.QDRANT_URL || 'http://localhost:6333' });

// Pattern classes, EN + HU. confidence: high = the match itself is
// secret-shaped (key/JWT/private key); medium = a labeled credential line;
// low = contextual (digit code near an OTP-ish word, tokened URL) — expect
// false positives in the low tier, that's what human review is for.
const PATTERNS = [
  { class: 'private_key', confidence: 'high', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { class: 'anthropic_key', confidence: 'high', re: /sk-ant-[A-Za-z0-9_-]{20,}/g },
  { class: 'openai_style_key', confidence: 'high', re: /sk-[A-Za-z0-9_-]{20,}/g },
  { class: 'google_api_key', confidence: 'high', re: /AIza[A-Za-z0-9_-]{30,}/g },
  { class: 'github_token', confidence: 'high', re: /gh[pousr]_[A-Za-z0-9]{30,}/g },
  { class: 'slack_token', confidence: 'high', re: /xox[baprs]-[A-Za-z0-9-]{10,}/g },
  { class: 'jwt', confidence: 'high', re: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  { class: 'bearer_token', confidence: 'high', re: /Bearer\s+[A-Za-z0-9_./+-]{25,}/g },
  {
    class: 'password_line',
    confidence: 'medium',
    // "password: hunter2", "jelszó: abc", "pwd=xyz" — labeled value on the same line
    re: /(?:password|passwd|pwd|jelsz[óo](?:av?a?d?)?|belépési kód)\s*[:=]\s*\S{4,}/gi,
  },
  {
    class: 'auth_url',
    confidence: 'medium',
    // links carrying auth material in the query string
    re: /https?:\/\/\S*[?&](?:token|access_token|auth|code|key|secret|reset|verify)=[A-Za-z0-9_.%-]{8,}\S*/gi,
  },
  {
    class: 'otp_code',
    confidence: 'low',
    // 4-8 digit code within a few words of an OTP-ish label (EN + HU)
    re: /(?:verification code|security code|one[- ]time (?:code|password)|OTP|2FA|authentication code|megerősítő kód|ellenőrző kód|biztonsági kód|egyszeri (?:kód|jelszó))\D{0,40}\b(\d{4,8})\b/gi,
  },
];

function mask(match) {
  const s = match.trim();
  if (s.length <= 6) return '*'.repeat(s.length);
  return `${s.slice(0, 2)}${'*'.repeat(Math.min(s.length - 4, 24))}${s.slice(-2)}`;
}

// Snippet = 30 chars of context either side, with the match itself masked.
function snippet(text, index, matchLen, matched) {
  const before = text.slice(Math.max(0, index - 30), index).replace(/\s+/g, ' ');
  const after = text.slice(index + matchLen, index + matchLen + 30).replace(/\s+/g, ' ');
  return `…${before}[${mask(matched)}]${after}…`;
}

function scanText(text) {
  const hits = [];
  for (const p of PATTERNS) {
    p.re.lastIndex = 0;
    let m;
    while ((m = p.re.exec(text)) !== null) {
      hits.push({
        pattern_class: p.class,
        confidence: p.confidence,
        snippet: snippet(text, m.index, m[0].length, m[0]),
      });
      if (hits.length > 50) return hits; // pathological point, cap it
    }
  }
  return hits;
}

async function run() {
  const byThought = new Map(); // thought id -> { meta, hits }
  let scanned = 0;
  let offset = undefined;
  while (true) {
    const batch = await qdrant.scroll(COLLECTION, { limit: 100, with_payload: true, offset });
    for (const point of batch.points) {
      scanned++;
      const pl = point.payload || {};
      const isChunk = pl.kind === 'chunk';
      const text = [pl.title, isChunk ? pl.chunk_text : pl.text].filter(Boolean).join('\n');
      if (!text) continue;
      const hits = scanText(text);
      if (!hits.length) continue;
      // Chunk hits attribute to the parent thought — one review unit per thought
      const key = isChunk ? pl.parent_id : point.id;
      if (!byThought.has(key)) {
        byThought.set(key, {
          thought_id: key,
          source: pl.source || null,
          source_id: pl.source_id || null,
          title: isChunk ? null : pl.title || null,
          created_at: pl.created_at || null,
          hits: [],
        });
      }
      const entry = byThought.get(key);
      if (!isChunk && !entry.title) entry.title = pl.title || null;
      for (const h of hits) entry.hits.push({ ...h, via: isChunk ? `chunk:${point.id}` : 'thought' });
    }
    if (!batch.next_page_offset) break;
    offset = batch.next_page_offset;
  }

  const rank = { high: 0, medium: 1, low: 2 };
  const flagged = [...byThought.values()]
    .map((t) => ({ ...t, top_confidence: t.hits.reduce((a, h) => (rank[h.confidence] < rank[a] ? h.confidence : a), 'low') }))
    .sort((a, b) => rank[a.top_confidence] - rank[b.top_confidence]);

  const summary = {
    scanned_points: scanned,
    flagged_thoughts: flagged.length,
    by_confidence: {
      high: flagged.filter((t) => t.top_confidence === 'high').length,
      medium: flagged.filter((t) => t.top_confidence === 'medium').length,
      low: flagged.filter((t) => t.top_confidence === 'low').length,
    },
    by_class: {},
  };
  for (const t of flagged) for (const h of t.hits) summary.by_class[h.pattern_class] = (summary.by_class[h.pattern_class] || 0) + 1;

  const outPath = join(REPO_ROOT, 'tasks', `secret-exposure-${new Date().toISOString().slice(0, 10)}.json`);
  writeFileSync(outPath, JSON.stringify({ generated_at: new Date().toISOString(), summary, flagged }, null, 2));

  console.log(`Scanned ${scanned} points (thoughts + chunks)`);
  console.log(`Flagged ${flagged.length} thoughts — high: ${summary.by_confidence.high}, medium: ${summary.by_confidence.medium}, low: ${summary.by_confidence.low}`);
  console.table(summary.by_class);
  console.log(`Report: ${outPath}`);
}

run().catch((err) => { console.error(err); process.exit(1); });
