# Open Brain — Tasks & Progress

## Status: Server Tested Locally (2026-03-16)

---

## Phase 1: Qdrant + Docker Setup
- [x] `docker-compose.yml` — Qdrant + server services
- [x] `Dockerfile` — Node 20 alpine
- [x] `scripts/init-collection.js` — creates `thoughts` collection (3072 dims, Cosine, HNSW)
- [x] Docker Desktop installed, Qdrant running locally
- [x] Collection initialized, payload index on `created_at`

---

## Phase 2: Server Core Helpers
- [x] `server/package.json` — deps installed
- [x] `server/qdrant.js` — upsertPoint, searchVector, scrollRecent, getAllPayloads, scrollFiltered
- [x] `server/embeddings.js` — embedText via Gemini `gemini-embedding-001`
- [x] `server/metadata.js` — extractMetadata via Claude Haiku

---

## Phase 3: HTTP Routes — ALL TESTED
- [x] `POST /capture` — tested, captures thought with embedding + metadata extraction
- [x] `GET /search?q=&limit=` — tested, semantic search returns results with similarity scores
- [x] `GET /recent?limit=` — tested, returns thoughts ordered by created_at desc
- [x] `GET /stats` — tested, returns counts by type, top topics, daily frequency
- [x] `POST /export` — code written, needs Google Drive service account to test
- [x] `server/index.js` — Express app running on port 3000

---

## Phase 4: MCP Server
- [x] `server/mcp.js` — MCP over SSE, 4 tools calling route handlers directly
- [ ] Test MCP connection from Claude Desktop or Claude Code

---

## Phase 5: Google Drive Export + Cron
- [x] `server/routes/export.js` — code written
- [x] `cron/export.js` — code written
- [ ] Set up Google service account + Drive folder
- [ ] Test export endpoint
- [ ] Add crontab on Hetzner

---

## Phase 6: React UI
- [x] `client/` — Vite + React + Tailwind scaffolding
- [x] `client/src/api.js` — fetch helpers
- [x] Components: Capture, Search, Recent, Stats, Export
- [x] Client deps installed
- [ ] Build and test UI: `cd client && npm run build`

---

## Phase 7: Docs & Config
- [x] `.env.example`
- [x] `README.md`
- [x] `CLAUDE.md`
- [x] `tasks.md`
- [x] `.gitignore`
- [x] Root `package.json` with init/start scripts

---

## Fixes Applied During Testing
- **Embedding model**: `gemini-embedding-exp-03-07` not found → switched to `gemini-embedding-001` (same as bizi, confirmed working)
- **Scripts path**: `init-collection.js` couldn't find deps → added root `package.json` with dotenv + qdrant deps
- **Docker Compose**: needed `brew install docker-compose` + plugin config in `~/.docker/config.json`
- **Docker Desktop**: Rosetta not needed on Apple Silicon → disabled

---

## Next Steps
1. Build React UI: `cd client && npm run build`
2. Test MCP from Claude Desktop/Code
3. Set up Google Drive service account for export
4. Deploy to Hetzner

---

## Architecture Decisions
- **Supabase removed** — not needed, Qdrant stores everything
- **Plain JS** — no TypeScript, no build step for server
- **One backend, two interfaces** — HTTP routes for React + MCP SSE for AI tools
- **Google Drive for Obsidian** — avoids git conflicts, uses service account (same pattern as messagingMatrix)
- **Gemini `gemini-embedding-001`** @ 3072 dims — matches bizi project
- **No vector index dimension limit** — Qdrant handles 3072-dim HNSW natively (pgvector capped at 2000)

---

## Environment
- **Google API Key:** reused from bizi project — configured
- **Anthropic API Key:** reused from bizi project — configured
- **Capture Secret:** `test-secret-123` (change for production)
- **Google Service Account:** reuse from messagingMatrix — not yet configured
- **Hetzner:** CX22 (~€4/month), not yet provisioned
