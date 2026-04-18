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

async function haikuExtract(cleaned, { subject, from }) {
  const prompt = `This is an email thread body after boilerplate removal and paragraph deduplication. Extract ONLY the substantive human content: decisions, questions, opinions, facts, action items, news, dates, numbers, names.

Preserve EVERY meaningful word — the input has already been aggressively deduped, so what remains is signal-dense. Do NOT summarize or paraphrase. Only strip:
- Any remaining legal/confidentiality/disclaimer text that got through
- Boilerplate signatures that survived (job title lines, phone numbers repeated across messages, "Sent from my iPhone", etc.)
- Meeting invite machinery (ics blobs, calendar links, "Join Zoom Meeting")
- Pure pleasantries that carry no information ("Thanks!", "Best regards", "Hope you're well")

Respond in the ORIGINAL language (Hungarian or English). If there is no substantive content at all, respond with exactly: ${NO_CONTENT_MARKER}

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
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gmail cleaner Haiku failed: ${err}`);
  }

  const json = await res.json();
  return (json.content[0]?.text || '').trim();
}

/**
 * cleanEmailBody accepts either:
 *   - an array of message bodies (ordered oldest → newest), or
 *   - a single pre-joined string (backward-compatible)
 * Returns { text, stats } where stats has { raw_chars, after_dedup, after_regex, after_haiku, kept }.
 */
export async function cleanEmailBody(input, { subject, from } = {}) {
  const bodies = Array.isArray(input) ? input : [input];
  const totalRawChars = bodies.reduce((n, b) => n + (b?.length || 0), 0);

  const deduped = dedupeAcrossThread(bodies);
  const afterRegex = applyRegexStrip(deduped);

  const stats = {
    raw_chars: totalRawChars,
    after_dedup: deduped.length,
    after_regex: afterRegex.length,
    after_haiku: null,
    kept: true,
  };

  if (afterRegex.length <= HAIKU_THRESHOLD) {
    if (afterRegex.length < 20) stats.kept = false;
    return { text: stats.kept ? afterRegex : NO_CONTENT_MARKER, stats };
  }

  const haikuOut = await haikuExtract(afterRegex, { subject, from });
  stats.after_haiku = haikuOut.length;

  if (haikuOut === NO_CONTENT_MARKER || haikuOut.includes(NO_CONTENT_MARKER)) {
    stats.kept = false;
    return { text: NO_CONTENT_MARKER, stats };
  }

  return { text: haikuOut, stats };
}
