import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env') });

import { scrollFiltered, updatePayload } from '../server/qdrant.js';

/**
 * One-off cleanup for existing Fireflies captures whose `Participants:` line
 * contains the raw pre-joined string + individual emails duplication shape
 * (see `agent/tools/fireflies.js::normalizeParticipants` for the cause).
 *
 * Scope: source='fireflies' captures only. Rewrites ONLY the Participants:
 * line of the text field; rest of text (title, date, transcript) untouched.
 *
 * Embeddings are NOT re-generated — cosmetic whitespace/dedup change has
 * negligible effect on cosine similarity, and re-embedding 45+ thoughts
 * would cost significantly more than it's worth.
 *
 * Dry-run default. Pass --apply to commit.
 */
const APPLY = process.argv.includes('--apply');

function normalizeEmails(rawLine) {
  // Input: "Participants: a@b,c@d, e@f, g@h"
  // Split off the "Participants: " prefix, split on commas/semis, trim, dedupe, rejoin.
  const prefix = 'Participants: ';
  const body = rawLine.startsWith(prefix) ? rawLine.slice(prefix.length) : rawLine;
  const emails = body
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const unique = [...new Set(emails)];
  return `${prefix}${unique.join(', ')}`;
}

function needsFix(rawLine) {
  // Has adjacent comma without space, OR has duplicates.
  if (/,(?!\s)/.test(rawLine.replace(/^Participants:\s*/, ''))) return true;
  const emails = rawLine.replace(/^Participants:\s*/, '').split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  return emails.length !== new Set(emails).size;
}

async function run() {
  console.log(`Fireflies participants cleanup — mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

  const captures = await scrollFiltered(
    { must: [{ key: 'source', match: { value: 'fireflies' } }] },
    200,
  );
  console.log(`Scanned ${captures.length} Fireflies captures.\n`);

  let fixed = 0;
  let unchanged = 0;
  let noParticipants = 0;
  let failed = 0;

  for (const c of captures) {
    const text = c.text || '';
    const lines = text.split('\n');
    const partIdx = lines.findIndex((l) => l.startsWith('Participants:'));
    if (partIdx === -1) {
      noParticipants++;
      continue;
    }

    const original = lines[partIdx];
    if (!needsFix(original)) {
      unchanged++;
      continue;
    }

    const fixedLine = normalizeEmails(original);
    lines[partIdx] = fixedLine;
    const newText = lines.join('\n');

    const oldEmails = original.replace(/^Participants:\s*/, '').split(/[,;]/).map((s) => s.trim()).filter(Boolean);
    const newEmails = fixedLine.replace(/^Participants:\s*/, '').split(/, /).filter(Boolean);

    console.log(`─ ${c.id}  ${c.title || '(untitled)'}`);
    console.log(`  entries: ${oldEmails.length} → ${newEmails.length} (${oldEmails.length - newEmails.length} dupes removed)`);

    if (APPLY) {
      try {
        await updatePayload(c.id, { text: newText });
        fixed++;
      } catch (err) {
        failed++;
        console.error(`  FAILED: ${err.message}`);
      }
    } else {
      fixed++; // counted as "would fix" in dry-run
    }
  }

  console.log(
    `\nDone: ${APPLY ? 'applied' : 'would fix'}=${fixed}  unchanged=${unchanged}  no-participants-line=${noParticipants}  failed=${failed}`,
  );
  if (!APPLY && fixed > 0) {
    console.log(`\nRe-run with --apply to commit the changes.`);
  }
}

run().catch((err) => {
  console.error('Script crashed:', err.message);
  process.exit(1);
});
