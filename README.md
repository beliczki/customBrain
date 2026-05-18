# customBrain

A self-owned AI memory system. Capture thoughts from many sources, search them semantically, curate the graph of connections, and export to Obsidian through Google Drive.

**Live at [brain.beliczki.hu](https://brain.beliczki.hu).** One Express server exposes three surfaces: HTTP routes (for the React UI and the Chrome extension), MCP tools (for Claude Desktop / Claude Code / Cursor / any MCP client), and a static build of the React SPA.

Latest: `0.5.3` — brain-hygiene tooling (P10) with interactive metadata curation, batch cleanup script, and capture-time prompt tightening. See `CHANGELOG.md` for the full history.

---

## Stack

- **Node.js** (ESM, no build step for server code)
- **Qdrant** — vector storage, 3072-dim Cosine HNSW, single collection `thoughts`
- **Google Gemini** — `gemini-embedding-001` for embeddings, `gemini-2.5-flash` for YouTube video understanding
- **Claude Haiku 4.5** — metadata extraction, conflict detection, Gmail boilerplate cleanup, brain-hygiene suggestions
- **Express** — HTTP routes + MCP Streamable HTTP transport
- **React 19 + Tailwind 3 + Vite** — web UI (SPA in `client/`)
- **Google Drive** — Obsidian vault sync (full rebuild via OAuth2, vault-context reads via Service Account)
- **pm2 + nginx** — production process management and reverse proxy on Hetzner CX22

---

## What it does, at a glance

- **Capture thoughts** from manual notes, meetings (Fireflies webhook), liked YouTube videos, labeled Gmail threads, and the Chrome "Save to Brain" extension — each capture gets auto-extracted metadata (people, projects, topics, action items) via Claude Haiku
- **Semantic search** over everything, with time-decay scoring
- **Automatic conflict detection** on capture — near-duplicate thoughts that logically contradict the existing state get archived with a `supersedes` link
- **Brain hygiene** — find over-connected "hub" thoughts whose metadata wrongly links them to everything, get Haiku's proposal for tighter metadata, review, and apply as a patch to Qdrant
- **Export to Obsidian** — full vault rebuild to Google Drive, wikilinks in YAML frontmatter, graph-view-ready markdown
- **Living system** — cleans itself over time through scheduled crons and human-in-the-loop hygiene sessions

---

## Setup (local dev — optional; production runs on Hetzner)

> **This project is deploy-tested only.** There is no local `.env` or `service-account.json` checked in or expected on any dev machine. All testing happens directly on Hetzner via SSH. Static checks (syntax, regex unit tests, pure-function tests) are fine locally. See `CLAUDE.md` for the convention.

If you genuinely need local dev:

```bash
# 1. Start Qdrant
docker compose up -d

# 2. Create .env at repo root with CAPTURE_SECRET only (since 0.23.0)
cp .env.example .env
# Edit .env and set CAPTURE_SECRET=<random-string>
# Everything else (Google/Anthropic/Fireflies/Gmail) goes via Settings UI
# tab after first boot — values are persisted in state/settings.json.
# Also drop service-account.json at repo root if using Drive features.

# 3. Initialize Qdrant collection (idempotent — safe on existing data)
npm run init

# 4. Build the React UI
cd client && npm install && npm run build && cd ..

# 5. Start server
cd server && npm install && cd ..
npm start
```

Production deploy: see `DEPLOYMENT.md` for the mandatory pm2 + `fuser -k 3000/tcp` sequence.

---

## HTTP API

All routes require `Authorization: Bearer <CAPTURE_SECRET>` (also accepts `?token=` query param for browser use). Exception: `/fireflies-webhook` has its own HMAC-based auth.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/capture` | Capture a new thought. Auto-extracts metadata, detects conflicts, embeds, upserts. |
| `GET` | `/search?q=&limit=` | Semantic search with time-decay scoring. |
| `GET` | `/recent?limit=` | Most recent thoughts. |
| `GET` | `/stats` | Count by type, top topics, daily capture frequency. |
| `POST` | `/export` | Force vault rebuild (usually hourly cron calls this). |
| `DELETE` | `/thoughts/:id` | Remove a thought from Qdrant. |
| `PATCH` | `/thoughts/:id` | **New in 0.5.0.** Partial metadata update. Allowed fields: `people, projects, topics, title, action_items`. Text/source/timestamps stay immutable. |
| `POST` | `/fireflies-webhook` | Fireflies webhook endpoint (HMAC-verified via `x-hub-signature`). |
| `ALL` | `/mcp/http` | MCP Streamable HTTP transport for Claude Desktop / Claude Code / Cursor. |

Client sends all JSON. Responses are JSON or SSE (MCP).

---

## MCP tools

Available over Streamable HTTP at `/mcp/http` (bearer-auth) or stdio via `node server/mcp-stdio.js` for local Claude Desktop setups. All three brain-hygiene tools shipped in 0.5.0; 0.5.3 tightened their behavior.

### Core brain

#### `capture_thought`

Capture a new thought. Metadata (title, people, projects, topics, type, action items) is auto-extracted by Haiku. Near-duplicates are checked via vector similarity; logical contradictions archive the old thought.

```
capture_thought({
  text: "Met with Alice about the ProductX redesign. Decision: ship the new onboarding flow by May.",
  conflict_threshold: 0.85   // optional; default 0.85
})

→ {
  ok: true,
  id: "uuid-…",
  metadata: {
    title: "ProductX onboarding ship decision",
    people: ["Alice", "Me"],
    projects: ["ProductX"],
    topics: ["redesign", "onboarding", "release"],
    type: "decision",
    action_items: ["Ship new onboarding flow by May"]
  }
}
```

#### `search_brain`

Semantic search over all active thoughts. Time-decay applied (newer thoughts score slightly higher).

```
search_brain({ query: "onboarding flow decisions", limit: 5 })
→ [{ id, text, title, metadata, created_at, score, cosine_score }, …]
```

#### `list_recent`

Most recent thoughts ordered by `created_at` desc.

```
list_recent({ limit: 10 })
→ [{ id, text, title, metadata, created_at }, …]
```

#### `brain_stats`

Counts by type, top topics, daily capture histogram.

```
brain_stats({})
→ {
  total: 118,
  by_type: { meeting: 56, reflection: 8, reference: 24, task: 8, note: 8, idea: 2, decision: 1 },
  top_topics: [{ topic: "onboarding", count: 4 }, …],
  daily_counts: { "2026-04-19": 18, "2026-04-18": 36, … }
}
```

#### `rebuild_obsidian_vault`

Full vault rebuild: wipes the existing `customBrain/` folder on Drive, regenerates every thought as `.md` with wikilink frontmatter, re-creates People/Projects stubs for newly mentioned names. Hourly cron runs this automatically; manual invocation is for after bulk edits.

```
rebuild_obsidian_vault({})
→ { ok: true, exported_count: 118 }
```

### Brain hygiene (shipped 0.5.0, hardened 0.5.3)

Interactive metadata curation. The model: brain gets messy as it grows (Haiku over-tags projects, person lists drift), so tools let Claude Desktop surface the worst offenders and propose fixes.

#### `find_overconnected`

Ranks active thoughts by `hub_score` — the total number of other thoughts reachable via shared project/person metadata. Flags thoughts exceeding thresholds for review.

```
find_overconnected({ limit: 10, min_project_count: 5, min_hub_score: 20 })
→ [
  {
    id: "uuid-…",
    title: "AI failure-mode reflection",
    hub_score: 141,
    project_count: 8,
    reasons: [
      "8 projects tagged (threshold 5)",
      "hub score 141 — reachable from 141 other thoughts via shared metadata"
    ],
    projects: ["ProjectAlpha", "ProductX", "PlatformY", …]
  },
  …
]
```

#### `suggest_metadata_fix`

Haiku re-reads a thought and classifies each tagged project as `primary | example | context`. Proposes a tighter `{people, projects, topics, title}`, enforces language preservation (Hungarian thoughts stay Hungarian), resolves aliases, and grep-verifies person removals.

```
suggest_metadata_fix({ thought_id: "uuid-…" })
→ {
  thought_id: "uuid-…",
  current: { title, people, projects, topics },
  proposed: { title, people, projects, topics },
  classifications: {
    projects: [
      { value: "ProductX", classification: "primary", reason: "Thought is explicitly about this" },
      { value: "PlatformY", classification: "example",  reason: "Mentioned once as analogy" },
      …
    ]
  },
  removed: [{ field, value, reason }, …],
  kept:    [{ field, value, reason }, …],
  reasoning: "Thought is a self-reflection on one project. Six of the eight were examples of a broader pattern, not subjects."
}
```

#### `update_thought`

Applies a partial metadata delta to an existing thought. Only `people, projects, topics, title, action_items` are patchable — text, source, timestamps stay immutable (use `rebuild` + new `capture_thought` if text needs editing; that's P7a).

```
update_thought({
  thought_id: "uuid-…",
  projects: ["ProductX"],              // was ["ProductX", "PlatformY", …]
  people: ["Me", "Alice"]              // drop cc'd non-participants
})
→ {
  ok: true,
  id: "uuid-…",
  updated_fields: ["projects", "people"],
  thought: { /* full updated thought */ }
}
```

### Agent tools (external sources — registered via `agent/register.js`)

Pull raw data from Gmail, Calendar, Fireflies, YouTube. Useful for morning "process yesterday" flows or for building context before a meeting.

| Tool | Purpose |
|---|---|
| `get_fireflies_transcripts({ since_date })` | Raw transcripts — titles, dates, participants, full text. Used by `scripts/backfill-fireflies.js`. |
| `get_youtube_likes({ since_date })` | Liked videos with title/channel/description/tags/category_id. Gemini-based summaries live in the cron, not the tool. |
| `get_gmail_threads({ query, max_results })` | Gmail thread search (standard Gmail query syntax). Used by `cron/gmail-intake.js` for `label:brain` auto-capture. |
| `get_calendar_events({ date_range })` | Upcoming / past calendar events. |
| `get_event_context({ event_title, attendees? })` | For a named event: searches brain, emails, Fireflies. Returns a context card — "what do you already know about this meeting and these people". |
| `get_task_context({ task_title })` | Decomposes a task, pulls related brain content. |
| `manage_drafts({ action, data? })` | In-memory draft store for proposed captures awaiting user approval. |

---

## Auto-intake (shipped 0.3.0, hardened 0.4.x)

Three always-on ingestion paths into the brain. All use the shared `source` + `source_id` payload fields for idempotent dedup — re-running any path is a no-op on already-captured items.

| Source | Trigger | `source_id` | Entry point |
|---|---|---|---|
| Fireflies meetings | Webhook `POST /fireflies-webhook` on transcription-complete | Fireflies `meetingId` | `server/routes/fireflies-webhook.js` |
| YouTube likes | Cron every 30 min (Hetzner crontab) | YouTube `videoId` | `cron/youtube-intake.js` |
| Gmail labeled emails | Cron every 10 min | Gmail `threadId` | `cron/gmail-intake.js` |

### Fireflies webhook

- Authenticated via `x-hub-signature` header (HMAC-SHA256 of raw body with `FIREFLIES_WEBHOOK_SECRET`)
- On receipt: fetch full transcript, truncate to 30000 chars, capture with `source: "fireflies"`
- Retries 3x with 30s backoff if Fireflies fires webhook before transcript is queryable

### YouTube likes cron

- Polls the user's auto-generated "Liked" playlist via OAuth2
- Filters by `YOUTUBE_SKIP_CATEGORIES` env var (default `10` = Music; `10,23,24` = Music + Comedy + Entertainment)
- For non-filtered videos: calls Gemini 2.5 Flash with the YouTube URL and gets a structured summary (Summary / Key ideas / Action items / Frameworks / Speakers)
- Capture body = title + URL + Gemini summary + original description (as footer)

### Gmail labeled cron

- Query: `label:brain -label:brain/captured` — user labels an email "brain", cron picks it up, applies `brain/captured` label to close the loop
- Body cleaner (`agent/tools/gmail-clean.js`) does thread-aware paragraph dedup (kills N² reply-chain explosion) + regex-based legal-footer stripping + optional Haiku content extractor if >1500 chars remain. Tested: 817k → 5k chars on a real corporate thread, zero unique content lost.
- Returns `__NO_CONTENT__` for pure-boilerplate messages — cron adds `brain/empty` label and skips capture

---

## Obsidian vault export

Full rebuild model — not incremental. Each hour, `cron/export.js` calls `exportThoughts()` which:

1. Wipes the `customBrain/` subfolder on Drive
2. Writes every active thought as `<title>.md` with YAML frontmatter
3. Generates People/Projects stubs for every person/project referenced (if the folder is configured and the stub doesn't already exist — hand-edited stubs are preserved)
4. Embeds wikilinks in frontmatter: `people: ["[[People/Alice|Alice]]", …]` and `projects: ["[[Projects/ProductX|ProductX]]", …]`
5. Appends a "Related thoughts" section listing all thoughts sharing any person/project (metadata-based — this is exactly what the brain-hygiene tooling cleans up when it over-connects)

Manual trigger: the `rebuild_obsidian_vault` MCP tool.

**Vault context for capture** (People + Projects + aliases) is read **by the service account** (`server/drive-context.js::getVaultContext`). OAuth2 sometimes misses files in shared folders owned by other accounts; SA sees everything. Cached 5 minutes.

### Project/people aliases (0.5.1)

Files in `People/<Name>.md` and `Projects/<Name>.md` can declare `alias:` lines that get parsed into an alias → canonical map and injected into the Haiku prompt for both capture-time metadata extraction AND `suggest_metadata_fix`. Example:

```markdown
# People/Me.md
alias: John Doe
alias: JD
```

A capture mentioning "John Doe" or "JD" normalizes to `people: ["Me"]`. Same mechanism works for projects (useful when a product has internal + client-facing names).

One alias per line. Comma-separated values in a single line currently store as one key (pending 0.5.4 fix).

---

## React UI (`client/`)

Tab-based SPA served from `/`. Components in `client/src/components/`.

| Tab | What it does |
|---|---|
| **Capture** | Text area + "Save to Brain" button. After capture, shows extracted metadata feedback: type / title / topics / people / projects / action_items — plus an accordion with the full Haiku prompt that was used (useful for prompt debugging). |
| **Search** | Query box + top-N results with cosine score and time-decayed score. Clicking a result scrolls to full text. |
| **Recent** | Last N captures, newest first. Each row has a delete button. |
| **Stats** | Mirrors `brain_stats` MCP tool: counts by type, top topics, daily capture histogram (Chart.js). |
| **Export** | "Rebuild Obsidian vault now" button that calls `POST /export`. Shows last export time + thought count. |

Auth: the client-side token gate prompts for `CAPTURE_SECRET` on first visit, stores in localStorage.

---

## Chrome extension (`extension/`)

Manifest v3 "Save to Brain" web clipper.

- Click the extension on any page → popup extracts title + og:description + main content (stripped of nav/footer/ads)
- Displays extracted content in a textarea for last-mile editing
- Calls `/search?q=...` with the content (not just the title — fixed in 0.4.1) to show related brain entries with cosine score %
- "Save to Brain" button POSTs to `/capture` with your edited text
- Settings panel stores `brainUrl` + `captureSecret` in `chrome.storage.local`

Install unpacked: `chrome://extensions` → Developer mode → Load unpacked → select `extension/`.

---

## Scheduled crons (Hetzner crontab)

```
*/30 * * * * cd /root/customBrain && /usr/bin/node cron/youtube-intake.js
*/10 * * * * cd /root/customBrain && /usr/bin/node cron/gmail-intake.js
0 * * * *    cd /root/customBrain && /usr/bin/node cron/export.js
```

Plus on-demand:
- `node scripts/backfill-fireflies.js [since-date]` — pull older meetings that predate the webhook
- `node scripts/backfill-youtube-summaries.js` — regenerate Gemini summaries for existing YouTube captures
- `node scripts/batch-hygiene.js [--limit N] [--apply]` — P10 brain hygiene across multiple thoughts (dry-run default)
- `node scripts/eval-strict-prompt.js [N]` — A/B the tightened Haiku prompt against the N worst over-taggers

Log rotation via `pm2-logrotate` (10 MB rotate, 7-day gzip retention).

---

## Architecture — one backend, three interfaces

- **HTTP** (`server/routes/*.js`) — React UI, Chrome extension, curl
- **MCP over Streamable HTTP** (`server/mcp.js`) — Claude Desktop, Claude Code, Cursor, any MCP client
- **MCP over stdio** (`server/mcp-stdio.js`) — local Claude Desktop installs that bridge to stdio

All three surfaces call the same core functions in `server/routes/*.js`. No duplication of business logic, no HTTP hop between MCP and its underlying route. Adding a new capability means writing one function and exposing it in all three places consistently — the pattern is simple enough to follow by example.

Qdrant is the source of truth. Obsidian is a derivative export target, regenerated from Qdrant. People/Projects folders on Drive are the aliases source (read) and the export destination (write).

---

## Versioning

Semver (`major.minor.patch`), currently `0.5.3`. Version synced across `package.json` (root), `server/package.json`, `client/package.json`, `extension/manifest.json`, plus a `CHANGELOG.md` entry per release. `0.x.y` means pre-1.0; breaking changes are allowed on minor bumps at this stage.

---

## Related docs

- [CLAUDE.md](./CLAUDE.md) — architecture, conventions, and rules for AI assistants working on this codebase
- [CHANGELOG.md](./CHANGELOG.md) — per-version history from 0.1 to current
- [ROADMAP.md](./ROADMAP.md) — what's planned (P-numbered priorities) and what's shipped
- [DEPLOYMENT.md](./DEPLOYMENT.md) — Hetzner deploy ritual, including the mandatory pm2 + `fuser -k 3000/tcp` sequence
- [.env.example](./.env.example) — required environment variables

---

## Status at a glance

- **Production**: [brain.beliczki.hu](https://brain.beliczki.hu) on Hetzner CX22
- **Current version**: 0.5.3
- **Thought count**: 118 (2026-04-19)
- **Active intake paths**: 3 (Fireflies, YouTube, Gmail) + Chrome extension + manual capture
- **MCP tools exposed**: 15 (5 brain + 3 hygiene + 7 agent)
- **Obsidian vault**: auto-synced hourly via Google Drive
