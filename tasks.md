# customBrain — Project State Document
## For conductor handoff — 2026-03-16

---

## Git State
- **Repo**: https://github.com/beliczki/customBrain
- **Branch**: `main`
- **Last commit**: `1ec3571` — "Initial build: Open Brain — self-owned AI memory system"
- **Uncommitted changes** (4 files, UI polish after initial commit):
  - `client/index.html` — title changed to "customBrain"
  - `client/src/App.jsx` — heading changed to "customBrain"
  - `client/src/components/Recent.jsx` — title displayed uppercase bold
  - `client/src/components/Search.jsx` — reformatted to match Recent layout (labeled property groups, title, projects)

---

## What Was Built (vs todo.md)

### Phase 1: Qdrant + Docker Setup — DONE
- [x] `docker-compose.yml` — Qdrant + server services
- [x] `Dockerfile` — Node 20 alpine
- [x] `scripts/init-collection.js` — thoughts collection, 3072 dims, Cosine, payload index on created_at
- **Deviation**: todo said `gemini-embedding-exp-03-07` — that model doesn't exist. Using `gemini-embedding-001` (same as bizi project, confirmed working at 3072 dims)

### Phase 2: Server Core Helpers — DONE
- [x] `server/qdrant.js` — upsertPoint, searchVector, scrollRecent, getAllPayloads, scrollFiltered, deletePoint
- [x] `server/embeddings.js` — embedText via Gemini gemini-embedding-001
- [x] `server/metadata.js` — extractMetadata via Claude Haiku
- **Added beyond todo**:
  - `server/context.json` — local context for metadata extraction (not_people list: Gábor=AI assistant, Vanda=Telekom bot)
  - `server/drive-context.js` — reads People/ and Projects/ folders from Google Drive vault at capture time, passes known names to Claude for accurate property assignment
  - Metadata now extracts `title` (2-3 word short title) and `projects` (matched against vault's Projects folder)
  - Language-aware: responds in same language as input (Hungarian → Hungarian metadata)

### Phase 3: HTTP Routes — DONE
- [x] `POST /capture` — bearer auth, embed + metadata in parallel, upserts to Qdrant
- [x] `GET /search?q=&limit=` — semantic search
- [x] `GET /recent?limit=` — ordered by created_at desc
- [x] `GET /stats` — counts by type, top topics, daily frequency
- [x] `POST /export` — **vault rebuild** (not incremental export)
- [x] `DELETE /thoughts/:id` — delete a thought from Qdrant
- [x] `server/index.js` — Express app with CORS, JSON, all routes, MCP SSE, static file serving
- **Added beyond todo**:
  - DELETE endpoint (not in original todo)
  - Capture now stores: text, title, people, topics, projects, type, action_items, created_at

### Phase 4: MCP Server — DONE
- [x] `server/mcp.js` — MCP over SSE transport at /mcp
- Tools: `search_brain`, `list_recent`, `brain_stats`, `rebuild_obsidian_vault`
- **Deviation**: `export_to_obsidian` renamed to `rebuild_obsidian_vault` — reflects actual behavior (full rebuild, not incremental export)
- **Not yet tested**: MCP connection from Claude Desktop or Claude Code

### Phase 5: Obsidian Export (Google Drive) — DONE (with significant changes)
- [x] Google Drive integration working
- [x] Vault rebuild: deletes all .md files in customBrain subfolder, writes all thoughts fresh
- [x] `cron/export.js` — standalone script for hourly export
- **Major deviations from todo**:
  - **OAuth2 instead of service account** for file creation — Google changed policy in 2024, service accounts can't create files on personal Drive (storageQuotaExceeded). Service account still used for reading People/Projects folders.
  - **Vault rebuild model** instead of incremental export — no exported_at tracking needed, Qdrant is source of truth
  - **Writes to `customBrain/` subfolder** inside the `_customBrain` Drive folder (not root)
  - **YAML frontmatter contains wikilinks**: `people: [[../People/Pityesz|Pityesz]]`, `projects: [[../Projects/Bizi|Bizi]]` — Obsidian renders these as clickable links in Properties view and shows connections in Graph view
  - **Date in body**: each thought has its capture date formatted in Hungarian at the top of the body
  - **Related thoughts section**: thoughts linked to each other via shared people/topics/projects (wikilinks in body)
  - **Filename from title**: if Claude generated a title, it's used as the .md filename instead of date-slug

### Phase 6: React UI — DONE
- [x] Vite + React + Tailwind, all components built
- [x] Capture: textarea + secret input, shows metadata confirmation
- [x] Search: semantic search with labeled property groups (Type, Topics, Projects, People, Actions), title in uppercase
- [x] Recent: scrollable feed with labeled properties, title in uppercase bold, Delete button (dustbin icon + "Delete" text)
- [x] Stats: total count, by type, top topics
- [x] Export: trigger vault rebuild, shows count + filenames
- [x] Static files served from Express
- **Page title**: "customBrain" (changed from "Open Brain")

### Phase 7: Docs — DONE
- [x] `.env.example`
- [x] `README.md`
- [x] `CLAUDE.md` — architecture notes + "read tasks.md" instruction
- [x] `.gitignore` — .env, service-account.json, client_secret*.json, node_modules, client/dist, package-lock.json

---

## Environment (localhost — current working state)

### Running services
- **Qdrant**: Docker Desktop, port 6333, collection `thoughts` initialized
- **Server**: `node server/index.js`, port 3000
- **Restart command**: `pkill -f "node index.js"; cd ~/customBrain/server && node index.js &`

### Configured keys (in server/.env)
- `QDRANT_URL=http://localhost:6333`
- `GOOGLE_API_KEY` — from bizi project (Gemini embeddings)
- `ANTHROPIC_API_KEY` — from bizi project (Haiku metadata)
- `CAPTURE_SECRET=test-secret-123` (change for production!)
- `GOOGLE_DRIVE_FOLDER_ID` — `_customBrain` shared folder
- `GOOGLE_DRIVE_REFRESH_TOKEN` — OAuth2 token for beliczki.robert@gmail.com
- `GOOGLE_DRIVE_CLIENT_ID` / `GOOGLE_DRIVE_CLIENT_SECRET` — OAuth2 from custombrain GCP project
- `GOOGLE_SERVICE_ACCOUNT_PATH=./service-account.json` — messagingmatrix SA (reads People/Projects)

### Google Cloud project: `custombrain` (project 397420339784)
- Drive API: enabled
- OAuth consent screen: testing mode, beliczki.robert@gmail.com as test user
- OAuth2 client: "customBrain-client" (web application type), redirect URI: http://localhost:3001/callback

### Obsidian vault
- Location: `_customBrain` folder on Google Drive (shared with service account)
- Structure: `People/`, `Projects/`, `customBrain/` (brain dump goes here), `Agaurg/`
- Google Drive desktop app mounted locally → Obsidian points at it
- Wikilinks working: People and Projects properties link to entity .md files

---

## What's NOT Done / Next Steps

### Hetzner deployment — 90% DONE (2026-03-16)
- [x] Hetzner CX22 provisioned: `46.224.60.159`, domain: `brain.beliczki.hu`
- [x] Docker + Qdrant running, collection initialized
- [x] Repo cloned, server deps installed, client built
- [x] Production .env with real CAPTURE_SECRET: `0be0c7a00f2f3c3779cec85c406ecb784bf6023900faf6cd`
- [x] Nginx reverse proxy configured for brain.beliczki.hu
- [x] Server running via nohup (http://brain.beliczki.hu works)
- [ ] **HTTPS certbot** — DNS propagation pending, run tomorrow morning (2026-03-17):
  ```bash
  ssh -i ~/.ssh/hetzner_customBrain root@46.224.60.159 'certbot --nginx -d brain.beliczki.hu --non-interactive --agree-tos -m beliczki.robert@gmail.com'
  ```
- [ ] **Crontab setup** — `cron/export.js` exists but no system crontab configured
- [ ] **Firewall** — lock down Qdrant 6333 to internal only
- [ ] **Process manager** — replace nohup with systemd service for auto-restart

### Remaining tasks
- [ ] **MCP testing** — server exposes /mcp SSE endpoint but not yet connected to Claude Desktop or Claude Code
- [ ] **P1a** — Time decay in search scoring
- [ ] **P3** — capture_thought MCP tool

### Known issues
- **Embedding model mismatch**: todo.md says `gemini-embedding-exp-03-07` but code uses `gemini-embedding-001` (the experimental model doesn't exist)
- **Old thoughts lack title/projects**: thoughts captured before the title/projects feature was added don't have these fields — they show up without a title in Recent/Search
- **Service account null bytes**: files copied via Microsoft RDC arrive as null-byte-padded files — required manual cleanup with python3 stripping. The service-account.json in server/ is now clean.
- **Docker Compose plugin**: had to install via `brew install docker-compose` and configure `~/.docker/config.json` with `cliPluginsExtraDirs`
- **Google Drive file ownership**: service account-created folders (People, Projects, Agaurg) are owned by the SA — OAuth2 user can see them but can't modify. New files created via OAuth2 are owned by the user.

### Ideas discussed but not built
- `capture_thought` MCP tool — so Claude can capture directly during conversation
- Edit/update thought endpoint — fix wrong metadata on existing thoughts
- Fireflies webhook integration
- Email forwarding capture
- WhatsApp/Telegram bot capture
- Browser extension "Save to Brain"
- iOS Shortcut for voice capture
- Two-way Obsidian sync (Obsidian edits → Qdrant)

---

## Architecture Decisions Made During Build

| Decision | Why | Deviation from todo |
|----------|-----|-------------------|
| `gemini-embedding-001` not `exp-03-07` | Experimental model doesn't exist in API | Yes |
| OAuth2 for Drive writes | Service accounts can't create files on personal Gmail (Google policy 2024) | Yes — todo said service account |
| Vault rebuild not incremental export | Simpler, no exported_at tracking, Qdrant is source of truth | Yes |
| Wikilinks in YAML frontmatter | Obsidian renders property values as clickable links + Graph view connections | Added feature |
| Title generation by Claude | 2-3 word title used as Obsidian filename instead of date-slug | Added feature |
| Vault-aware metadata (drive-context.js) | Claude reads People/ and Projects/ from Drive to assign accurate properties | Added feature |
| context.json for not_people | Prevents AI assistants (Gábor, Vanda) from being tagged as people | Added feature |
| Hungarian language matching | Metadata responds in input language | Added feature |
| Delete endpoint | Not in todo but essential for managing mistakes | Added feature |
