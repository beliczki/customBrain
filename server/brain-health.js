// On-demand brain health audit. Replaces the maintenance crons from the
// original P6 plan with a listing-only "what would I clean up if I were
// cleaning up" report. Never mutates Qdrant or Drive — leaves the decision
// to the user.
//
// Triggered by: MCP `brain_health_check`, HTTP `GET /health-check`, or the
// "Run health check" button under the Stats tab in the UI. All three call
// `runHealthCheck()` here.

import { getAllWithVectors, getConnectionStats } from './qdrant.js';
import { getVaultContext } from './drive-context.js';
import { findOverconnected } from './brain-hygiene.js';

const DUPLICATE_THRESHOLD = 0.92;
const OVERSIZED_CHARS = 6000;          // matches the Gemini embedding window guard
const MAX_ITEMS_PER_CATEGORY = 50;     // cap report size to keep MCP responses reasonable

// Local copy of the cosine helper used by export.js. Kept in-file to avoid a
// vector-utils refactor for one extra call site; if a third caller appears,
// extract to server/vector-utils.js then.
function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

function findDuplicatePairs(items, threshold) {
  const active = items.filter((p) => p.payload.status !== 'archived');
  const pairs = [];
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const score = cosine(active[i].vector, active[j].vector);
      if (score >= threshold) {
        pairs.push({
          a_id: active[i].id,
          a_title: active[i].payload.title || '(no title)',
          b_id: active[j].id,
          b_title: active[j].payload.title || '(no title)',
          score: Math.round(score * 1000) / 1000,
        });
      }
    }
  }
  pairs.sort((a, b) => b.score - a.score);
  return pairs;
}

function findStaleSummaries(payloads) {
  return payloads
    .filter((p) => p.status !== 'archived')
    .filter((p) => p.has_auto_summary && p.summary_appended_at && p.updated_at)
    .filter((p) => p.summary_appended_at < p.updated_at)
    .map((p) => ({
      id: p._id,
      title: p.title || '(no title)',
      summary_appended_at: p.summary_appended_at,
      updated_at: p.updated_at,
      hours_stale: Math.round((new Date(p.updated_at) - new Date(p.summary_appended_at)) / 3600000),
    }))
    .sort((a, b) => b.hours_stale - a.hours_stale);
}

function findOversizedNoSummary(payloads) {
  return payloads
    .filter((p) => p.status !== 'archived')
    .filter((p) => (p.text || '').length > OVERSIZED_CHARS)
    .filter((p) => !p.has_auto_summary)
    .map((p) => ({
      id: p._id,
      title: p.title || '(no title)',
      length: p.text.length,
      source: p.source || 'manual',
    }))
    .sort((a, b) => b.length - a.length);
}

function findMetadataAnomalies(payloads, vault) {
  if (!vault) {
    return { unavailable: true, reason: 'vault context unreachable' };
  }
  const active = payloads.filter((p) => p.status !== 'archived');

  // Canonical lowercase sets (include aliases as known names)
  const knownProjects = new Set();
  for (const name of vault.projects || []) knownProjects.add(name.toLowerCase());
  for (const alias of Object.keys(vault.projectAliases || {})) knownProjects.add(alias.toLowerCase());

  const knownPeople = new Set();
  for (const name of vault.people || []) knownPeople.add(name.toLowerCase());
  for (const alias of Object.keys(vault.aliases || {})) knownPeople.add(alias.toLowerCase());

  // Usage counts per name (from thoughts)
  const projectUsage = new Map();
  const peopleUsage = new Map();
  for (const p of active) {
    for (const proj of p.projects || []) {
      projectUsage.set(proj, (projectUsage.get(proj) || 0) + 1);
    }
    for (const person of p.people || []) {
      peopleUsage.set(person, (peopleUsage.get(person) || 0) + 1);
    }
  }

  // 1. Names in thoughts that have no canonical .md (unknown_*)
  const unknownProjects = [...projectUsage.entries()]
    .filter(([name]) => !knownProjects.has(name.toLowerCase()))
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const unknownPeople = [...peopleUsage.entries()]
    .filter(([name]) => !knownPeople.has(name.toLowerCase()))
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  // 2. .md files that no active thought references (orphan_*)
  const usedProjectsLower = new Set([...projectUsage.keys()].map((n) => n.toLowerCase()));
  const usedPeopleLower = new Set([...peopleUsage.keys()].map((n) => n.toLowerCase()));

  const orphanProjectFiles = (vault.projects || []).filter((name) => {
    const lower = name.toLowerCase();
    if (usedProjectsLower.has(lower)) return false;
    // Check aliases too — if any alias is used, the canonical isn't orphan
    const aliases = Object.entries(vault.projectAliases || {})
      .filter(([, canonical]) => canonical === name)
      .map(([alias]) => alias.toLowerCase());
    return !aliases.some((a) => usedProjectsLower.has(a));
  });

  const orphanPeopleFiles = (vault.people || []).filter((name) => {
    const lower = name.toLowerCase();
    if (usedPeopleLower.has(lower)) return false;
    const aliases = Object.entries(vault.aliases || {})
      .filter(([, canonical]) => canonical === name)
      .map(([alias]) => alias.toLowerCase());
    return !aliases.some((a) => usedPeopleLower.has(a));
  });

  return {
    unknown_projects: unknownProjects.slice(0, MAX_ITEMS_PER_CATEGORY),
    unknown_people: unknownPeople.slice(0, MAX_ITEMS_PER_CATEGORY),
    orphan_project_files: orphanProjectFiles,
    orphan_people_files: orphanPeopleFiles,
    totals: {
      unknown_projects: unknownProjects.length,
      unknown_people: unknownPeople.length,
      orphan_project_files: orphanProjectFiles.length,
      orphan_people_files: orphanPeopleFiles.length,
    },
  };
}

export async function runHealthCheck() {
  const startTime = Date.now();

  const [withVectors, connStats, vault] = await Promise.all([
    getAllWithVectors(),
    getConnectionStats(),
    getVaultContext().catch((err) => {
      console.warn(`[health-check] vault unavailable: ${err.message}`);
      return null;
    }),
  ]);

  // getAllPayloads()-style projection from withVectors, plus carry the id
  // alongside payload so stale-summary / oversized helpers can include it.
  const payloadsWithId = withVectors.map((p) => ({ _id: p.id, ...p.payload }));

  const duplicates = findDuplicatePairs(withVectors, DUPLICATE_THRESHOLD);
  const overTagged = findOverconnected(connStats.stats, { limit: MAX_ITEMS_PER_CATEGORY });
  const staleSummaries = findStaleSummaries(payloadsWithId);
  const oversizedNoSummary = findOversizedNoSummary(payloadsWithId);
  const metadataAnomalies = findMetadataAnomalies(payloadsWithId, vault);

  const total = withVectors.length;
  const totalActive = withVectors.filter((p) => p.payload.status !== 'archived').length;

  return {
    generated_at: new Date().toISOString(),
    duration_ms: Date.now() - startTime,
    totals: {
      thoughts_total: total,
      thoughts_active: totalActive,
      thoughts_archived: total - totalActive,
    },
    checks: {
      duplicate_candidates: {
        count: duplicates.length,
        threshold: DUPLICATE_THRESHOLD,
        pairs: duplicates.slice(0, MAX_ITEMS_PER_CATEGORY),
      },
      over_tagged: {
        count: overTagged.length,
        items: overTagged,
      },
      stale_summaries: {
        count: staleSummaries.length,
        items: staleSummaries.slice(0, MAX_ITEMS_PER_CATEGORY),
      },
      oversized_no_summary: {
        count: oversizedNoSummary.length,
        threshold_chars: OVERSIZED_CHARS,
        items: oversizedNoSummary.slice(0, MAX_ITEMS_PER_CATEGORY),
      },
      metadata_anomalies: metadataAnomalies,
    },
  };
}
