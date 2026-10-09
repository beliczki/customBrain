import { logAnthropicUsage } from '../../server/anthropic-usage.js';

export const BOILERPLATE_PATTERNS = [
  // English legal/confidentiality footer
  /this (e-?mail|message|communication)[\s\S]{0,250}?(confidential|intended recipient|privileged|proprietary)[\s\S]{0,2000}?(?=\n\s*\n|$)/gi,
  // Hungarian legal/confidentiality footer
  /(ez a (levél|üzenet|e-?mail)|jelen levél)[\s\S]{0,250}?(bizalmas|címzett|jogi védelem)[\s\S]{0,2000}?(?=\n\s*\n|$)/gi,
  // "Please consider the environment before printing"
  /(please consider|think before|before you print)[\s\S]{0,100}?(print|environment)[\s\S]{0,300}/gi,
  /(kérjük[, ]+gondoljon|kérjük[, ]+mielőtt)[\s\S]{0,100}?(nyomtat|környezet)[\s\S]{0,300}/gi,
  // Unsubscribe / marketing footer anchored to end
  /(unsubscribe|opt.?out|manage (your )?preferences|leiratkozás|leiratkozhat)[\s\S]{0,500}$/gi,
  // RFC-3676 signature delimiter + following sig block
  /\n-- ?\n[\s\S]{0,600}$/g,
  // "You are receiving this email because..."
  /you are receiving this (email|message)[\s\S]{0,300}/gi,
  // Generic "View this email in your browser"
  /view this (email|message) in your browser[\s\S]{0,200}/gi,
  // "-----Original Message-----" / "---------- Forwarded message ----------"
  /-{3,}\s*(original message|forwarded message|eredeti üzenet|továbbított üzenet)\s*-{3,}/gi,
  // "Privileged/Confidential Information may be contained in this message…" —
  // the first pattern needs "this message" BEFORE "confidential"; WPP's footer
  // has it the other way round.
  /(privileged|confidential)[^\n]{0,80}?this (e-?mail|message)[\s\S]{0,2000}?(?=\n\s*\n|$)/gi,
  // Recipient lists in one-line Outlook headers ("*To:* … *Cc:* …", 600+ chars
  // each, mostly inside forwards). From/Sent stay — who and when is context.
  /\*?(To|Cc|Címzett|Másolat):\*?[^\n]*?(?=\s\*?(Cc|Subject|Tárgy|Másolat):|\n|$)/gi,
  // Bare separator lines (Outlook's ____ above a quoted header, ---- rules).
  /^[ \t]*[_=-]{10,}[ \t]*$/gm,
];

// Lines that are reply/forward headers — strip them so the paragraph text below
// is unambiguously deduplicated against earlier messages.
const QUOTE_HEADER_PATTERNS = [
  /^\s*On .{10,300} wrote:\s*$/i,                      // "On Mon, Apr 18, 2026 at 10:30 AM X wrote:"
  /^\s*.{3,80} (írta|wrote|schrieb|escribió|ha scritto)[:\s]*$/i,
  /^\s*(from|to|cc|sent|subject|date|feladó|címzett|másolat|dátum|tárgy|küldve):\s.*$/i,
  /^\s*>+\s*.*$/,                                      // any line starting with '>'
];

const HAIKU_THRESHOLD = 1500;
export const NO_CONTENT_MARKER = '__NO_CONTENT__';

function stripQuoteMarkers(line) {
  // Remove leading '>' markers, optional space, then trim.
  return line.replace(/^[>\s]+/, '').trim();
}

function isHeaderLine(line) {
  return QUOTE_HEADER_PATTERNS.some((re) => re.test(line));
}

function normalizeParagraphKey(paragraph) {
  return paragraph
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N} ]+/gu, '')
    .trim()
    .slice(0, 200);
}

function splitIntoParagraphs(text) {
  // Drop quote markers line-by-line first, then split on blank-line boundaries.
  const cleaned = text
    .split('\n')
    .map(stripQuoteMarkers)
    .filter((l) => !isHeaderLine(l))
    .join('\n');

  return cleaned
    .split(/\n\s*\n+/)
    .map((p) => p.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 0);
}

// Reply headers that start the quoted copy of earlier messages, in the shapes
// seen in real threads (2026-10-09): Outlook "From: … / Sent: …" on two lines or one (also with
// Hungarian dates), Gmail "On …, Name <addr> wrote:" (often wrapped onto a
// second line), Hungarian Gmail "… ezt írta:", and "-----Original Message-----".
const REPLY_HEADERS = [
  /^[ \t>]*(From|Feladó):[^\n]*\n[ \t>]*(Sent|Date|Küldve|Elküldve|Dátum):/im,
  // Outlook HTML rendered to text: the header block on ONE line, bold markers kept —
  // "*From:* Anna Marjan <…> *Sent:* 2026. február 11., szerda 11:23 *To:* …"
  /^[ \t>]*\*?(From|Feladó):\*?[^\n]{0,400}?\*?(Sent|Date|Küldve|Elküldve|Dátum):\*?/im,
  /^[ \t>]*On\b[^\n]*(?:\n[^\n]*){0,2}?\bwrote:[ \t]*$/m,
  /^[ \t>]*[^\n]{0,200}írta:[ \t]*$/m, // no \b: in a non-unicode regex 'í' is not a word char
  /^[ \t>]*-{2,}\s*(Original Message|Eredeti üzenet)\s*-{2,}/im,
];
const FORWARD_MARKER = /(-{2,}\s*(Forwarded message|Továbbított üzenet)|Begin forwarded message)/i;
const FORWARD_SUBJECT = /^\s*(fw|fwd|tov|továbbítás)\s*:/i;
// "answers inline / in red below": the reply lives inside the quote, keep it.
const INLINE_REPLY = /(inline|pirossal|kékkel|alább válaszol|lent válaszol|válaszaim lent|below in (red|blue)|see (my )?(answers|comments) below)/i;

/**
 * Keep only what a message adds: everything from its first reply header on is
 * a copy of earlier messages, which the thread already contains. Until 0.47.3
 * the copies stayed in and paragraph dedup was meant to remove them — but
 * Outlook re-wraps quotes and rewrites links, so near-copies slipped through
 * and a 45-message thread stored ~50% signatures, quoted headers and link
 * wrappers. Forwards are left whole: their content exists nowhere else.
 */
export function newContentOfMessage(body, subject = '') {
  if (FORWARD_SUBJECT.test(subject)) return body;
  let cut = -1;
  for (const re of REPLY_HEADERS) {
    const m = body.match(re);
    if (m && (cut === -1 || m.index < cut)) cut = m.index;
  }
  if (cut === -1) return body;
  const fwd = body.search(FORWARD_MARKER);
  if (fwd !== -1 && fwd < cut) return body;
  if (INLINE_REPLY.test(body.slice(0, cut))) return body;
  return body.slice(0, cut);
}

// Link noise: Outlook writes "label<url>" and "addr<mailto:addr>", security
// gateways wrap URLs (urldefense, safelinks), signatures embed image URLs.
// Real document links are content (Drive/Docs links feed the Files catalog):
// unwrap them, keep them once.
function unwrapUrl(url) {
  const ud = url.match(/^https?:\/\/urldefense\.com\/v3\/__(.+?)__;/);
  if (ud) return ud[1].replace(/^(https?):\/(?!\/)/, '$1://');
  const sl = url.match(/^https?:\/\/[^/]*safelinks\.protection\.outlook\.com\/\?url=([^&]+)/);
  if (sl) { try { return decodeURIComponent(sl[1]); } catch { return url; } }
  return url;
}

export function cleanLinks(text) {
  return text
    .replace(/<mailto:[^>\s]*>/gi, '')
    .replace(/\[(cid:[^\]]*|https?:\/\/[^\]\s]+\.(png|jpe?g|gif|svg)[^\]]*)\]/gi, '')
    .replace(/[^\n]*reacted via Gmail[^\n]*/gi, '')
    .replace(/https?:\/\/[^\s<>"\]]+/g, (u) => unwrapUrl(u))
    // "label<url>": keep the url once, in parentheses, unless the label is the url
    .replace(/(\S)<(https?:\/\/[^>\s]+)>/g, (m, pre, url) => `${pre} (${unwrapUrl(url)})`)
    .replace(/<(https?:\/\/[^>\s]+)>/g, (m, url) => unwrapUrl(url))
    .replace(/(https?:\/\/\S+) \(\1\)/g, '$1');
}

/**
 * Given an ordered array of message bodies (oldest → newest), return the
 * concatenated text with every paragraph appearing at most once.
 *
 * The reply-chain in email means message N typically contains a quoted
 * copy of messages 1..N-1. Paragraph-level dedup collapses that entire
 * explosion into a linear list of unique content, language-agnostic.
 */
export function dedupeAcrossThread(bodies) {
  const seen = new Set();
  const messagesOut = [];

  for (const body of bodies) {
    if (!body) continue;
    const paragraphs = splitIntoParagraphs(body);
    const unique = [];
    for (const p of paragraphs) {
      const key = normalizeParagraphKey(p);
      if (key.length < 4) continue; // drop "OK", "Ha", single-char noise
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(p);
    }
    if (unique.length) messagesOut.push(unique.join('\n\n'));
  }

  return messagesOut.join('\n\n---\n\n');
}

export function applyRegexStrip(raw) {
  let cleaned = raw;
  for (const pattern of BOILERPLATE_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();
  return cleaned;
}

// Haiku only DECIDES whether a long body carries human content; it never
// produces the stored text. The stored text is always the deterministic
// dedup+regex output. Letting the model rewrite the body (the pre-0.45 design)
// replaced source with model text and silently cut long threads at its output
// cap — a 4096-token rewrite of a 30k-char thread lost the end with no signal.
async function haikuHasContent(cleaned, { subject, from }) {
  const prompt = `This is an email thread body after boilerplate removal and paragraph deduplication. Does it contain ANY substantive human content — decisions, questions, opinions, facts, action items, news, dates, numbers, names?

Answer NO_CONTENT only if it is entirely legal/confidentiality text, signatures, meeting-invite machinery, marketing/unsubscribe footers or pure pleasantries.

Respond with exactly one word: CONTENT or ${NO_CONTENT_MARKER}

Email:
Subject: ${subject || ''}
From: ${from || ''}

${cleaned}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 16,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gmail cleaner Haiku failed: ${err}`);
  }

  const json = await res.json();
  logAnthropicUsage('gmail_clean', json);
  const verdict = (json.content[0]?.text || '').trim();
  if (verdict.includes(NO_CONTENT_MARKER)) return false;
  if (verdict.includes('CONTENT')) return true;
  throw new Error(`Gmail cleaner Haiku returned an unexpected verdict: ${JSON.stringify(verdict)}`);
}

/**
 * cleanEmailBody accepts either:
 *   - an array of message bodies (ordered oldest → newest), or
 *   - a single pre-joined string (backward-compatible)
 * Returns { text, stats } where stats has { raw_chars, after_dedup, after_regex, haiku_verdict, kept }.
 * text is always the deterministic dedup+regex output (or NO_CONTENT_MARKER).
 */
export async function cleanEmailBody(input, { subject, from } = {}) {
  // Items are message bodies (strings) or {text, subject}; each keeps only
  // what it adds to the thread, with link noise removed.
  const items = Array.isArray(input) ? input : [input];
  const messages = items.map((it) => (typeof it === 'string' ? { text: it, subject: '' } : it));
  const totalRawChars = messages.reduce((n, m) => n + (m.text?.length || 0), 0);
  const bodies = messages.map(({ text, subject: s }) => cleanLinks(newContentOfMessage(text || '', s || '')));

  const deduped = dedupeAcrossThread(bodies);
  const afterRegex = applyRegexStrip(deduped);

  const stats = {
    raw_chars: totalRawChars,
    after_dedup: deduped.length,
    after_regex: afterRegex.length,
    haiku_verdict: null,
    kept: true,
  };

  if (afterRegex.length <= HAIKU_THRESHOLD) {
    if (afterRegex.length < 20) stats.kept = false;
    return { text: stats.kept ? afterRegex : NO_CONTENT_MARKER, stats };
  }

  const hasContent = await haikuHasContent(afterRegex, { subject, from });
  stats.haiku_verdict = hasContent ? 'content' : 'no_content';

  if (!hasContent) {
    stats.kept = false;
    return { text: NO_CONTENT_MARKER, stats };
  }

  return { text: afterRegex, stats };
}
