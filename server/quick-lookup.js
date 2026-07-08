import { scrollFilteredRaw } from './qdrant.js';

/**
 * Deterministic metadata lookup — the zero-model rung of the retrieval ladder.
 * Counts, who/when, list-by-person/project/topic questions need no embedding
 * and no LLM: plain payload filtering answers them in one scroll. All filters
 * are case-insensitive substring matches so "pityesz" finds "Pityesz".
 * Read-only; returns projected rows (no full text) to keep responses lean.
 */
export async function quickLookup({ person, project, topic, type, source, since, until, limit = 50, count_only = false } = {}) {
  // Raw scroll keeps the point id so the caller can chain into get_thought.
  const payloads = await scrollFilteredRaw({ must_not: [{ key: 'kind', match: { value: 'chunk' } }] });
  const norm = (s) => String(s || '').toLowerCase();
  const arrayHas = (arr, needle) => (arr || []).some((v) => norm(v).includes(norm(needle)));

  const matches = payloads.filter((p) => {
    if (p.status === 'archived') return false;
    if (person && !arrayHas(p.people, person)) return false;
    if (project && !arrayHas(p.projects, project)) return false;
    if (topic && !arrayHas(p.topics, topic)) return false;
    if (type && norm(p.type) !== norm(type)) return false;
    if (source && norm(p.source) !== norm(source)) return false;
    const date = String(p.effective_date || p.created_at || '');
    if (since && date && date < since) return false;
    if (until && date && date > until) return false;
    return true;
  });

  matches.sort((a, b) => String(b.effective_date || b.created_at || '')
    .localeCompare(String(a.effective_date || a.created_at || '')));

  if (count_only) return { count: matches.length };

  return {
    count: matches.length,
    returned: Math.min(matches.length, limit),
    thoughts: matches.slice(0, limit).map((p) => ({
      id: p.id,
      title: p.title,
      type: p.type,
      source: p.source,
      effective_date: p.effective_date,
      created_at: p.created_at,
      people: p.people,
      projects: p.projects,
      topics: p.topics,
      action_items: p.action_items,
    })),
  };
}
