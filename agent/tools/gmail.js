import { getGmail } from '../../server/drive-context.js';

const SKIP_SENDERS = ['noreply@', 'no-reply@', 'notifications@', 'mailer-daemon@', 'fred@fireflies.ai'];

function decodeBase64Url(str) {
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
}

function extractBody(payload) {
  // Direct body
  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // Multipart — prefer text/plain
  if (payload.parts) {
    const plain = payload.parts.find((p) => p.mimeType === 'text/plain');
    if (plain?.body?.data) {
      return decodeBase64Url(plain.body.data).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }

    const html = payload.parts.find((p) => p.mimeType === 'text/html');
    if (html?.body?.data) {
      return decodeBase64Url(html.body.data).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }

    // Nested multipart
    for (const part of payload.parts) {
      if (part.parts) {
        const nested = extractBody(part);
        if (nested) return nested;
      }
    }
  }
  return '';
}

function getHeader(headers, name) {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
}

export async function getGmailThreads(query, maxResults = 10) {
  const gmail = getGmail();

  const listRes = await gmail.users.threads.list({
    userId: 'me',
    q: query,
    maxResults,
  });

  const threads = listRes.data.threads || [];
  const results = [];

  for (const thread of threads) {
    const threadRes = await gmail.users.threads.get({
      userId: 'me',
      id: thread.id,
      format: 'full',
    });

    const firstMsg = threadRes.data.messages?.[0];
    if (!firstMsg) continue;

    const from = getHeader(firstMsg.payload.headers, 'From');
    if (SKIP_SENDERS.some((s) => from.toLowerCase().includes(s))) continue;

    const bodyParts = threadRes.data.messages
      .map((msg) => extractBody(msg.payload))
      .filter(Boolean);

    results.push({
      thread_id: thread.id,
      subject: getHeader(firstMsg.payload.headers, 'Subject'),
      from,
      date: getHeader(firstMsg.payload.headers, 'Date'),
      snippet: firstMsg.snippet || '',
      body_text: bodyParts.join('\n---\n').substring(0, 10000),
    });
  }

  return results;
}
