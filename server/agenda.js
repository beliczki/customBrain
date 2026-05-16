// Agenda sync — reads Google Calendar (today + N days) and attaches per-event
// brain context (top-N matching thoughts + aggregated people/projects/topics).
// Writes the result to state/agenda-cache.json for the MCP tool, HTTP route,
// and UI to read. Subtask breakdown is intentionally NOT done here — that's
// the LLM's job in a Claude Desktop / Code session via get_agenda + chat.

import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCalendarEvents } from '../agent/tools/calendar.js';
import { searchThoughts } from './routes/search.js';
import { getVaultContext } from './drive-context.js';
import { scrollFilteredRaw } from './qdrant.js';

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
export const AGENDA_CACHE_PATH = resolve(MODULE_DIR, '..', 'state', 'agenda-cache.json');

const SEARCH_LIMIT = 5;
const MIN_SCORE = Number(process.env.AGENDA_MIN_SCORE || 0.65);
const TOTAL_THOUGHTS_PER_EVENT = 5;
const PROJECT_FALLBACK_RECENT = 3;

function buildSearchQuery(event) {
  const attendeeNames = (event.attendees || [])
    .map((a) => a.name || a.email)
    .filter(Boolean);
  return [event.title, ...attendeeNames].filter(Boolean).join(' ');
}

function aggregateContext(thoughts, attendees) {
  const people = new Set();
  const projects = new Set();
  const topics = new Set();

  for (const a of attendees || []) {
    if (a.name) people.add(a.name);
  }
  for (const t of thoughts) {
    for (const p of t.metadata?.people || []) people.add(p);
    for (const p of t.metadata?.projects || []) projects.add(p);
    for (const tag of t.metadata?.topics || []) topics.add(tag);
  }

  return {
    thoughts: thoughts.map((t) => ({
      id: t.id,
      title: t.title,
      score: Math.round(t.score * 100) / 100,
      type: t.metadata?.type || null,
      projects: t.metadata?.projects || [],
      match_reason: 'semantic',
    })),
    people: [...people],
    projects: [...projects],
    topics: [...topics],
  };
}

function buildProjectMap(vault) {
  // lowercase name → canonical name. Sorted by length desc later so multi-word
  // matches win over substrings ("Hello Business" before "Bizi").
  const map = {};
  if (!vault) return map;
  for (const name of vault.projects || []) {
    map[name.toLowerCase()] = name;
  }
  for (const [alias, canonical] of Object.entries(vault.projectAliases || {})) {
    map[alias.toLowerCase()] = canonical;
  }
  return map;
}

function detectProjectsInTitle(title, projectMap) {
  if (!title) return [];
  const lower = title.toLowerCase();
  const matched = [];
  const sorted = Object.keys(projectMap).sort((a, b) => b.length - a.length);
  for (const lowerName of sorted) {
    if (lower.includes(lowerName)) {
      const canonical = projectMap[lowerName];
      if (!matched.includes(canonical)) matched.push(canonical);
    }
  }
  return matched;
}

async function projectTaggedThoughts(canonicals) {
  if (!canonicals.length) return [];
  // Qdrant filter — projects field is not indexed but at <1k thoughts the
  // full-scan cost is trivial (~tens of ms).
  const filter = {
    must: [{ key: 'projects', match: { any: canonicals } }],
    must_not: [{ key: 'status', match: { value: 'archived' } }],
  };
  const rows = await scrollFilteredRaw(filter, 200).catch((err) => {
    console.warn(`[agenda] project filter scroll failed: ${err.message}`);
    return [];
  });
  return rows;
}

export async function syncAgenda({ daysAhead = 7 } = {}) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start.getTime() + (daysAhead + 1) * 86400000);

  const events = await getCalendarEvents({
    start: start.toISOString(),
    end: end.toISOString(),
  });

  // Vault context for project-name detection in event titles. Best-effort —
  // if Drive is unreachable, we skip project fallback (semantic search only).
  const vault = await getVaultContext().catch((err) => {
    console.warn(`[agenda] vault context unavailable: ${err.message}`);
    return null;
  });
  const projectMap = buildProjectMap(vault);

  // Per-project lazy cache to avoid re-scrolling for the same project across events.
  const projectThoughtsCache = new Map();
  const getProjectThoughts = async (canonical) => {
    if (projectThoughtsCache.has(canonical)) return projectThoughtsCache.get(canonical);
    const rows = await projectTaggedThoughts([canonical]);
    projectThoughtsCache.set(canonical, rows);
    return rows;
  };

  // De-dupe identical search queries within one run (recurring meetings):
  // run search once per unique query, fan out the result.
  const queryCache = new Map();
  const enriched = [];

  for (const event of events) {
    if (event.is_all_day) {
      enriched.push({
        event,
        brain_context: { thoughts: [], people: [], projects: [], topics: [], detected_projects: [], project_thought_counts: {} },
      });
      continue;
    }

    const query = buildSearchQuery(event);
    let thoughts = [];
    if (query) {
      if (queryCache.has(query)) {
        thoughts = queryCache.get(query);
      } else {
        const raw = await searchThoughts(query, SEARCH_LIMIT).catch((err) => {
          console.warn(`[agenda] search failed for "${event.title}": ${err.message}`);
          return [];
        });
        // Drop low-score matches (noise — embedding finds linguistic similarity
        // but not topical relevance). Same logic as semantic autolinks (0.6.0).
        thoughts = raw.filter((t) => t.score >= MIN_SCORE);
        queryCache.set(query, thoughts);
      }
    }

    const aggregated = aggregateContext(thoughts, event.attendees);

    // Project fallback: if the event title references a known project,
    // augment with the most recent project-tagged thoughts (regardless of
    // semantic similarity to the event title). This handles the case where
    // "customBrain dev next steps" should surface customBrain-tagged thoughts
    // even if the linguistic match is weak.
    const detected = detectProjectsInTitle(event.title, projectMap);
    const projectThoughtCounts = {};
    if (detected.length > 0) {
      const existingIds = new Set(aggregated.thoughts.map((t) => t.id));
      const slotsLeft = TOTAL_THOUGHTS_PER_EVENT - aggregated.thoughts.length;
      for (const canonical of detected) {
        const rows = await getProjectThoughts(canonical);
        projectThoughtCounts[canonical] = rows.length;
      }
      if (slotsLeft > 0) {
        const allRows = [];
        for (const canonical of detected) {
          allRows.push(...(await getProjectThoughts(canonical)));
        }
        const added = allRows
          .filter((p) => !existingIds.has(p.id))
          .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
          .slice(0, Math.min(slotsLeft, PROJECT_FALLBACK_RECENT))
          .map((p) => ({
            id: p.id,
            title: p.title,
            score: null,
            type: p.type || null,
            projects: p.projects || [],
            match_reason: 'project_tag',
          }));
        aggregated.thoughts.push(...added);
      }
    }
    aggregated.detected_projects = detected;
    aggregated.project_thought_counts = projectThoughtCounts;

    enriched.push({ event, brain_context: aggregated });
  }

  const cache = {
    synced_at: new Date().toISOString(),
    days_ahead: daysAhead,
    event_count: enriched.length,
    enriched_count: enriched.filter((e) => e.brain_context.thoughts.length > 0).length,
    events: enriched,
  };

  const dir = dirname(AGENDA_CACHE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(AGENDA_CACHE_PATH, JSON.stringify(cache, null, 2), 'utf-8');

  return cache;
}

export function readAgendaCache() {
  if (!existsSync(AGENDA_CACHE_PATH)) return null;
  const raw = readFileSync(AGENDA_CACHE_PATH, 'utf-8');
  const cache = JSON.parse(raw);
  cache.cache_age_ms = Date.now() - statSync(AGENDA_CACHE_PATH).mtimeMs;
  return cache;
}
