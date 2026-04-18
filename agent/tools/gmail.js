import { getGmail } from '../../server/drive-context.js';

const SKIP_SENDERS = ['noreply@', 'no-reply@', 'notifications@', 'mailer-daemon@', 'fred@fireflies.ai'];

function decodeBase64Url(str) {
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
}

function normalizePlainText(raw) {
  // Preserve newlines from the original; just tidy horizontal whitespace
  // and collapse excessive blank-line runs.
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function htmlToText(raw) {
  // Block-level tags become newlines so paragraph boundaries survive.
  // Inline tags become a single space. Entities are decoded cheaply.
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<\/?(p|div|li|h[1-6]|br|blockquote|tr|table|ul|ol|pre|hr|section|article|header|footer)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function bodyPartToText(part) {
  if (!part?.body?.data) return '';
  const raw = decodeBase64Url(part.body.data);
  if (part.mimeType === 'text/html') return htmlToText(raw);
  return normalizePlainText(raw);
}

export function extractBody(payload) {
  // Direct body
  if (payload.body?.data) {
    return bodyPartToText(payload);
  }

  // Multipart — prefer text/plain
  if (payload.parts) {
    const plain = payload.parts.find((p) => p.mimeType === 'text/plain');
    if (plain?.body?.data) return bodyPartToText(plain);

    const html = payload.parts.find((p) => p.mimeType === 'text/html');
    if (html?.body?.data) return bodyPartToText(html);

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

export function getHeader(headers, name) {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
}

export async function ensureLabel(gmail, name) {
  const listRes = await gmail.users.labels.list({ userId: 'me' });
  const existing = (listRes.data.labels || []).find((l) => l.name === name);
  if (existing) return existing.id;

  const createRes = await gmail.users.labels.create({
    userId: 'me',
    requestBody: {
      name,
      labelListVisibility: 'labelShow',
      messageListVisibility: 'show',
    },
  });
  return createRes.data.id;
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
