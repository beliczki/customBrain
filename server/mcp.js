import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAgentTools } from '../agent/register.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { searchThoughts, searchThoughtsMulti, forAgent } from './routes/search.js';
import { getRecent, updateThought, getThoughtSlice } from './routes/recent.js';
import { getStats } from './routes/stats.js';
import { exportThoughts } from './routes/export.js';
import { captureThought } from './routes/capture.js';
import { getConnectionStats, getById } from './qdrant.js';
import { findOverconnected } from './brain-hygiene.js';
import { suggestCleanedMetadata } from './metadata.js';
import { getVaultContext } from './drive-context.js';
import { listThoughtsNeedingSummary, setThoughtTextWithSummary } from './routes/summary.js';
import { getAgenda } from './routes/agenda.js';
import { runHealthCheck } from './brain-health.js';
import { quickLookup } from './quick-lookup.js';
import { findFiles } from './files-catalog.js';
import { reindexDossiers } from './dossier-index.js';
import { listCommitments, listCommitmentCandidates, saveCommitments } from './commitments.js';
import { buildBrainMap } from './brain-map.js';
import { applyScopeGate } from './mcp-scopes.js';

/**
 * @param {string[]|null} scopes Capability scopes of the calling token, or null
 *   for unrestricted (stdio, and tokens minted before scopes existed).
 * @param {string|null} caller Token name, recorded per call in the MCP call log
 *   (0.58.0); null = no logging.
 */
export function createMcpServer({ scopes = null, caller = null } = {}) {
  const server = new McpServer({
    name: 'customBrain',
    version: '1.0.0',
    icons: [{ src: 'https://brain.beliczki.hu/favicon-96x96.png', sizes: ['96x96'], mimeType: 'image/png' }],
  });

  // Must run before any server.tool(...) below — it wraps the registration fn.
  applyScopeGate(server, scopes, caller);

  server.tool(
    'capture_thought',
    'Capture a new thought into the brain — extracts metadata (people, topics, projects, type, action items) automatically. If a near-duplicate exists and contradicts, the old thought is archived. WRITE-BACK CONVENTION: when a search-and-synthesize session produces a genuinely useful answer, file it back — capture the answer with a leading "Synthesis: <question>" line so it gets type=synthesis; the next session hits the pre-digested answer instead of re-deriving it from raw thoughts (compounding memory).',
    { text: z.string(), conflict_threshold: z.number().min(0).max(1).optional().describe('Cosine similarity threshold for conflict detection (default 0.85)') },
    async ({ text, conflict_threshold }) => {
      const opts = conflict_threshold != null ? { conflictThreshold: conflict_threshold } : {};
      const result = await captureThought(text, opts);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'search',
    'Search your brain. Simple: pass query (hybrid dense+BM25, RRF-fused). Advanced: pass queries=[{type:"lex"|"vec",q}] to compose your own retrieval legs — lex is BM25-only (exact words, names, IDs), vec is dense-only (meaning, paraphrase) — fused server-side (RRF k=60). Every hit carries an evidence tag: exact_title | bm25_exact | high_dense | weak_semantic — WHY it surfaced, so you can weigh hits categorically instead of by raw score. Hits longer than 8000 chars come back as summary + matched_chunk_text + text_omitted (page the full text with get_thought from_line/max_lines).',
    {
      query: z.string().optional().describe('Simple-mode query (required unless queries is set)'),
      limit: z.number().optional(),
      queries: z.array(z.object({
        type: z.enum(['lex', 'vec']).describe('lex = BM25 exact-words leg, vec = dense semantic leg'),
        q: z.string(),
      })).optional().describe('Typed sub-queries composed by you, fused via RRF. Overrides query.'),
    },
    async ({ query, limit, queries }) => {
      if (!queries?.length && !query) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'Provide query or queries' }) }] };
      }
      const results = queries?.length
        ? await searchThoughtsMulti(queries, limit ?? 5)
        : await searchThoughts(query, limit ?? 5);
      return { content: [{ type: 'text', text: JSON.stringify(forAgent(results), null, 2) }] };
    }
  );

  server.tool(
    'get_thought',
    'Fetch a single thought by id. For long thoughts (Fireflies transcripts, refreshed email threads) pass from_line/max_lines to pull only a window of the text — the response includes text_slice.total_lines so you can page through instead of loading tens of thousands of chars at once.',
    {
      thought_id: z.string(),
      from_line: z.number().optional().describe('1-indexed first line of the text window (default 1)'),
      max_lines: z.number().optional().describe('How many lines to return (default: all remaining)'),
    },
    async ({ thought_id, from_line, max_lines }) => {
      const result = (from_line || max_lines)
        ? await getThoughtSlice(thought_id, from_line ?? 1, max_lines ?? null)
        : await getById(thought_id);
      if (!result) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: `Thought ${thought_id} not found` }) }] };
      }
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'quick_lookup',
    'Deterministic metadata lookup — zero model calls, zero embeddings. Answers counts / who / when / list-by questions from payload filters alone: thoughts by person, project, topic, type, source, or date range. Use this INSTEAD of search when the question is about metadata ("how many meetings with X?", "what did I capture about project Y in June?") — it is exact and instant. Filters are case-insensitive substrings; combine freely.',
    {
      person: z.string().optional(),
      project: z.string().optional(),
      topic: z.string().optional(),
      type: z.string().optional().describe('Exact type: meeting | note | idea | decision | …'),
      source: z.string().optional().describe('manual | gmail | youtube | fireflies'),
      since: z.string().optional().describe('ISO date lower bound on effective_date (inclusive)'),
      until: z.string().optional().describe('ISO date upper bound on effective_date (inclusive)'),
      limit: z.number().optional().describe('Max rows returned (default 50); count is always exact'),
      count_only: z.boolean().optional().describe('Return only the count'),
    },
    async (args) => {
      const result = await quickLookup(args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'find_files',
    'Find documents in the Files catalog: decks, docs, sheets, PDFs and markdown on Drive, plus the attachments of brain-captured Gmail threads. Metadata only (name, Drive path or Gmail thread, projects, direction, link) — no file contents. Use it for "where is the X deck?", "what did Y send us?", "which files belong to project Z?". Copies and re-exports of one document share variant_group. Filters combine; text filters are case- and accent-insensitive substrings. Ranked by match strength × recency (90-day half-life that never reaches zero — old files stay findable, just lower); each hit carries score and age_days. Page with offset/next_offset.',
    {
      query: z.string().optional().describe('Substring of file name or Drive path'),
      project: z.string().optional(),
      source: z.enum(['drive', 'gmail']).optional(),
      kind: z.enum(['presentation', 'document', 'spreadsheet', 'pdf', 'markdown']).optional(),
      direction: z.enum(['received', 'delivered']).optional().describe('Gmail attachments only'),
      thread_id: z.string().optional().describe('Gmail thread id (= source_id of the gmail thought)'),
      since: z.string().optional().describe('ISO date lower bound on modified (inclusive)'),
      until: z.string().optional().describe('ISO date upper bound on modified (inclusive)'),
      limit: z.number().optional().describe('Rows per page (default 25)'),
      offset: z.number().optional(),
    },
    async (args) => {
      const result = await findFiles(args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'map',
    'Situation map for a question or anchor — the first call when someone asks "where are we with X?" / "what is going on with Y?". Returns one structured package, NOT a merged hit list: HORGONYOK (recognised projects/people/topics; per project whether a repo and Drive files exist), HELYZET (repo version/last commit/drift, latest files), ELŐZMÉNYEK (timeline: date · type · source · title · thought id), KÖVETKEZŐ (open/waiting commitments + upcoming calendar events tied to the anchors), HÁTTÉR (syntheses, decisions, dossiers, YouTube), HIÁNYOK (gaps across sources: drift, unreadable repo, project without Drive folder, overdue commitment, stale state, empty section), TOVÁBB (the deeper tool call per section, ready to run). One line per item with a ref — no full texts. Anchors in the question are matched on whole words; a bare first name is listed under candidates, not used. Calendar is read from the hourly agenda cache, not live. Zero LLM calls.',
    {
      question: z.string().optional().describe('Free-text question; anchors are recognised in it'),
      project: z.string().optional().describe('Project anchor (alias-resolved)'),
      person: z.string().optional().describe('Person anchor (alias-resolved; Robi is "Me")'),
      days_back: z.number().optional().describe('ELŐZMÉNYEK window in days (default 60)'),
      days_ahead: z.number().optional().describe('Upcoming events window in days (default 7, max what the agenda cache holds)'),
    },
    async (args) => {
      const result = await buildBrainMap(args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'list_commitments',
    'List verified commitments — the "what should happen next" layer. Each has one owner (Robi = "Me"), status (open | waiting | done | dropped | expired), kind (penz | jog | ugyfel | belso), optional due and event_ref, and at least one direct source with a verbatim quote. `expired` is derived on read: an open commitment whose event has ended. Sorted by urgency: earliest due first, undated last, then money → legal → client → internal; `overdue` marks open/waiting items past due. Filters combine; project is a case-insensitive substring.',
    {
      status: z.enum(['open', 'waiting', 'done', 'dropped', 'expired']).optional(),
      owner: z.string().optional().describe('Canonical People name; Robi is "Me"'),
      project: z.string().optional(),
      kind: z.enum(['penz', 'jog', 'ugyfel', 'belso']).optional(),
      due_before: z.string().optional().describe('ISO date; only commitments due on or before it'),
      limit: z.number().optional().describe('Rows per page (default 50)'),
      offset: z.number().optional(),
    },
    async (args) => {
      const result = await listCommitments(args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'list_commitment_candidates',
    'List commitment CANDIDATES: action_items of thoughts nobody has reviewed yet (or that were refreshed after the last review). Candidates are loose — they repeat across thoughts, mix other people\'s tasks and descriptions, and carry no status. Also returns live_commitments (open/waiting) so you can dedup. Workflow: follow the review-commitments skill — turn candidates into commitments, get Robi\'s approval, then save_commitments with reviewed_thought_ids. Oldest first, paged.',
    {
      since: z.string().optional().describe('ISO date lower bound on effective_date'),
      limit: z.number().optional().describe('Thoughts per page (default 20)'),
      offset: z.number().optional(),
    },
    async (args) => {
      const result = await listCommitmentCandidates(args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'save_commitments',
    'Create or update commitments in one batch, AFTER Robi approved them. Item without id = create; with id = merge into the stored one (sources and candidate_refs are appended, other fields replaced). Every commitment needs owner, kind, status and at least one source {source: gmail|fireflies|calendar|repo|manual|session, ref, quote (verbatim), at?}; items failing that are rejected, the rest still save. A status change is appended to status_history with `by` (human|agent|rule) and `evidence` (e.g. the Fireflies meeting id that shows it happened). Commitments are never deleted — use status dropped. reviewed_thought_ids stamps candidates_reviewed_at on the thoughts this batch accounted for, so they leave the candidate list.',
    {
      commitments: z.array(z.object({
        id: z.string().optional(),
        title: z.string().optional(),
        owner: z.string().optional(),
        counterparty: z.array(z.string()).optional(),
        projects: z.array(z.string()).optional(),
        kind: z.enum(['penz', 'jog', 'ugyfel', 'belso']).optional(),
        status: z.enum(['open', 'waiting', 'done', 'dropped', 'expired']).optional(),
        due: z.string().nullable().optional().describe('ISO date'),
        event_ref: z.object({
          calendar_event_id: z.string(),
          start: z.string(),
          end: z.string(),
        }).nullable().optional(),
        sources: z.array(z.object({
          source: z.enum(['gmail', 'fireflies', 'calendar', 'repo', 'manual', 'session']),
          ref: z.string(),
          quote: z.string(),
          at: z.string().optional(),
        })).optional(),
        candidate_refs: z.array(z.object({ thought_id: z.string(), text: z.string() })).optional(),
        by: z.enum(['human', 'agent', 'rule']).optional().describe('Who decided this status (default agent)'),
        evidence: z.string().optional().describe('What shows the status is true'),
      })).optional(),
      reviewed_thought_ids: z.array(z.string()).optional(),
    },
    async (args) => {
      const result = await saveCommitments(args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'list_recent',
    'List the most recent thoughts captured in your brain',
    { limit: z.number().optional() },
    async ({ limit }) => {
      const results = await getRecent(limit ?? 10);
      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    }
  );

  server.tool(
    'brain_stats',
    'Get statistics about your brain: counts by type, top topics, capture frequency',
    {},
    async () => {
      const results = await getStats();
      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    }
  );

  server.tool(
    'find_overconnected',
    'Find thoughts that are wrongly linked to many others via over-broad metadata. Sorted by hub_score (sum of thoughts reachable via shared projects/people). Use before suggest_metadata_fix + update_thought to surface brain-hygiene candidates.',
    {
      limit: z.number().optional().describe('How many top candidates to return (default 10)'),
      min_project_count: z.number().optional().describe('Flag thoughts with this many or more projects (default 5)'),
      min_hub_score: z.number().optional().describe('Flag thoughts with this or higher hub score (default 20)'),
    },
    async ({ limit, min_project_count, min_hub_score }) => {
      const { stats } = await getConnectionStats();
      const results = findOverconnected(stats, {
        limit: limit ?? 10,
        minProjectCount: min_project_count ?? 5,
        minHubScore: min_hub_score ?? 20,
      });
      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    }
  );

  server.tool(
    'suggest_metadata_fix',
    'Given a thought ID (typically one surfaced by find_overconnected), ask Haiku to propose tighter metadata. Returns the proposed people/projects/topics/title, classification of each current project (primary/example/context), and human-readable reasoning. Does NOT apply — use update_thought with the proposed values after user review.',
    { thought_id: z.string() },
    async ({ thought_id }) => {
      const thought = await getById(thought_id);
      if (!thought) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: `Thought ${thought_id} not found` }) }] };
      }
      const vaultCtx = await getVaultContext().catch(() => null);
      const suggestion = await suggestCleanedMetadata(thought, vaultCtx);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            thought_id,
            current: {
              title: thought.title,
              people: thought.people,
              projects: thought.projects,
              topics: thought.topics,
            },
            ...suggestion,
          }, null, 2),
        }],
      };
    }
  );

  server.tool(
    'update_thought',
    'Update metadata (people, projects, topics, title, action_items) on an existing thought. Text, source, and timestamps are immutable — use this for brain-hygiene corrections, NOT to rewrite content.',
    {
      thought_id: z.string(),
      people: z.array(z.string()).optional(),
      projects: z.array(z.string()).optional(),
      topics: z.array(z.string()).optional(),
      title: z.string().optional(),
      action_items: z.array(z.string()).optional(),
    },
    async ({ thought_id, ...rest }) => {
      const delta = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
      if (Object.keys(delta).length === 0) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'No updatable fields provided' }) }] };
      }
      const result = await updateThought(thought_id, delta);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'list_thoughts_needing_summary',
    'List long thoughts (text > 6000 chars) that need a chronological summary prepended — either none yet, or stale because the thought was refreshed after the last summary. Returns full text so the caller can summarize in-session without a follow-up fetch. Sorted oldest-summary-first for fair loop progress. Use together with update_thought_text_with_summary in a coworker loop until the list is empty.',
    {
      limit: z.number().optional().describe('Max thoughts to return per call (default 10). Smaller batches keep session context lean.'),
    },
    async ({ limit }) => {
      const results = await listThoughtsNeedingSummary(limit ?? 10);
      return { content: [{ type: 'text', text: JSON.stringify({ count: results.length, thoughts: results }, null, 2) }] };
    }
  );

  server.tool(
    'update_thought_text_with_summary',
    'Prepend a chronological summary block to a thought\'s text. Strips any existing summary block first (idempotent re-runs are safe). The summary block format is "## Summary\\n<text>\\n\\n---\\n\\n<original>"; the first "# Title" line of the original text is hoisted above the summary if present. Sets has_auto_summary=true, summary_appended_at=now, summary_source="coworker". Re-embeds and re-extracts metadata via refreshCapture. Use after generating a summary in-session via the summarize-long-thoughts skill.',
    {
      thought_id: z.string(),
      summary_text: z.string().describe('Chronological summary, ideally ≤ 5000 chars, hard-capped at 5500. Same language as the source.'),
    },
    async ({ thought_id, summary_text }) => {
      const result = await setThoughtTextWithSummary(thought_id, summary_text);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'rebuild_obsidian_vault',
    'Sync the Obsidian vault on Google Drive — incremental md5 diff: writes only new/changed thoughts as linked markdown with YAML frontmatter, deletes orphans',
    {},
    async () => {
      const results = await exportThoughts();
      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    }
  );

  server.tool(
    'brain_health_check',
    'Run an on-demand audit of the brain. Listing-only — no mutations. Surfaces: duplicate candidates (cosine > 0.92), over-tagged thoughts, stale auto-summaries, oversized thoughts without summary, unknown projects/people in metadata, orphan People/Projects .md files on Drive. Use to decide where to manual-cleanup; nothing automated.',
    {},
    async () => {
      const result = await runHealthCheck();
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'get_agenda',
    'Get your upcoming calendar agenda with brain context per event (matching thoughts, people, projects, topics). Server delivers the data; YOU (the LLM) do the subtask breakdown in conversation — nothing persists server-side. Pass days=1 for today only, up to days=7.',
    {
      days: z.number().min(1).max(7).optional().describe('How many days ahead to include (default 1 = today only)'),
      force_refresh: z.boolean().optional().describe('Force a fresh sync, ignore cached. Default false — uses cache if under 1h old, else re-syncs.'),
    },
    async ({ days, force_refresh }) => {
      const result = await getAgenda({ days: days ?? 1, force_refresh: force_refresh ?? false });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'reindex_dossiers',
    'Re-index the canonical People/Projects/Topics/Files/Repos dossiers into the search index so their content is retrievable by search. Call this right after editing a dossier `.md` on Drive so the change is searchable immediately (don\'t wait for the hourly reconcile). No args = re-index only files whose content changed since last run. Optional: paths (e.g. ["Projects/Bizi"]) or types (["person"|"project"|"topic"|"file"|"repo"]) to scope; reconcile=true deletes points for dossiers removed from Drive (the hash gate still skips unchanged files); force=true re-embeds even unchanged dossiers (e.g. after an embedding-model change).',
    {
      paths: z.array(z.string()).optional().describe('Specific dossier paths, e.g. ["Projects/Bizi", "People/Porkoláb Dávid"]'),
      types: z.array(z.enum(['person', 'project', 'topic', 'file', 'repo'])).optional(),
      reconcile: z.boolean().optional().describe('Also delete orphaned points for dossiers removed from Drive (default false)'),
      force: z.boolean().optional().describe('Re-embed even content-unchanged dossiers (default false)'),
    },
    async ({ paths, types, reconcile, force }) => {
      const result = await reindexDossiers({ paths, types, reconcile: !!reconcile, force: !!force });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  registerAgentTools(server, z);
  return server;
}

// === Streamable HTTP Transport (stateful) ===
// Not mounted since 0.50.0 — both MCP paths use handleMcpHttpStateless. Kept
// for one release as the rollback, then removed with httpTransports.
const httpTransports = new Map();

export async function handleMcpHttp(req, res) {
  // Set by the auth middleware in server/index.js, which has already validated
  // the bearer against the named-token store. Absent = the middleware was
  // bypassed; fail closed rather than serve an unidentified caller.
  const principal = req.mcpPrincipal;
  if (!principal) {
    return res.status(401).json({ error: 'MCP requires an identified named token' });
  }

  // Check for existing session
  const sessionId = req.headers['mcp-session-id'];

  if (sessionId && httpTransports.has(sessionId)) {
    const entry = httpTransports.get(sessionId);
    // A session is bound to the token that opened it. Without this, any valid
    // token could attach to another token's session and inherit its tool set —
    // which would hand a narrowly-scoped token the scopes of a broad one.
    if (entry.tokenId !== principal.id) {
      return res.status(403).json({ error: 'Session belongs to a different token' });
    }
    await entry.transport.handleRequest(req, res);
    return;
  }

  // A session id we don't hold (the process restarted, or it was closed). The
  // Streamable HTTP spec requires 404 here: that is the client's signal to
  // re-initialize. Falling through instead handed the request to a fresh,
  // uninitialized transport, which answers 400 "Server not initialized" — and
  // clients don't recover from a 400, so every deploy stranded the claude.ai
  // connector until it was reconnected by hand.
  if (sessionId) {
    return res.status(404).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Session not found' }, id: null });
  }

  // New session — stateful: the SDK issues an Mcp-Session-Id on initialize and
  // routes subsequent tools/call requests back to this same initialized transport.
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (sid) => {
      httpTransports.set(sid, { transport, tokenId: principal.id });
    },
  });

  const server = createMcpServer({ scopes: principal.scopes || null, caller: principal.name });

  transport.onclose = () => {
    const sid = transport.sessionId;
    if (sid) httpTransports.delete(sid);
  };

  await server.connect(transport);
  await transport.handleRequest(req, res);
}

// === Stateless Streamable HTTP (/mcp/http and /mcp/http-stateless) ===
// A fresh server + transport per request: no Mcp-Session-Id, nothing held in
// memory, so a deploy restart is invisible to clients and every request is
// authorised (and scope-gated) on its own token — there is no session to
// hijack. Served /mcp/http-stateless alone from 0.49.0 until claude.ai, Claude
// Code, Codex and Grok each showed a real tools/call on it in the nginx log;
// since 0.50.0 it serves /mcp/http too. The 2026-07-28 MCP spec removes
// protocol sessions altogether (SEP-2567/2575); this is the SDK's stateless
// mode on the current 2025-11-25 protocol, not that spec.
export async function handleMcpHttpStateless(req, res) {
  const principal = req.mcpPrincipal;
  if (!principal) {
    return res.status(401).json({ error: 'MCP requires an identified named token' });
  }
  // GET = the client's standalone server→client stream. The spec allows either
  // an SSE stream or 405. Codex (codex-mcp-client 0.162.0-alpha) treats both
  // the SDK's 406 and a correct 405 as an auth failure and drops into OAuth
  // discovery ("Authenticate", 2026-10-09), so take the other spec branch: an
  // open SSE stream that never carries a message (stateless = nothing to push),
  // only keep-alive comments so proxies don't cut it. No state is held.
  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write(': stateless — no server-initiated messages\n\n');
    const ping = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => clearInterval(ping));
    return;
  }
  if (req.method !== 'POST') {
    res.set('Allow', 'GET, POST');
    return res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed' }, id: null });
  }
  const server = createMcpServer({ scopes: principal.scopes || null, caller: principal.name });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => {
    transport.close();
    server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res);
}

