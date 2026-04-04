# customBrain — Roadmap
## Last updated: 2026-04-03

Historical build plans archived in `docs/archive/`.

---

## What's Built

- **Core brain**: capture (with Haiku metadata extraction), semantic search (Gemini embeddings), recent, stats, delete, vault rebuild
- **MCP server**: 12 tools over SSE + Streamable HTTP + stdio transports
  - Brain tools: `capture_thought`, `search_brain`, `list_recent`, `brain_stats`, `rebuild_obsidian_vault`
  - Agent tools: `get_fireflies_transcripts`, `get_youtube_likes`, `get_gmail_threads`, `get_calendar_events`, `get_event_context`, `get_task_context`, `manage_drafts`
- **Chrome extension**: Manifest v3 "Save to Brain" web clipper
- **React UI**: capture, search, recent, stats, export tabs (Vite + React 19 + Tailwind 3)
- **Obsidian sync**: full vault rebuild via Google Drive (OAuth2 writes, service account reads), wikilinks in YAML frontmatter
- **Production**: Hetzner CX22 at `brain.beliczki.hu`, pm2, nginx reverse proxy

---

## Ops — do first (stability)

- [ ] **HTTPS**: certbot for brain.beliczki.hu (was scheduled 2026-03-17, status unknown)
- [ ] **Firewall**: lock Qdrant port 6333 to internal only
- [ ] **Crontab**: configure `cron/export.js` hourly on Hetzner: `0 * * * * cd /root/customBrain && node cron/export.js`
- [ ] **pm2 startup**: ensure auto-restart on server reboot (`pm2 startup` + `pm2 save`)

---

## Testing Gaps

- [ ] `manage_drafts` — draft save/approve/reject flow end-to-end
- [ ] `get_task_context` — task decomposition with brain context
- [ ] Full daily cycle e2e: morning "dolgozd fel a tegnapit" → Fireflies/YouTube intake → review → approve → brain → Obsidian

---

## Next up (2026-04-04)

Tested `get_event_context` on real calendar events (ArtAI javítások, Bizi tudásbázis). Results:
- Tool works but search results are noisy — irrelevant thoughts rank above relevant ones
- "Draft approve teszt" (irrelevant) outranks "Bizi platformfeladatok" (highly relevant) because cosine alone decides
- Email bodies return raw HTML (Fireflies recap), not useful text

**Action items for today's session, in order:**

1. **P1a: Time decay in search** (30min) — `server/routes/search.js`
   - Apply `final_score = cosine_score * (1 / (1 + days / 30))` after Qdrant returns
   - Return both scores. This alone improves ranking for context tool.

2. **`get_event_context` quality fixes** (30-60min) — `agent/tools/context.js`
   - Brain search: filter by project if event title matches a known project in brain
   - Limit brain results to top 3 (currently 5, too noisy)
   - Strip HTML from email bodies, truncate to ~500 chars

3. **Re-test**: run ArtAI + Bizi context again, verify improved ranking

---

## P1: Make the Brain Smarter

### P1a: Time decay in search scoring (~30min)
After Qdrant returns results, apply: `final_score = cosine_score * (1 / (1 + days_since_capture / 30))`
Return both `final_score` and `cosine_score`. Applies to MCP `search_brain` too (same handler).
- File: `server/routes/search.js`
- Inspired by Rohit's "agent that never forgets" article (in brain) — "Embeddings measure similarity, not truth"

### P1b: Conflict resolution at capture
After embedding, before upsert: search for top 1 result with score > 0.92. If found, ask Haiku if the new thought contradicts the existing one. If YES: archive old point (`status: archived`), store new with `supersedes: old_id`.
- File: `server/routes/capture.js`
- Prevents "I love my job" + "I quit my job" both living as equal truth

### P1c: Evolving People/Projects summaries
After vault rebuild, group thoughts by person/project. Fetch existing summary .md from Drive, call Haiku to rewrite integrating new thoughts. Write updated summaries back.
- File: `server/routes/export.js`
- Note: People/Projects folders owned by service account — may need OAuth2 for writing

---

## P2: Idea Lifecycle

One field. Five states. No project management overhead.

`idea` (default) → `active` → `shipped` | `killed` | `dormant`

- [ ] **P2a**: Add `status`, `status_updated_at`, `status_note` fields to Qdrant payload at capture. Backfill script for existing thoughts.
- [ ] **P2b**: `PATCH /thoughts/:id` endpoint + `update_status` MCP tool. Auto-detection at capture (Haiku checks if new thought references existing idea).
- [ ] **P2c**: Status in Obsidian YAML frontmatter. Auto-generate index files (`_index/shipped.md`, etc.).
- [ ] **P2d**: Lifecycle-aware stats: shipped/total ratio, avg idea→shipped time, longest dormant ideas.

---

## P4: More Capture Channels

| Channel | Effort | Notes |
|---------|--------|-------|
| **P4a: Telegram bot** | ~1hr | Highest value mobile capture. BotFather → webhook → POST /capture |
| **P4c: iOS Shortcut** | ~20min | Documentation only — no server code needed. Dictate → POST /capture |
| **P4d: Email forwarding** | ~2hrs | Mailgun/SendGrid webhook → POST /capture |
| **P4e: Fireflies webhook** | ~1hr | Auto-capture on meeting end (currently manual pull via MCP) |

Already built: Claude Desktop capture (#3), Browser extension (#6). Standup (#7) and briefing (#8) work via MCP without extra code.

Not planned: Voice agydump (Whisper API), WhatsApp bot — lower priority, can use Telegram + iOS Shortcut instead.

---

## P4f: Calendar AI assistant — brain context at the point of need

**Problem**: `get_event_context` works via MCP but requires switching to Claude Desktop/Code. The value is in having context *where you already are* — Google Calendar.

### Options considered

| Option | How | Pro | Con |
|--------|-----|-----|-----|
| **A. Extend existing Chrome extension** | Calendar page detection → popup shows brain + email context for current event | Builds on existing code, full control, fast | Popup only, not inline |
| **B. Calendar content script overlay** | Content script injects brain icon next to each Calendar event card. Click/hover → mini context card inline | Most seamless UX, zero context switch | DOM scraping fragile (Google changes Calendar markup), higher effort |
| **C. Claude Chrome extension + MCP** | Use Claude's official extension, ask it about events, it calls `get_event_context` | Zero code | Manual, not automatic, not integrated |
| **D. Google Workspace Calendar Add-on** | Apps Script sidebar inside Calendar | Native Google integration | Publish flow complex, Apps Script limited, can't call brain API easily |

### Best bet: A+B hybrid (~3-4hrs)

Extend the existing `extension/` with a Calendar-aware mode:
1. **Content script** (`extension/calendar.js`): detects `calendar.google.com`, reads event title + attendees from DOM when user opens an event
2. **Popup mode switch**: on Calendar pages, popup shows "Event Context" instead of "Save to Brain"
3. **Context display**: calls `brain.beliczki.hu/search` + a new lightweight `/event-context` HTTP endpoint (reuses `get_event_context` logic but over HTTP, not MCP)
4. **Later**: inject small brain icon overlay next to event cards for inline access (B-style)

Key files: `extension/manifest.json` (add `calendar.google.com` content script), `extension/calendar.js` (new), `extension/popup.js` (mode detection)

---

## P4g: Google Slides brain assistant — context-aware slide work

**Problem**: Slides work is frequent — preparing decks for meetings, clients, pitches. The brain + email context that helps with Calendar events would be equally valuable while editing slides: "what do I know about this topic?", "what did the client say about this?", "what are the next steps from the last meeting?"

### What it would do
- Read slide content (titles, body text, speaker notes) from the current presentation
- Search brain + emails for related context
- Surface: related thoughts, people involved, action items, contradictions, missing info
- Help: clarify messaging, discover next steps, connect dots across projects

### Options

| Option | How | Pro | Con |
|--------|-----|-----|-----|
| **A. Chrome extension (same as Calendar)** | Content script on `docs.google.com/presentation`, reads slide text from DOM, popup shows brain context | Reuses existing extension, consistent UX | DOM scraping, limited Slides API access |
| **B. Google Workspace Slides Add-on** | Apps Script sidebar inside Slides editor. Uses Slides API (native access to all slide content + speaker notes) | Full slide content access, native UI, can write back to slides | Apps Script → brain API needs proxy or fetch, publish flow |
| **C. Hybrid: Add-on reads slides → calls brain HTTP API** | Apps Script sidebar for UI + slide reading, brain.beliczki.hu for search/context | Best of both: native slide access + brain power | Two codebases (Apps Script + brain API) |

### Best bet: C hybrid, but after Calendar extension is proven

The Calendar extension (P4f) validates the pattern first. If popup-based context works well there, Slides is the next surface. The Slides version likely needs the Add-on route (option B/C) because slide content is harder to scrape from DOM than calendar events, and the Slides API gives clean access to text + speaker notes.

**Dependency**: P4f (Calendar extension) should ship first. The HTTP context endpoint built for P4f (`/event-context` or generalized to `/context?q=...`) would be reused by the Slides add-on.

---

## P5: Lifecycle Prompts

Templates that make the system compound:
- [ ] **Memory migration** — extract context from Claude/ChatGPT existing memory → bulk captures
- [ ] **Open Brain Spark** — interview-style: asks about tools, decisions, key people → personalized capture list
- [ ] **Quick capture templates** — 5 starters: Decision, Person note, Insight, Meeting debrief, Idea
- [ ] **Weekly review** — calls list_recent + brain_stats + lifecycle stats → clusters, surfaces unresolved actions, finds patterns

---

## P6: Maintenance Crons

Without this, the brain rots over time.
- [ ] **Nightly** (3 AM): find near-duplicates (>0.92), merge via Haiku, run conflict resolution
- [ ] **Weekly** (Sunday): re-summarize People/Projects, surface dormant ideas >30 days, prune archived >90 days
- [ ] **Monthly** (1st): rebuild old embeddings, recompute time-decay, generate "idea metabolism" report

---

## P7: UI & Data Quality

- [ ] **P7a**: Edit thought (`PUT /thoughts/:id` + re-embed if text changed + UI edit button)
- [ ] **P7b**: Re-process old thoughts — backfill missing titles/projects with current metadata prompt
- [ ] **P7c**: Bulk import from Obsidian (`scripts/import-vault.js`)
- [ ] **P7d**: UI polish — auto-resize textarea, filter/sort on Recent (by type, project, person, date), stats charts

---

## Future (D upgrade path)

When manual "dolgozd fel a tegnapit" becomes tedious:
- [ ] `cron/intake.js` — automated morning processing (same tool code, cron-triggered instead of MCP)
- [ ] `agent/notify.js` — email notification for pending drafts
- [ ] `agent/review-server.js` — optional web review UI for drafts
- [ ] Separate `agent.beliczki.hu` server if performance requires it

---

## Recommended Execution Order

1. **Ops** (1hr) — HTTPS, firewall, crontab, pm2 startup
2. **P1a** (30min) — time decay, 10-line change, immediate search improvement
3. **Testing gaps** (1hr) — verify draft store, task context, daily cycle
4. **P1b** (2hrs) — conflict resolution before more capture channels go live
5. **P2a+b** (2hrs) — idea lifecycle schema + endpoint + MCP tool
6. **P4a** (1hr) — Telegram bot, first mobile capture
7. **P1c + P2c** (2hrs) — evolving summaries + Obsidian lifecycle
8. **P5** (1hr) — lifecycle prompts
9. **P4c** (20min) — iOS Shortcut docs
10. **P6** (2hrs) — maintenance crons
11. **P7** — ongoing

---

## Architecture Decisions (from build)

| Decision | Why | Deviation from original plan |
|----------|-----|------------------------------|
| `gemini-embedding-001` not `exp-03-07` | Experimental model doesn't exist in API | Yes |
| OAuth2 for Drive writes | Service accounts can't create files on personal Gmail (Google policy 2024) | Yes — plan said service account |
| Vault rebuild not incremental export | Simpler, no exported_at tracking, Qdrant is source of truth | Yes |
| Wikilinks in YAML frontmatter | Obsidian renders property values as clickable links + Graph view connections | Added feature |
| Title generation by Claude | 2-3 word title used as Obsidian filename instead of date-slug | Added feature |
| Vault-aware metadata (drive-context.js) | Claude reads People/ and Projects/ from Drive to assign accurate properties | Added feature |
| context.json for not_people | Prevents AI assistants (Gábor, Vanda) from being tagged as people | Added feature |
| Hungarian language matching | Metadata responds in input language | Added feature |
| Delete endpoint | Not in plan but essential for managing mistakes | Added feature |
| Agent tools in `agent/` not `server/tools/` | Isolation from server code, separate auth (OAuth2 vs SA) | Architecture choice |
| zod must stay v3 | zod v4 breaks `@modelcontextprotocol/sdk` via `zod-to-json-schema` | Discovered during build |
| Streamable HTTP transport added | Modern MCP transport alongside legacy SSE | Added feature |
| stdio MCP transport (`mcp-stdio.js`) | Local Claude Desktop without Express server | Added feature |
