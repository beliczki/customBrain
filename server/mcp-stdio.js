import 'dotenv/config';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { searchThoughts } from './routes/search.js';
import { getRecent } from './routes/recent.js';
import { getStats } from './routes/stats.js';
import { exportThoughts } from './routes/export.js';
import { captureThought } from './routes/capture.js';
import { registerAgentTools } from '../agent/register.js';

const server = new McpServer({
  name: 'customBrain',
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
  'Rebuild the full Obsidian vault on Google Drive',
  {},
  async () => {
    const results = await exportThoughts();
    return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
  }
);

registerAgentTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
