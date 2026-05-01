# customBrain — Roadmap
## Last updated: 2026-05-01

Historical build plans archived in `docs/archive/`.

---

## What's Built

- **Core brain**: capture (with Haiku metadata extraction), semantic search (Gemini embeddings), recent, stats, delete, vault rebuild
- **MCP server**: 12 tools over SSE + Streamable HTTP + stdio transports
  - Brain tools: `capture_thought`, `search_brain`, `list_recent`, `brain_stats`, `rebuild_obsidian_vault`
  - Agent tools: `get_fireflies_transcripts`, `get_youtube_likes`, `get_gmail_threads`, `get_calendar_events`, `get_event_context`, `get_task_context`, `manage_drafts`
- **Chrome extension**: Manifest v3 "Save to Brain" web clipper
- **React UI**: capture, search, recent, stats, export tabs (Vite + React 19 + Tailwind 3)
- **Auto-intake (2026-04-18)**: zero-approval capture from Fireflies webhook (meetings), YouTube likes cron (30min), Gmail (10min). Shared `source` + `source_id` payload for idempotent dedup. Gmail body cleaner strips legal/confidentiality boilerplate (regex + Haiku).
- **Gmail thread refresh + outbound auto-label (0.7.0, 2026-04-18)**: history-API driven cron with watermark. New messages on a brain-labeled thread atomically refresh the existing Qdrant point (preserves id, source_id, created_at; bumps `refresh_count`). Outbound messages to a known brain-person (matched via `email:` lines in People/<Name>.md) auto-apply the `brain` label and capture. `brain/captured` is now just a UI marker — no longer a filter gate.
- **Coworker-loop summary skill (0.10.0, 2026-05-01)**: long thoughts (> 6000 chars, the Gemini embedding window) get a chronological summary prepended in a `## Summary` block above a `---` divider, so semantic search reaches the full content via the summary. Generation runs in a Claude Code session (subscription-billed) via the global `/summarize-long-thoughts` skill, calling two MCP tools — `list_thoughts_needing_summary` and `update_thought_text_with_summary`. Stale-detection by `summary_appended_at < updated_at` so frequent Gmail-thread refreshes don't burn calls. Fireflies slice cap raised 30k → 180k. One backfill script remains: `scripts/backfill-fireflies-transcripts.js` (no-LLM, re-fetches truncated transcripts). Replaces the 0.9.0 inline preprocessor.
- **Obsidian sync**: full vault rebuild via Google Drive (OAuth2 writes, service account reads), wikilinks in YAML frontmatter
- **Production**: Hetzner CX22 at `brain.beliczki.hu`, pm2, nginx reverse proxy

---

## USE IT FIRST — one week before building anything new

**Status (2026-04-04)**: Infra is done. The brain is empty. 19 thoughts, ~4 are test garbage, ~5 are meta about itself. Building more features on an unused system is wasted effort.

**Commit to one week of daily use (2026-04-04 → 2026-04-11) before any new development:**

- [ ] **Reggeli rutin**: Claude Desktop-ban "dolgozd fel a tegnapit" — Fireflies transcripts + YouTube likes + Calendar context → review → approve → brain-be
- [ ] **Napközben**: Chrome extension ha látsz cikket/posztot/tweetet ami értékes — clip → brain
- [ ] **Meeting előtt**: "mi a kontextus ehhez a meetinghez?" — get_event_context
- [ ] **Hét végén**: rebuild_obsidian_vault → Obsidian Graph view → mit gondoltál a héten, milyen kapcsolatok rajzolódnak ki?
- [ ] **Teszt szemét törlése**: "Draft approve teszt", "MCP naptár teszt", "Szeretem/Felmondtam" tesztpárok — ki a brain-ből

**After one week**: evaluate what's actually missing from real use, not theory. Then decide what to build next.

---

## Ops — do first (stability)

- [ ] **HTTPS**: certbot for brain.beliczki.hu (was scheduled 2026-03-17, status unknown)
- [ ] **Firewall**: lock Qdrant port 6333 to internal only
- [ ] **Crontab**: configure `cron/export.js` hourly on Hetzner: `0 * * * * cd /root/customBrain && node cron/export.js`
- [ ] **pm2 startup**: ensure auto-restart on server reboot (`pm2 startup` + `pm2 save`)
- [ ] **Qdrant backup**: automated Qdrant snapshot/backup strategy — the brain is irreplaceable data. Options: Qdrant snapshot API (`POST /collections/thoughts/snapshots`), periodic export to JSON, or volume-level backup of `qdrant_data` Docker volume. Should run on schedule (daily minimum) and store off-server (S3, Google Drive, or local download).

---

## Testing Gaps

- [ ] `manage_drafts` — draft save/approve/reject flow end-to-end
- [ ] `get_task_context` — task decomposition with brain context
- [ ] Full daily cycle e2e: morning "dolgozd fel a tegnapit" → Fireflies/YouTube intake → review → approve → brain → Obsidian

---

## Session log — 2026-04-05

### Done
- **People alias resolution**: `drive-context.js` reads `alias:` lines from People .md files on Drive, `metadata.js` injects them into Haiku prompt + deterministic post-processing. Files: `server/drive-context.js`, `server/metadata.js`
- **SA for vault context**: switched `getVaultContext()` from OAuth2 to service account — OAuth2 couldn't see all files (missed Me.md, Pityesz.md, Agaurg.md + 6 projects). SA sees everything.
- **Stripped wikilink brackets from aliases**: `[[Nate B. Jones]]` → `Nate B. Jones`
- **Removed `not_people` from Haiku prompt**: Gábor/Vanda exclusions were Bizi-specific, not global
- **Capture UI: Haiku prompt accordion**: collapsed `<details>` showing the full prompt sent to Haiku after capture
- **Capture UI: projects in feedback**: projects now shown alongside type, topics, people, actions

### Key finding: OAuth2 vs SA visibility
OAuth2 (personal account) couldn't see files that exist in shared folders — SA sees all regardless of owner. This affected both People (8/11) and Projects (3/9). Root cause unclear (possibly Google Drive sharing/visibility rules). Fix: use SA for all vault context reads.

---

## Session log — 2026-04-04

### Done
- **P1a: Time decay** — implemented and verified
- **P1b: Conflict resolution** — implemented with configurable `conflict_threshold` (default 0.85). Works well for near-duplicate detection (cosine > 0.85). Archives old thought with `status: archived`, `archived_at`, `archived_reason`. New thought gets `supersedes: old_id` link. Files: `server/routes/capture.js`, `server/metadata.js` (`checkContradiction`), `server/qdrant.js` (`updatePayload`), `server/mcp.js` + `mcp-stdio.js`
- **Event context quality** — brain/email results 5→3, email body truncate 500 char, HTML strip, Fireflies recap emails filtered out. File: `agent/tools/context.js`
- **CLAUDE.md** updated: dependency management, production deploy, delete endpoint docs
- **PM2 deploy fix**: zombie process handling, `pm2 save` on Hetzner

### Known limitation: semantic contradiction detection
Embedding model measures topic similarity, not logical relationship. Test results:
- "Utálom a munkámat" vs "Gyűlölöm a munkámat" (same sentiment): **0.977**
- "Szeretem a munkámat" vs "Imádom a munkámat" (same sentiment): **0.919**
- "Szeretem a munkámat" vs "Felmondtam a munkámban" (contradiction): **0.77**

Contradicting thoughts score *lower* than confirming ones — lowering threshold to 0.75 would catch them but flood with false positives. Current P1b is a **duplicate detector**, not a true contradiction detector.

**Future options for real contradiction detection:**
- **Option A**: At capture, send top 5-10 results (lower threshold) to Haiku to identify contradictions — more API calls but accurate
- **Option B**: Nightly batch cron (P6) — pair all thoughts and check for contradictions offline, not real-time

---

## P1: Make the Brain Smarter

### ~~P1a: Time decay in search scoring~~ — DONE (2026-04-04)

### ~~P1b: Conflict resolution at capture~~ — DONE (2026-04-04)
Works for near-duplicates (>0.85). True semantic contradiction detection requires different approach — see session log above.

### P1c: Evolving People/Projects summaries
After vault rebuild, group thoughts by person/project. Fetch existing summary .md from Drive, call Haiku to rewrite integrating new thoughts. Write updated summaries back.
- File: `server/routes/export.js`
- Note: People/Projects folders owned by service account — may need OAuth2 for writing

### ~~P1d: Semantic autolinks in export~~ — DONE (2026-04-19, v0.6.0)
Replaced the metadata-based `Related thoughts` dump (every shared-tag thought) with in-memory cosine top-3 above `RELATED_MIN_SCORE = 0.75`. `getAllWithVectors()` in `server/qdrant.js`; `semanticNeighbors()` + new `buildLinksSection()` in `server/routes/export.js`. Each link carries a `*(score%)*` marker. Expected effect: Obsidian graph edges drop ~80%, remaining edges are genuinely meaningful.

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
| **~~P4d: Email forwarding~~** | DONE | Replaced by Gmail label cron (`cron/gmail-intake.js`). Label = `brain`. |
| **~~P4e: Fireflies webhook~~** | DONE (2026-04-18) | `server/routes/fireflies-webhook.js`. Auto-capture on meeting end. |

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
- [ ] **Weekly review** — calls list_recent + brain_stats + lifecycle stats → clusters, surfaces unresolved actions, finds patterns. **Largely subsumed by P5a below.**

### P5a: hot.md — nightly session context cache (~2hr)
Daily cron (~05:00 UTC) regenerates a ~500-word markdown at the vault root. Contents: last-7-days `list_recent` + active project summaries + top-5 people. Haiku-compressed. Every Claude Desktop / Code / Obsidian session opens warm — zero tool calls to establish context. Daily-automatic equivalent of the manual "Weekly review" above, compounding automatically with auto-intake volume.
- New: `cron/hot-cache.js` (~60 lines). No server changes, no new MCP tool.
- Writes via `drive-context.js` OAuth2.
- Full spec in brain thought `11e3aa53-f685-4c29-8d13-c1b8fcdd5e2f` (Task 1).
- **Highest-leverage of the four MemMolt ideas** — compounds per session forever.

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
- [ ] **P7e**: `index.md` — flat one-line catalog of every thought at vault root (`- [[title]] — <first summary sentence>`, sorted by created_at DESC, Hungarian-aware word-boundary truncation). ~30 lines in `server/routes/export.js`, no new Qdrant fields. Full spec: brain thought `11e3aa53-...` (Task 2).
- [ ] **P7c**: Bulk import from Obsidian (`scripts/import-vault.js`)
- [ ] **P7d**: UI polish — auto-resize textarea, filter/sort on Recent (by type, project, person, date), stats charts

---

## P8: Search Quality — RRF hybrid (vector + BM25) (~2 days, NOT a weekend)

Current pure-dense search misses exact-name queries and Hungarian agglutinative inflections ("megbeszélhetjük" vs "megbeszéltük" may not score as high as they should despite being nearly identical in meaning). Qdrant 1.10+ supports named sparse vectors and server-side Reciprocal Rank Fusion via the Query API.

- Add sparse vector field at `scripts/init-collection.js` (idempotent).
- At capture: generate both dense (Gemini) + sparse (BM25-like) vectors in parallel.
- `/search` route: RRF merge of dense + sparse top-k (server-side via Qdrant Query API preferred over client-side).
- `scripts/backfill-sparse.js` for existing ~N thoughts.
- Response shape of `/search` and `/capture` does NOT change. Only ranking improves.

**Open question before implementing**: Hungarian tokenization. Qdrant's default BM25 uses whitespace tokens — won't necessarily fix the morphology case. Options: lemmatization (heavy), subword tokenization (lighter), or accept whitespace + rely on dense vector for morphology while sparse handles exact-name. Resolve before coding.

- Full spec in brain thought `11e3aa53-f685-4c29-8d13-c1b8fcdd5e2f` (Task 4).
- **Defer until brain has 200+ thoughts and a real recall problem shows up** — current 41-thought brain doesn't produce enough A/B signal to validate the improvement.

---

## P11: Incremental export — fast & reliable vault rebuild

**Why this exists**: `cron/export.js` rebuilds the entire vault every hour — deletes all .md, re-uploads all .md. At ~1000 thoughts the run is 200s+; linear in N, will hit 1000s soon. Quick win shipped 2026-04-22 (parallelized upload batch of 10, mirroring the delete batch — see export.js step 4) drops it ~5–10×, but that's still a full rebuild and re-uploads bytes that didn't change. The proper fix is incremental: only re-export thoughts whose content or related-section changed, only delete files whose source thought is gone.

**Recommended shape** (manifest-based, NOT per-file frontmatter hashes):
- Maintain `_manifest.json` in the customBrain Drive folder: `{ thought_id: { hash, filename } }`. One Drive read + one Drive write per run, instead of N file reads.
- `hash = sha256(text + canonical(metadata) + sorted(neighbor_id:title pairs))`. Neighbor titles must be in the hash because each .md embeds neighbor titles in `## Related thoughts` (line 111 of export.js) — if neighbor B's title changes, A's file is stale even though A's own content didn't.
- Per run: load manifest, load thoughts+vectors from Qdrant, compute new hashes, diff:
  - new in Qdrant, not in manifest → create
  - in both, hash differs → overwrite (`drive.files.update` by id, not delete+create — preserves Drive file id, link history)
  - in manifest, gone from Qdrant → delete
  - in both, hash same → skip (the win)
- Rewrite manifest at end.

**Known gotchas to design around** before coding:
1. **Title-edit renames the file**. `thoughtFilename()` derives from title. If a title is edited, manifest entry needs delete-old + create-new; Obsidian wikilinks in user-owned notes outside customBrain/ will rot. Decide: accept rot, or stabilize filenames on `thought_id` (breaks readable filenames).
2. **Manifest drift**. If someone deletes files in Drive directly, manifest says "exists, hash matches" → file is missing forever. Cheap fix: every Nth run (or `?force=true`), do a full reconcile (list Drive, intersect with manifest, repair).
3. **Atomicity**. Manifest write must happen AFTER all Drive ops succeed, otherwise next run double-creates. Write to `_manifest.json.tmp` then rename.
4. **Neighbor recompute cost**. Even when own-content didn't change, neighbor sets can shift (new thoughts compete for top-3 slots). Either: recompute neighbors for everything every run (cheap — in-memory cosine on already-loaded vectors, ~O(N²) ≈ 1–3s at N=1000) and include in hash; or skip neighbor-only churn (accept eventual consistency).
5. **Concurrent runs**. Hourly cron + manual `/export` from UI could overlap. Add a lockfile (`_manifest.lock` with timestamp + pid) or refuse to start if recent run is in progress.

**Files to touch**: `server/routes/export.js` (the bulk), `cron/export.js` (no change expected — calls `rebuildVault`).

**Verification on Hetzner**: (a) run after change with empty manifest → expect full rebuild matching pre-change file set, (b) run again immediately → expect "0 created, 0 updated, 0 deleted" in <5s, (c) edit one thought via PATCH → run → expect exactly 1 update, (d) delete one thought → run → expect exactly 1 delete, (e) directly delete one .md in Drive UI → trigger reconcile path → expect 1 re-create.

Defer until after the parallelization win (0.8.2) is verified in production. Estimate ~4hrs of careful work; the gotchas above are real, not theoretical.

---

## ~~P10: Brain Connection Hygiene~~ — DONE (2026-04-19, v0.5.0 + 0.5.2 post-pilot hardening)

Interactive metadata curation — surfaces over-tagged thoughts, Haiku proposes tighter metadata, user approves, Qdrant patched in place, Obsidian graph self-corrects on next hourly export. Plus: tightened capture-time extraction prompt so new thoughts don't reintroduce the problem.

**Shipped MCP tools:**
- `find_overconnected(limit, min_project_count, min_hub_score)` — detection
- `suggest_metadata_fix(thought_id)` — Haiku proposal with classifications
- `update_thought(thought_id, {people?, projects?, topics?, title?, action_items?})` — apply

**Shipped HTTP:** `PATCH /thoughts/:id`

**Shipped modules:** `server/brain-hygiene.js`, `server/qdrant.js::getById`, `server/qdrant.js::getConnectionStats`, `server/metadata.js::suggestCleanedMetadata`

**Shipped scripts:** `scripts/eval-strict-prompt.js` (read-only A/B of old vs new prompt)

**Pilot (DONE 2026-04-19):** 10 candidates processed via Claude Desktop, conventions locked, audit captured to brain with marker `BRAIN-HYGIENE-PILOT-01` (id `dcd3da9b-ff1b-4439-9976-8184a8a174cd`). Findings fed into 0.5.2 patches below.

**Post-pilot shipped (v0.5.2, 2026-04-19):**
- Project aliases (`Projects/*.md` with `alias:` lines, mirrors People pattern)
- Language preservation rule in `suggestCleanedMetadata`
- `scripts/batch-hygiene.js` — dry-run diff report + `--apply` flag, encodes pilot conventions as deterministic post-processors

**Still open for manual follow-up:**
- Run `batch-hygiene.js` in dry-run → review → apply waves against remaining ~90 over-tagged thoughts.
- Add `alias:` lines to `Projects/*.md` on Drive for projects with external names (Bizi, ConfAI, etc.).

Cross-ref: brain thought `3e7538f2-2903-4dcd-ae76-d6734b6e4108` ("Agent önbizalom-csapda") documents the failure mode addressed here. Ironically, that thought is itself the pilot target.

Plan file: `~/.claude/plans/at-this-point-every-purring-stonebraker.md`.

---

## P9: Thinking Tools — outbound brain intelligence

Based on Eugeniu Ghelbur's `obsidian-second-brain` skill (see brain thought `d29c3eb8-4976-4452-a31d-997c81868af0` for the full Karpathy-vs-Eugeniu analysis). The insight: today the brain is passive (you query, it returns). Thinking tools flip it — the brain provokes, aggregates, bridges. Passive lookup → active sparring partner.

Four new MCP tools, each a thin Haiku prompt layer over existing retrieval primitives:

| Tool | Effort | Built on |
|---|---|---|
| `challenge_idea(text)` | ~1hr | `search_brain` + contrarian Haiku prompt — the vault argues back using your own past notes |
| `emerge_patterns(days)` | ~2hr | `list_recent` over timeframe + Haiku pattern-mining — unnamed themes across recent captures |
| `connect_domains(a, b)` | ~1hr | Dual `search_brain` + Haiku bridge-finder — what ties two apparently-independent topics |
| `graduate_idea(thought_id)` | ~2hr | P2 status transition (`idea → active`) + Haiku expansion to project spec. **Couple to P2c** — same mechanism, different surface. |

Plus bi-temporal lookup helpers (small, independent):
- `get_supersedes_chain(id)` — walks the `supersedes` lineage backward to see "what did I think about this 1 month ago?"
- `get_belief_history(topic)` — aggregates both `active` and `archived` thoughts on a topic, ordered by `created_at`, showing the belief evolution

### Usage gate — defer LONGER than the MemMolt stubs

Thinking tools only pay off when the brain has enough content to produce meaningful output:
- `challenge_idea` needs enough disagreement in your own past notes to be contrarian — at 41 thoughts, Haiku has weak ammunition
- `emerge_patterns` needs volume within the timeframe — 7 days × ~2 captures/day = too sparse
- `connect_domains` needs breadth across domains — currently most captures cluster on customBrain/Bizi/Amundi

**Gate: ~200 thoughts AND P2 idea lifecycle shipped** (so `graduate` has a real status transition to perform). Roughly 2–3 weeks out at current auto-intake pace.

### Version bump when built
0.5.0 → 0.6.0 (minor — new user-visible capability, new MCP tool surface).

---

## Future (D upgrade path)

When manual "dolgozd fel a tegnapit" becomes tedious:
- [ ] `cron/intake.js` — automated morning processing (same tool code, cron-triggered instead of MCP)
- [ ] `agent/notify.js` — email notification for pending drafts
- [ ] `agent/review-server.js` — optional web review UI for drafts
- [ ] Separate `agent.beliczki.hu` server if performance requires it

---

## Recommended Execution Order

0. **USE IT FIRST** — 1 week of daily auto-intake after 2026-04-18. Gather real signal about which gap hurts most before building. Revisit this ordering with fresh data.
1. **Ops** — HTTPS (certbot), firewall lock Qdrant 6333, pm2 startup, Qdrant backup
2. **P5a** (~2hr) — `hot.md` nightly cache. Compounds per session forever — highest-leverage of the MemMolt-four.
3. **P7e** (~30min) — `index.md` flat catalog. Tiny drop-in during any export-touching session.
4. **P1c + P1d** (~3hr) — People/Projects summary evolution + semantic autolinks. Share export code path.
5. **P2a+b** (~2hr) — idea lifecycle schema + endpoint + MCP tool
6. **P4a** (~1hr) — Telegram bot, first mobile capture
7. **P2c** (~1hr) — lifecycle in Obsidian frontmatter + index files
8. **P5** — Open Brain Spark, quick capture templates, memory migration (Weekly review subsumed by P5a)
9. **P4c** (~20min) — iOS Shortcut docs
10. **P6** (~2hr) — maintenance crons (nightly dedup, weekly summary refresh, monthly metabolism)
11. **P8** (~2 days) — RRF hybrid search. Only once brain has >200 thoughts and a real recall problem is measurable.
12. ~~**P10** — Brain Connection Hygiene.~~ DONE 2026-04-19 (v0.5.0).
13. **P9** (~6hr) — Thinking Tools. Gated on ≥200 thoughts AND P2 shipped. `graduate_idea` couples to P2c.
14. **P7** — ongoing UI/data quality

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
