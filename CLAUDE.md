# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Before starting work
- Read `tasks.md` for current progress, blockers, and decisions
- Update `tasks.md` as you complete steps or hit blockers

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

## Architecture

- **Plain JavaScript** — Node.js ESM (`"type": "module"`), no TypeScript, no build step for server
- **Qdrant** (Docker) for vector storage — 3072-dim Cosine HNSW, collection name: `thoughts`
- **Google Gemini** `gemini-embedding-001` for embeddings (3072 dims)
- **Claude Haiku** for metadata extraction (people, topics, projects, type, title, action_items)
- **One Express server** serving HTTP routes + MCP over SSE/Streamable HTTP + static React UI
- **Google Drive** export for Obsidian sync (OAuth2 for writes, service account for reads)
- **Hetzner CX22** — production at `brain.beliczki.hu`, one Docker Compose stack

## One backend, two interfaces

HTTP routes are the source of truth. Route files export both an Express router (default) and a named function for the core logic (e.g., `searchThoughts`, `captureThought`). MCP tools in `server/mcp.js` call these exported functions directly — no HTTP hop. React UI calls the same routes via fetch.

## Key patterns

- **Capture pipeline**: text → parallel [Gemini embedding + Haiku metadata extraction] → Qdrant upsert. Metadata extraction is context-aware: `server/drive-context.js` reads People/Projects folders from Google Drive, `server/context.json` has exclusion lists.
- **Obsidian export**: full vault rebuild (not incremental). Deletes all .md in `customBrain/` subfolder, rewrites everything from Qdrant. YAML frontmatter contains Obsidian wikilinks for people/projects.
- **Auth**: `POST /capture` requires Bearer token matching `CAPTURE_SECRET` env var. Other routes are open.
- **MCP**: Two transports — SSE legacy (`GET /mcp` + `POST /mcp/messages`) and Streamable HTTP modern (`ALL /mcp/http`). Each connection gets its own McpServer instance.

## Client

Vite + React 19 + Tailwind 3. Components in `client/src/components/`. No routing library — tab-based navigation in `App.jsx`. API base URL comes from Vite proxy or direct fetch to server origin.
