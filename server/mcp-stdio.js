import 'dotenv/config';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { searchThoughts, searchThoughtsMulti } from './routes/search.js';
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
import { registerAgentTools } from '../agent/register.js';

const server = new McpServer({
  name: 'customBrain',
  version: '1.0.0',
  icons: [{ src: 'https://brain.beliczki.hu/favicon-96x96.png', sizes: ['96x96'], mimeType: 'image/png' }],
});

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
  'search_brain',
  'Search your brain. Simple: pass query (hybrid dense+BM25, RRF-fused). Advanced: pass queries=[{type:"lex"|"vec",q}] to compose your own retrieval legs — lex is BM25-only (exact words, names, IDs), vec is dense-only (meaning, paraphrase) — fused server-side (RRF k=60). Every hit carries an evidence tag: exact_title | bm25_exact | high_dense | weak_semantic — WHY it surfaced, so you can weigh hits categorically instead of by raw score.',
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
    return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
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
  'Deterministic metadata lookup — zero model calls, zero embeddings. Answers counts / who / when / list-by questions from payload filters alone: thoughts by person, project, topic, type, source, or date range. Use this INSTEAD of search_brain when the question is about metadata ("how many meetings with X?", "what did I capture about project Y in June?") — it is exact and instant. Filters are case-insensitive substrings; combine freely.',
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
  'Find thoughts wrongly linked to many others via over-broad metadata. Sorted by hub_score. Use before suggest_metadata_fix + update_thought to surface brain-hygiene candidates.',
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
  'Rebuild the full Obsidian vault on Google Drive',
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

registerAgentTools(server, z);

const transport = new StdioServerTransport();
await server.connect(transport);
