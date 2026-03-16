import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';
import { searchThoughts } from './routes/search.js';
import { getRecent } from './routes/recent.js';
import { getStats } from './routes/stats.js';
import { exportThoughts } from './routes/export.js';
import { captureThought } from './routes/capture.js';

export function createMcpServer() {
  const server = new McpServer({
    name: 'open-brain',
    version: '1.0.0',
  });

  server.tool(
    'capture_thought',
    'Capture a new thought into the brain — extracts metadata (people, topics, projects, type, action items) automatically',
    { text: z.string() },
    async ({ text }) => {
      const result = await captureThought(text);
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

  return server;
}

// Map of active transports by session ID
const transports = new Map();

export function handleMcpSse(req, res) {
  const server = createMcpServer();
  const transport = new SSEServerTransport('/mcp/messages', res);
  transports.set(transport.sessionId, { server, transport });

  res.on('close', () => {
    transports.delete(transport.sessionId);
  });

  server.connect(transport);
}

export function handleMcpMessage(req, res) {
  const sessionId = req.query.sessionId;
  const session = transports.get(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  session.transport.handlePostMessage(req, res);
}
