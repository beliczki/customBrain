import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
4. **content_chunks** — split the ORIGINAL text by topic transitions

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
  "content_chunks": [
    { "label": "short descriptive label in same language as text", "text": "chunk text (≤ 2000 chars)" }
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

**content_chunks**:
- 2-10 chunks for a typical thought, split at topic transitions / speaker turns / agenda-item boundaries
- 1 chunk if the thought is short or single-topic
- Each chunk ≤ 2000 chars
- Together they should cover the full original text (some overlap OK at boundaries; small omissions of pure boilerplate are OK)
- Each \`label\` should be 2-6 words describing the chunk's topic
- IMPORTANT: chunk by SEMANTIC TURNING POINTS in the content, not by fixed length. A 30-line agenda-item is one chunk; an email-reply within a thread is one chunk.

**Shortcuts for short/simple thoughts**:
- If text is < 1000 chars: \`summary\` = text itself; \`summary_chunks\` = [{label: "fő", text: summary}]; \`content_chunks\` = [{label: "fő", text: text}].
- If text is single-topic regardless of length: still produce a summary, but both chunk arrays may be length 1.
${contextBlock}

Original thought text:
"""
${text}
"""`;
}

const TOOL_SCHEMA = {
  name: 'submit_reprocessed_thought',
  description: 'Submit the reprocessed metadata, summary, and topic-chunked text for a thought.',
  input_schema: {
    type: 'object',
    required: ['metadata', 'summary', 'summary_chunks', 'content_chunks'],
    properties: {
      metadata: {
        type: 'object',
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
          required: ['label', 'text'],
          properties: {
            label: { type: 'string', description: '2-6 word topic label, same language as input' },
            text: { type: 'string', description: '≤1500 chars' },
          },
        },
      },
      content_chunks: {
        type: 'array',
        items: {
          type: 'object',
          required: ['label', 'text'],
          properties: {
            label: { type: 'string', description: '2-6 word topic label, same language as input' },
            text: { type: 'string', description: '≤2000 chars' },
          },
        },
      },
    },
  },
};

export async function reprocessThought(text, vaultContext) {
  const localCtx = loadContext();
  const prompt = buildMegaPrompt(text, localCtx, vaultContext);

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 16384,
      tools: [TOOL_SCHEMA],
      tool_choice: { type: 'tool', name: 'submit_reprocessed_thought' },
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`reprocessThought failed: ${err}`);
  }

  const json = await res.json();
  const toolUse = json.content.find((c) => c.type === 'tool_use');
  if (!toolUse) {
    throw new Error(`No tool_use in response: ${JSON.stringify(json.content)}`);
  }
  const parsed = toolUse.input;

  // Defensive: Haiku occasionally returns chunk arrays as stringified JSON
  // even with tool_use schema. Recover when possible.
  for (const field of ['summary_chunks', 'content_chunks']) {
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
