// Local, idempotent People-folder consolidation:
//   for each canonical, merge alias/email lines from the canonical (if it
//   exists) + each source file, prefer Western-order canonical filename,
//   then delete the source files.
//
// Run: `node scripts/drive-consolidate-people.js` from anywhere — it operates
// only on the synced Drive folder.

import { readFileSync, writeFileSync, unlinkSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = '/Users/robertbeliczki/Library/CloudStorage/GoogleDrive-beliczki.robert@gmail.com/My Drive/Docs/_customBrain/People';

const GROUPS = [
  // SELF
  { canonical: 'Me', aliases: ['Beliczki Róbert', 'Beliczki Robert', 'Róbert', 'Robi', 'Robert Beliczki', 'Róbert Beliczki'] },

  // HUNGARIAN-ORDER → WESTERN FLIPS (with accent variants folded)
  { canonical: 'Istvan Hollosi', aliases: ['Hollosi Istvan', 'Hollósi István'] },
  { canonical: 'Anna Bodiss', aliases: ['Bodiss Anna', 'Anna'] },
  { canonical: 'Flora Balogh', aliases: ['Balogh Flora', 'Balogh Flóra'] },
  { canonical: 'Krisztina Benyei', aliases: ['Benyei Krisztina', 'Bényei Krisztina'] },
  { canonical: 'Tunde Bittermann', aliases: ['Bittermann Tunde', 'Bittermann Tünde'] },
  { canonical: 'Viktoria Boda', aliases: ['Boda Viktoria', 'Boda Viktória', 'Viktória Boda'] },
  { canonical: 'Akos Csermely', aliases: ['Csermely Akos', 'Csermely Ákos'] },
  { canonical: 'Eniko Czabanyi', aliases: ['Czabanyi Eniko', 'Czabányi Enikő'] },
  { canonical: 'Zsuzsanna Deak', aliases: ['Deak Zsuzsanna', 'Deák Zsuzsanna', 'Deák Zsuzsa'] },
  { canonical: 'Eszter Dorman', aliases: ['Dorman Eszter', 'Eszter Dormán'] },
  { canonical: 'Zoltan Farkas', aliases: ['Farkas Zoltan', 'Farkas Zoltán'] },
  { canonical: 'Katalin Fuzesi', aliases: ['Fuzesi Katalin', 'Füzesi Katalin'] },
  { canonical: 'Adam Gajdos', aliases: ['Gajdos Adam', 'Gajdos Ádám'] },
  { canonical: 'Zsofia Gerendas', aliases: ['Gerendas Zsofia', 'Gerendás Zsofia'] },
  { canonical: 'Bela Gerlei', aliases: ['Gerlei Bela', 'Gerlei Béla'] },
  { canonical: 'Anita Granicz', aliases: ['Granicz Anita', 'Bottlik-Gránicz Anita', 'Gránicz Anita'] },
  { canonical: 'Hajde Pezo', aliases: ['Hajdé Pezó'] },
  { canonical: 'Laszlo Harmati', aliases: ['Harmati Laszlo', 'Harmati László'] },
  // Hegyi Domokos Mark: "Hegyi" surname + "Domokos Márk" compound firstname is
  // one plausible read; leaving canonical at Hungarian order to avoid guessing wrong.
  { canonical: 'Hegyi Domokos Mark', aliases: ['Hegyi Domokos Márk'] },
  { canonical: 'Aron Igmandy', aliases: ['Igmandy Aron', 'Igmándy Áron', 'Áron Igmándy'] },
  { canonical: 'Tamas Jobbagy', aliases: ['Jobbagy Tamas', 'Jobbágy Tamás'] },
  { canonical: 'David Kiricsi', aliases: ['Kiricsi David', 'Kiricsi Dávid'] },
  { canonical: 'Hajni Kristaly', aliases: ['Kristaly Hajni', 'Kristály Hajnalka', 'Kristály Hajni'] },
  { canonical: 'Peter Laczo', aliases: ['Laczo Peter', 'Laczó Péter', 'Péter'] },
  { canonical: 'Maria Meszegeto', aliases: ['Meszegeto Maria', 'Mészégető Maria'] },
  { canonical: 'Krisztina Mihok', aliases: ['Mihok Krisztina', 'Mihók Krisztina'] },
  { canonical: 'Zsombor Molnar', aliases: ['Molnar Zsombor', 'Molnár Zsombor'] },
  { canonical: 'Zoli Peresztenyi', aliases: ['Peresztenyi Zoli', 'Peresztényi Zoli'] },
  { canonical: 'David Porkolab', aliases: ['Porkolab David', 'Porkoláb Dávid'] },
  { canonical: 'Tamas Santha', aliases: ['Santha Tamas', 'Sántha Tamás'] },
  { canonical: 'Bela Szabo', aliases: ['Szabo Bela', 'Szabó Béla'] },
  { canonical: 'Barnabas Imre Szaszi', aliases: ['Szaszi Barnabas Imre', 'Szászi Barnabás Imre'] },
  { canonical: 'Annamaria Nora Szaszko', aliases: ['Szaszko Annamaria Nora', 'Szászkő Annamária Nóra'] },
  { canonical: 'Lajos Toth', aliases: ['Toth Lajos', 'Tóth Lajos'] },
  { canonical: 'Renata Vasko', aliases: ['Vasko Renata', 'Vaskó Renáta'] },
  { canonical: 'Gyorgy Bakos', aliases: ['Bakos Gyorgy', 'Bakos György'] },
  { canonical: 'Albert-Laszlo Barabasi', aliases: ['Barabasi Albert-Laszlo', 'Barabási Albert-László'] },
  { canonical: 'Laszlo Bek-Balla', aliases: ['Bek-Balla Laszlo', 'Bek-Balla László'] },
  { canonical: 'Andrea Beliczki', aliases: ['Beliczki Andrea'] },
  { canonical: 'Kitti Fa', aliases: ['Fa Kitti'] },
  { canonical: 'Zsuzsanna Nyerki', aliases: ['Nyerki Zsuzsanna'] },
  { canonical: 'Csaba Brunner', aliases: ['Brunner Csaba'] },
  { canonical: 'Tamas Varfi', aliases: ['Varfi Tamas', 'Tomas Varfi'] },
  { canonical: 'Emese Papp', aliases: ['Papp Emese'] },
  { canonical: 'Alexandra Sipos', aliases: ['Sipos Alexandra'] },

  // ALREADY-WESTERN (un-accent + fold)
  { canonical: 'Andrej Karpathy', aliases: ['Karpathy'] },
  { canonical: 'Alexandra Kato', aliases: ['Alexandra Kató'] },
  { canonical: 'Eszter Suto', aliases: ['Eszter Sütő'] },
  { canonical: 'Kristof Martikan', aliases: ['Kristóf Martikán'] },
  { canonical: 'Krisztian Simon', aliases: ['Krisztián Simon'] },
  { canonical: 'Krisztian Nagy', aliases: ['Krisztián Nagy'] },
  { canonical: 'Peter Buza', aliases: ['Péter Buza'] },
  { canonical: 'Szilard Beres', aliases: ['Szilárd Béres'] },
  { canonical: 'Miklos Kun', aliases: ['Miklós Kun'] },
  { canonical: 'David Farkas', aliases: ['Dávid Farkas'] },
  { canonical: 'Csenge Barabas', aliases: ['Csenge Barabás'] },
  { canonical: 'Sandor Korsos', aliases: ['Sándor Korsos'] },

  // POST-CONSOLIDATION HUNGARIAN-ORDER (flip + un-accent)
  { canonical: 'Marta Hornai', aliases: ['Hornai Márta'] },
  { canonical: 'Gabor Wolf', aliases: ['Wolf Gábor'] },
  { canonical: 'Judit Fejszak', aliases: ['Fejszák Judit'] },
  { canonical: 'Szabina Mitter', aliases: ['Mitter Szabina'] },
  { canonical: 'Bettina Nagy', aliases: ['Nagy Bettina'] },
  { canonical: 'Mate Halasz', aliases: ['Halasz Mate'] },
  { canonical: 'Aniko Szemeti', aliases: ['Szemeti Anikó'] },
  { canonical: 'Bence Arcs', aliases: ['Árcs Bence'] },

  // CAUGHT ON DRY-RUN REVIEW
  { canonical: 'Zsolt Balogh', aliases: ['Balogh Zsolt'] },
  { canonical: 'Barbara Szentteleki', aliases: ['Szentteleki Barbara'] },
  // Email laszlo.liza@telekom.hu — Hungarian convention "surname.firstname" →
  // László is the surname, Liza the firstname. Western canonical: Liza Laszlo.
  { canonical: 'Liza Laszlo', aliases: ['Laszlo Liza', 'László Liza', 'Laszló Liza', 'Liza'] },
];

function parseFile(content) {
  const lines = content.split('\n');
  const aliases = [];
  const emails = [];
  const bodyLines = [];
  let inMentions = false;

  for (const line of lines) {
    const aliasMatch = line.match(/^alias:\s*(.+)/i);
    if (aliasMatch) {
      const values = aliasMatch[1]
        .split(',')
        .map((v) => v.trim().replace(/^\[\[|]]$/g, ''))
        .filter(Boolean);
      aliases.push(...values);
      continue;
    }
    const emailMatch = line.match(/^email:\s*(.+)/i);
    if (emailMatch) {
      const values = emailMatch[1].split(',').map((v) => v.trim()).filter(Boolean);
      emails.push(...values);
      continue;
    }
    if (/^##\s+Mentions/i.test(line)) {
      inMentions = true;
      continue;
    }
    if (inMentions) {
      const t = line.trim();
      if (t === '' || t.startsWith('- [[')) continue;
      inMentions = false;
      // fall through — current line is real body content
    }
    bodyLines.push(line);
  }
  return { aliases, emails, body: bodyLines.join('\n').trim() };
}

function buildContent(canonical, aliases, emails, body) {
  const parts = [];
  for (const a of aliases) parts.push(`alias: ${a}`);
  for (const e of emails) parts.push(`email: ${e}`);
  if (parts.length) parts.push('');

  // Only retitle the file if its very first non-blank line is a `# Heading`
  // — otherwise we'd clobber section headings further down (e.g. Me.md's
  // "# My clients"). If the body has no leading heading at all, prepend one.
  let bodyOut = body;
  const bodyLines = bodyOut.split('\n');
  const firstNonBlank = bodyLines.findIndex((l) => l.trim());
  if (firstNonBlank === -1) {
    bodyOut = `# ${canonical}`;
  } else if (/^#\s+/.test(bodyLines[firstNonBlank])) {
    bodyLines[firstNonBlank] = `# ${canonical}`;
    bodyOut = bodyLines.join('\n');
  } else {
    bodyOut = `# ${canonical}\n\n${bodyOut}`;
  }

  return `${parts.join('\n')}${parts.length ? '\n' : ''}${bodyOut}\n`;
}

function consolidate({ canonical, aliases }) {
  const canonicalPath = join(DIR, `${canonical}.md`);
  const sourcePaths = aliases
    .filter((a) => a !== canonical)
    .map((a) => join(DIR, `${a}.md`))
    .filter((p) => existsSync(p));

  const canonicalExists = existsSync(canonicalPath);
  if (!canonicalExists && sourcePaths.length === 0) {
    return { canonical, skipped: true, reason: 'no canonical, no sources' };
  }

  const allAliases = [];
  const allEmails = [];
  const bodies = [];

  if (canonicalExists) {
    const parsed = parseFile(readFileSync(canonicalPath, 'utf-8'));
    allAliases.push(...parsed.aliases);
    allEmails.push(...parsed.emails);
    if (parsed.body) bodies.push(parsed.body);
  }
  for (const p of sourcePaths) {
    const parsed = parseFile(readFileSync(p, 'utf-8'));
    allAliases.push(...parsed.aliases);
    allEmails.push(...parsed.emails);
    if (parsed.body) bodies.push(parsed.body);
  }

  // Add the group's declared aliases (= the source filenames + accent variants
  // never present as files) so future captures can resolve them.
  for (const a of aliases) {
    if (a !== canonical) allAliases.push(a);
  }

  const uniqueAliases = [...new Set(allAliases.filter((a) => a && a !== canonical))];
  const uniqueEmails = [...new Set(allEmails.filter((e) => e && e.includes('@')))];

  // Pick the longest body — typically the source with the richest profile text.
  bodies.sort((a, b) => b.length - a.length);
  const body = bodies[0] || '';

  const newContent = buildContent(canonical, uniqueAliases, uniqueEmails, body);
  writeFileSync(canonicalPath, newContent);

  let deleted = 0;
  for (const p of sourcePaths) {
    if (p !== canonicalPath) {
      unlinkSync(p);
      deleted++;
    }
  }

  return {
    canonical,
    aliases_total: uniqueAliases.length,
    emails_total: uniqueEmails.length,
    sources_merged: sourcePaths.length,
    files_deleted: deleted,
    canonical_existed_before: canonicalExists,
  };
}

const APPLY = process.argv.includes('--apply');
const before = readdirSync(DIR).filter((f) => f.endsWith('.md')).length;

console.log(`People consolidation — Western-order canonicals — mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
console.log(`Starting count: ${before} files\n`);

function dryRun({ canonical, aliases }) {
  const canonicalPath = join(DIR, `${canonical}.md`);
  const sourcePaths = aliases
    .filter((a) => a !== canonical)
    .map((a) => join(DIR, `${a}.md`))
    .filter((p) => existsSync(p));
  const canonicalExists = existsSync(canonicalPath);
  if (!canonicalExists && sourcePaths.length === 0) {
    return { canonical, skipped: true };
  }
  return {
    canonical,
    canonical_existed_before: canonicalExists,
    sources_merged: sourcePaths.length,
    files_deleted: sourcePaths.filter((p) => p !== canonicalPath).length,
    aliases_total: aliases.length,
  };
}

let touched = 0;
let totalDeleted = 0;
const noOps = [];
for (const g of GROUPS) {
  const r = APPLY ? consolidate(g) : dryRun(g);
  if (r.skipped) {
    noOps.push(g.canonical);
    continue;
  }
  touched++;
  totalDeleted += r.files_deleted;
  const tag = r.canonical_existed_before ? 'update' : 'create';
  const verb = APPLY ? tag : `${tag}?`;
  console.log(
    `${verb.padEnd(8)} ${r.canonical.padEnd(28)}  sources=${r.sources_merged}  ${APPLY ? 'aliases' : 'declared_aliases'}=${r.aliases_total}  ${APPLY ? `emails=${r.emails_total}  ` : ''}deletes=${r.files_deleted}`,
  );
}

const after = APPLY ? readdirSync(DIR).filter((f) => f.endsWith('.md')).length : before;
console.log(`\n${APPLY ? 'Done.' : 'Would process'} ${touched} groups. ${APPLY ? 'Deleted' : 'Would delete'} ${totalDeleted} duplicate files.`);
if (APPLY) console.log(`File count: ${before} → ${after}`);
if (noOps.length) console.log(`No-op groups (no canonical, no sources): ${noOps.join(', ')}`);
if (!APPLY) console.log(`\nRe-run with --apply to commit.`);
