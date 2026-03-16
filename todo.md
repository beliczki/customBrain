# Open Brain - Owned AI Memory System
# Claude Code Handoff Plan

## Architecture Decision Log
- **Embeddings**: Google `gemini-embedding-exp-03-07` @ 3072 dims
  - Reason: Hungarian agglutinative language needs high-dim nuance
  - OpenAI rejected (user preference)
- **Vector store**: Qdrant (Docker on Hetzner) — supports 3072 dims with full HNSW indexing
  - pgvector/Supabase rejected — 2000 dim HNSW ceiling
  - Local Qdrant rejected — tunneling complexity
- **Language**: Plain JavaScript (Node.js) — no TypeScript, no build step, simpler Hetzner ops
- **Hosting**: Hetzner CX22 (~€4/month) — runs everything in one Docker Compose stack
- **Supabase**: Removed entirely — not needed
- **Obsidian sync**: Hetzner cron → Google Drive API (service account) → Google Drive desktop app mounts locally → Obsidian vault points at mounted folder
  - Git rejected — too many small file conflicts
- **UI**: React app (customBrain) — owned interface hitting the same HTTP routes as MCP
  - MCP and React UI are two consumers of the same backend, not separate systems

## Key Insight: One Backend, Two Interfaces
```
Hetzner Server (Plain JS)
├── POST /capture        ← React UI + curl + any HTTP client
├── GET  /search         ← React UI + MCP tool
├── GET  /recent         ← React UI + MCP tool
├── GET  /stats          ← React UI + MCP tool
├── POST /export         ← React UI + MCP tool + cron
└── /mcp (SSE)           ← Claude Desktop, Claude Code, Cursor, any MCP client
```
MCP tools are thin wrappers around the HTTP routes. Logic written once, exposed twice.

## Repo Structure (customBrain)
```
customBrain/
├── server/
│   ├── package.json
│   ├── index.js               # Express app: mounts all routes + MCP SSE endpoint
│   ├── routes/
│   │   ├── capture.js         # POST /capture
│   │   ├── search.js          # GET /search
│   │   ├── recent.js          # GET /recent
│   │   ├── stats.js           # GET /stats
│   │   └── export.js          # POST /export (→ Google Drive)
│   ├── mcp.js                 # MCP server: thin wrappers calling the same route handlers
│   ├── qdrant.js              # Qdrant client + helper functions
│   ├── embeddings.js          # Google Gemini embedding helper
│   └── metadata.js            # Claude Haiku metadata extraction helper
├── client/                    # React app (customBrain UI)
│   ├── package.json
│   ├── index.html
│   └── src/
│       ├── App.jsx
│       ├── components/
│       │   ├── Capture.jsx    # text input → POST /capture
│       │   ├── Search.jsx     # search box → GET /search, shows results
│       │   ├── Recent.jsx     # GET /recent, scrollable feed
│       │   ├── Stats.jsx      # GET /stats, simple counts/charts
│       │   └── Export.jsx     # trigger POST /export
│       └── api.js             # fetch helpers pointing at Hetzner server
├── scripts/
│   └── init-collection.js     # one-time: creates Qdrant collection
├── cron/
│   └── export.js              # called hourly: POST /export for last 24h
├── docker-compose.yml         # qdrant + server containers
├── Dockerfile                 # Node.js server image
├── .env.example
└── README.md
```

## Todo

### Phase 1: Qdrant + Docker Setup
- [ ] `docker-compose.yml`
  - qdrant service: image qdrant/qdrant, port 6333, persistent volume
  - server service: builds Dockerfile, depends_on qdrant, env_file .env, port 3000
- [ ] `Dockerfile`
  - Node 20 alpine, copy package.json, npm install, copy source, node server/index.js
- [ ] `scripts/init-collection.js`
  - Connect to Qdrant, create `thoughts` collection
  - size=3072, distance=Cosine, HNSW index enabled
  - Run once: `node scripts/init-collection.js`

### Phase 2: Server Core Helpers
- [ ] `server/qdrant.js`
  - Qdrant JS client setup
  - helpers: upsertPoint(vector, payload), searchVector(vector, limit), scrollRecent(limit), getPayloads()
- [ ] `server/embeddings.js`
  - Google Generative AI client
  - embedText(text) → 3072-dim float array using gemini-embedding-exp-03-07
- [ ] `server/metadata.js`
  - Anthropic client (Haiku)
  - extractMetadata(text) → { people[], topics[], type, action_items[] }

### Phase 3: HTTP Routes
- [ ] `server/routes/capture.js`
  - POST /capture { text }
  - Bearer token auth check (CAPTURE_SECRET)
  - calls embeddings.js + metadata.js in parallel
  - upserts to Qdrant via qdrant.js
  - returns { ok, metadata }
- [ ] `server/routes/search.js`
  - GET /search?q=query&limit=5
  - embeds query, vector searches Qdrant
  - returns array of { text, metadata, score }
- [ ] `server/routes/recent.js`
  - GET /recent?limit=10
  - scrolls Qdrant by created_at desc
  - returns array of { text, metadata, created_at }
- [ ] `server/routes/stats.js`
  - GET /stats
  - fetches all payloads, computes counts by type, top topics, daily frequency
  - returns { total, by_type, top_topics, daily_counts }
- [ ] `server/routes/export.js`
  - POST /export { filter_topic?, filter_days? }
  - fetches matching thoughts from Qdrant
  - builds .md files with YAML frontmatter + body
  - uploads to Google Drive via service account
  - returns { ok, exported_count }
- [ ] `server/index.js`
  - Express app, JSON middleware, CORS
  - mounts all routes
  - starts MCP SSE endpoint at /mcp
  - listens on PORT (default 3000)

### Phase 4: MCP Server
- [ ] `server/mcp.js`
  - MCP server over SSE transport
  - Tool: search_brain(query, limit) → calls search route handler directly
  - Tool: list_recent(limit) → calls recent route handler directly
  - Tool: brain_stats() → calls stats route handler directly
  - Tool: export_to_obsidian(filter_topic?, filter_days?) → calls export route handler directly
  - Note: route handlers are plain functions, imported and called directly (no HTTP hop)

### Phase 5: Obsidian Export (Google Drive)
- [ ] Inside `server/routes/export.js` (see Phase 3)
  - Google Drive API via googleapis npm package
  - Auth: service account JSON from env
  - Multipart upload each .md file to GOOGLE_DRIVE_FOLDER_ID
  - Filename format: YYYY-MM-DD-HHmm-slug.md
  - YAML frontmatter: people, topics, type, action_items, captured_at
- [ ] `cron/export.js`
  - Calls export handler for last 24h
  - System crontab on Hetzner: `0 * * * * node /app/cron/export.js`

### Phase 6: React UI (customBrain)
- [ ] `client/package.json` — React, Vite, Tailwind
- [ ] `client/src/api.js` — fetch helpers: capture(text), search(q), recent(n), stats(), exportToObsidian()
- [ ] `client/src/components/Capture.jsx`
  - Textarea + submit button
  - Shows returned metadata confirmation after capture
- [ ] `client/src/components/Search.jsx`
  - Search input, results list showing text + topics + people + score
- [ ] `client/src/components/Recent.jsx`
  - Scrollable feed of recent thoughts with metadata pills
- [ ] `client/src/components/Stats.jsx`
  - Simple display: total count, breakdown by type, top topics
- [ ] `client/src/components/Export.jsx`
  - Button to trigger export, shows count of exported files
- [ ] `client/src/App.jsx`
  - Tab navigation between Capture / Search / Recent / Stats / Export
- [ ] Serve client as static files from Express in production
  - `server/index.js` serves `client/dist` at root /

### Phase 7: Docs
- [ ] `.env.example`
  ```
  QDRANT_URL=http://qdrant:6333
  GOOGLE_API_KEY=xxx
  ANTHROPIC_API_KEY=sk-ant-xxx
  CAPTURE_SECRET=your-random-secret
  GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
  GOOGLE_DRIVE_FOLDER_ID=xxx
  PORT=3000
  ```
- [ ] `README.md`
  ### Hetzner Setup
  1. Create CX22 (Ubuntu 22.04), install Docker
  2. Clone repo, copy .env.example → .env, fill values
  3. `docker compose up -d`
  4. `node scripts/init-collection.js` (once)
  5. Build React: `cd client && npm install && npm run build`
  6. Open http://your-hetzner-ip:3000 — your brain UI

  ### Google Drive Setup
  1. Google Cloud project → enable Drive API
  2. Create service account → download JSON key
  3. Create Drive folder → share with service account email
  4. Copy folder ID from URL → set in .env

  ### Obsidian Setup
  1. Install Google Drive desktop app
  2. Open Obsidian → vault = mounted Drive folder

  ### Connecting AI Tools
  Claude Desktop (`claude_desktop_config.json`):
  ```json
  {
    "mcpServers": {
      "open-brain": {
        "type": "sse",
        "url": "http://your-hetzner-ip:3000/mcp"
      }
    }
  }
  ```
  Claude Code: same URL in .claude/config.json

## Review
_To be filled after completion_
