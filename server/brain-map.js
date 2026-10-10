// map (0.56.0; brain_map until 0.60.0) — the situation package of the ontology spec
// (docs/ontologia-es-helyzetcsomag-spec-2026-10-10.md, plan:
// docs/brain-map-terv-2026-10-10.md). One question or anchor in, seven
// sections out: HORGONYOK · HELYZET · ELŐZMÉNYEK · KÖVETKEZŐ · HÁTTÉR ·
// HIÁNYOK · TOVÁBB.
//
// It only ASSEMBLES: every section is filled by an existing reader, and every
// item is one line with a ref — the agent digs further with the tool TOVÁBB
// names. No LLM call; one embedding (searchThoughts) when a question is given.
// The calendar comes from the agenda cache, not live, so the tool stays
// brain-read and a narrow token can call it.

import { readFile } from 'node:fs/promises';
import { REPOS_STATUS_PATH } from './repos-status.js';
import { findFiles } from './files-catalog.js';
import { readAgendaCache } from './agenda.js';
import { listCommitments } from './commitments.js';
import { quickLookup } from './quick-lookup.js';
import { searchThoughts } from './routes/search.js';
import { getVaultContext } from './drive-context.js';
import { nameKey, resolveAliases, stripAccents } from './names.js';
import { layerOf } from './ontology.js';
import { spiderWalk } from './spider.js';
import { stage } from './phase.js';

// Per-section caps. Hand-set starting values; the AUTORESEARCH profile
// (ROADMAP) is where they get calibrated per brain instance.
const MAX = { search: 10, history: 25, files: 8, commitments: 15, events: 10, background: 10, anchors: 3, earlier: 10 };
// How old a state file may be before HIÁNYOK says so. Agenda: hourly cron.
// Repos: daily 04:30 cron. Files catalog: built by hand, no cron yet.
const STALE_HOURS = { agenda: 2, repos: 36, files: 24 * 14 };

const OPEN_STATUSES = new Set(['open', 'waiting', 'expired']);

const norm = (s) => stripAccents(String(s || '')).toLowerCase();
const hoursSince = (iso) => (Date.now() - new Date(iso).getTime()) / 3600000;
const dateOf = (t) => String(t.effective_date || t.created_at || '').slice(0, 10);
// HÁTTÉR = the Tudás layer (server/ontology.js) plus dossier hits.
const isBackground = (t) => t.type === 'dossier' || layerOf(t) === 'tudas';

/**
 * Anchors named in a question, matched word by word, order- and
 * accent-insensitive (the nameKey contract). Hungarian inflects names
 * ("Országtuninggal", "Kun Miklóssal"), so a name word of 4+ letters also
 * matches as the START of a question word; shorter ones must match exactly. A one-word PERSON name is never
 * an anchor on its own — bare first names misfire ("Attila" → Barta Attila,
 * "Me" in an English sentence) — it is returned as a candidate instead.
 * An all-caps one-word project/topic ("MET") must match case-sensitively, or
 * every English "met" would anchor it.
 */
export function matchAnchors(question, vault) {
  const words = String(question).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const keys = words.map(norm);
  const raw = new Set(words);
  const hit = (t) => keys.some((k) => k === t || (t.length >= 4 && k.startsWith(t)));
  const found = { projects: new Set(), people: new Set(), topics: new Set(), candidates: new Set() };

  const scan = (bucket, names, aliases) => {
    const entries = [...names.map((n) => [n, n]), ...Object.entries(aliases || {})];
    for (const [name, canonical] of entries) {
      const tokens = nameKey(name).split(' ').filter(Boolean);
      if (!tokens.length || !tokens.every(hit)) continue;
      if (tokens.length === 1) {
        if (bucket === 'people') { found.candidates.add(canonical); continue; }
        if (/^\p{Lu}{2,}$/u.test(name) && !raw.has(name)) continue;
      }
      found[bucket].add(canonical);
    }
  };
  scan('projects', vault.projects, vault.projectAliases);
  scan('people', vault.people, vault.aliases);
  scan('topics', vault.topicCanonicals, vault.topicAliases);
  for (const p of found.people) found.candidates.delete(p);
  return Object.fromEntries(Object.entries(found).map(([k, v]) => [k, [...v]]));
}

// Most frequent project/person across search hits, if it recurs — an
// inference, so the caller marks it derived_from: "search_hits".
function anchorsFromHits(hits) {
  const top = (field, skip) => {
    const counts = {};
    // Dossier hits carry no metadata — they ARE an anchor's page, not tagged with one.
    for (const h of hits) if (h.kind !== 'dossier') for (const v of h.metadata[field] || []) if (v !== skip) counts[v] = (counts[v] || 0) + 1;
    const [best] = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return best && best[1] >= 2 ? [best[0]] : [];
  };
  return { projects: top('projects'), people: top('people', 'Me') };
}

async function readReposStatus() {
  try {
    return JSON.parse(await readFile(REPOS_STATUS_PATH, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

// The dossier's `project:` line may be a wikilink or quoted.
const repoProject = (r, vault) =>
  r.project && resolveAliases([r.project.replace(/^["'[]+|["'\]]+$/g, '')], vault.projectAliases, vault.projects)[0];

// quick_lookup rows carry `type` flat; search hits nest it in `metadata`, and
// dossier hits have none — they are typed by kind.
const hitType = (h) => (h.kind === 'dossier' ? 'dossier' : h.metadata.type);

// Phase of an anchor-derived line: the dossier it came through, so the trace
// can draw the edge from that anchor. `via` is "project:X" / "person:X" /
// "topic:X" / "search:<evidence>".
const viaAnchor = (via) => {
  const m = /^(project|person|topic):(.+)$/.exec(via);
  return m ? { dossier: m[2] } : null;
};

/**
 * withTrace (0.61.0): also return `trace`, the steps in the order the code
 * took them — what was picked, through which anchor, why, and what a section
 * cap cut. Refs are names/ids; GET /trace resolves them to graph nodes. The
 * MCP tool does not ask for it, so the agent's package is unchanged.
 */
// emit (0.67.0): progress stages for /trace?stream=1; the MCP tool passes none.
export async function buildBrainMap({ question, project, person, days_back = 60, days_ahead = 7, withTrace = false, emit = () => {} } = {}) {
  if (!question && !project && !person) return { error: 'Provide question, project or person' };
  let done = stage(emit, 'vault', 'horgonynevek (dossziék)');
  const vault = await getVaultContext();
  done(`${vault.people.length} ember, ${vault.projects.length} projekt`);
  const gaps = [];
  const trace = [];
  // KORÁBBI (0.65.0): spider walks the graph from the same question in
  // parallel; what it reaches beyond the days_back window becomes the
  // section. The window keeps ELŐZMÉNYEK current; spider is the way past it.
  // Without recency: with it, the fresh threads take every step and nothing
  // old is left to list (measured on "humanody": KORÁBBI came back empty).
  const earlierDone = stage(emit, 'earlier', 'KORÁBBI — bejárás a gráfon (párhuzamosan)');
  const earlierWalk = spiderWalk(question || project || person, undefined, { recency: false });
  // Awaited below; this only keeps an early failure from counting as an
  // unhandled rejection (which ends the process) while the readers run.
  earlierWalk.catch(() => {});

  // ── HORGONYOK ──
  done = stage(emit, 'search', 'keresés');
  const hits = question ? await searchThoughts(question, MAX.search) : [];
  done(`${hits.length} találat`);
  for (const h of hits) trace.push({ phase: 'search', ref: { id: h.id }, label: h.title, why: `${h.evidence} · ${h.score.toFixed(3)}` });
  const anchors = { projects: [], people: [], topics: [], candidates: [] };
  const ANCHOR_WHY = { param: 'paraméterben', question: 'a kérdésben', search_hits: 'a keresési találatokban ismétlődik' };
  const add = (bucket, names, derived_from) => {
    for (const name of names) {
      if (anchors[bucket].some((a) => a.name === name)) continue;
      const cut = anchors[bucket].length >= MAX.anchors;
      trace.push({ phase: 'anchor', ref: { dossier: name }, label: name, why: `${ANCHOR_WHY[derived_from]}${cut ? ` · levágva (max ${MAX.anchors})` : ''}`, cut });
      if (cut) continue;
      anchors[bucket].push({ name, derived_from });
    }
  };
  if (project) {
    const [name] = resolveAliases([project], vault.projectAliases, vault.projects);
    if (!vault.projects.includes(name)) gaps.push({ kind: 'unknown_anchor', detail: `"${project}" is not a Projects dossier` });
    add('projects', [name], 'param');
  }
  if (person) {
    const [name] = resolveAliases([person], vault.aliases, vault.people);
    if (!vault.people.includes(name)) gaps.push({ kind: 'unknown_anchor', detail: `"${person}" is not a People dossier` });
    add('people', [name], 'param');
  }
  if (question) {
    const m = matchAnchors(question, vault);
    add('projects', m.projects, 'question');
    add('people', m.people, 'question');
    add('topics', m.topics, 'question');
    anchors.candidates = m.candidates;
    for (const c of m.candidates) trace.push({ phase: 'anchor', ref: { dossier: c }, label: c, why: 'csak jelölt: csupasz keresztnév', cut: true });
    if (!anchors.projects.length && !anchors.people.length) {
      const d = anchorsFromHits(hits);
      add('projects', d.projects, 'search_hits');
      add('people', d.people, 'search_hits');
    }
  }
  if (!anchors.projects.length && !anchors.people.length && !anchors.topics.length) {
    gaps.push({ kind: 'no_anchor', detail: 'no project, person or topic recognised — sections below rest on search hits only' });
  }

  emit({ type: 'phase', name: 'anchors', label: 'HORGONYOK', status: 'done', ms: 0, note: [...anchors.projects, ...anchors.people, ...anchors.topics].map((a) => a.name).join(', ') || 'nincs' });

  // ── HELYZET ── repos + files per project anchor
  done = stage(emit, 'situation', 'HELYZET — repó, fájlok');
  const repos = await readReposStatus();
  if (!repos) gaps.push({ kind: 'missing_state', detail: 'state/repos-status.json not built (cron/repos-status.js)' });
  else if (hoursSince(repos.generated_at) > STALE_HOURS.repos) gaps.push({ kind: 'stale_state', detail: `repos-status.json from ${repos.generated_at}` });

  const situation = { repos: [], files: [] };
  let catalogAt = null;
  for (const a of anchors.projects) {
    const repo = repos?.repos.find((r) => repoProject(r, vault) === a.name) || null;
    a.repo = repo ? repo.repo : null;
    if (repo?.error) {
      situation.repos.push({ project: a.name, repo: repo.repo, error: repo.error });
      gaps.push({ kind: 'repo_unreadable', detail: `${repo.dossier}: ${repo.error}`, ref: repo.repo });
    } else if (repo) {
      trace.push({ phase: 'situation', ref: { repo: repo.dossier }, from: { dossier: a.name }, label: repo.repo, why: `repó a projekthez · ${repo.drift.length} drift` });
      situation.repos.push({
        project: a.name, repo: repo.repo, version: repo.version, last_commit: repo.last_commit,
        pushed_at: repo.pushed_at, drift: repo.drift,
      });
      for (const d of repo.drift) gaps.push({ kind: 'repo_drift', detail: `${repo.repo}: ${d}`, ref: repo.repo });
    }
    const files = await findFiles({ project: a.name, limit: MAX.files });
    if (files.error) { gaps.push({ kind: 'missing_state', detail: files.error }); continue; }
    catalogAt = files.generated_at;
    const drive = await findFiles({ project: a.name, source: 'drive', limit: 1 });
    a.drive_files = drive.total;
    if (files.files.length) trace.push({ phase: 'situation', ref: { files: a.name }, from: { dossier: a.name }, label: `Fájlok · ${a.name}`, why: `${files.total} fájl a projekthez, a legfrissebb ${files.files.length} a csomagban` });
    if (!drive.total) gaps.push({ kind: 'project_without_drive_folder', detail: `${a.name}: no Drive file mapped — drive_folder: missing from its Projects dossier?` });
    situation.files.push(...files.files.map((f) => ({
      project: a.name, name: f.name, kind: f.kind, source: f.source, modified: f.modified.slice(0, 10), link: f.link,
    })));
  }
  if (catalogAt && hoursSince(catalogAt) > STALE_HOURS.files) gaps.push({ kind: 'stale_state', detail: `files catalog from ${catalogAt} (scripts/build-files-catalog.js)` });
  done(`${situation.repos.length} repó, ${situation.files.length} fájl`);

  // ── ELŐZMÉNYEK + HÁTTÉR ── anchor lookups and search hits, one line per thought
  done = stage(emit, 'history', 'ELŐZMÉNYEK, HÁTTÉR');
  const since = new Date(Date.now() - days_back * 86400000).toISOString().slice(0, 10);
  const byId = new Map();
  const collect = (t, via) => {
    const seen = byId.get(t.id);
    if (seen) { if (!seen.via.includes(via)) seen.via.push(via); return; }
    const line = { date: dateOf(t), type: t.type, source: t.source, title: t.title, id: t.id, via: [via] };
    byId.set(t.id, { ...line, background: isBackground(line) });
  };
  for (const a of anchors.projects) (await quickLookup({ project: a.name, since, limit: MAX.history })).thoughts.forEach((t) => collect(t, `project:${a.name}`));
  for (const a of anchors.people) (await quickLookup({ person: a.name, since, limit: MAX.history })).thoughts.forEach((t) => collect(t, `person:${a.name}`));
  for (const a of anchors.topics) (await quickLookup({ topic: a.name, since, limit: MAX.history })).thoughts.forEach((t) => collect(t, `topic:${a.name}`));
  for (const h of hits) collect({ ...h, type: hitType(h) }, `search:${h.evidence}`);

  const lines = [...byId.values()].sort((a, b) => b.date.localeCompare(a.date));
  const strip = ({ background, ...l }) => l;
  const history = lines.filter((l) => !l.background).slice(0, MAX.history).map(strip);
  const background = lines.filter((l) => l.background).slice(0, MAX.background).map(strip);
  done(`${history.length} előzmény, ${background.length} háttér`);
  // ── KORÁBBI ── spider's thoughts older than the window, not already listed
  const { result: walk } = await earlierWalk;
  const reached = walk.layers.flatMap((l) => l.items)
    .filter((i) => !i.entity && i.date < since && !byId.has(i.id))
    .sort((a, b) => a.step - b.step);
  earlierDone(`${Math.min(reached.length, MAX.earlier)} régebbi szál`);
  const earlier = reached.slice(0, MAX.earlier).map((i) => ({ date: i.date, type: i.type, source: i.source, title: i.title, id: i.id, via: [`spider #${i.step}: ${i.why}`] }));
  reached.forEach((i, n) => trace.push({
    phase: 'earlier', ref: { id: i.id }, label: i.title,
    why: `${i.date} · spider #${i.step}: ${i.why}${n >= MAX.earlier ? ` · levágva (max ${MAX.earlier})` : ''}`, cut: n >= MAX.earlier,
  }));

  for (const [phase, all, cap] of [['history', lines.filter((l) => !l.background), MAX.history], ['background', lines.filter((l) => l.background), MAX.background]]) {
    all.forEach((l, i) => trace.push({
      phase, ref: { id: l.id }, from: viaAnchor(l.via[0]), label: l.title,
      why: `${l.date} · ${l.via.join(', ')}${i >= cap ? ` · levágva (max ${cap})` : ''}`, cut: i >= cap,
    }));
  }

  // ── KÖVETKEZŐ ── commitments + upcoming events tied to an anchor
  done = stage(emit, 'next', 'KÖVETKEZŐ — vállalások, naptár');
  const projectKeys = new Set(anchors.projects.map((a) => nameKey(a.name)));
  const personKeys = new Set(anchors.people.map((a) => nameKey(a.name)));
  const all = await listCommitments({ limit: 1000 });
  // Which anchor tied a commitment in — the first that matches, for the trace.
  const matchOf = (c) => {
    const p = (c.projects || []).find((x) => projectKeys.has(nameKey(x)));
    if (p) return { dossier: p, why: `projekt: ${p}` };
    if (personKeys.has(nameKey(c.owner))) return { dossier: c.owner, why: `gazda: ${c.owner}` };
    const cp = (c.counterparty || []).find((x) => personKeys.has(nameKey(x)));
    return cp ? { dossier: cp, why: `partner: ${cp}` } : null;
  };
  const matched = all.commitments.filter((c) => OPEN_STATUSES.has(c.status)).map((c) => ({ c, m: matchOf(c) })).filter((x) => x.m);
  matched.forEach(({ c, m }, i) => trace.push({
    phase: 'next', ref: { id: c.id }, from: { dossier: m.dossier }, label: c.title,
    why: `${c.status} · ${m.why}${i >= MAX.commitments ? ` · levágva (max ${MAX.commitments})` : ''}`, cut: i >= MAX.commitments,
  }));
  const commitments = matched
    .slice(0, MAX.commitments)
    .map(({ c }) => ({
      id: c.id, title: c.title, status: c.status, owner: c.owner, counterparty: c.counterparty || [],
      kind: c.kind, due: c.due ?? null, overdue: c.overdue, ref: `${c.sources[0].source}:${c.sources[0].ref}`,
    }));
  for (const c of commitments.filter((x) => x.overdue)) gaps.push({ kind: 'overdue_commitment', detail: `${c.title} (due ${c.due})`, ref: c.id });

  const events = [];
  const agenda = readAgendaCache();
  if (!agenda) gaps.push({ kind: 'missing_state', detail: 'agenda cache not built (cron/agenda-sync.js)' });
  else {
    if (agenda.cache_age_ms > STALE_HOURS.agenda * 3600000) gaps.push({ kind: 'stale_state', detail: `agenda cache synced ${agenda.synced_at}` });
    const horizon = Date.now() + days_ahead * 86400000;
    for (const { event, brain_context } of agenda.events) {
      const start = new Date(event.start).getTime();
      if (start < Date.now() || start > horizon) continue;
      const matched = [
        ...brain_context.detected_projects.filter((p) => projectKeys.has(nameKey(p))).map((p) => `project:${p}`),
        ...event.attendees
          .map((a) => vault.peopleEmails[a.email.toLowerCase()] || (a.name && resolveAliases([a.name], vault.aliases, vault.people)[0]))
          .filter((p) => p && personKeys.has(nameKey(p))).map((p) => `person:${p}`),
      ];
      if (!matched.length) continue;
      events.push({ start: event.start, title: event.title, event_id: event.event_id, attendees: event.attendees.length, matched_by: [...new Set(matched)] });
    }
    const cutEvents = events.splice(MAX.events);
    for (const [list, cut] of [[events, false], [cutEvents, true]]) {
      for (const e of list) trace.push({ phase: 'next', ref: null, label: `${e.start.slice(0, 16).replace('T', ' ')} ${e.title}`, why: `naptár · ${e.matched_by.join(', ')}${cut ? ` · levágva (max ${MAX.events})` : ''}`, cut });
    }
  }

  done(`${commitments.length} vállalás, ${events.length} esemény`);

  // ── TOVÁBB ── the deeper call per section, ready to run
  const further = [];
  for (const a of anchors.projects) {
    further.push({ section: 'ELŐZMÉNYEK', tool: 'quick_lookup', args: { project: a.name } });
    further.push({ section: 'HELYZET', tool: 'find_files', args: { project: a.name } });
    further.push({ section: 'KÖVETKEZŐ', tool: 'list_commitments', args: { project: a.name } });
  }
  for (const a of anchors.people) {
    further.push({ section: 'ELŐZMÉNYEK', tool: 'quick_lookup', args: { person: a.name } });
    further.push({ section: 'KÖVETKEZŐ', tool: 'list_commitments', args: { owner: a.name } });
  }
  for (const e of events) further.push({ section: 'KÖVETKEZŐ', tool: 'get_event_context', args: { event_title: e.title }, note: 'live Gmail + Fireflies' });
  if (history.length) further.push({ section: 'ELŐZMÉNYEK', tool: 'get_thought', args: { thought_id: history[0].id, from_line: 1, max_lines: 80 } });
  if (question) further.push({ section: 'ELŐZMÉNYEK', tool: 'search', args: { query: question, limit: 20 } });

  // An empty section is said out loud, not left for the agent to guess at.
  const sections = { HELYZET: situation.repos.length + situation.files.length, ELŐZMÉNYEK: history.length, KÖVETKEZŐ: commitments.length + events.length, HÁTTÉR: background.length };
  for (const [name, n] of Object.entries(sections)) if (!n) gaps.push({ kind: 'empty_section', detail: name });

  return {
    question: question ?? null,
    window: { since, days_ahead },
    HORGONYOK: anchors,
    HELYZET: situation,
    ELŐZMÉNYEK: history,
    KORÁBBI: earlier,
    KÖVETKEZŐ: { commitments, events },
    HÁTTÉR: background,
    HIÁNYOK: gaps,
    TOVÁBB: further,
    ...(withTrace ? { trace } : {}),
  };
}
