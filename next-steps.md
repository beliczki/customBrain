# customBrain — Revised Next Steps
## Merged: existing next-steps.md + implementation experience from build session
## Updated: 2026-03-16

---

## Architecture Decision Log (additions from next-steps.md)
- **Memory decay**: time-weighted scoring in search (recent beats old at similar relevance)
- **Conflict resolution**: near-duplicate detection at capture, contradictions archived not accumulated
- **Category summaries**: People/Projects .md files become evolving summaries, not just exports
- **Idea lifecycle**: single `status` field (idea → active → shipped/killed/dormant), no project management overhead
- **Status changes**: via MCP tool, via auto-detection at capture, via weekly review prompt

---

## P0 — Make it real (Hetzner deployment)

The whole point is always-on, accessible from anywhere. A brain that dies when your Mac sleeps is not a brain.

- [ ] Provision Hetzner CX22 (Ubuntu 22.04)
- [ ] Install Docker + Docker Compose
- [ ] Clone repo, copy .env, fill production values
- [ ] `docker compose up -d`
- [ ] `node scripts/init-collection.js` (once)
- [ ] Build client dist on server (`cd client && npm install && npm run build`)
- [ ] Migrate local Qdrant data → Hetzner via Qdrant snapshot export/import
- [ ] Set up Caddy reverse proxy for HTTPS (1 config file, free cert)
- [ ] Set real CAPTURE_SECRET
- [ ] Firewall: only 80/443 open, Qdrant 6333 internal only
- [ ] Test: capture from phone browser → appears in Obsidian

**Implementation note from build**: Docker Compose v2 plugin needed (`brew install docker-compose` on Mac, native on Ubuntu). Qdrant init script must run from server/ dir for node_modules resolution — or use root package.json.

---

## P1 — Make the brain smarter before agents read it

Do this before connecting MCP — garbage in, garbage out.

### P1a: Time decay in search scoring
- [ ] `server/routes/search.js` — after Qdrant returns results, apply score multiplier:
  `final_score = cosine_score * (1 / (1 + days_since_capture / 30))`
- [ ] Return `final_score` alongside `cosine_score` in results so UI can show both
- [ ] Applies to MCP search_brain tool too (same handler)
- Simple 10-line change, high impact for a growing brain

### P1b: Conflict resolution at capture
- [ ] `server/routes/capture.js` — after embedding, before upsert:
  - Search Qdrant for top 1 result with score > 0.92
  - If found, ask Haiku: "Does the new thought contradict the existing one? YES/NO + reason"
  - If YES: set `status: archived` on old point, store new with `supersedes: old_id`
  - If NO: proceed as normal upsert
- [ ] Return conflict info in capture confirmation so UI can show "updated existing thought"
- Prevents "I love my job" + "I quit my job" both living as equal truth

**Implementation note**: capture.js already calls embedText + extractMetadata in parallel. Conflict check adds a third parallel step (searchVector with the same embedding). Haiku call only fires if score > 0.92.

### P1c: Evolving category summaries
- [ ] `server/routes/export.js` — after writing individual thought .md files:
  - Group thoughts by each unique person and project
  - For each: fetch existing summary .md from Drive, call Haiku to rewrite integrating new thoughts
  - Write updated summary back to `People/PersonName.md` and `Projects/ProjectName.md`
- [ ] Weekly full re-summarization cron

**Implementation note**: export.js already has getDriveClient() and getOrCreateSubfolder(). People/Projects folders are owned by service account — need to use SA drive client for reading, OAuth2 for writing new summaries (or transfer ownership). Current drive-context.js already reads these folders via SA fallback.

---

## P2 — Idea lifecycle

One field. Five states. No project management overhead.

### States
`idea` (default) → `active` → `shipped` | `killed` | `dormant`

### P2a: Schema addition
- [ ] Add `status` field to Qdrant payload at capture (default: `idea`)
- [ ] Add `status_updated_at` and `status_note` fields
- [ ] `scripts/backfill-status.js` — sets all existing thoughts to `status: idea`

**Implementation note**: Qdrant is schemaless — just add fields to payload in capture.js. No migration needed. Backfill script scrolls all points and does setPayload.

### P2b: Update status endpoint + MCP tool
- [ ] `PATCH /thoughts/:id` { status, status_note } — new route in `server/routes/recent.js` (already has DELETE)
- [ ] MCP tool: `update_status(thought_id, status, note)` in `server/mcp.js`
- [ ] Auto-detection at capture: Haiku checks if new thought references an existing idea

### P2c: Obsidian lifecycle integration
- [ ] Status in YAML frontmatter on every .md export (toFrontmatter in export.js)
- [ ] Auto-generate `_index/shipped.md`, `_index/killed.md`, `_index/active.md`
- [ ] Graph view shows the full arc visually

### P2d: Lifecycle-aware stats
- [ ] `server/routes/stats.js` — add lifecycle breakdown: shipped/total ratio, avg idea→shipped time, longest dormant ideas, "idea metabolism"

---

## P3 — MCP: make agents actually read the brain

Currently untested. Server exposes /mcp SSE endpoint.

- [ ] Connect Claude Desktop to Hetzner MCP SSE endpoint
- [ ] Test search_brain, list_recent, brain_stats, rebuild_obsidian_vault
- [ ] Add `capture_thought` MCP tool — Claude captures during conversation: "jegyezd meg hogy..."
  - Import captureThought from routes/capture.js, wire as MCP tool in mcp.js
- [ ] Connect Claude Code to same endpoint
- [ ] Document exact config for both in README

**Implementation note**: mcp.js already imports route handlers directly. Adding capture_thought is ~10 lines: import captureThought, server.tool('capture_thought', ...). SSE transport already mounted at /mcp in index.js.

---

## P4 — Capture channels

"Bármit rákötöl ami HTTP-t tud küldeni"

### P4a: Telegram bot (highest value, lowest friction)
- [ ] Create bot via BotFather
- [ ] `server/routes/telegram.js` — webhook receiver
- [ ] Any message → POST /capture → reply with metadata confirmation
- [ ] Optional: `/search query` command for quick retrieval

### P4b: Claude Desktop as capture (free once P3 done)
- Already works once capture_thought MCP tool is built

### P4c: iOS Shortcut (voice capture from anywhere)
- [ ] Document shortcut setup in README
- Dictate → POST /capture with Bearer token
- No server code needed

### P4d: Email forwarding
- [ ] `server/routes/email.js` — Mailgun/SendGrid webhook
- [ ] Parse body → POST /capture

### P4e: Fireflies webhook
- [ ] `server/routes/fireflies.js` — meeting summaries auto-captured

---

## P5 — The 4 lifecycle prompts (compounding mechanism)

What makes the system compound. Store as templates in React UI.

- [ ] **Memory migration prompt** — extracts context from Claude/ChatGPT existing memory → bulk captures
- [ ] **Open Brain Spark** — interview-style: asks about tools, decisions, key people → personalized capture list
- [ ] **Quick capture templates** — 5 starters: Decision, Person note, Insight, Meeting debrief, Idea (auto-sets status: idea)
- [ ] **Weekly review prompt** — calls list_recent + brain_stats + lifecycle stats, then clusters, surfaces unresolved actions, finds patterns, surfaces dormant ideas, detects missed connections

---

## P6 — Memory maintenance cron

Without this, the brain rots over time.

- [ ] **Nightly consolidation** (3 AM): find near-duplicates (>0.92), merge via Haiku, run conflict resolution
- [ ] **Weekly summarization** (Sunday): re-summarize People/Projects, surface dormant ideas >30 days, prune archived >90 days
- [ ] **Monthly re-indexing** (1st): rebuild old embeddings, recompute time-decay, generate "idea metabolism" report

---

## P7 — UI & data quality improvements

### P7a: Edit thought
- [ ] `PUT /thoughts/:id` — update text/metadata, re-embed if text changed
- [ ] Edit button on Recent/Search cards

### P7b: Re-process old thoughts
- [ ] `scripts/reprocess-thoughts.js` — scroll all → re-extract metadata with current prompt (title, projects, vault context) → update payload

### P7c: Bulk import from Obsidian
- [ ] `scripts/import-vault.js` — import existing .md files into Qdrant

### P7d: UI polish
- [ ] Capture: auto-resize textarea, processing indicator, edit metadata before save
- [ ] Filter/sort on Recent: by type, project, person, date range
- [ ] Stats charts with lightweight chart lib

---

## Recommended execution order

1. **P0** — Hetzner (2hrs) — makes everything else possible
2. **P1a** — Time decay in search (30min) — 10-line change, immediate improvement
3. **P3 partial** — capture_thought MCP tool + Claude Desktop test (30min) — proves the thesis
4. **P1b** — Conflict resolution (2hrs) — before more capture channels
5. **P2a+b** — Idea lifecycle schema + update endpoint + MCP tool (2hrs)
6. **P4a** — Telegram bot (1hr) — first mobile capture
7. **P1c + P2c** — Evolving summaries + Obsidian lifecycle (2hrs)
8. **P5** — 4 lifecycle prompts (1hr) — templates in React UI
9. **P4c** — iOS Shortcut (20min) — voice capture everywhere
10. **P6** — Maintenance crons (2hrs) — needs data to consolidate
11. **P7** — Edit, reprocess, UI polish (ongoing)

Total: one serious weekend → fully operational, smarter than described.

---

## What's already ahead of the original vision
- Wikilinks in YAML frontmatter (Graph view connections)
- Title generation for Obsidian filenames
- Vault-aware metadata (reads People/Projects from Drive at capture time)
- Hungarian language matching
- Delete endpoint
- Full vault rebuild model (Qdrant is source of truth)
- context.json (prevents AI assistants being tagged as people)
- OAuth2 for Drive writes (service account can't create files on personal Gmail since 2024)
