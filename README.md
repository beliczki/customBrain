# Open Brain

A self-owned AI memory system. Capture thoughts, search them semantically, and export to Obsidian via Google Drive.

One backend, two interfaces: HTTP routes for the React UI + MCP over SSE for AI tools (Claude Desktop, Claude Code, Cursor).

## Stack

- **Qdrant** — vector storage (3072-dim HNSW)
- **Google Gemini** — embeddings (`gemini-embedding-exp-03-07`)
- **Claude Haiku** — metadata extraction
- **Express** — HTTP + MCP SSE server
- **React + Tailwind** — web UI
- **Google Drive** — Obsidian sync

## Setup

### 1. Start services

```bash
docker compose up -d
```

### 2. Initialize Qdrant collection

```bash
cd server && npm install
node ../scripts/init-collection.js
```

### 3. Configure environment

```bash
cp .env.example .env
# Fill in: GOOGLE_API_KEY, ANTHROPIC_API_KEY, CAPTURE_SECRET, etc.
```

### 4. Build React UI

```bash
cd client && npm install && npm run build
```

### 5. Open

- Web UI: `http://your-server:3000`
- MCP endpoint: `http://your-server:3000/mcp`

## Google Drive Setup

1. Create a Google Cloud project, enable Drive API
2. Create a service account, download the JSON key
3. Create a Drive folder, share it with the service account email
4. Set `GOOGLE_SERVICE_ACCOUNT_PATH` and `GOOGLE_DRIVE_FOLDER_ID` in `.env`

## Obsidian Setup

1. Install Google Drive desktop app
2. Point Obsidian vault at the mounted Drive folder
3. Exported thoughts appear as `.md` files with YAML frontmatter

## Connecting AI Tools

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "open-brain": {
      "type": "sse",
      "url": "http://your-server:3000/mcp"
    }
  }
}
```

### Claude Code

Same URL in your Claude Code MCP settings.

## API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/capture` | POST | Capture a thought (requires Bearer token) |
| `/search?q=&limit=` | GET | Semantic search |
| `/recent?limit=` | GET | Recent thoughts |
| `/stats` | GET | Brain statistics |
| `/export` | POST | Export to Google Drive |
| `/mcp` | GET | MCP SSE endpoint |
