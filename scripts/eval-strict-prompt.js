import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', 'server', '.env') });

import { scrollFiltered } from '../server/qdrant.js';
import { extractMetadata } from '../server/metadata.js';
import { getVaultContext } from '../server/drive-context.js';

/**
 * Eval harness for the tightened metadata extraction prompt (P10 Phase 5).
 *
 * Strategy: find the 5 current worst over-taggers (by projects.length desc),
 * re-run extractMetadata on their text, print the diff old-vs-new.
 *
 * Read-only — does NOT modify any thought. Run manually; review output before
 * relying on the prompt change for new captures.
 *
 * Usage:
 *   node scripts/eval-strict-prompt.js        # 5 worst
 *   node scripts/eval-strict-prompt.js 10     # top 10
 */
async function run() {
  const topN = Number(process.argv[2] || 5);
  console.log(`Strict-prompt eval — sampling top ${topN} over-tagged thoughts.\n`);

  const vaultCtx = await getVaultContext().catch(() => null);
  if (!vaultCtx) console.warn('(vault context unavailable — proceeding without it)\n');

  const all = await scrollFiltered({}, 200);
  const sorted = all
    .filter((t) => (t.projects || []).length >= 3)
    .sort((a, b) => (b.projects?.length || 0) - (a.projects?.length || 0))
    .slice(0, topN);

  if (!sorted.length) {
    console.log('No thoughts with >=3 projects found.');
    return;
  }

  for (const t of sorted) {
    console.log('─'.repeat(72));
    console.log(`Thought: ${t.title}  (id ${t.id})`);
    console.log(`OLD projects (${(t.projects || []).length}): ${(t.projects || []).join(', ')}`);
    try {
      const fresh = await extractMetadata(t.text || '', vaultCtx);
      const newProjects = fresh.projects || [];
      const added = newProjects.filter((p) => !(t.projects || []).includes(p));
      const dropped = (t.projects || []).filter((p) => !newProjects.includes(p));
      console.log(`NEW projects (${newProjects.length}): ${newProjects.join(', ')}`);
      if (dropped.length) console.log(`  DROPPED: ${dropped.join(', ')}`);
      if (added.length) console.log(`  ADDED:   ${added.join(', ')}`);
      if (!dropped.length && !added.length) console.log(`  (no change)`);
    } catch (err) {
      console.error(`  FAILED: ${err.message}`);
    }
    console.log('');
  }
}

run().catch((err) => {
  console.error('Eval crashed:', err.message);
  process.exit(1);
});
