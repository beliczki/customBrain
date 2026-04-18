# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Before starting work
- Read `ROADMAP.md` for current priorities and what's built
- Update `ROADMAP.md` as you complete steps or hit blockers
- **Deploying?** Read `DEPLOYMENT.md` first.

## Versioning
Semver (`major.minor.patch`), currently `0.3.0`. Versions sync across root `package.json`, `server/package.json`, `client/package.json`, `extension/manifest.json`. Bump all four together and log the change in `CHANGELOG.md`. `0.x.y` = pre-1.0, breaking changes allowed on minor bumps.

**After finishing any shipped work — a completed plan, a patch, a new cron/route/MCP tool, a dependency upgrade — remind the user to bump the version before wrapping up.** Don't bump silently. Surface a suggestion in the form:

> Suggested bump: `0.3.0` → `0.3.1` (patch). Reason: <one sentence>.

Heuristic for the suggestion (at `0.x.y`):
- **patch** (`0.3.0` → `0.3.1`): bug fix, doc-only change, internal refactor with no behaviour change, env var rename with backwards-compatible fallback.
- **minor** (`0.3.0` → `0.4.0`): new feature or capture path, new MCP tool, new HTTP route, new Qdrant payload field, payload migration, or any user-visible behaviour change. Breaking changes are allowed on minor bumps while pre-1.0.
- **major** (`0.x.y` → `1.0.0`): reserved for graduating to "stable daily use" — user decides, never auto-suggest.

If the finished work is ambiguous (touches multiple categories), propose the higher bump and explain both options in one line — let the user decide.

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

### MCP stdio (local Claude Desktop)
```bash
node server/mcp-stdio.js            # connects Claude Desktop without Express
```

### Environment setup
Copy `.env.example` to `server/.env`. Key vars: `GOOGLE_API_KEY` (Gemini), `ANTHROPIC_API_KEY` (Haiku), `CAPTURE_SECRET`, Google Drive service account + OAuth2 creds. Run `scripts/get-drive-token.js` to generate the OAuth2 refresh token. Note: `.env.example` is incomplete — OAuth2 vars (`GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, `GOOGLE_DRIVE_REFRESH_TOKEN`) needed by agent tools and Drive writes are not listed.

### Dependency management
Root `package.json` and `server/package.json` have separate dependency trees (no workspaces). Client has its own `package.json` too. Agent code imports from server's `node_modules` via relative paths.

### Tests / lint
No `test` or `lint` scripts defined in any package.json. Verification is manual.

## Architecture

- **Plain JavaScript** — Node.js ESM, no TypeScript, no build step for server
- **Qdrant** (Docker) — 3072-dim Cosine HNSW, collection: `thoughts`
- **Gemini** `gemini-embedding-001` for embeddings
- **Claude Haiku** for metadata extraction (people, topics, projects, type, title, action_items)
- **One Express server** — HTTP routes + MCP over Streamable HTTP + static React UI
- **Google Drive** export for Obsidian sync

### Google auth
- **Server** (`server/google-auth.js`): service account for Drive reads. Uses `GOOGLE_SERVICE_ACCOUNT_PATH`.
- **Agent** (`agent/google-auth.js`): OAuth2 for Gmail, Calendar, YouTube. Uses `GOOGLE_DRIVE_CLIENT_ID/SECRET/REFRESH_TOKEN`.
- **Drive writes** (`server/drive-context.js`): OAuth2, same refresh token.
- **Vault context reads** (`server/drive-context.js`): service account. OAuth2 can't see all files in People/Projects folders — SA sees everything regardless of owner. This bit us: OAuth2 missed Me.md, Pityesz.md, Agaurg.md and 6 project files.

### People aliases
- People `.md` files on Drive can contain `alias: <name>` lines (e.g., `Me.md` has `alias: Beliczki Róbert` and `alias: Robi`)
- `drive-context.js` reads these at capture time, builds an alias→canonical map
- `metadata.js` injects aliases into the Haiku prompt AND does deterministic post-processing to normalize the `people` array
- Aliases are the single source of truth on Drive — no local config needed

## HTTP API

All routes behind auth middleware. Route files in `server/routes/`:

| Endpoint | Method | File | Core function |
|----------|--------|------|---------------|
| `/capture` | POST | `capture.js` | `captureThought` |
| `/search` | POST | `search.js` | `searchThoughts` |
| `/recent` | GET | `recent.js` | `getRecent` |
| `/thoughts/:id` | DELETE | `recent.js` | — |
| `/stats` | GET | `stats.js` | `getStats` |
| `/export` | POST | `export.js` | `exportThoughts` |
| `/mcp/http` | ALL | `mcp.js` | `handleMcpHttp` |

## One backend, two interfaces

Route files export an Express router (default) and a named function for core logic. MCP tools in `server/mcp.js` call these functions directly — no HTTP hop. React UI calls routes via fetch.

## Key patterns

- **Capture pipeline**: text → parallel [embedding + metadata extraction] → Qdrant upsert. Context-aware: `server/drive-context.js` reads People/Projects from Drive (via SA) including `alias:` lines from People .md files. Post-processing resolves aliases to canonical names. Near-duplicate detection (cosine > 0.85): archives old thought (`status: archived`), links new thought via `supersedes`. Semantic contradiction detection is limited — embeddings measure topic similarity, not logical opposition.
- **Obsidian export**: full vault rebuild (not incremental). Deletes all .md, rewrites from Qdrant.
- **Delete**: `DELETE /thoughts/:id` lives in `server/routes/recent.js`.
- **Auth**: All API and MCP routes require `Authorization: Bearer <CAPTURE_SECRET>` (also accepts `?token=` query param). Static files (React SPA) are open — token gate in the client. MCP stdio has no auth (local only).
- **SPA routing**: `server/index.js` serves `client/dist/` as static, with a wildcard `GET *` that sends `index.html` for any path not matching an API route. API routes are hardcoded in the wildcard guard (including `/fireflies-webhook`) — new routes need to be added there too.
- **MCP**: Streamable HTTP only (`/mcp/http`). Each connection gets its own McpServer.

## MCP tools

Core: `server/mcp.js` — `capture_thought`, `search_brain`, `list_recent`, `brain_stats`, `rebuild_obsidian_vault`.

Agent: `agent/register.js` — `get_fireflies_transcripts`, `get_youtube_likes`, `get_gmail_threads`, `get_calendar_events`, `get_event_context`, `get_task_context`, `manage_drafts`. Each tool implemented in its own file under `agent/tools/` (e.g., `calendar.js`, `gmail.js`, `context.js`).

**Stdio: `server/mcp-stdio.js` duplicates tool registrations — any MCP tool change must be made in BOTH `mcp.js` and `mcp-stdio.js`.**

Draft workflow: `manage_drafts` stores in-memory (`agent/drafts/store.js`). `approve` calls `captureThought`.

## Chrome extension

`extension/` — Manifest v3 "Save to Brain" web clipper. Calls `/capture` and `/search` via HTTP.

## Cron & scripts

- `cron/export.js` — hourly Obsidian vault export
- `cron/youtube-intake.js` — polls YouTube liked playlist, auto-captures new items (source='youtube', source_id=videoId). Runs every 30 min on Hetzner.
- `cron/gmail-intake.js` — polls Gmail for `label:brain -label:brain/captured`, cleans boilerplate via `agent/tools/gmail-clean.js`, captures, adds `brain/captured` label. Runs every 10 min.
- `scripts/init-collection.js` — idempotent Qdrant setup (`npm run init`). Creates collection if missing, ensures payload indexes (`created_at`, `source`, `source_id`).
- `scripts/get-drive-token.js` — OAuth2 refresh token flow (also duplicated at `server/get-drive-token.js`)

## Auto-intake paths

Three sources auto-capture with zero approval gate. All share the `source` + `source_id` payload convention for idempotent dedup (via `findBySourceId` in `server/qdrant.js`).

| Source | Trigger | source_id | Entry point |
|--------|---------|-----------|-------------|
| `fireflies` | Webhook (`POST /fireflies-webhook?secret=...`) | Fireflies `meetingId` | `server/routes/fireflies-webhook.js` |
| `youtube` | Cron (30 min) | YouTube `videoId` | `cron/youtube-intake.js` |
| `gmail` | Cron (10 min) | Gmail `threadId` | `cron/gmail-intake.js` |

All three call `captureThought(text, { source, sourceId })`, which early-returns `{ duplicate: true }` if the `(source, source_id)` pair already exists in Qdrant — skipping embedding + Haiku to save cost.

### Payload conventions
- `source`: `fireflies` | `youtube` | `gmail` | `manual` (default; UI + Chrome extension + MCP tool)
- `source_id`: provider-specific ID or `null` for manual captures. Never reused across sources.

### Gmail body cleaner
`agent/tools/gmail-clean.js` — two-stage preprocessor run before capture. Stage 1: deterministic regex strips known boilerplate (confidentiality footers, unsubscribe, signatures) in English + Hungarian. Stage 2: Haiku content extractor only if body > 1500 chars remain. Returns `__NO_CONTENT__` for pure-boilerplate messages; the cron adds a `brain/empty` label for audit instead of capturing.

## Client

Vite + React 19 + Tailwind 3. Components in `client/src/components/`. Tab-based navigation in `App.jsx`.

## Production

Hetzner CX22 at `brain.beliczki.hu`. pm2 + nginx reverse proxy on port 3000. See `DEPLOYMENT.md` for deploy steps, known gotchas (OOM during build, pm2 cwd, zod v3 requirement).

### SSH access
You have SSH access to the production host:
```bash
ssh -i ~/.ssh/id_ed25519_hetzner root@brain.beliczki.hu
```
Repo path on server: `/root/customBrain`. Each SSH command still needs the user's per-action approval (production reads/writes are never blanket-authorized). Default to the **least invasive read** first — confirm state before changing anything — and always follow the `feedback_hetzner_restart.md` rule on restart: `pm2 stop all` + `fuser -k 3000/tcp` BEFORE `pm2 start`.
