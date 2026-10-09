import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logAnthropicUsage } from './anthropic-usage.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadContext() {
  try {
    return JSON.parse(readFileSync(join(__dirname, 'context.json'), 'utf-8'));
  } catch {
    return null;
  }
}

function resolveAliases(names, aliases) {
  if (!aliases || !names?.length) return names;
  const resolved = names.map((n) => {
    const lower = n.toLowerCase();
    for (const [alias, canonical] of Object.entries(aliases)) {
      if (alias.toLowerCase() === lower) return canonical;
    }
    return n;
  });
  return [...new Set(resolved)];
}

/**
 * Verify a tagged canonical person actually appears in the text in some form.
 * Accepts: exact canonical, name-order reversed (Hu↔Western), or any known alias from vault.
 * Rejects: names that only exist in the canonical list (Haiku hallucination from context).
 * "Me" is always accepted (self-reference is hard to verify mechanically).
 */
function verifyPersonInText(canonicalName, text, vaultAliases) {
  if (canonicalName === 'Me') return true;
  const lowerText = text.toLowerCase();
  if (lowerText.includes(canonicalName.toLowerCase())) return true;

  const parts = canonicalName.split(/\s+/).filter(Boolean);
  if (parts.length === 2) {
    const reversed = `${parts[1]} ${parts[0]}`;
    if (lowerText.includes(reversed.toLowerCase())) return true;
  }

  if (vaultAliases) {
    for (const [alias, canonical] of Object.entries(vaultAliases)) {
      if (canonical === canonicalName && lowerText.includes(alias.toLowerCase())) return true;
    }
  }

  return false;
}

function filterHallucinatedPeople(people, text, vaultAliases) {
  if (!people?.length) return { kept: [], rejected: [] };
  const kept = [];
  const rejected = [];
  for (const name of people) {
    if (verifyPersonInText(name, text, vaultAliases)) {
      kept.push(name);
    } else {
      rejected.push(name);
    }
  }
  return { kept, rejected };
}

// Content chunks are cut from the ORIGINAL text by code; the model only marks
// where topics change. Until 0.46 the model re-wrote the text into "2-10 chunks
// ≤ 2000 chars", which for a 100k-char transcript could hold at most ~20% of it:
// the rest was condensed away and never reached any vector (measured 2026-10-09:
// 156 of 389 long thoughts had text no chunk contained, 104 of 128 Fireflies).
// Cutting by line number keeps Sonnet's semantic boundaries and covers every line.
//
// gemini-embedding-001 accepts 2,048 input tokens (ai.google.dev embeddings
// docs); 4000 chars of Hungarian stays well under that, so no chunk is
// truncated at embed time.
export const MAX_CHUNK_CHARS = 4000;

export function numberLines(text) {
  return text.split('\n').map((line, i) => `${i + 1}| ${line}`).join('\n');
}

// A single line longer than the cap (newline-poor text) is split at sentence
// ends, and a sentence longer than the cap at the cap itself.
function splitLongLine(line) {
  const pieces = [];
  let cur = '';
  for (const sentence of line.split(/(?<=[.!?])\s+/)) {
    for (let i = 0; i < sentence.length; i += MAX_CHUNK_CHARS) {
      const part = sentence.slice(i, i + MAX_CHUNK_CHARS);
      if (cur && cur.length + 1 + part.length > MAX_CHUNK_CHARS) { pieces.push(cur); cur = ''; }
      cur = cur ? `${cur} ${part}` : part;
    }
  }
  if (cur) pieces.push(cur);
  return pieces;
}

function packLines(lines) {
  const out = [];
  let cur = [];
  let len = 0;
  for (const line of lines) {
    const parts = line.length > MAX_CHUNK_CHARS ? splitLongLine(line) : [line];
    for (const part of parts) {
      if (cur.length && len + 1 + part.length > MAX_CHUNK_CHARS) { out.push(cur.join('\n')); cur = []; len = 0; }
      cur.push(part);
      len += (cur.length > 1 ? 1 : 0) + part.length;
    }
  }
  if (cur.length) out.push(cur.join('\n'));
  return out;
}

// Section boundaries are a SET of start lines — their order in the answer
// carries no meaning, so an out-of-order or duplicated list is normalised, not
// rejected (Sonnet 4.6 returned 363 before 242 in the 2026-10-09 A/B; rejecting
// left the whole thought unchunked). Out-of-range lines are dropped and line 1
// is always a start, so every line still lands in exactly one chunk.
export function sectionsToChunks(text, sections) {
  const lines = text.split('\n');
  if (!Array.isArray(sections) || sections.length === 0) {
    throw new Error('reprocess returned no content_sections');
  }
  const byStart = new Map();
  for (const s of sections) {
    if (Number.isInteger(s.start_line) && s.start_line >= 1 && s.start_line <= lines.length && !byStart.has(s.start_line)) {
      byStart.set(s.start_line, s.label);
    }
  }
  if (!byStart.has(1)) byStart.set(1, sections[0].label);
  const starts = [...byStart.keys()].sort((a, b) => a - b);
  sections = starts.map((start_line) => ({ start_line, label: byStart.get(start_line) }));
  const chunks = [];
  sections.forEach((s, i) => {
    const end = i + 1 < sections.length ? starts[i + 1] - 1 : lines.length;
    const pieces = packLines(lines.slice(s.start_line - 1, end)).filter((p) => p.trim());
    pieces.forEach((p, k) => chunks.push({ label: pieces.length > 1 ? `${s.label} (${k + 1}/${pieces.length})` : s.label, text: p }));
  });
  return chunks;
}

export const CONTENT_SECTION_RULES = `**content_sections**:
- Every line of the original text below is prefixed with its line number and a bar (\`17| \`). The prefix is a marker, not content — never copy it into any other output.
- Return the line number where each topic section STARTS, in increasing order. The first section starts at line 1. A section runs until the next section's start line; the last one runs to the end. Do NOT return any text — the system cuts the sections from the original itself, so the whole text is always covered.
- Place a start at every SEMANTIC TURNING POINT: topic transitions, agenda items, a new email in a thread, a new speaker block on a new subject. Not at fixed lengths — a 30-line agenda item is one section.
- A section is normally at least ~1000 characters (several paragraphs or a full exchange). Do NOT open a new section for every heading, bullet group or short reply in a short text — group adjacent small parts that belong to the same subject.
- There is no upper limit on the number of sections: a long meeting transcript typically needs many (one per agenda item / subject change). Very long sections are split further by the system on line boundaries.
- Each \`label\` should be 2-6 words describing the section's topic`;

// Language and size are decided in code and handed to the model as facts: in
// the 2026-10-09 A/B Haiku 5.5 labelled Hungarian transcripts in English when
// left to infer the language, and with a stated language + target count + a
// self-check it kept 100% Hungarian labels on every Hungarian text.
function isHungarian(text) {
  const letters = (text.match(/\p{L}/gu) || []).length;
  const accented = (text.match(/[áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/g) || []).length;
  return letters > 0 && accented / letters > 0.02;
}

export function sectionGuidance(text) {
  const lang = isHungarian(text) ? 'Hungarian' : 'English';
  const lo = Math.max(1, Math.round(text.length / 5000));
  const hi = Math.max(1, Math.round(text.length / 2000));
  return `LANGUAGE (hard rule): the text is ${lang}. Every section label MUST be written in ${lang}${lang === 'Hungarian' ? ' (magyarul!)' : ''}. Never translate a label into another language, even if the text contains English terms.

SIZE: the text is ${text.length} characters. Aim for roughly ${lo}–${hi} content sections (about 2000–5000 characters each), following the real topic changes.

BEFORE YOU ANSWER, check your section list and fix anything that fails:
1. Every label is in ${lang}.
2. The first start_line is 1 and the start lines strictly increase.
3. No section is much shorter than ~1000 characters unless the whole text is short — merge tiny neighbours on the same subject.
4. Each label names the subject of its section in 2-6 words.`;
}

function buildMegaPrompt(text, localCtx, vaultCtx) {
  let contextBlock = '';

  if (localCtx?.notes) {
    contextBlock += `\nNotes: ${localCtx.notes}`;
  }

  if (vaultCtx?.people?.length) {
    contextBlock += `\n\nKnown people in the vault (use these exact names if they appear in the text): ${vaultCtx.people.join(', ')}`;
  }

  if (vaultCtx?.aliases && Object.keys(vaultCtx.aliases).length) {
    const byCanonical = {};
    for (const [alias, canonical] of Object.entries(vaultCtx.aliases)) {
      if (!byCanonical[canonical]) byCanonical[canonical] = [];
      byCanonical[canonical].push(alias);
    }
    const lines = Object.entries(byCanonical).map(
      ([canonical, alts]) => `- "${canonical}" is also known as: ${alts.join(', ')}`
    );
    contextBlock += `\n\nName aliases (always use the canonical name on the left, never the alias on the right):\n${lines.join('\n')}`;
  }

  if (vaultCtx?.projects?.length) {
    contextBlock += `\n\nCanonical project names in the vault. ALWAYS pick the MOST SPECIFIC sub-project that matches the thought's content. Example: if a thought mentions "SZA", "Cseperedő", "Online számla", or "Diákszámla", the project is "ERSTE Számlák" — NOT the umbrella "ERSTE". Only fall back to the umbrella when the thought is genuinely cross-product. List: ${vaultCtx.projects.join(', ')}`;
  }

  if (vaultCtx?.projectAliases && Object.keys(vaultCtx.projectAliases).length) {
    const byCanonical = {};
    for (const [alias, canonical] of Object.entries(vaultCtx.projectAliases)) {
      if (!byCanonical[canonical]) byCanonical[canonical] = [];
      byCanonical[canonical].push(alias);
    }
    const lines = Object.entries(byCanonical).map(
      ([canonical, alts]) => `- "${canonical}" is also known as: ${alts.join(', ')}`
    );
    contextBlock += `\n\nProject aliases (always use the canonical name on the left, never the alias on the right):\n${lines.join('\n')}`;
  }

  if (vaultCtx?.projectDocs && Object.keys(vaultCtx.projectDocs).length) {
    const blocks = Object.entries(vaultCtx.projectDocs)
      .map(([name, doc]) => `### ${name}\n${(doc || '').trim()}`)
      .filter((block) => block.split('\n').length > 1);
    if (blocks.length) {
      contextBlock += `\n\nFull project documents — the markdown content of each project's .md file. Use to understand each project's scope, products, and stakeholders. A thought belongs to a project ONLY if it fits the project's described scope:\n\n${blocks.join('\n\n---\n\n')}`;
    }
  }

  return `You are reprocessing a previously-captured thought. You must produce FOUR outputs in a single JSON response:

1. **metadata** — same shape as our existing capture pipeline produces
2. **summary** — a chronological, content-focused summary (≤ 6000 chars)
3. **summary_chunks** — split the summary by topic
4. **content_sections** — mark where the ORIGINAL text changes topic (line numbers only, no text)

Return ONLY valid JSON with this exact shape:

\`\`\`json
{
  "metadata": {
    "title": "string (2-4 word title, prefixed by canonical project name and em-dash if a primary project exists, e.g. 'ERSTE Számlák — SZA banner frissítés')",
    "type": "idea | note | task | meeting | reflection | reference | conversation",
    "projects": ["MOST SPECIFIC sub-project name from the canonical vault list"],
    "people": ["canonical person names"],
    "topics": ["3-8 key topics"],
    "action_items": ["concrete todos if any"]
  },
  "summary": "Chronological, dense, ≤6000 chars. Capture every meaningful fact, decision, date, name, link, number. If the thought has dates embedded in the content (email send dates, meeting dates, deadlines), preserve them. The summary should let a reader understand WHEN the content happened, not when it was captured.",
  "summary_chunks": [
    { "label": "short descriptive label in same language as text", "text": "chunk text (≤ 1500 chars)" }
  ],
  "content_sections": [
    { "label": "short descriptive label in same language as text", "start_line": 1 }
  ]
}
\`\`\`

RULES:

**Language**: Detect the dominant language of the input text. EVERY user-visible string in the output (title, topics, action_items, summary, chunk labels, chunk text) MUST be in that same language. If the text is Hungarian, do NOT switch to English for "professional" terms. If the text is a mix, follow the dominant language. NEVER translate.

**Title rule (strict)**:
- 2-4 words describing what this thought is ABOUT
- If a primary project is identified (i.e. \`projects\` is non-empty), the title MUST start with the canonical project name + em-dash + the 2-4 word topic. Example: "ERSTE Számlák — SZA banner frissítés".
- If \`projects\` is empty, just the 2-4 word topic.
- DO NOT use people's names as the title prefix. People go in \`people\`, not in the title.
- DO NOT use informal nicknames in the title.

**metadata.projects** — STRICT WHITELIST:
- MAY ONLY contain values from the canonical project list above (or one of their aliases).
- Pick the MOST SPECIFIC sub-project that matches. Prefer "ERSTE Számlák" over "ERSTE" when SZA/Cseperedő/Diák/Online számla are referenced. Prefer "ERSTE Hitelkártya" over "ERSTE" when credit-card products referenced. Etc.
- Most thoughts have 0-2 projects. 3+ is rare.
- Never invent project names by combining client + product + campaign + fiscal year fragments. Sub-activity details belong in \`topics\`.
- Empty array is correct when no canonical project matches.

**metadata.people** — STRICT VERBATIM RULE:
- A person MAY be tagged ONLY if their name (or a known alias from the vault) appears VERBATIM in the input text.
- DO NOT invent or borrow names from the canonical people list above. The canonical list is a NAMING GUIDE — it tells you how to spell people who appear in the text, NOT who exists in this thought.
- Before tagging "X", verify: does the substring "X" (or a vault alias of X) appear anywhere in the input text? If no, DO NOT tag.
- Exclude AI assistants, chatbots, virtual characters, people only in cc/quotes/passing.
- "Me" represents the user — tag if and only if the thought is self-referential or the user is clearly a participant.

**Language purity**: when responding in Hungarian, use ONLY Hungarian Latin characters (a-z, á, é, í, ó, ú, ö, ü, ő, ű). NEVER mix Cyrillic, Greek, or other non-Latin characters into Hungarian words.

**summary** rules:
- ≤ 6000 characters (strict — count chars, not tokens)
- Chronological where possible
- Dense — every sentence carries information
- Preserve embedded dates from the content
- Same language as input
- DO NOT include the original capture date; only content/conversation dates

**summary_chunks**:
- 2-5 chunks for a typical multi-topic thought
- 1 chunk if the thought is short or single-topic
- Each chunk ≤ 1500 chars
- Together they should cover the full summary
- Each \`label\` should be 2-6 words describing the chunk's topic

${CONTENT_SECTION_RULES}

${sectionGuidance(text)}

**Shortcuts for short/simple thoughts**:
- If text is < 1000 chars: \`summary\` = text itself; \`summary_chunks\` = [{label: "fő", text: summary}]; \`content_sections\` = [{label: "fő", start_line: 1}].
- If text is single-topic regardless of length: still produce a summary, but \`summary_chunks\` and \`content_sections\` may be length 1.
${contextBlock}

Original thought text (line-numbered):
"""
${numberLines(text)}
"""`;
}

// Structured output (output_config.format). Sonnet 5.5 rejects forced
// tool_choice, so the old submit-tool is now a JSON schema; strict schemas need
// additionalProperties:false on every object.
const RESPONSE_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    required: ['metadata', 'summary', 'summary_chunks', 'content_sections'],
    properties: {
      metadata: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'type', 'projects', 'people', 'topics', 'action_items'],
        properties: {
          title: { type: 'string', description: '2-4 word title, prefixed by canonical project name and em-dash if a primary project exists' },
          type: { type: 'string', enum: ['idea', 'note', 'task', 'meeting', 'reflection', 'reference', 'conversation'] },
          projects: { type: 'array', items: { type: 'string' }, description: 'Most-specific sub-project names from the canonical vault list' },
          people: { type: 'array', items: { type: 'string' } },
          topics: { type: 'array', items: { type: 'string' } },
          action_items: { type: 'array', items: { type: 'string' } },
        },
      },
      summary: { type: 'string', description: 'Chronological, dense, ≤6000 chars. Preserves embedded content dates.' },
      summary_chunks: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['label', 'text'],
          properties: {
            label: { type: 'string', description: '2-6 word topic label, same language as input' },
            text: { type: 'string', description: '≤1500 chars' },
          },
        },
      },
      content_sections: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['label', 'start_line'],
          properties: {
            label: { type: 'string', description: '2-6 word topic label, same language as input' },
            start_line: { type: 'integer', description: '1-based line number where this section starts; strictly increasing, first is 1' },
          },
        },
      },
    },
};

// Sonnet 5.5 at low effort for chunking: in a 2026-10-09 A/B on six real
// thoughts it gave the finest sensible boundaries, kept Hungarian labels and
// returned no invalid section list (Sonnet 4.6: 1/6 out of order; Haiku 5.5
// translated labels to English). Its thinking can't be switched off; effort is
// the lever. A refusal or a max_tokens stop is an incomplete answer: throw, so
// the caller marks the thought instead of indexing half of it.
const CHUNK_MODEL = 'claude-sonnet-5-5';
// Sections alone (re-chunking): Haiku 5.5 at low effort. Same A/B, round 2 with
// sectionGuidance: Hungarian labels on every Hungarian text, sensible
// boundaries, 1.5-3 s per text and ~1/20 of Sonnet 5.5's price. High effort was
// slower (up to 21 s) and over-split, not better.
const SECTIONS_MODEL = 'claude-haiku-5-5';

async function callClaudeJson({ model = CHUNK_MODEL, prompt, schema, effort, maxTokens, site }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      output_config: { effort, format: { type: 'json_schema', schema } },
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`${site} failed: ${await res.text()}`);
  const json = await res.json();
  logAnthropicUsage(site, json);
  if (json.stop_reason !== 'end_turn') {
    throw new Error(`${site} stopped with ${json.stop_reason}${json.stop_details ? ` (${json.stop_details.category})` : ''} — output incomplete`);
  }
  const text = json.content.find((c) => c.type === 'text')?.text;
  if (!text) throw new Error(`${site}: no text block in response`);
  return { parsed: JSON.parse(text), json };
}

// `model` / `effort` override the production choice — used by model A/B runs.
export async function reprocessThought(text, vaultContext, { model = CHUNK_MODEL, effort = 'medium' } = {}) {
  const localCtx = loadContext();
  const prompt = buildMegaPrompt(text, localCtx, vaultContext);

  const { parsed, json } = await callClaudeJson({
    model, prompt, schema: RESPONSE_SCHEMA, effort, maxTokens: 32000, site: 'chunking',
  });

  // Defensive: Haiku occasionally returns chunk arrays as stringified JSON
  // even with tool_use schema. Recover when possible.
  for (const field of ['summary_chunks', 'content_sections']) {
    if (typeof parsed[field] === 'string') {
      try {
        const recovered = JSON.parse(parsed[field]);
        if (Array.isArray(recovered)) {
          parsed[field] = recovered;
          parsed[`_recovered_${field}`] = true;
        }
      } catch {
        // leave as string; downstream will warn
      }
    }
    if (!Array.isArray(parsed[field])) {
      parsed[field] = [];
    }
  }

  parsed.content_chunks = sectionsToChunks(text, parsed.content_sections);

  if (parsed.metadata) {
    parsed.metadata.people = resolveAliases(parsed.metadata.people, vaultContext?.aliases);
    parsed.metadata.projects = resolveAliases(parsed.metadata.projects, vaultContext?.projectAliases);

    const { kept, rejected } = filterHallucinatedPeople(parsed.metadata.people, text, vaultContext?.aliases);
    parsed.metadata.people = kept;
    parsed._rejected_people = rejected;
  }

  parsed._prompt = prompt;
  parsed._usage = json.usage;
  parsed._stop_reason = json.stop_reason;
  return parsed;
}

// Content sections only — no metadata, no summary, no vault context. Used to
// re-chunk thoughts that already carry a summary and curated metadata, which a
// full reprocess would overwrite; and it costs ~1/5 of one (the vault context
// alone is ~23k input tokens per reprocess call).
const SECTIONS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['content_sections'],
  properties: { content_sections: RESPONSE_SCHEMA.properties.content_sections },
};

export async function markContentSections(text) {
  const prompt = `Split the text below into topic sections for retrieval indexing.

${CONTENT_SECTION_RULES}

${sectionGuidance(text)}

Text (line-numbered):
"""
${numberLines(text)}
"""`;
  const { parsed } = await callClaudeJson({
    model: SECTIONS_MODEL, prompt, schema: SECTIONS_SCHEMA, effort: 'low', maxTokens: 16000, site: 'rechunk',
  });
  return sectionsToChunks(text, parsed.content_sections);

}
