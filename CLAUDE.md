# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Before starting work
- Read `ROADMAP.md` for current priorities and what's built
- Update `ROADMAP.md` as you complete steps or hit blockers

## Commands

### Server (from repo root)
```bash
docker compose up -d              # start Qdrant
npm run init                      # one-time: create Qdrant collection
npm start                         # start Express server (runs from server/)
```

### Client (from client/)
```bash
npm install                       # first time only
npm run dev                       # Vite dev server with HMR
npm run build                     # production build → client/dist/
```

The Express server serves `client/dist/` as static files in production. No separate client server needed after build.

### Local development
Server env lives in `server/.env` (copy from `.env.example`). Qdrant must be running on port 6333. Server runs on port 3000.

### Dependency management
Root `package.json` and `server/package.json` have separate dependency trees (no workspaces). Run `npm install` in both. Client has its own `package.json` too. Agent code has no `package.json` — it imports from server's `node_modules` via relative paths.

### Production (Hetzner)
pm2 manages the server process. Restart with `pm2 restart all --cwd /root/customBrain/server`. Nginx reverse-proxies port 3000.

## Architecture

- **Plain JavaScript** — Node.js ESM (`"type": "module"`), no TypeScript, no build step for server
- **Qdrant** (Docker) for vector storage — 3072-dim Cosine HNSW, collection name: `thoughts`
- **Google Gemini** `gemini-embedding-001` for embeddings (3072 dims)
- **Claude Haiku** for metadata extraction (people, topics, projects, type, title, action_items)
- **One Express server** serving HTTP routes + MCP over SSE/Streamable HTTP + static React UI
- **Google Drive** export for Obsidian sync (OAuth2 for writes, service account for reads)
- **Hetzner CX22** — production at `brain.beliczki.hu`, one Docker Compose stack

### Two Google auth mechanisms

- **Server** (`server/google-auth.js`): service account for Drive reads (vault context for metadata extraction). Uses `GOOGLE_SERVICE_ACCOUNT_PATH`.
- **Agent** (`agent/google-auth.js`): OAuth2 client for user-scoped APIs — Gmail, Calendar, YouTube. Uses `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, `GOOGLE_DRIVE_REFRESH_TOKEN`.
- **Drive writes** (`server/drive-context.js`): also OAuth2, for Obsidian export. Same refresh token.

## One backend, two interfaces

HTTP routes are the source of truth. Route files export both an Express router (default) and a named function for the core logic (e.g., `searchThoughts`, `captureThought`). MCP tools in `server/mcp.js` call these exported functions directly — no HTTP hop. React UI calls the same routes via fetch.

## Key patterns

- **Capture pipeline**: text → parallel [Gemini embedding + Haiku metadata extraction] → Qdrant upsert. Metadata extraction is context-aware: `server/drive-context.js` reads People/Projects folders from Google Drive to provide known names/projects to Haiku. `server/context.json` has `not_people` exclusion lists (prevents AI assistant names like "Gábor" from being tagged as people).
- **Obsidian export**: full vault rebuild (not incremental). Deletes all .md in `customBrain/` subfolder, rewrites everything from Qdrant. YAML frontmatter contains Obsidian wikilinks for people/projects.
- **Delete**: `DELETE /thoughts/:id` lives in `server/routes/recent.js` (not its own route file).
- **Auth**: `POST /capture` requires Bearer token matching `CAPTURE_SECRET` env var. Other routes (including delete) are open.
- **MCP**: Two transports — SSE legacy (`GET /mcp` + `POST /mcp/messages`) and Streamable HTTP modern (`ALL /mcp/http`). Each connection gets its own McpServer instance.

## MCP tools

Core brain tools are registered in `server/mcp.js`: `capture_thought`, `search_brain`, `list_recent`, `brain_stats`, `rebuild_obsidian_vault`. These call the named exports from route files directly.

Agent tools live in `agent/` directory (isolated from server code). `agent/register.js` exports `registerAgentTools(server, z)` — receives the zod instance from the caller to avoid dual-instance issues. Tools: `get_fireflies_transcripts`, `get_youtube_likes`, `get_gmail_threads`, `get_calendar_events`, `get_event_context`, `get_task_context`, `manage_drafts`.

Draft workflow: `manage_drafts` stores drafts in-memory (`agent/drafts/store.js`). `approve` action calls `captureThought` to persist to Qdrant.

## Chrome extension

`extension/` — Manifest v3 "Save to Brain" web clipper. Calls `/capture` and `/search` directly via HTTP. Load unpacked in `chrome://extensions`.

## MCP stdio transport

`server/mcp-stdio.js` is a standalone stdio MCP server (no Express). Used for local Claude Desktop connections without the HTTP server. Tool registrations are duplicated between `mcp.js` (HTTP) and `mcp-stdio.js` (stdio) — changes to tools must be made in both files.

## Cron & scripts

- `cron/export.js` — hourly Obsidian vault export (last 24h). Run via system crontab: `0 * * * * node /app/cron/export.js`
- `scripts/init-collection.js` — one-time Qdrant collection setup (aliased as `npm run init`)
- `scripts/get-drive-token.js` — interactive OAuth2 flow to get Drive/Gmail/Calendar refresh token

## Known deployment gotchas

- **zod must be v3** — zod v4 causes `_zod` property errors with `@modelcontextprotocol/sdk`. The MCP SDK claims v4 support but `zod-to-json-schema` breaks. Keep `zod@3.x` in `server/package.json`.
- **pm2 cwd matters** — pm2 must start with `--cwd /root/customBrain/server` on Hetzner, otherwise `dotenv` can't find `.env` and Qdrant/API calls fail with "fetch failed".
- **express.json() blocks Streamable HTTP** — `/mcp/http` route is excluded from `express.json()` middleware because `StreamableHTTPServerTransport` needs the raw body.
- **Claude Desktop MCP config** — only supports `command`+`args` (stdio), not SSE/HTTP directly. Use `npx mcp-remote https://brain.beliczki.hu/mcp/http` as the command to bridge stdio↔Hetzner.
- **OAuth2 scope expansion** — when adding Google API scopes, must re-run `server/get-drive-token.js` and update the refresh token in `.env` on all environments (local + Hetzner).
- **Dockerfile omits `agent/` and `client/`** — the Dockerfile only copies `server/` and `scripts/`. Since `mcp.js` imports from `../agent/register.js`, the Docker image currently can't serve MCP tools that include agent tools. Client must be pre-built and served separately or the Dockerfile extended.
- **`.env.example` is incomplete** — it only lists base vars. OAuth2 vars (`GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, `GOOGLE_DRIVE_REFRESH_TOKEN`) required by agent tools and Drive writes are not listed.

## Client

Vite + React 19 + Tailwind 3. Components in `client/src/components/`. No routing library — tab-based navigation in `App.jsx`. API base URL comes from Vite proxy or direct fetch to server origin.
