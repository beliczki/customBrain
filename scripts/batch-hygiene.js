import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFileSync } from 'node:fs';
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', 'server', '.env') });

import { getConnectionStats, getById } from '../server/qdrant.js';
import { findOverconnected } from '../server/brain-hygiene.js';
import { suggestCleanedMetadata } from '../server/metadata.js';
import { getVaultContext } from '../server/drive-context.js';
import { updateThought } from '../server/routes/recent.js';

/**
 * Batch brain-hygiene cleanup driver.
 *
 * Iterates over over-connected thoughts (project_count >=4 OR hub_score >=15
 * by default), calls suggestCleanedMetadata, runs deterministic post-
 * processors encoding the BRAIN-HYGIENE-PILOT-01 conventions, and emits
 * a markdown diff report. With --apply, commits the final (post-processed)
 * diff via updateThought.
 *
 * Dry-run by default. Review the report, THEN pass --apply.
 *
 *   node scripts/batch-hygiene.js                 # dry-run, all candidates
 *   node scripts/batch-hygiene.js --limit 20      # dry-run, first 20
 *   node scripts/batch-hygiene.js --apply         # commit after dry-run review
 */

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const LIMIT = (() => {
  const i = args.indexOf('--limit');
  return i >= 0 ? parseInt(args[i + 1], 10) : 100;
})();
const MIN_PROJECTS = (() => {
  const i = args.indexOf('--min-projects');
  return i >= 0 ? parseInt(args[i + 1], 10) : 4;
})();
const MIN_HUB = (() => {
  const i = args.indexOf('--min-hub');
  return i >= 0 ? parseInt(args[i + 1], 10) : 15;
})();

// Umbrella-level tags that should almost never stand alone next to a specific
// product project. Locked from pilot conventions (Telekom, ERSTE, Proficio
// surface as client/deployment umbrellas for Bizi, ConfAI, MM-instances).
const UMBRELLA_PROJECTS = new Set(['Telekom', 'ERSTE', 'Erste', 'Proficio']);
// Product projects that, when co-tagged with an umbrella, mean the umbrella
// is redundant context.
const PRODUCT_PROJECTS_THAT_IMPLY_UMBRELLA = new Set([
  'Bizi', 'ConfAI', 'Art AI', 'Messaging matrix', 'Országtuning RMT', 'CoMind',
]);

/** Deterministic post-processing of Haiku's suggestion. */
function applyConventions(original, haikuSuggested, fullText) {
  const originalProjects = new Set(original.projects || []);
  const originalPeople = new Set(original.people || []);
  const originalTopics = original.topics || [];

  // Start from Haiku's proposal as the baseline
  const proposed = {
    title: haikuSuggested.proposed?.title ?? original.title,
    people: [...(haikuSuggested.proposed?.people ?? [])],
    projects: [...(haikuSuggested.proposed?.projects ?? [])],
    topics: [...(haikuSuggested.proposed?.topics ?? [])],
  };
  const notes = [];

  // --- Rule 1: Preserve Hungarian title if the original was Hungarian ---
  const originalTitleHasHU = /[őűáéíóúüö]/i.test(original.title || '');
  const proposedTitleIsEnglish = proposed.title && !/[őűáéíóúüö]/i.test(proposed.title);
  if (originalTitleHasHU && proposedTitleIsEnglish && proposed.title !== original.title) {
    notes.push(`Title flipped to English — reverted to original "${original.title}"`);
    proposed.title = original.title;
  }

  // --- Rule 2: Keep Me if the user originally tagged themselves and Haiku dropped it ---
  if (originalPeople.has('Me') && !proposed.people.includes('Me')) {
    proposed.people.push('Me');
    notes.push('Haiku dropped "Me" — restored per user convention (self-reflection/participation)');
  }

  // --- Rule 3: "not mentioned" factual-claim verification ---
  // If Haiku's removal reason for a person is "not mentioned" but the name
  // does appear in the text, keep the person.
  const textLower = (fullText || '').toLowerCase();
  for (const removed of haikuSuggested.removed || []) {
    if (removed.field !== 'people') continue;
    const reasonLower = (removed.reason || '').toLowerCase();
    const claimsNotMentioned = /not\s+mentioned|nem\s+szerepel|nincs\s+meg/.test(reasonLower);
    if (!claimsNotMentioned) continue;
    // Check if the name actually appears in the text
    const nameLower = (removed.value || '').toLowerCase();
    const parts = nameLower.split(/\s+/).filter((p) => p.length >= 3);
    const nameAppears = parts.some((p) => textLower.includes(p));
    if (nameAppears && originalPeople.has(removed.value)) {
      if (!proposed.people.includes(removed.value)) {
        proposed.people.push(removed.value);
        notes.push(
          `"${removed.value}": Haiku claimed not-mentioned but name appears in text — kept`,
        );
      }
    }
  }

  // --- Rule 4: Topic language preservation ---
  // If a Hungarian original was replaced with an English equivalent, revert.
  const originalTopicsLower = new Set(originalTopics.map((t) => t.toLowerCase()));
  const huTopicsInOriginal = originalTopics.filter((t) => /[őűáéíóúüö]/i.test(t));
  // Heuristic: if many original topics were HU and proposal has few/no HU,
  // Haiku likely flipped language. Restore the intersection.
  const proposedTopicsLower = new Set(proposed.topics.map((t) => t.toLowerCase()));
  if (huTopicsInOriginal.length >= 3 && proposed.topics.length > 0) {
    const proposedHuCount = proposed.topics.filter((t) => /[őűáéíóúüö]/i.test(t)).length;
    if (proposedHuCount < huTopicsInOriginal.length / 2) {
      notes.push(
        `Topics appear to have been translated to English (${proposedHuCount}/${proposed.topics.length} HU vs ${huTopicsInOriginal.length}/${originalTopics.length} originally) — flagged for manual review`,
      );
    }
  }

  // --- Rule 5: Strip umbrella project when a product project is co-tagged ---
  const proposedSet = new Set(proposed.projects);
  const hasProduct = [...proposedSet].some((p) => PRODUCT_PROJECTS_THAT_IMPLY_UMBRELLA.has(p));
  if (hasProduct) {
    for (const umbrella of UMBRELLA_PROJECTS) {
      if (proposedSet.has(umbrella)) {
        proposedSet.delete(umbrella);
        notes.push(`Stripped umbrella "${umbrella}" because a product project is tagged (candidate-2/3/4 rule)`);
      }
    }
    proposed.projects = [...proposedSet];
  }

  // --- Rule 6: Reject project tags not in the vault ---
  // (Handled elsewhere once we pass vaultCtx.projects; if a tag is unknown,
  //  note but don't auto-strip — could be a legitimate new project to add.)

  return { proposed, notes };
}

function diffLines(prefix, before, after) {
  const b = new Set(before || []);
  const a = new Set(after || []);
  const added = [...a].filter((x) => !b.has(x));
  const removed = [...b].filter((x) => !a.has(x));
  const lines = [];
  if (added.length) lines.push(`  ${prefix} +added: ${added.join(', ')}`);
  if (removed.length) lines.push(`  ${prefix} -removed: ${removed.join(', ')}`);
  return lines;
}

async function run() {
  console.log(`Batch hygiene — threshold: projects >=${MIN_PROJECTS} OR hub >=${MIN_HUB}`);
  console.log(`Limit: ${LIMIT}. Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}.`);

  const vaultCtx = await getVaultContext().catch(() => null);
  const { stats } = await getConnectionStats();
  const candidates = findOverconnected(stats, {
    limit: LIMIT,
    minProjectCount: MIN_PROJECTS,
    minHubScore: MIN_HUB,
  });

  console.log(`Found ${candidates.length} candidates.\n`);
  if (!candidates.length) {
    console.log('Nothing to do.');
    return;
  }

  const date = new Date().toISOString().slice(0, 10);
  const reportPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    `brain-hygiene-batch-${date}.md`,
  );
  const reportLines = [
    `# Brain Hygiene Batch Report — ${date}`,
    '',
    `- Mode: **${APPLY ? 'APPLY' : 'DRY-RUN'}**`,
    `- Threshold: project_count ≥ ${MIN_PROJECTS} OR hub_score ≥ ${MIN_HUB}`,
    `- Candidates: ${candidates.length}`,
    '',
    'Conventions applied automatically (from `BRAIN-HYGIENE-PILOT-01`):',
    '',
    '1. Preserve Hungarian title if original was Hungarian',
    '2. Keep `Me` if user tagged themselves originally',
    '3. Verify "not mentioned" person claims by grep-on-text',
    '4. Flag topic-language flip (HU→EN) for manual review',
    '5. Strip umbrella projects (Telekom, ERSTE, Proficio) when a product project is co-tagged',
    '',
    '---',
    '',
  ];

  let applied = 0;
  let skippedNoChange = 0;
  let failed = 0;

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const heading = `## ${i + 1}. ${c.title}  \`${c.id}\``;
    reportLines.push(heading);
    reportLines.push(`- hub_score: ${c.hub_score}, project_count: ${c.project_count}, people_count: ${c.people_count}, topic_count: ${c.topic_count}`);

    try {
      const thought = await getById(c.id);
      if (!thought) {
        reportLines.push(`- **SKIPPED**: not found in Qdrant`);
        reportLines.push('');
        skippedNoChange++;
        continue;
      }
      const suggestion = await suggestCleanedMetadata(thought, vaultCtx);
      const { proposed, notes } = applyConventions(thought, suggestion, thought.text);

      // Compute the actual delta after post-processing
      const delta = {};
      if (proposed.title !== thought.title) delta.title = proposed.title;
      const diffField = (key) => {
        const b = new Set(thought[key] || []);
        const a = new Set(proposed[key] || []);
        if (b.size !== a.size || [...b].some((x) => !a.has(x))) {
          delta[key] = [...a];
        }
      };
      diffField('people');
      diffField('projects');
      diffField('topics');

      if (Object.keys(delta).length === 0) {
        reportLines.push(`- No changes after conventions applied.`);
        reportLines.push('');
        skippedNoChange++;
        continue;
      }

      if (delta.title) reportLines.push(`  title: "${thought.title}" → "${delta.title}"`);
      reportLines.push(...diffLines('people:  ', thought.people, proposed.people));
      reportLines.push(...diffLines('projects:', thought.projects, proposed.projects));
      reportLines.push(...diffLines('topics:  ', thought.topics, proposed.topics));

      if (notes.length) {
        reportLines.push(`- **Post-processor notes:**`);
        for (const n of notes) reportLines.push(`  - ${n}`);
      }
      if (suggestion.reasoning) {
        reportLines.push(`- Haiku reasoning: ${suggestion.reasoning}`);
      }

      if (APPLY) {
        await updateThought(c.id, delta);
        reportLines.push(`- **APPLIED** via updateThought.`);
        applied++;
      } else {
        reportLines.push(`- **PROPOSED** (dry-run; pass --apply to commit).`);
      }
      reportLines.push('');
      console.log(`  ${i + 1}/${candidates.length}: ${c.title} — ${Object.keys(delta).join(', ')}`);
    } catch (err) {
      reportLines.push(`- **FAILED**: ${err.message}`);
      reportLines.push('');
      failed++;
      console.error(`  ${i + 1}/${candidates.length}: ${c.title} — FAILED: ${err.message}`);
    }
  }

  reportLines.push('---');
  reportLines.push('');
  reportLines.push(`## Summary`);
  reportLines.push(`- candidates: ${candidates.length}`);
  reportLines.push(`- no-change: ${skippedNoChange}`);
  reportLines.push(`- proposed/applied: ${candidates.length - skippedNoChange - failed}`);
  reportLines.push(`- failed: ${failed}`);
  if (APPLY) reportLines.push(`- applied to Qdrant: ${applied}`);

  writeFileSync(reportPath, reportLines.join('\n'));
  console.log(`\nReport written to ${reportPath}`);
  console.log(
    `Summary: ${candidates.length - skippedNoChange - failed} diffs, ${skippedNoChange} no-change, ${failed} failed. Applied: ${APPLY ? applied : 0}.`,
  );
}

run().catch((err) => {
  console.error('Batch hygiene crashed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
