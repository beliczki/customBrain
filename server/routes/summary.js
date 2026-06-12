// Coworker-loop summary management. Two operations:
//   - listThoughtsNeedingSummary: surfaces long thoughts that need a fresh
//     summary prepended (either none yet, or stale because the thought was
//     refreshed after the summary was last appended).
//   - setThoughtTextWithSummary: strips any existing summary block from the
//     text, prepends a new summary block, writes back via refreshCapture.
//
// Summary block format in the text payload:
//   # <title line, optional, hoisted from original text if present>
//   <blank>
//   ## Summary
//   <chronological summary, ≤ ~5000 chars>
//   <blank>
//   ---
//   <blank>
//   <rest of original text>
//
// "Stale" detection: a summary is stale when summary_appended_at < updated_at.
// We do NOT auto-strip on refresh — the stale summary stays in place until
// the coworker loop replaces it. This avoids burning a subscription call on
// every Gmail thread refresh.

import { Router } from 'express';
import { scrollFilteredRaw, getById } from '../qdrant.js';
import { refreshCapture } from './capture.js';

const router = Router();

const NEEDS_SUMMARY_THRESHOLD = 6000;
const SUMMARY_HARD_CAP_CHARS = 5500;

const SUMMARY_BLOCK_REGEX = /^(# [^\n]+\n\n?)?## Summary\n[\s\S]*?\n---\n+/;

export function stripExistingSummary(text) {
  const match = text.match(SUMMARY_BLOCK_REGEX);
  if (!match) return text;
  const titleLine = match[1] || '';
  return titleLine + text.slice(match[0].length);
}

export function wrapWithSummary(text, summary) {
  const lines = text.split('\n');
  let titleLine = '';
  let rest = text;
  if (lines[0]?.startsWith('# ')) {
    titleLine = lines[0] + '\n\n';
    let i = 1;
    while (i < lines.length && lines[i].trim() === '') i++;
    rest = lines.slice(i).join('\n');
  }
  return `${titleLine}## Summary\n${summary}\n\n---\n\n${rest}`;
}

export async function listThoughtsNeedingSummary(limit = 10) {
  // No Qdrant filter for "field A < field B" semantics — pull all and filter
  // in JS. Dataset is small enough (hundreds) for this to be fine.
  const all = await scrollFilteredRaw({}, 200);

  const candidates = all.filter((t) => {
    if ((t.text?.length || 0) <= NEEDS_SUMMARY_THRESHOLD) return false;
    if (t.status === 'archived') return false;
    if (t.has_auto_summary !== true) return true;
    // Stale check: refresh bumps updated_at; if summary was appended before
    // the most recent refresh, it's outdated.
    if (t.updated_at && t.summary_appended_at && t.summary_appended_at < t.updated_at) return true;
    return false;
  });

  // Stable order: oldest summary (or never-summarized) first, so the loop
  // works through the longest-stale items in priority order.
  candidates.sort((a, b) => {
    const aKey = a.summary_appended_at || '0000';
    const bKey = b.summary_appended_at || '0000';
    return aKey.localeCompare(bKey);
  });

  return candidates.slice(0, limit).map((t) => ({
    id: t.id,
    title: t.title || '',
    text: t.text,
    text_length: t.text.length,
    has_auto_summary: t.has_auto_summary === true,
    summary_appended_at: t.summary_appended_at || null,
    updated_at: t.updated_at || null,
  }));
}

export async function setThoughtTextWithSummary(thoughtId, summaryText) {
  if (typeof summaryText !== 'string' || summaryText.trim().length === 0) {
    throw new Error('summary_text must be a non-empty string');
  }
  if (summaryText.length > SUMMARY_HARD_CAP_CHARS) {
    throw new Error(`summary_text exceeds hard cap of ${SUMMARY_HARD_CAP_CHARS} chars (got ${summaryText.length})`);
  }

  const existing = await getById(thoughtId);
  if (!existing) throw new Error(`Thought ${thoughtId} not found`);

  const stripped = stripExistingSummary(existing.text || '');
  const wrapped = wrapWithSummary(stripped, summaryText.trim());

  const result = await refreshCapture(thoughtId, wrapped, {
    chunk: false, // coworker path manages its own summary; don't re-summarize/chunk
    extraPayload: {
      has_auto_summary: true,
      summary_appended_at: new Date().toISOString(),
      summary_source: 'coworker',
    },
  });

  return {
    ok: true,
    id: thoughtId,
    summary_length: summaryText.length,
    text_length: wrapped.length,
    refresh_count: result.refresh_count,
  };
}

router.get('/thoughts/needing-summary', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 10;
    const results = await listThoughtsNeedingSummary(limit);
    res.json({ count: results.length, thoughts: results });
  } catch (err) {
    console.error('listThoughtsNeedingSummary error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/thoughts/:id/set-summary', async (req, res) => {
  try {
    const { summary_text } = req.body || {};
    const result = await setThoughtTextWithSummary(req.params.id, summary_text);
    res.json(result);
  } catch (err) {
    console.error('setThoughtTextWithSummary error:', err.message);
    res.status(err.message?.includes('not found') ? 404 : 400).json({ error: err.message });
  }
});

export default router;
