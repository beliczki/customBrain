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

  if (localCtx) {
    const lines = [];
    if (localCtx.not_people?.length) {
      lines.push('These are NOT real people — do NOT put them in "people":');
      for (const np of localCtx.not_people) lines.push(`- "${np.name}" → ${np.what}`);
    }
    if (localCtx.notes) lines.push(`\nNotes: ${localCtx.notes}`);
    contextBlock += '\n' + lines.join('\n');
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
    contextBlock += `\n\nKnown projects in the vault (match to these if relevant): ${vaultCtx.projects.join(', ')}`;
  }

  return `Extract metadata from this text. Return ONLY valid JSON with these fields:
- title: string (2-3 word short title summarizing the thought — in the same language as the text)
- people: string[] (names of REAL people mentioned — exclude AI assistants, chatbots, virtual characters)
- topics: string[] (key topics/themes)
- projects: string[] (project names this thought relates to, from the known projects list if possible)
- type: string (one of: idea, note, task, meeting, reflection, reference, conversation)
- action_items: string[] (any action items or todos)

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
          content: `Do these two thoughts contradict each other? The new thought may update, replace, or directly conflict with the existing one.

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

function resolveAliases(people, aliases) {
  if (!aliases || !people?.length) return people;
  const resolved = people.map((p) => {
    const lower = p.toLowerCase();
    for (const [alias, canonical] of Object.entries(aliases)) {
      if (alias.toLowerCase() === lower) return canonical;
    }
    return p;
  });
  return [...new Set(resolved)];
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
  metadata._prompt = buildPrompt(text, localCtx, vaultContext);
  return metadata;
}
