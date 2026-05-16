// Migrate People/ and Projects/ .md files from legacy `alias: X` / `email: X`
// body lines to Obsidian-native YAML frontmatter (`aliases:` array,
// `email:` scalar or `emails:` array). Merges with any pre-existing frontmatter.
//
// Surgical: only touches the `aliases:` and `email:`/`emails:` blocks inside
// frontmatter (and the legacy lines in the body). Other frontmatter keys
// — including non-standard ones like `Product Groups: SZK, HK, SZA` or
// placeholder `tags:` — are preserved byte-for-byte.
//
// Idempotent: files already in pure-frontmatter form become no-ops.
//
// Run: `node scripts/migrate-to-frontmatter.js [--apply] [--people] [--projects]`
// Defaults: dry-run, both folders.

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const BASE = '/Users/robertbeliczki/Library/CloudStorage/GoogleDrive-beliczki.robert@gmail.com/My Drive/Docs/_customBrain';
const APPLY = process.argv.includes('--apply');
const ONLY_PEOPLE = process.argv.includes('--people');
const ONLY_PROJECTS = process.argv.includes('--projects');
const FOLDERS = [];
if (ONLY_PEOPLE || !ONLY_PROJECTS) FOLDERS.push('People');
if (ONLY_PROJECTS || !ONLY_PEOPLE) FOLDERS.push('Projects');

const stripWikilink = (a) => String(a).trim().replace(/^\[\[(?:[^|\]]*\|)?|]]$/g, '');

function splitFrontmatter(text) {
  if (!text.startsWith('---\n') && !text.startsWith('---\r\n')) {
    return { frontmatter: null, body: text };
  }
  const startLen = text.startsWith('---\r\n') ? 5 : 4;
  const closing = text.slice(startLen).match(/\r?\n---\r?\n|\r?\n---\s*$/);
  if (!closing) return { frontmatter: null, body: text };
  const endIdx = startLen + closing.index;
  return {
    frontmatter: text.slice(startLen, endIdx),
    body: text.slice(endIdx + closing[0].length),
  };
}

function yamlEscape(v) {
  if (/[:#\[\]{},&*!|>'"%@`]/.test(v) || /^\s|\s$/.test(v)) {
    return `"${v.replace(/"/g, '\\"')}"`;
  }
  return v;
}

/**
 * Walk the existing frontmatter YAML lines. When we hit `aliases:` /
 * `email:` / `emails:`, replace that block (key + following "  - …" array
 * items if any). Other lines pass through verbatim — so `Product Groups:`,
 * empty `tags:` placeholders, and any other custom keys survive untouched.
 */
function rewriteFrontmatterAliases(yamlText, aliases, emails) {
  const lines = yamlText.split('\n');
  const out = [];
  let i = 0;
  let aliasesWritten = false;
  let emailWritten = false;

  while (i < lines.length) {
    const line = lines[i];

    if (/^aliases\s*:/.test(line)) {
      // Skip key + indented array items
      i++;
      while (i < lines.length && /^\s+-/.test(lines[i])) i++;
      if (!aliasesWritten && aliases.length) {
        out.push('aliases:');
        for (const a of aliases) out.push(`  - ${yamlEscape(a)}`);
      }
      aliasesWritten = true;
      continue;
    }

    if (/^email(s)?\s*:/.test(line)) {
      const isArrayHeader = /^email(s)?\s*:\s*$/.test(line);
      i++;
      if (isArrayHeader) {
        while (i < lines.length && /^\s+-/.test(lines[i])) i++;
      }
      if (!emailWritten && emails.size) {
        if (emails.size === 1) out.push(`email: ${yamlEscape([...emails][0])}`);
        else { out.push('emails:'); for (const e of emails) out.push(`  - ${yamlEscape(e)}`); }
      }
      emailWritten = true;
      continue;
    }

    out.push(line);
    i++;
  }

  // Append aliases/email at end if they weren't already in the frontmatter.
  if (!aliasesWritten && aliases.length) {
    if (out.length && out[out.length - 1].trim() !== '') out.push('');
    out.push('aliases:');
    for (const a of aliases) out.push(`  - ${yamlEscape(a)}`);
  }
  if (!emailWritten && emails.size) {
    if (emails.size === 1) out.push(`email: ${yamlEscape([...emails][0])}`);
    else { out.push('emails:'); for (const e of emails) out.push(`  - ${yamlEscape(e)}`); }
  }

  return out.join('\n').replace(/^\n+/, '').replace(/\n+$/, '');
}

function buildFreshFrontmatter(aliases, emails) {
  const lines = [];
  if (aliases.length) {
    lines.push('aliases:');
    for (const a of aliases) lines.push(`  - ${yamlEscape(a)}`);
  }
  if (emails.size === 1) {
    lines.push(`email: ${yamlEscape([...emails][0])}`);
  } else if (emails.size > 1) {
    lines.push('emails:');
    for (const e of emails) lines.push(`  - ${yamlEscape(e)}`);
  }
  return lines.join('\n');
}

/**
 * Pull aliases / emails out of a raw frontmatter block — minimally — so we
 * can merge with body-line values before writing back. We do NOT round-trip
 * any other fields; those stay as raw text in `frontmatter`.
 */
function extractAliasesAndEmails(yamlText) {
  const aliases = new Set();
  const emails = new Set();
  const lines = yamlText.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const aliasInline = line.match(/^aliases\s*:\s*\[(.+)\]\s*$/);
    if (aliasInline) {
      for (const v of aliasInline[1].split(',').map((s) => s.trim().replace(/^["']|["']$/g, ''))) {
        if (v) aliases.add(stripWikilink(v));
      }
      continue;
    }
    if (/^aliases\s*:\s*$/.test(line)) {
      let j = i + 1;
      while (j < lines.length && /^\s+-/.test(lines[j])) {
        const v = lines[j].replace(/^\s+-\s+/, '').trim().replace(/^["']|["']$/g, '');
        if (v) aliases.add(stripWikilink(v));
        j++;
      }
      continue;
    }
    const emailInline = line.match(/^email(s)?\s*:\s*(.+)$/);
    if (emailInline) {
      const val = emailInline[2].trim();
      if (val.startsWith('[') && val.endsWith(']')) {
        for (const e of val.slice(1, -1).split(',').map((s) => s.trim().replace(/^["']|["']$/g, '').toLowerCase())) {
          if (e.includes('@')) emails.add(e);
        }
      } else {
        const e = val.replace(/^["']|["']$/g, '').toLowerCase();
        if (e.includes('@')) emails.add(e);
      }
      continue;
    }
    if (/^email(s)?\s*:\s*$/.test(line)) {
      let j = i + 1;
      while (j < lines.length && /^\s+-/.test(lines[j])) {
        const v = lines[j].replace(/^\s+-\s+/, '').trim().replace(/^["']|["']$/g, '').toLowerCase();
        if (v.includes('@')) emails.add(v);
        j++;
      }
      continue;
    }
  }
  return { aliases, emails };
}

function migrate(filePath) {
  const original = readFileSync(filePath, 'utf-8');
  const { frontmatter: rawFm, body } = splitFrontmatter(original);

  // Aliases/emails from existing frontmatter
  const { aliases: fmAliases, emails: fmEmails } = rawFm
    ? extractAliasesAndEmails(rawFm)
    : { aliases: new Set(), emails: new Set() };

  // Strip legacy `alias: X` / `email: X` lines from body; collect their values.
  const bodyLines = body.split('\n');
  const keepLines = [];
  let stripped = false;
  const bodyAliases = new Set();
  const bodyEmails = new Set();
  for (const line of bodyLines) {
    const am = line.match(/^alias:\s*(.+)/i);
    if (am) {
      stripped = true;
      for (const v of am[1].split(',').map((s) => s.trim())) {
        const clean = stripWikilink(v);
        if (clean) bodyAliases.add(clean);
      }
      continue;
    }
    const em = line.match(/^email:\s*(.+)/i);
    if (em) {
      stripped = true;
      for (const v of em[1].split(',').map((s) => s.trim().toLowerCase())) {
        if (v.includes('@')) bodyEmails.add(v);
      }
      continue;
    }
    keepLines.push(line);
  }
  const cleanedBody = keepLines.join('\n').replace(/^\s+/, '').replace(/\s+$/, '');

  // Merge frontmatter + body-line values
  const allAliases = [...new Set([...fmAliases, ...bodyAliases])];
  const allEmails = new Set([...fmEmails, ...bodyEmails]);

  // Files with nothing to migrate AND no existing frontmatter get left
  // alone — avoids cosmetic-only diffs (e.g. adding a trailing newline) on
  // unrelated files.
  if (rawFm === null && !stripped && allAliases.length === 0 && allEmails.size === 0) {
    return { file: filePath, changed: false, aliases: 0, emails: 0, legacy_lines_stripped: false, had_frontmatter: false, newContent: original };
  }

  let newFrontmatter;
  if (rawFm !== null) {
    newFrontmatter = rewriteFrontmatterAliases(rawFm, allAliases, allEmails);
  } else if (allAliases.length || allEmails.size) {
    newFrontmatter = buildFreshFrontmatter(allAliases, allEmails);
  } else {
    newFrontmatter = '';
  }

  const newContent = newFrontmatter
    ? `---\n${newFrontmatter}\n---\n${cleanedBody ? '\n' + cleanedBody + '\n' : ''}`
    : `${cleanedBody}\n`;

  return {
    file: filePath,
    changed: newContent !== original,
    aliases: allAliases.length,
    emails: allEmails.size,
    legacy_lines_stripped: stripped,
    had_frontmatter: rawFm !== null,
    newContent,
  };
}

console.log(`Frontmatter migration — mode: ${APPLY ? 'APPLY' : 'DRY-RUN'} — folders: ${FOLDERS.join(', ')}\n`);

let totalChanged = 0;
let totalNoOp = 0;
let totalStripped = 0;

for (const folder of FOLDERS) {
  const dir = join(BASE, folder);
  if (!existsSync(dir)) { console.log(`Skip ${folder}/ — not found`); continue; }
  console.log(`── ${folder}/ ──`);
  const files = readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
  for (const f of files) {
    const r = migrate(join(dir, f));
    if (!r.changed) { totalNoOp++; continue; }
    totalChanged++;
    if (r.legacy_lines_stripped) totalStripped++;
    const fmTag = r.had_frontmatter ? 'has-fm' : 'no-fm ';
    console.log(`  ${APPLY ? '✓' : '?'} ${f.padEnd(36)}  aliases=${r.aliases}  emails=${r.emails}  ${fmTag}`);
    if (APPLY) writeFileSync(r.file, r.newContent);
  }
  console.log('');
}

console.log(`${APPLY ? 'Done.' : 'Would change'} ${totalChanged} files. ${totalNoOp} unchanged. ${totalStripped} had legacy lines stripped.`);
if (!APPLY) console.log(`Re-run with --apply to commit.`);
