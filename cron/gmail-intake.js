import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env') });
import { applySettingsToEnv } from '../server/config.js';
applySettingsToEnv();

import { getGmail, getVaultContext } from '../server/drive-context.js';
import { extractBody, getHeader, ensureLabel } from '../agent/tools/gmail.js';
import { cleanEmailBody, NO_CONTENT_MARKER } from '../agent/tools/gmail-clean.js';
import { captureThought, refreshCapture } from '../server/routes/capture.js';
import { findBySourceIdRaw } from '../server/qdrant.js';

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const STATE_DIR = join(MODULE_DIR, '..', 'state');
const WATERMARK_PATH = join(STATE_DIR, 'gmail-watermark.json');
const MAX_BODY_CHARS = 6000;

async function readWatermark() {
  try {
    const raw = await readFile(WATERMARK_PATH, 'utf-8');
    const data = JSON.parse(raw);
    return data.history_id ? String(data.history_id) : null;
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

async function writeWatermark(historyId) {
  await mkdir(STATE_DIR, { recursive: true });
  const body = JSON.stringify(
    { history_id: String(historyId), updated_at: new Date().toISOString() },
    null,
    2,
  );
  await writeFile(WATERMARK_PATH, body, 'utf-8');
}

/**
 * Parse recipient-header emails (To, Cc, Bcc). Gmail returns RFC-5322
 * strings like "Foo Bar <foo@bar.com>, baz@baz.com". We only need the
 * bare addresses, lowercased.
 */
function extractEmails(headerValue) {
  if (!headerValue) return [];
  const out = [];
  const re = /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi;
  let m;
  while ((m = re.exec(headerValue)) !== null) {
    out.push(m[1].toLowerCase());
  }
  return out;
}

function threadHasLabel(thread, labelId) {
  return thread.messages.some((m) => (m.labelIds || []).includes(labelId));
}

function threadLatestInternalDate(thread) {
  let max = 0;
  for (const m of thread.messages) {
    const n = Number(m.internalDate || 0);
    if (n > max) max = n;
  }
  return max;
}

/**
 * Scan a thread for an outbound message (SENT label) addressed to any email
 * in `peopleEmails`. Returns the matched canonical person name or null.
 */
function detectOutboundToKnownPerson(thread, peopleEmails) {
  for (const msg of thread.messages) {
    if (!(msg.labelIds || []).includes('SENT')) continue;
    const headers = msg.payload?.headers || [];
    const recipients = [
      ...extractEmails(getHeader(headers, 'To')),
      ...extractEmails(getHeader(headers, 'Cc')),
      ...extractEmails(getHeader(headers, 'Bcc')),
    ];
    for (const email of recipients) {
      if (peopleEmails[email]) return peopleEmails[email];
    }
  }
  return null;
}

async function buildThreadText(thread) {
  const first = thread.messages[0];
  const subject = getHeader(first.payload.headers, 'Subject');
  const from = getHeader(first.payload.headers, 'From');
  const date = getHeader(first.payload.headers, 'Date');

  const ordered = [...thread.messages].sort((a, b) =>
    Number(a.internalDate || 0) - Number(b.internalDate || 0)
  );
  const bodies = ordered.map((m) => extractBody(m.payload)).filter(Boolean);
  // Sender of the newest message in the thread — surfaced in the UI as "who
  // added the latest line". Was previously lost: only the first sender made it
  // into the header and the cleaner strips per-message From: lines.
  const lastFrom = getHeader(ordered[ordered.length - 1].payload.headers, 'From');

  const { text: cleaned, stats } = await cleanEmailBody(bodies, {
    subject,
    from,
  });

  if (!stats.kept || cleaned === NO_CONTENT_MARKER) {
    return { empty: true, stats };
  }

  const body = cleaned.slice(0, MAX_BODY_CHARS);
  const text = `# ${subject || '(no subject)'}\nFrom: ${from}\n${date}\n\n${body}`;
  return { empty: false, text, stats, last_message_from: lastFrom };
}

async function processThread(gmail, threadId, { brainLabelId, capturedLabelId, emptyLabelId, peopleEmails }) {
  const threadRes = await gmail.users.threads.get({
    userId: 'me',
    id: threadId,
    format: 'full',
  });
  const thread = threadRes.data;

  let hasBrain = threadHasLabel(thread, brainLabelId);
  let outboundMatched = null;
  const latestDate = threadLatestInternalDate(thread);

  if (!hasBrain) {
    outboundMatched = detectOutboundToKnownPerson(thread, peopleEmails);
    if (!outboundMatched) return { status: 'ignored' };

    const OUTBOUND_RECENCY_DAYS = 14;
    const ageDays = (Date.now() - latestDate) / 86400000;
    if (ageDays > OUTBOUND_RECENCY_DAYS) {
      return { status: 'ignored_stale_outbound', age_days: Math.floor(ageDays), matched: outboundMatched };
    }

    await gmail.users.threads.modify({
      userId: 'me',
      id: threadId,
      requestBody: { addLabelIds: [brainLabelId] },
    });
    hasBrain = true;
  }

  const existing = await findBySourceIdRaw('gmail', threadId);

  if (existing && existing.last_internal_date && Number(existing.last_internal_date) >= latestDate) {
    return { status: 'unchanged', id: existing.id };
  }

  const built = await buildThreadText(thread);
  if (built.empty) {
    await gmail.users.threads.modify({
      userId: 'me',
      id: threadId,
      requestBody: { addLabelIds: [capturedLabelId, emptyLabelId] },
    });
    return { status: 'empty', stats: built.stats };
  }

  console.log(`  ${threadId}: raw=${built.stats.raw_chars} dedup=${built.stats.after_dedup} regex=${built.stats.after_regex} haiku=${built.stats.after_haiku ?? '-'} kept=${built.stats.kept}`);

  const extraPayload = {
    thread_id: threadId,
    last_internal_date: latestDate,
    ...(built.last_message_from && { last_message_from: built.last_message_from }),
    ...(outboundMatched && { auto_labeled_via: `outbound:${outboundMatched}` }),
  };

  if (existing) {
    const result = await refreshCapture(existing.id, built.text, { extraPayload });
    console.log(`    refreshed: ${result.id} (count=${result.refresh_count})`);
    await gmail.users.threads.modify({
      userId: 'me',
      id: threadId,
      requestBody: { addLabelIds: [capturedLabelId] },
    });
    return { status: 'refreshed', id: result.id };
  }

  const result = await captureThought(built.text, {
    source: 'gmail',
    sourceId: threadId,
    extraPayload,
  });
  console.log(`    captured: ${result.id}${outboundMatched ? ` (outbound→${outboundMatched})` : ''}`);
  await gmail.users.threads.modify({
    userId: 'me',
    id: threadId,
    requestBody: { addLabelIds: [capturedLabelId] },
  });
  return { status: result.duplicate ? 'duplicate' : 'captured', id: result.id };
}

/**
 * Collect all thread IDs touched since startHistoryId. Also returns the latest
 * historyId we observed, to advance the watermark.
 *
 * Returns null if Gmail rejects the startHistoryId (too old — Gmail history
 * window is ~7 days). Caller should bootstrap in that case.
 */
async function collectAffectedThreads(gmail, startHistoryId) {
  const threadIds = new Set();
  let pageToken = undefined;
  let latestHistoryId = startHistoryId;

  while (true) {
    let res;
    try {
      res = await gmail.users.history.list({
        userId: 'me',
        startHistoryId,
        historyTypes: ['messageAdded', 'labelAdded'],
        maxResults: 500,
        pageToken,
      });
    } catch (err) {
      if (err.code === 404 || err.response?.status === 404) return null;
      throw err;
    }

    const history = res.data.history || [];
    for (const h of history) {
      for (const ev of h.messagesAdded || []) {
        if (ev.message?.threadId) threadIds.add(ev.message.threadId);
      }
      for (const ev of h.labelsAdded || []) {
        if (ev.message?.threadId) threadIds.add(ev.message.threadId);
      }
    }
    if (res.data.historyId) latestHistoryId = res.data.historyId;

    pageToken = res.data.nextPageToken;
    if (!pageToken) break;
  }

  return { threadIds: Array.from(threadIds), latestHistoryId };
}

/**
 * First-run / recovery path: scan every thread currently labeled `brain`.
 * Used when (a) the watermark file doesn't exist yet, or (b) Gmail returned
 * 404 because the stored watermark is older than Gmail's 7-day history
 * retention window.
 */
async function bootstrapFullScan(gmail, brainLabel, ctx) {
  console.log(`Gmail intake bootstrap: full scan of label:${brainLabel}`);
  const listRes = await gmail.users.messages.list({
    userId: 'me',
    q: `label:${brainLabel}`,
    maxResults: 200,
  });
  const messages = listRes.data.messages || [];
  const threadIds = new Set();
  for (const msg of messages) {
    const res = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'minimal' });
    if (res.data.threadId) threadIds.add(res.data.threadId);
  }
  return Array.from(threadIds);
}

async function run() {
  const gmail = getGmail();
  const brainLabel = process.env.GMAIL_BRAIN_LABEL || 'brain';
  const capturedLabel = process.env.GMAIL_CAPTURED_LABEL || 'brain/captured';
  const emptyLabel = `${brainLabel}/empty`;

  const brainLabelId = await ensureLabel(gmail, brainLabel);
  const capturedLabelId = await ensureLabel(gmail, capturedLabel);
  const emptyLabelId = await ensureLabel(gmail, emptyLabel);

  const vaultCtx = await getVaultContext();
  const peopleEmails = vaultCtx.peopleEmails || {};
  console.log(`Gmail intake: ${Object.keys(peopleEmails).length} known-person emails loaded`);

  const ctx = { brainLabelId, capturedLabelId, emptyLabelId, peopleEmails };

  const watermark = await readWatermark();
  let threadIds;
  let newWatermark;

  if (!watermark) {
    threadIds = await bootstrapFullScan(gmail, brainLabel, ctx);
    const profile = await gmail.users.getProfile({ userId: 'me' });
    newWatermark = profile.data.historyId;
  } else {
    const collected = await collectAffectedThreads(gmail, watermark);
    if (collected === null) {
      console.warn(`Gmail intake: watermark ${watermark} too old (>7 days). Bootstrapping.`);
      threadIds = await bootstrapFullScan(gmail, brainLabel, ctx);
      const profile = await gmail.users.getProfile({ userId: 'me' });
      newWatermark = profile.data.historyId;
    } else {
      threadIds = collected.threadIds;
      newWatermark = collected.latestHistoryId;
    }
  }

  console.log(`Gmail intake: ${threadIds.length} affected threads since historyId=${watermark || '(bootstrap)'}`);

  const counts = { captured: 0, refreshed: 0, duplicate: 0, unchanged: 0, empty: 0, ignored: 0, failed: 0 };

  for (const threadId of threadIds) {
    try {
      const result = await processThread(gmail, threadId, ctx);
      counts[result.status] = (counts[result.status] || 0) + 1;
    } catch (err) {
      counts.failed++;
      const cause = err.cause ? ` (cause: ${err.cause.code || err.cause.message || err.cause})` : '';
      console.error(`  failed: thread ${threadId} — ${err.message}${cause}`);
      if (err.stack) console.error(err.stack.split('\n').slice(0, 5).join('\n'));
    }
  }

  if (newWatermark) {
    await writeWatermark(newWatermark);
    console.log(`Gmail intake: watermark advanced to ${newWatermark}`);
  }

  console.log(`Gmail intake done: ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(' ')}`);
}

run().catch((err) => {
  console.error('Gmail intake crashed:', err.message);
  process.exit(1);
});
