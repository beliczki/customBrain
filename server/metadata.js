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

function buildPrompt(text, localCtx, vaultCtx) {
  let contextBlock = '';

  if (localCtx?.notes) {
    contextBlock += `\nNotes: ${localCtx.notes}`;
  }

  if (vaultCtx?.people?.length) {
    contextBlock += `\n\nKnown people in the vault (use these exact names if they appear in the text): ${vaultCtx.people.join(', ')}`;
  }

  if (vaultCtx?.aliases && Object.keys(vaultCtx.aliases).length) {
    // Group aliases by canonical name
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
    contextBlock += `\n\nCanonical project names in the vault (use these exact names if the thought IS about one of these projects; do NOT force a match when the thought merely mentions one in passing): ${vaultCtx.projects.join(', ')}`;
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
      .filter((block) => block.split('\n').length > 1); // skip projects with empty .md
    if (blocks.length) {
      contextBlock += `\n\nFull project documents — the markdown content of each project's .md file in the vault. Use these to understand each project's scope, client, stakeholders, and history. A thought belongs to a project ONLY if it fits the project's described scope:\n\n${blocks.join('\n\n---\n\n')}`;
    }
  }

  return `Extract metadata from this text. Return ONLY valid JSON with these fields:
- title: string (2-3 word short title summarizing the thought — in the same language as the text). If you identify a primary project (see rule below) AND it ends up in the \`projects\` array, prefix the title with the canonical project name and an em-dash, e.g. "Hello Business — KPI és biztonság" instead of "KPI és biztonság". Do NOT prefix if no primary project is in \`projects\`. Use the canonical project name exactly as listed in the vault context, not an alias.
- people: string[] (names of REAL people actually discussed; exclude AI assistants, chatbots, virtual characters, and people mentioned only in cc/quotes/passing)
- topics: string[] (3-8 key topics/themes that capture what the thought is actually about)
- projects: string[] — see rule below
- type: string (one of: idea, note, task, meeting, reflection, reference, conversation)
- action_items: string[] (any concrete action items or todos)

RULE FOR \`projects\` — IMPORTANT:
Include ONLY projects this thought is PRIMARILY ABOUT. Do NOT include projects mentioned as:
- examples ("we could apply the same pattern as Bizi")
- comparisons ("unlike in Proficio, here we...")
- background context ("this happened during the ERSTE sprint")
- inspiration / lineage ("this idea originally came from customBrain")

STRICT WHITELIST — never invent project names:
\`projects\` MAY ONLY contain values that are present in the canonical project list above (or one of their aliases). Never invent a new project name by combining client names, product names, campaign names, fiscal years, or any other fragments. Example of an invalid invented name: "FY26 Erste-Visa Cseperedő kampány" — this is NOT a project; the canonical project is "Erste", and the campaign / product / fiscal-year details (FY26, Visa, Cseperedő, kampány) belong in \`topics\`. If a thought is about a sub-activity (campaign, product, sprint, fiscal-year initiative) within an existing canonical project, tag the parent canonical project and put the sub-activity details in \`topics\`. If no canonical project matches, return an empty \`projects\` array — empty is correct, an invented name is wrong.

Most thoughts have 0-2 projects. A thought with 3+ projects is genuinely rare — reserved for cross-team meetings, explicit registries, or direct A-vs-B comparison documents. If you're tempted to tag 4+ projects, re-read the text and ask "what ONE project is this thought actually about?". Default to FEWER tags.

IMPORTANT: Respond in the SAME LANGUAGE as the input text. If Hungarian, all values in Hungarian. Match the language exactly.
${contextBlock}

Text: ${text}`;
}

export async function checkContradiction(newText, existingText) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: `Is the NEW thought a LOGICAL CONTRADICTION of the EXISTING thought — meaning both CANNOT be simultaneously true? The default is NO. Only say yes if you are confident they directly conflict.

NOT a contradiction (answer false):
- Different instances of a recurring meeting or event (e.g. "Weekly sync March 15" vs "Weekly sync March 22" — both happened, both are historical records)
- Two snapshots of a project or situation at different times (both were true at the time they were written)
- An update that adds information without negating previous facts
- Different details about different people or projects that happen to share vocabulary
- Related topics captured from different sources (e.g. an email about project X and a meeting about project X)
- Similar phrasing but different subjects or time periods

YES a contradiction (answer true):
- Mutually exclusive factual claims about the same entity at the same time (e.g. "X lives in Berlin" vs "X lives in Budapest", both claimed as current)
- Explicitly reversed decisions about the same thing (e.g. "we chose option A" vs "we rejected A in favor of B")
- Explicit corrections labelled as such (e.g. "v1 was wrong, v2 is the correct version")
- Two versions of the same document/registry/spec where one is meant to supersede the other

When in doubt, answer false. Archiving a historical record has a real cost; keeping two independent entries has none.

Existing thought: ${existingText}

New thought: ${newText}

Reply ONLY with a JSON object: {"contradicts": true/false, "reason": "one sentence explanation"}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Contradiction check failed: ${err}`);
  }

  const json = await res.json();
  const raw = json.content[0].text;
  const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, raw];
  return JSON.parse(match[1].trim());
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
 * Brain-hygiene suggestion: given a thought's text + its current metadata,
 * ask Haiku to classify each tagged project as primary / example / context
 * and propose a cleaner set. Removal-biased prompt by design — over-tagging
 * is the known failure mode (P10).
 *
 * Returns:
 *   {
 *     proposed: { people, projects, topics, title },
 *     removed:  [ { field, value, classification, reason } ],
 *     kept:     [ { field, value, reason } ],
 *     reasoning: string
 *   }
 */
export async function suggestCleanedMetadata(thought, vaultContext) {
  const current = {
    title: thought.title || '',
    people: thought.people || [],
    projects: thought.projects || [],
    topics: thought.topics || [],
  };

  const vaultProjectsHint = vaultContext?.projects?.length
    ? `\nCanonical project names in the vault: ${vaultContext.projects.join(', ')}`
    : '';

  let projectAliasesHint = '';
  if (vaultContext?.projectAliases && Object.keys(vaultContext.projectAliases).length) {
    const byCanonical = {};
    for (const [alias, canonical] of Object.entries(vaultContext.projectAliases)) {
      if (!byCanonical[canonical]) byCanonical[canonical] = [];
      byCanonical[canonical].push(alias);
    }
    const lines = Object.entries(byCanonical).map(
      ([canonical, alts]) => `- "${canonical}" is also known as: ${alts.join(', ')}`
    );
    projectAliasesHint = `\n\nProject aliases (if the thought mentions one of the aliases, the project IS the canonical name on the left):\n${lines.join('\n')}`;
  }

  // Best-effort language detection so we can explicitly constrain Haiku.
  // Simple heuristic: Hungarian-specific characters present → Hungarian.
  const textForDetect = `${thought.title || ''} ${thought.text?.slice(0, 500) || ''}`;
  const isHungarian = /[őűáéíóúüö]/i.test(textForDetect);
  const languageRule = isHungarian
    ? 'The thought is in Hungarian. Your proposed `title` and `topics` MUST be in Hungarian. DO NOT translate existing Hungarian topics to English. DO NOT flip the title to English.'
    : 'Preserve the ORIGINAL language of the thought\'s title and topics. Do NOT translate.';

  const prompt = `You are reviewing a previously-captured thought's metadata. The thought was captured with over-broad projects/people/topics tags. Your job: propose a tighter set, removal-biased.

For each currently tagged PROJECT, classify:
- "primary" — the thought is ABOUT this project (keep)
- "example" — mentioned as an example/comparison/pattern only; the thought is not about it (REMOVE)
- "context" — provides background but isn't the subject (REMOVE)

A thought can have AT MOST ONE primary project in 90% of cases. Multi-project thoughts are genuinely rare (cross-team meetings, registry documents, comparisons). If you're tempted to keep 3+ as "primary", reconsider which ONE the thought is actually about.

Default to REMOVING. If the thought reads like it could be about "none of these projects", remove ALL project tags — that's fine.

For PEOPLE: keep anyone who was IN the meeting or is directly discussed in the thought. Attendance counts — someone named in a meeting-participants list is kept even if they didn't actively speak. Remove people mentioned only in quotes, cc lists, or transitively (e.g., "like what X did last year"). The "Me" tag represents the user; keep it if the thought is a self-reflection OR if the user was a meeting participant.

Before claiming a person is "not mentioned", search the text for the name. If found, the person stays regardless of role.

For TOPICS: keep 3-8 topics that capture what the thought is actually about. Remove generic noise and over-narrow one-offs.

For TITLE: keep if it accurately summarizes in 2-4 words. Propose a tighter alternative only if clearly wrong.

LANGUAGE RULE (strict): ${languageRule}

${vaultProjectsHint}${projectAliasesHint}

Thought text:
"""
${(thought.text || '').slice(0, 5000)}
"""

Current metadata:
${JSON.stringify(current, null, 2)}

Respond with JSON ONLY, matching this schema exactly:
{
  "proposed": {
    "title": "string",
    "people": ["..."],
    "projects": ["..."],
    "topics": ["..."]
  },
  "classifications": {
    "projects": [
      { "value": "project_name", "classification": "primary|example|context", "reason": "one sentence" }
    ]
  },
  "removed": [
    { "field": "people|projects|topics", "value": "...", "reason": "one sentence" }
  ],
  "kept": [
    { "field": "people|projects|topics", "value": "...", "reason": "one sentence" }
  ],
  "reasoning": "2-3 sentence overall rationale for the proposed version"
}`;

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
    throw new Error(`suggestCleanedMetadata failed: ${err}`);
  }

  const json = await res.json();
  const raw = json.content[0].text;
  const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, raw];
  const parsed = JSON.parse(match[1].trim());

  // Resolve aliases on the proposed arrays — same treatment extractMetadata
  // gets. Prevents duplicates like "Me" + "Beliczki Róbert" surviving
  // side-by-side after Haiku returns an un-resolved alias.
  if (parsed.proposed) {
    if (parsed.proposed.people) {
      parsed.proposed.people = resolveAliases(parsed.proposed.people, vaultContext?.aliases);
    }
    if (parsed.proposed.projects) {
      parsed.proposed.projects = resolveAliases(parsed.proposed.projects, vaultContext?.projectAliases);
    }
  }
  return parsed;
}

export async function extractMetadata(text, vaultContext) {
  const localCtx = loadContext();

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: buildPrompt(text, localCtx, vaultContext),
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Metadata extraction failed: ${err}`);
  }

  const json = await res.json();
  const raw = json.content[0].text;
  const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, raw];
  const metadata = JSON.parse(match[1].trim());
  metadata.people = resolveAliases(metadata.people, vaultContext?.aliases);
  metadata.projects = resolveAliases(metadata.projects, vaultContext?.projectAliases);
  metadata._prompt = buildPrompt(text, localCtx, vaultContext);
  return metadata;
}
