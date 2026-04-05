import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAgentTools } from '../agent/register.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { searchThoughts } from './routes/search.js';
import { getRecent } from './routes/recent.js';
import { getStats } from './routes/stats.js';
import { exportThoughts } from './routes/export.js';
import { captureThought } from './routes/capture.js';

export function createMcpServer() {
  const server = new McpServer({
    name: 'customBrain',
    version: '1.0.0',
    icons: [{ src: 'https://brain.beliczki.hu/favicon-32x32.png', sizes: ['32x32'], mimeType: 'image/png' }],
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
