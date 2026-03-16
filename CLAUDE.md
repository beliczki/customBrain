# Open Brain

## Before starting work
- Read `tasks.md` for current progress, blockers, and decisions
- Update `tasks.md` as you complete steps or hit blockers

## Architecture
- **Plain JavaScript** (Node.js, no TypeScript, no build step for server)
- **Qdrant** (Docker) for vector storage — 3072-dim Cosine HNSW
- **Google Gemini** `gemini-embedding-exp-03-07` for embeddings (3072 dims)
- **Claude Haiku** for metadata extraction (people, topics, type, action_items)
- **One Express server** serving HTTP routes + MCP over SSE + static React UI
- **Google Drive** export for Obsidian sync (service account, same pattern as messagingMatrix)
- **Hetzner CX22** — everything runs in one Docker Compose stack

## One backend, two interfaces
HTTP routes are the source of truth. MCP tools call route handlers directly (no HTTP hop). React UI calls the same routes via fetch.

## Key files
- `server/index.js` — Express app, mounts routes + MCP SSE
- `server/qdrant.js` — all Qdrant interactions
- `server/embeddings.js` — Gemini embedding calls
- `server/metadata.js` — Anthropic Haiku metadata extraction
- `server/mcp.js` — MCP server with SSE transport
- `server/routes/` — capture, search, recent, stats, export
- `scripts/init-collection.js` — one-time Qdrant collection setup
- `docker-compose.yml` — Qdrant + server
