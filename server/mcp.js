import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAgentTools } from '../agent/register.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { searchThoughts } from './routes/search.js';
import { getRecent, updateThought } from './routes/recent.js';
import { getStats } from './routes/stats.js';
import { exportThoughts } from './routes/export.js';
import { captureThought } from './routes/capture.js';
import { getConnectionStats, getById } from './qdrant.js';
import { findOverconnected } from './brain-hygiene.js';
import { suggestCleanedMetadata } from './metadata.js';
import { getVaultContext } from './drive-context.js';

export function createMcpServer() {
  const server = new McpServer({
    name: 'customBrain',
    version: '1.0.0',
    icons: [{ src: 'https://brain.beliczki.hu/favicon-96x96.png', sizes: ['96x96'], mimeType: 'image/png' }],
  });

  server.tool(
    'capture_thought',
    'Capture a new thought into the brain — extracts metadata (people, topics, projects, type, action items) automatically. If a near-duplicate exists and contradicts, the old thought is archived.',
    { text: z.string(), conflict_threshold: z.number().min(0).max(1).optional().describe('Cosine similarity threshold for conflict detection (default 0.85)') },
    async ({ text, conflict_threshold }) => {
      const opts = conflict_threshold != null ? { conflictThreshold: conflict_threshold } : {};
      const result = await captureThought(text, opts);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'search_brain',
    'Semantically search your brain for thoughts matching a query',
    { query: z.string(), limit: z.number().optional() },
    async ({ query, limit }) => {
      const results = await searchThoughts(query, limit ?? 5);
      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
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
    'rebuild_obsidian_vault',
    'Rebuild the full Obsidian vault on Google Drive — deletes old files and writes all thoughts as linked markdown with YAML frontmatter',
    {},
    async () => {
      const results = await exportThoughts();
      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    }
  );

  registerAgentTools(server, z);
  return server;
}

// === Streamable HTTP Transport ===
const httpTransports = new Map();

export async function handleMcpHttp(req, res) {
  // Check for existing session
  const sessionId = req.headers['mcp-session-id'];

  if (sessionId && httpTransports.has(sessionId)) {
    const transport = httpTransports.get(sessionId);
    await transport.handleRequest(req, res);
    return;
  }

  // New session
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  const server = createMcpServer();

  transport.onclose = () => {
    const sid = transport.sessionId;
    if (sid) httpTransports.delete(sid);
  };

  await server.connect(transport);

  if (transport.sessionId) {
    httpTransports.set(transport.sessionId, transport);
  }

  await transport.handleRequest(req, res);
}
