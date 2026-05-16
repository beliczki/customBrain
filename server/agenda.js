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

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
export const AGENDA_CACHE_PATH = resolve(MODULE_DIR, '..', 'state', 'agenda-cache.json');

const SEARCH_LIMIT = 5;
const MIN_SCORE = Number(process.env.AGENDA_MIN_SCORE || 0.5);

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
    })),
    people: [...people],
    projects: [...projects],
    topics: [...topics],
  };
}

export async function syncAgenda({ daysAhead = 7 } = {}) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start.getTime() + (daysAhead + 1) * 86400000);

  const events = await getCalendarEvents({
    start: start.toISOString(),
    end: end.toISOString(),
  });

  // De-dupe identical search queries within one run (recurring meetings):
  // run search once per unique query, fan out the result.
  const queryCache = new Map();
  const enriched = [];

  for (const event of events) {
    if (event.is_all_day) {
      enriched.push({
        event,
        brain_context: { thoughts: [], people: [], projects: [], topics: [] },
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

    enriched.push({
      event,
      brain_context: aggregateContext(thoughts, event.attendees),
    });
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
