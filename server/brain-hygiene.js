/**
 * Pure, testable hygiene helpers — no I/O. The data comes from
 * qdrant.js `getConnectionStats()`; these functions decide what to surface.
 *
 * Spec: brain thought TODO / ROADMAP P10 — see
 * `~/.claude/plans/at-this-point-every-purring-stonebraker.md`.
 */

/**
 * Given the per-thought stats from getConnectionStats(), filter + rank the
 * thoughts that look over-connected.
 *
 * A thought is a candidate if EITHER:
 *   - project_count >= minProjectCount, OR
 *   - hub_score >= minHubScore
 *
 * Ranking: hub_score desc, then project_count desc, then title asc (stable).
 *
 * Each result includes human-readable `reasons` so the caller (Claude Desktop)
 * can explain the flag to the user without re-running heuristics.
 */
export function findOverconnected(stats, { limit = 10, minProjectCount = 5, minHubScore = 20 } = {}) {
  const candidates = [];

  for (const s of stats) {
    const reasons = [];
    if (s.project_count >= minProjectCount) {
      reasons.push(`${s.project_count} projects tagged (threshold ${minProjectCount})`);
    }
    if (s.hub_score >= minHubScore) {
      reasons.push(`hub score ${s.hub_score} (threshold ${minHubScore}) — reachable from ${s.hub_score} other thoughts via shared metadata`);
    }
    if (reasons.length === 0) continue;
    candidates.push({
      id: s.id,
      title: s.title,
      type: s.type,
      created_at: s.created_at,
      project_count: s.project_count,
      people_count: s.people_count,
      topic_count: s.topic_count,
      hub_score: s.hub_score,
      hub_from_projects: s.hub_from_projects,
      hub_from_people: s.hub_from_people,
      projects: s.projects,
      people: s.people,
      reasons,
    });
  }

  candidates.sort((a, b) => {
    if (b.hub_score !== a.hub_score) return b.hub_score - a.hub_score;
    if (b.project_count !== a.project_count) return b.project_count - a.project_count;
    return (a.title || '').localeCompare(b.title || '');
  });

  return candidates.slice(0, limit);
}
