# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Before starting work
- Read `ROADMAP.md` for current priorities and what's built
- Update `ROADMAP.md` as you complete steps or hit blockers
- **Deploying?** Read `DEPLOYMENT.md` first.

## Commands

### Server (from repo root)
```bash
docker compose up -d              # start Qdrant
npm run init                      # one-time: create Qdrant collection
npm start                         # start Express server (runs from server/)
```

### Client (from client/)
```bash
npm run dev                       # Vite dev server with HMR
npm run build                     # production build → client/dist/
```

### Environment setup
Copy `.env.example` to `server/.env`. Key vars: `GOOGLE_API_KEY` (Gemini), `ANTHROPIC_API_KEY` (Haiku), `CAPTURE_SECRET`, Google Drive service account + OAuth2 creds. Run `scripts/get-drive-token.js` to generate the OAuth2 refresh token.

### Dependency management
Root `package.json` and `server/package.json` have separate dependency trees (no workspaces). Client has its own `package.json` too. Agent code imports from server's `node_modules` via relative paths.

## Architecture

- **Plain JavaScript** — Node.js ESM, no TypeScript, no build step for server
- **Qdrant** (Docker) — 3072-dim Cosine HNSW, collection: `thoughts`
- **Gemini** `gemini-embedding-001` for embeddings
- **Claude Haiku** for metadata extraction (people, topics, projects, type, title, action_items)
- **One Express server** — HTTP routes + MCP over SSE/Streamable HTTP + static React UI
- **Google Drive** export for Obsidian sync

### Google auth
- **Server** (`server/google-auth.js`): service account for Drive reads. Uses `GOOGLE_SERVICE_ACCOUNT_PATH`.
- **Agent** (`agent/google-auth.js`): OAuth2 for Gmail, Calendar, YouTube. Uses `GOOGLE_DRIVE_CLIENT_ID/SECRET/REFRESH_TOKEN`.
- **Drive writes** (`server/drive-context.js`): OAuth2, same refresh token.

## One backend, two interfaces

Route files export an Express router (default) and a named function for core logic. MCP tools in `server/mcp.js` call these functions directly — no HTTP hop. React UI calls routes via fetch.

## Key patterns

- **Capture pipeline**: text → parallel [embedding + metadata extraction] → Qdrant upsert. Context-aware: `server/drive-context.js` reads People/Projects from Drive. `server/context.json` has `not_people` exclusions.
- **Obsidian export**: full vault rebuild (not incremental). Deletes all .md, rewrites from Qdrant.
- **Delete**: `DELETE /thoughts/:id` lives in `server/routes/recent.js`.
- **Auth**: All API and MCP routes require `Authorization: Bearer <CAPTURE_SECRET>`. Static files (React SPA) are open — token gate in the client. MCP stdio has no auth (local only).
- **MCP**: Streamable HTTP only (`/mcp/http`). Each connection gets its own McpServer.

## MCP tools

Core: `server/mcp.js` — `capture_thought`, `search_brain`, `list_recent`, `brain_stats`, `rebuild_obsidian_vault`.

Agent: `agent/register.js` — `get_fireflies_transcripts`, `get_youtube_likes`, `get_gmail_threads`, `get_calendar_events`, `get_event_context`, `get_task_context`, `manage_drafts`.

**Stdio: `server/mcp-stdio.js` duplicates tool registrations — any MCP tool change must be made in BOTH `mcp.js` and `mcp-stdio.js`.**

Draft workflow: `manage_drafts` stores in-memory (`agent/drafts/store.js`). `approve` calls `captureThought`.

## Chrome extension

`extension/` — Manifest v3 "Save to Brain" web clipper. Calls `/capture` and `/search` via HTTP.

## Cron & scripts

- `cron/export.js` — hourly Obsidian vault export
- `scripts/init-collection.js` — one-time Qdrant setup (`npm run init`)
- `scripts/get-drive-token.js` — OAuth2 refresh token flow

## Client

Vite + React 19 + Tailwind 3. Components in `client/src/components/`. Tab-based navigation in `App.jsx`.

## Production

Hetzner CX22 at `brain.beliczki.hu`. pm2 + nginx reverse proxy on port 3000. See `DEPLOYMENT.md` for deploy steps, known gotchas (OOM during build, pm2 cwd, zod v3 requirement).
