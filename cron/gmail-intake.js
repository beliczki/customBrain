import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', 'server', '.env') });

import { getGmail } from '../server/drive-context.js';
import { extractBody, getHeader, ensureLabel } from '../agent/tools/gmail.js';
import { cleanEmailBody, NO_CONTENT_MARKER } from '../agent/tools/gmail-clean.js';
import { captureThought } from '../server/routes/capture.js';

const MAX_BODY_CHARS = 6000;

function buildText(thread, cleanedBody) {
  const first = thread.messages[0];
  const subject = getHeader(first.payload.headers, 'Subject');
  const from = getHeader(first.payload.headers, 'From');
  const date = getHeader(first.payload.headers, 'Date');
  const body = cleanedBody.slice(0, MAX_BODY_CHARS);
  return `# ${subject || '(no subject)'}\nFrom: ${from}\n${date}\n\n${body}`;
}

async function run() {
  const gmail = getGmail();
  const brainLabel = process.env.GMAIL_BRAIN_LABEL || 'brain';
  const capturedLabel = process.env.GMAIL_CAPTURED_LABEL || 'brain/captured';
  const emptyLabel = `${brainLabel}/empty`;

  await ensureLabel(gmail, brainLabel);
  const capturedId = await ensureLabel(gmail, capturedLabel);
  const emptyId = await ensureLabel(gmail, emptyLabel);

  const query = `label:${brainLabel} -label:${capturedLabel}`;
  const listRes = await gmail.users.messages.list({ userId: 'me', q: query, maxResults: 50 });
  const messages = listRes.data.messages || [];
  console.log(`Gmail intake: ${messages.length} candidate messages (query: ${query})`);

  let captured = 0;
  let skipped = 0;
  let empty = 0;
  let failed = 0;

  const seenThreads = new Set();

  for (const msg of messages) {
    try {
      const msgRes = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'minimal' });
      const threadId = msgRes.data.threadId;
      if (seenThreads.has(threadId)) continue;
      seenThreads.add(threadId);

      const threadRes = await gmail.users.threads.get({ userId: 'me', id: threadId, format: 'full' });
      const thread = threadRes.data;

      // Sort oldest→newest so dedupeAcrossThread sees each paragraph
      // in its original message first, before the reply chain quotes it.
      const ordered = [...thread.messages].sort((a, b) =>
        Number(a.internalDate || 0) - Number(b.internalDate || 0)
      );
      const bodies = ordered.map((m) => extractBody(m.payload)).filter(Boolean);

      const { text: cleaned, stats } = await cleanEmailBody(bodies, {
        subject: getHeader(thread.messages[0].payload.headers, 'Subject'),
        from: getHeader(thread.messages[0].payload.headers, 'From'),
      });

      console.log(`  ${threadId}: raw=${stats.raw_chars} dedup=${stats.after_dedup} regex=${stats.after_regex} haiku=${stats.after_haiku ?? '-'} kept=${stats.kept}`);

      if (!stats.kept || cleaned === NO_CONTENT_MARKER) {
        await gmail.users.threads.modify({
          userId: 'me',
          id: threadId,
          requestBody: { addLabelIds: [capturedId, emptyId] },
        });
        empty++;
        continue;
      }

      const text = buildText(thread, cleaned);
      const result = await captureThought(text, { source: 'gmail', sourceId: threadId });

      await gmail.users.threads.modify({
        userId: 'me',
        id: threadId,
        requestBody: { addLabelIds: [capturedId] },
      });

      if (result.duplicate) {
        skipped++;
      } else {
        captured++;
        console.log(`    captured: ${result.id}`);
      }
    } catch (err) {
      failed++;
      const cause = err.cause ? ` (cause: ${err.cause.code || err.cause.message || err.cause})` : '';
      console.error(`  failed: ${msg.id} — ${err.message}${cause}`);
      if (err.stack) console.error(err.stack.split('\n').slice(0, 5).join('\n'));
    }
  }

  console.log(`Gmail intake done: captured=${captured} skipped=${skipped} empty=${empty} failed=${failed}`);
}

run().catch((err) => {
  console.error('Gmail intake crashed:', err.message);
  process.exit(1);
});
