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
];

const HAIKU_THRESHOLD = 1500;
const HAIKU_INPUT_CAP = 50000;
export const NO_CONTENT_MARKER = '__NO_CONTENT__';

function stripQuotedDuplicates(text) {
  const splitRe = /(\n\s*On .{10,200} wrote:\s*\n)/i;
  const parts = text.split(splitRe);
  if (parts.length < 3) return text;

  const head = parts[0];
  const result = [head];
  for (let i = 1; i < parts.length; i += 2) {
    const separator = parts[i];
    const quoted = parts[i + 1] || '';
    const firstLine = quoted.split('\n').find((l) => l.trim().length > 20);
    if (firstLine && head.includes(firstLine.trim().slice(0, 80))) {
      continue;
    }
    result.push(separator, quoted);
  }
  return result.join('');
}

export function applyRegexStrip(raw) {
  let cleaned = raw;
  for (const pattern of BOILERPLATE_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }
  cleaned = stripQuotedDuplicates(cleaned);
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();
  return cleaned;
}

async function haikuExtract(cleaned, { subject, from }) {
  const input = cleaned.length > HAIKU_INPUT_CAP
    ? cleaned.slice(0, HAIKU_INPUT_CAP) + '\n\n[...truncated, thread exceeded Haiku input cap]'
    : cleaned;

  const prompt = `This is an email thread body after boilerplate removal. Extract only the substantive human content: decisions, questions, opinions, facts, action items, news.

Strip:
- Any remaining legal/confidentiality/disclaimer text
- Repeated signatures across replies
- Quoted replies that duplicate content already present
- Meeting invite machinery, automated notifications
- Generic pleasantries ("Hope you're well", "Thanks!")

Respond in the ORIGINAL language (Hungarian or English). If there is no substantive content, respond with exactly: ${NO_CONTENT_MARKER}

Email:
Subject: ${subject || ''}
From: ${from || ''}

${input}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
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

export async function cleanEmailBody(raw, { subject, from } = {}) {
  const rawChars = raw.length;
  const afterRegex = applyRegexStrip(raw);
  const stats = { raw_chars: rawChars, after_regex: afterRegex.length, after_haiku: null, kept: true };

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
