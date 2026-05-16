# customBrain — Roadmap
## Last updated: 2026-05-16 (v0.15.1)

Historical build plans archived in `docs/archive/`. Per-release detail in `CHANGELOG.md`.

---

## What's Built

### Foundation (0.1.x — 0.2.x, pre-history)

- **Core brain** (0.1.x): capture (with Haiku metadata extraction), semantic search (Gemini embeddings), recent, stats, delete, vault rebuild — Qdrant + Gemini + Haiku + Express one-backend-two-interfaces scaffold
- **MCP server** (0.2.x): 12 tools over SSE + Streamable HTTP + stdio transports
  - Brain tools: `capture_thought`, `search_brain`, `list_recent`, `brain_stats`, `rebuild_obsidian_vault`
  - Agent tools: `get_fireflies_transcripts`, `get_youtube_likes`, `get_gmail_threads`, `get_calendar_events`, `get_event_context`, `get_task_context`, `manage_drafts`
- **Chrome extension** (0.2.x): Manifest v3 "Save to Brain" web clipper
- **React UI** (0.2.x): capture, search, recent, stats, export tabs (Vite + React 19 + Tailwind 3)
- **Obsidian sync** (0.2.x): full vault rebuild via Google Drive (OAuth2 writes, service account reads), wikilinks in YAML frontmatter
- **Production** (0.2.x): Hetzner CX22 at `brain.beliczki.hu`, pm2, nginx reverse proxy
- **P1a — time decay** in search scoring (0.2.x)
- **P1b — conflict resolution at capture** (0.2.x): near-duplicate detection (cosine > 0.85) archives old thought + supersedes-links new one. True semantic contradiction detection deferred — embeddings measure topic similarity, not logical opposition.
- **People alias resolution** (0.2.x): `alias:` lines on Drive People/*.md, Haiku-prompt injection + deterministic post-processing in `metadata.js::resolveAliases`

### Shipped (0.3.0+)

- **0.3.0 (2026-04-18) — Auto-intake, zero-approval**: Fireflies webhook (meetings), YouTube likes cron (30min), Gmail label cron (10min). Shared `source` + `source_id` payload for idempotent dedup. Gmail body cleaner strips legal/confidentiality boilerplate (regex + Haiku).
- **0.3.1–0.3.2 (2026-04-18) — Deploy hardening + YouTube category filter**: cron env loading, Qdrant default URL, OAuth2 `gmail.modify` scope, Gmail thread-aware paragraph dedup, Fireflies HMAC verification. YouTube Music (categoryId=10) skipped by default; `YOUTUBE_SKIP_CATEGORIES` env override.
- **0.4.0 (2026-04-18) — YouTube Gemini summaries**: structured markdown (Summary / Key ideas / Action items / Frameworks / Speakers) via Gemini 2.5 Flash multimodal, replaces broken captions path.
- **0.4.1 (2026-04-19) — Data integrity rollup**: Fireflies backfill script, duration fix (minutes not seconds), `checkContradiction` prompt rewrite (defaults FALSE, requires logical contradiction not just "different content"), Chrome extension search uses content not tab title.
- **0.5.0 (2026-04-19) — P10 Brain Connection Hygiene**: `find_overconnected` + `suggest_metadata_fix` + `update_thought` MCP trio; `PATCH /thoughts/:id` HTTP route; capture-time prompt tightened against over-tagging.
- **0.5.2–0.5.4 (2026-04-19) — Project aliases + batch-hygiene + alias parser hardening**: `Projects/*.md` carry `alias:` lines (mirrors People); `scripts/batch-hygiene.js` (dry-run + `--apply`); comma-separated aliases, circular-loop detection, self-alias skip; grep-verify person removals; HU→EN topic flip rejection.
- **0.6.0 (2026-04-19) — P1d Semantic autolinks in Obsidian export**: `## Related thoughts` switched from metadata-overlap to in-memory cosine top-N above `RELATED_MIN_SCORE=0.75` (max 3 per thought). Each link carries a `*(score%)*` marker. Graph edges dropped ~80%.
- **0.6.1–0.6.2 (2026-04-20) — Fireflies fixes**: in-memory `inFlight` map kills webhook race-condition double-captures; `normalizeParticipants()` handles mixed-shape participants field and dedupes emails.
- **0.7.0 (2026-04-18) — Gmail thread refresh + outbound auto-label**: history-API driven cron with watermark. New messages on a brain-labeled thread atomically refresh the existing Qdrant point (preserves id, source_id, created_at; bumps `refresh_count`). Outbound to a known brain-person (matched via `email:` lines) auto-applies `brain` label and captures. `brain/captured` becomes a pure UI marker.
- **0.8.0 (2026-04-22) — Drive export preserves thought timestamps**: `createdTime`/`modifiedTime` passed on file create so Drive sort reflects capture/refresh time, not export-cron time.
- **0.8.1 (2026-04-22) — Version pill in UI header**: imports from `client/package.json`, renders `v<VERSION>` next to "customBrain".
- **0.10.0 (2026-05-01) — Coworker-loop summary skill**: replaces the 0.9.0 inline preprocessor. Long thoughts (>6000 chars) get a chronological `## Summary` block prepended above a `---` divider; semantic search reaches full content via the summary. Generation runs in a Claude Code session via `/summarize-long-thoughts` (subscription-billed) calling `list_thoughts_needing_summary` + `update_thought_text_with_summary`. Stale-detection by `summary_appended_at < updated_at`. Fireflies slice cap raised 30k → 180k.
- **0.10.1 (2026-05-01) — Title prefixed with primary project**: Haiku title-rule prepends `<Project> — ` when a primary project is identified.
- **0.11.0 (2026-05-01) — Full project.md content in Haiku prompt + strict project whitelist**: project documents passed to Haiku in full (not just names) via `withDocuments: true`. Explicit rule: never invent project names from client / product / campaign fragments — empty `projects` is correct, invented is wrong.
- **0.12.0 (2026-05-16) — Alias-aware writeStubs + Western-order People canonicals + sub-product fold**: `writeStubs` resolves candidate names through aliases before the existing-file check (no more duplicate People stubs from accent variants); projects get `skipAutoCreate: true` (strictly user-curated). 117 duplicate People `.md` deleted, 135 Qdrant payloads rewritten to Western-order canonicals. `FÉLRETESZEK`/`BEFCAST` folded into ERSTE sub-products.
- **0.13.0 (2026-05-16) — Obsidian-native YAML frontmatter for People/Projects**: replaces the custom `alias: X` / `email: X` body-line convention with standard Obsidian Properties (`aliases:` array, `email:`/`emails:`). Obsidian Properties UI manages them natively. Parser falls back to legacy body lines for un-migrated files. 78 files rewritten surgically by `scripts/migrate-to-frontmatter.js`.

---

## Roadmap review — 2026-05-16 (post-6-weeks-of-use)

After 6 weeks of daily use (0.3.0 → 0.13.0) the actual capture pattern, friction points, and direction have clarified. Re-prioritized below; individual P-sections kept (with status banners) so the historical reasoning stays auditable.

### Killed
- **P1 Telegram bot / mobile capture** — mobilon like / bookmark / label workflow van, nem text capture. P12 (X bookmarks) lefedi a mobil-keletkezésű X-tartalmat; Gmail label + YouTube likes a többit.
- **P1c People/Projects summary evolution** — felülírná user-edit .md fájlokat (kockázatos), és az értéke kétséges.
- **P7e index.md flat catalog** — marginal érték; Obsidian Graph + Drive lista már eléri amit ez adna.
- **P9 Thinking tools (challenge_idea, emerge_patterns, ...)** — Claude Desktop-ban `search_brain` + szabad prompt már megoldja amit ezek strukturáltan adnának; nem éri meg tool-felületet építeni fix promptra.

### Deferred (nincs jelenleg signal)
- **P2 Idea Lifecycle** — ideák task-ká vagy naptári bejegyzéssé válnak, nem brain-szintű állapotgéppel követjük.
- **P5a hot.md** — szellemében jó, de a P4f Agenda (új) lefedi a "minden session-be warm context" use-case-t.
- **P5 Lifecycle Prompts** — weekly review subsumed by Agenda; quick capture templates kell-e tényleg? Nem volt használati signal.
- **P8 RRF hybrid search** — 233 thought-on nincs mérhető recall probléma.

### Promoted / Reshaped (új top prio sorrendben)
1. **P0 Ops** — HTTPS, Qdrant backup, firewall (változatlan, de minden sharing előtt kell)
2. **P4f → Agenda (MCP + UI preview)** — TOP, lásd újraírt szekciót lent
3. **P12 (új) — X.com bookmarks coworker loop**
4. **P13 (új) — Settings UI + agent-installable**
5. **P6 → Brain Health Check (UI + MCP)** — cron-mentes, on-demand audit; lásd újraírt szekciót lent

Részletes execution order a dokumentum alján.

---

## USE IT FIRST — one week before building anything new

**STATUS (2026-05-16): ✅ PASSED — 6+ hét napi használat 2026-04-04 → 2026-05-16. 233 thought, real signal alapján a fenti Roadmap review átszervezte a prio sorrendet.**

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

### ~~P1c: Evolving People/Projects summaries~~ — KILLED 2026-05-16
**Killed**: felülírná user-edit .md fájlokat (kockázatos), és az értéke kétséges. Lásd Roadmap review szekciót.

After vault rebuild, group thoughts by person/project. Fetch existing summary .md from Drive, call Haiku to rewrite integrating new thoughts. Write updated summaries back.
- File: `server/routes/export.js`
- Note: People/Projects folders owned by service account — may need OAuth2 for writing

### ~~P1d: Semantic autolinks in export~~ — DONE (2026-04-19, v0.6.0)
Replaced the metadata-based `Related thoughts` dump (every shared-tag thought) with in-memory cosine top-3 above `RELATED_MIN_SCORE = 0.75`. `getAllWithVectors()` in `server/qdrant.js`; `semanticNeighbors()` + new `buildLinksSection()` in `server/routes/export.js`. Each link carries a `*(score%)*` marker. Expected effect: Obsidian graph edges drop ~80%, remaining edges are genuinely meaningful.

---

## P2: Idea Lifecycle — DEFERRED 2026-05-16

**Deferred**: ideák task-ká vagy naptári bejegyzéssé válnak Robi workflow-jában, nem brain-szintű állapotgéppel követjük. Lásd Roadmap review szekciót.

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
| **~~P4a: Telegram bot~~** | KILLED 2026-05-16 | Mobilon like / bookmark / label workflow van, nem text capture. |
| **~~P4c: iOS Shortcut~~** | KILLED 2026-05-16 | Ugyanaz mint P4a — nincs mobil text-capture igény. |
| **~~P4d: Email forwarding~~** | DONE | Replaced by Gmail label cron (`cron/gmail-intake.js`). Label = `brain`. |
| **~~P4e: Fireflies webhook~~** | DONE (2026-04-18) | `server/routes/fireflies-webhook.js`. Auto-capture on meeting end. |

Already built: Claude Desktop capture (#3), Browser extension (#6). Standup (#7) and briefing (#8) work via MCP without extra code.

Not planned: Voice agydump (Whisper API), WhatsApp bot — lower priority, can use Telegram + iOS Shortcut instead.

---

## P4f: Agenda (MCP + UI preview) — TOP PRIO, reshaped 2026-05-16

**Reshaped**: az eredeti "Chrome extension Calendar-mode" terv (lásd archív lent) helyett szerver-oldali agenda-szinkron + MCP tool + brain.beliczki.hu UI tab preview. Az LLM-mel végzett subtask-bontás a Claude Desktop / Code session-ben történik (ott perzisztál chat history-ban), a szerver csak adat-primitíveket szállít. Mintát követi: 0.10.0 coworker-loop.

### Architektúra (3 réteg)

**1. Backend cron** — `cron/agenda-sync.js`
- Frekvencia: óránként (mint `cron/export.js`)
- Lépések: Google Calendar olvasás (ma + 7 nap előre) → minden event-re `search_brain` (cím + attendee nevek alapján) → top-N matching thought, kapcsolódó people / projects / topics
- Output: `state/agenda-cache.json` (per event: `{ event, brain_context: { thoughts: [...], people: [...], projects: [...], topics: [...] } }`)
- **NEM** csinál subtask breakdown-t — az LLM dolga, és nem perzisztálódik a szerveren

**2. MCP tool** — `get_agenda({ days = 1 })` (mindkét `mcp.js` ÉS `mcp-stdio.js` — duplikáció szabály!)
- Visszaad: `state/agenda-cache.json` adott napra szűrve
- Cache-stale ha `mtime > 1hr` → opcionálisan refresh-eli (vagy stale return + warning header)
- HTTP route: `GET /agenda?days=N` (Bearer auth, ugyanaz mint a többi)

**3. UI** — új "Agenda" tab (`client/src/components/AgendaTab.jsx`)
- Felül: utolsó sync timestamp + "Sync now" gomb (ugyanaz mint a cron — ma + 7 nap újrahúz)
- Lista: ma + 7 nap calendar event-ek időrendben, mindegyik kártyán:
  - Esemény cím + idő + attendee-k
  - "Brain context" preview szekció (3-5 bullet: matching thoughts cím + score, people, projects, topics)
- NINCS breakdown szekció, NINCS perzisztencia — read-only ablak a cache-re

### Subtask breakdown (LLM-side)

Claude Desktop / Code session-ben:
1. User: "mit kell ma csinálnom?"
2. LLM hívja `get_agenda({ days: 1 })` → kontextus-gazdag event lista
3. LLM proposálja az event-enkénti subtask bontást + idő becslést
4. Beszélgetés chat history-ban marad — semmi vissza-perzisztencia brain-be alapból (ha user kéri: `capture_thought` külön)

### "Idő" jelentése

Csak becslés: ha egy event 1 óra és 8 subtask jött ki, az LLM jelzi melyik 3-4 fér bele realistically. Nincs Calendar block manipuláció, nincs Tasks integráció.

### Agent learning (deferred, csak flag)

Az agenda létezése **megnyitja az utat** hogy később (külön projekt, nem most) egy agent figyelje Robi subtask-bontási stílusát és imitálja. Két előfeltétel ami ma nincs: (1) a subtask breakdown valahogy perzisztáljon, (2) elég adat legyen tanulni belőle. Flag-elve, nem építjük most.

### Verzió-bump

0.13.0 → 0.14.0 (minor: új cron, új MCP tool, új HTTP route, új UI tab).

### Becsült erőfeszítés

~6-10hr (cron 1hr + MCP tool 1hr + HTTP route 0.5hr + UI tab 3-5hr + integráció és kézi teszt 1-2hr).

### Archív — eredeti P4f terv (Chrome extension Calendar-mode)

A Chrome extension overlay opciók (A: popup, B: inline content script, C: Claude ext + MCP, D: Workspace add-on) elvetve a szerveroldali agenda-szinkron + MCP tool javára. Indok: a server-side megoldás (a) konzisztens a 0.10.0 coworker mintával, (b) `Calendar UI` változások nem törik a brain-t, (c) Claude Desktop-ban natívan dolgozható fel.

---

## P4g: Google Slides brain assistant — context-aware slide work — DEFERRED 2026-05-16

**Deferred**: az eredeti dependency (P4f Calendar Chrome extension) megszűnt — P4f átalakult szerveroldali Agenda-vá. A Slides use-case attól függ hogy a Slides editor-ben valós igény legyen (most nincs signal rá), és a megoldás minta is változhat (Apps Script add-on vs. szerveroldali snapshot). Visszahozzuk ha valódi igény jelentkezik.

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

## P5: Lifecycle Prompts — DEFERRED 2026-05-16

**Deferred**: weekly review subsumed by P4f Agenda; quick capture templates / memory migration / Open Brain Spark — egyikre se volt használati signal 6 hét alatt. Visszahozható ha tényleg igény jön rá.

Templates that make the system compound:
- [ ] **Memory migration** — extract context from Claude/ChatGPT existing memory → bulk captures
- [ ] **Open Brain Spark** — interview-style: asks about tools, decisions, key people → personalized capture list
- [ ] **Quick capture templates** — 5 starters: Decision, Person note, Insight, Meeting debrief, Idea
- [ ] **Weekly review** — calls list_recent + brain_stats + lifecycle stats → clusters, surfaces unresolved actions, finds patterns. **Largely subsumed by P5a below.**

### ~~P5a: hot.md — nightly session context cache~~ — DEFERRED 2026-05-16
**Deferred**: a P4f Agenda (új) lefedi a "minden session-be warm context" use-case-t — agenda + brain context per-event egy MCP hívással.
Daily cron (~05:00 UTC) regenerates a ~500-word markdown at the vault root. Contents: last-7-days `list_recent` + active project summaries + top-5 people. Haiku-compressed. Every Claude Desktop / Code / Obsidian session opens warm — zero tool calls to establish context. Daily-automatic equivalent of the manual "Weekly review" above, compounding automatically with auto-intake volume.
- New: `cron/hot-cache.js` (~60 lines). No server changes, no new MCP tool.
- Writes via `drive-context.js` OAuth2.
- Full spec in brain thought `11e3aa53-f685-4c29-8d13-c1b8fcdd5e2f` (Task 1).
- **Highest-leverage of the four MemMolt ideas** — compounds per session forever.

---

## P6: Brain Health Check (UI + MCP) — RESHAPED 2026-05-16

**Reshaped**: az eredeti cron-alapú nightly/weekly/monthly maintenance terv (lásd archív lent) helyett **on-demand audit**. Nem akarunk éjjel csendben mutálódó vault-ot — Robi döntse el mikor cleanupol.

### Funkcionalitás

`brain_health_check()` — MCP tool ÉS `GET /health-check` HTTP route ÉS Stats tab alatt egy "Run health check" gomb. Mindhárom ugyanazt a `server/brain-health.js` core function-t hívja.

Output (JSON + UI render):
- **Duplicate candidates**: thoughtok cosine > 0.92 párokkal (lehet merge-elendő); per pár megmutatja a két címet + score-t
- **Over-tagged thoughts**: `find_overconnected` eredmény (már megvan 0.5.0 óta — itt csak felületre hozzuk)
- **Stale summaries**: `has_auto_summary && summary_appended_at < updated_at` — coworker-loop runtime-ot trigger-elhetsz
- **Embedding-window túllépők**: `text.length > 6000 && !has_auto_summary` — coworker-loop még nem futott rajtuk
- **Orphan People / Projects .md**: Drive-on People/Projects fájl ami semmilyen active thought-ban nincs hivatkozva
- **Pure-boilerplate Gmail-ek**: `brain/empty` labelű thread-ek száma (audit, nem cleanup)
- **Tag-szintű anomalies**: olyan project / person name ami csak 1-2 thought-ban szerepel és nincs canonical .md-je

### Mit NEM csinál

- **Nem mutat semmit auto-cleanup-ként.** Csak listáz. Te döntsd mit teszel: `update_thought`, `delete`, kézi merge, stb.
- **Nem futtat cron-t.** Akkor fut amikor Te indítod.

### Verzió-bump

0.x.0 → 0.x+1.0 (minor: új MCP tool + új HTTP route + UI panel).

### Becsült erőfeszítés

~2-3hr (core function 1hr + MCP/HTTP wiring 0.5hr + UI panel 1hr).

### Archív — eredeti cron-terv

- ~~Nightly (3 AM): find near-duplicates (>0.92), merge via Haiku, run conflict resolution~~
- ~~Weekly (Sunday): re-summarize People/Projects, surface dormant ideas >30 days, prune archived >90 days~~
- ~~Monthly (1st): rebuild old embeddings, recompute time-decay, generate "idea metabolism" report~~

Elvetve: auto-mutáció éjjel csendben túl kockázatos egy single-user személyes brain-en. On-demand audit elég.

---

## P7: UI & Data Quality

- [ ] **P7a**: Edit thought (`PUT /thoughts/:id` + re-embed if text changed + UI edit button)
- [ ] **P7b**: Re-process old thoughts — backfill missing titles/projects with current metadata prompt
- [x] ~~**P7e**: `index.md` — flat one-line catalog~~ — **KILLED 2026-05-16**. Marginal érték: Obsidian Graph + Drive lista már eléri.
- [ ] **P7c**: Bulk import from Obsidian (`scripts/import-vault.js`)
- [ ] **P7d**: UI polish — auto-resize textarea, filter/sort on Recent (by type, project, person, date), stats charts

---

## P8: Search Quality — RRF hybrid (vector + BM25) — DEFERRED 2026-05-16

**Deferred**: 233 thought-on nincs mérhető recall probléma. Visszahozható ha valódi recall-failure-t észlelsz.

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

## P12 — X.com bookmarks coworker loop (új 2026-05-16)

Cél: az X.com bookmarks-od (auth-fal mögött) bekerüljön brain-be a már bevált coworker-loop mintán (0.10.0 `/summarize-long-thoughts` mintájára).

### Architektúra

**Új skill**: `~/.claude/skills/process-x-bookmarks/SKILL.md` (globális, user-invokálható: `/process-x-bookmarks`)
- Claude Code session **computer-use módban** → már bejelentkezett böngésződ → navigál `https://x.com/i/bookmarks`-ra
- Scrape: bookmark lista (tweet ID + URL + content snippet vagy linkelt article URL)
- Per bookmark: `findBySourceId('x', tweet_id)` → ha nincs, `captureThought(text, { source: 'x', sourceId: tweet_id, extraPayload: { tweet_url } })`
- Loop amíg el nem fogy az új bookmark vagy infinite scroll vége

**V1 capture content**:
- Ha a bookmark tweet (csak text): tweet body + szerző + dátum
- Ha a bookmark linkre mutat (article): WebFetch a linket → article text → capture
- **Nem hoz létre új People stub-ot tweet szerzőkből** — külön szabály a metadata extraction prompt-ban (mint a 0.11.0 strict project whitelist)

**Payload konvenció**:
- `source = 'x'`
- `source_id = <tweet_id>` (rövid, idempotens — `findBySourceId` ezzel keres)
- `tweet_url = <full URL>` extraPayload mezőben (informatív, ránézésre érted mi az)

**Idempotencia**: `findBySourceId` dedup early-return mint a többi auto-intake (Fireflies / YouTube / Gmail).

### Mit NEM csinál v1

- Nincs thread-mélyítés (parent tweet, reply chain) — később ha kell
- Nincs kép / videó analízis (Gemini multimodal X URL-en lehet menne, de nem most)
- Nincs auto-remove a bookmarks-ról (Te bookmarkold tovább kézzel)
- Nincs új People stub tweet szerzőkből

### Verzió-bump

0.x.0 → 0.x+1.0 (minor: új capture path, új source type, új skill).

### Becsült erőfeszítés

~3-5hr (skill prompt + DOM scrape kódja + capture wiring + tesztelés a Te X account-odon). Computer-use stabilitás kockázat: X gyakran változtat a DOM-on, lehet hogy iterálni kell a selector-okon az első hetekben.

---

## P13 — Settings UI + agent-installable (új 2026-05-16)

Cél: bárki letöltheti gitből, beállíthatja saját Hetzneren (vagy bárhol), saját API tokenekkel — single-tenant, de **plug-and-play**. Nem multi-user (továbbra is: 1 instance = 1 ember), de a setup ne kelljen 4 óra .env-szerkesztgetés.

### A) Settings UI

**Storage**: `state/settings.json` (file-system permission 0600). Nincs SQLite — overkill ehhez. JSON formátum: `[{ key, value, is_secret, updated_at }, ...]`.

**UI** — új "Settings" tab (`client/src/components/SettingsTab.jsx`):
- Mezők kategóriák szerint csoportosítva: Google Drive (service account JSON path + OAuth2 client/secret/refresh), Fireflies (API key + webhook secret), Anthropic, Google API (Gemini), Gmail OAuth, YouTube, CAPTURE_SECRET, Qdrant URL
- `is_secret: true` mezők: input `password` típusú, megjelenítés maszkolva (`••••••••<utolsó 4>`), "Show" gomb temporary reveal
- "Save & Restart" gomb → írja `state/settings.json`-be → `process.exit(0)`-zal kilép → PM2 auto-restart felveszi az új értékeket

**Auth**: ugyanaz a CAPTURE_SECRET (single-user assumption — aki a Bearer-rel bejön, az tudja állítani is).

**Config service**: `server/config.js` — minden modul ezen keresztül olvas tokent (`config.get('ANTHROPIC_API_KEY')`). Olvasási sorrend: `settings.json` → `process.env` fallback → undefined. A fallback miatt a régi `.env`-es deploy-ok átmenetileg nem törnek el.

**Migráció** (egyszeri, MOST): `scripts/migrate-env-to-settings.js` — Hetzner-en futtatva beolvassa a `.env`-et, beírja a `state/settings.json`-be. A script végén jelez: "OK to delete .env, all values migrated. Verify in UI before deletion." Te ellenőrzöd UI-on, törlöd a `.env`-et.

**Onboarding** (első indítás): ha `state/settings.json` üres ÉS `.env` is üres → UI a Settings tab-ra redirect-el "complete setup" üzenettel. Más tab-okon error banner: "API keys missing".

### B) Agent-installable — `INSTALL.md`

Új gyökér-szintű fájl, **Claude Code-nak írva, nem embernek**. Skeleton most kerül be, részletes step-by-step parancsok későbbi session-ben Hetzneren tesztelve.

Cél workflow:
1. User kap egy hostot (Hetzner CX22 vagy más Ubuntu 24.04 VPS), SSH kulccsal
2. Lokális Claude Code-nak megadja: "set up customBrain on root@<host> with this key"
3. Claude Code követi `INSTALL.md`-t, mindenhol verify command-okkal — tudja mikor akadt el
4. Végén: user mehet `https://<host>/`-ra, Settings tab, paste API keys
5. Plug be Claude Desktop-ba MCP config snippet alapján

### Verzió-bump

A) Settings UI → 0.x.0 → 0.x+1.0 (minor: új tab, új storage, config service refactor)
B) INSTALL.md skeleton → patch (doc-only)
B) INSTALL.md teljes step-by-step → minor (új user-visible capability)

### Becsült erőfeszítés

A) Settings UI: ~4-6hr (storage 1hr + config service refactor 1-2hr + UI tab 2hr + migration script 0.5hr + onboarding flow 0.5hr)
B) INSTALL.md skeleton: ~30min most
B) INSTALL.md teljes részletes: ~3-4hr külön session-ben Hetzneren tesztelve

### Sharing előfeltétele

P13A Settings UI nélkül nincs sharing. P13B INSTALL.md csak akkor érdekes ha van legalább 1 önként vállalkozó barát-tester (1 hónap napi single-tenant use).

---

## P14 — Agenda relevance / Qdrant search quality (új 2026-05-16, founded by 0.15.0 real use)

**Probléma**: a 0.15.x Agenda live tesztje után egyértelmű hogy a Qdrant semantic search gyenge releváns thoughts-felhozásban a Te tényleges brain-edre. Példák a 2026-05-16 agenda-ról:
- **"ERSTE Adform SZA frissítés 150e..."** — a "SZA" Te számára `SZAMLAK`-ot (számlák) jelent, de a search "Beerste 3.0 kampány költségvetést" hoz fel — más, régebbi, kampány-pénzügyi kontextus, irreleváns
- **"customBrain dev next steps..."** — a `recent` fallback `AI-first knowledge graph architektúra`, `AI feldolgozási réteg`, `API-kulcs aktiválás teszt`-et hoz, miközben a brain-ben vannak relevánsabbak: "pillanatkép", "customBrain fejlesztési feedback"
- Általában: `0.65` cosine threshold sok valódi releváns thoughtot is kiszűr, miközben gyenge linguistic-similarity match-ek 0.7+ score-ral még mindig átmennek

**Független a jelenleg futó P12/P13-tól.** A relevance gyengeség minden olyan funkciónál visszaüt ami `search_brain`-re épül: Agenda, Chrome extension Save-to-Brain related-thoughts, get_event_context, manage_drafts review.

### Likely causes (még nem megerősítve)

1. **`gemini-embedding-001` gyenge magyar domain-szókincsen** — főleg abbreviációkon (SZA, DCO, B2B sub-product code-ok), code-mixed HU/EN szövegen, és Bizi-specifikus belső terminusokon
2. **Recency-rank a project-tag fallback-ben** rossz proxy a relevancia helyett — egy 18 thought-os customBrain projektben a legutóbbi 3 nem feltétlenül a legrelevánsabb a "dev next steps" event-hez
3. **No re-rank layer** — top-K embed match common a tanult corpora-n hogy alacsony precision-ű; egy Haiku re-rank (vagy cross-encoder) javítana
4. **No domain synonym expansion** — a search nem tudja hogy "SZA" ≈ "SZAMLAK" ≈ "számlák"

### Approach options (cost-rendezve)

| Option | Effort | Yield (becslés) |
|---|---|---|
| **A**: project-tag fallback-ben recency helyett **cosine-to-event-title within project subset** | ~30min | Magas (customBrain case fix) |
| **B**: user-curated terminológia szótár (`config/synonyms.yaml`: SZA → "számla SZAMLAK", DCO → "..."), query expansion at search time | ~1hr | Közepes-magas |
| **C**: Haiku re-rank — adott event-titlere és top-10 candidate-re, kérd Haikut hogy válasszon top-3-at. Költség: $0.01/event × 25 event × 24 hourly = ~$6/nap = $180/hó | ~2hr | Magas, de költséges |
| **D**: P8 RRF hybrid (BM25 sparse + dense) — már a roadmap-en `DEFERRED`-ként, de a current evidence visszatolhatja az aktív listára | ~2 days | Bizonytalan magyar nyelven |
| **E**: Embedding model csere (multilingual-e5-large vagy hasonló) — Qdrant collection re-embed all | ~4-6hr | Bizonytalan |

**Javaslat sorrend**: A → B → (mérünk: ha A+B elég jó, megáll). C only ha kritikusan kell, D/E csak ha minden más kifulladt.

### Mit NEM csinálunk most

Ez P14, nem azonnali — a current execution order P12/P13 marad fókusz. P14 visszahozható prioritásban ha:
- Agenda relevance napi szinten fájdalmas
- Más search-épült feature (Chrome ext related-thoughts, draft review) is láthatóan rossz
- Másik user (P13 után) hasonló relevance-panaszt jelent

### Cross-ref

- 0.6.0 P1d már megoldotta ezt az export `## Related thoughts` szekcióhoz (cosine threshold + top-N) — de ott a "compare against the brain itself" use-case van, nem "compare external query (event title) against brain"
- P10 (DONE) brain-hygiene a metadata over-tagging-et oldja meg, NEM a search relevance-t

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

## ~~P9: Thinking Tools — outbound brain intelligence~~ — KILLED 2026-05-16

**Killed**: Claude Desktop-ban `search_brain` + szabad prompt már megoldja amit ezek strukturáltan adnának (challenge / patterns / bridges). Nem éri meg tool-felületet építeni egy fix promptra. A bi-temporal helpers (`get_supersedes_chain`, `get_belief_history`) — ha valaha kell — pici külön ticket lehet.

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

Updated 2026-05-16 a Roadmap review után (USE IT FIRST gate ✅ passed). Killed / deferred itemek a top "Roadmap review" szekcióban indokolva — nem ismétlem itt.

1. **P0 Ops** (~3hr) — Qdrant backup cron (off-server snapshot, brain pótolhatatlan adat — **NOW**), HTTPS via certbot brain.beliczki.hu, firewall Qdrant 6333. Előfeltétele bármilyen sharing-nek vagy third-party setup-nak.
2. **P4f Agenda — MCP + UI preview** (~6-10hr) — TOP. Új cron + új MCP tool + új HTTP route + új "Agenda" UI tab. Lásd P4f részletes szekciót.
3. **P12 X.com bookmarks coworker loop** (~3-5hr) — Új skill, új capture path (`source: 'x'`). Lásd P12 részletes szekciót.
4. **P13A Settings UI** (~4-6hr) — `state/settings.json` storage, config service refactor, UI tab, migration script. Lásd P13 részletes szekciót. *(Előfeltétele a P13B-nek és bármilyen sharing-nek.)*
5. **P6 Brain Health Check** (~2-3hr) — On-demand audit MCP + HTTP route + Stats tab panel. Lásd P6 részletes szekciót.
6. **P13B INSTALL.md teljes step-by-step** (~3-4hr) — Hetzneren tesztelve. Kapuja: van legalább 1 önként vállalkozó barát-tester aki napi szinten használná.
7. ***Sharing / federation vízió — nem most.*** Step 1 = 1 barát napi user 1 hónapig single-tenant instance-en. Csak utána térünk vissza a federation-protocol kérdésre.

### Folyamatos / opcionális

- **Coworker-loop summary** (0.10.0, kész) — `/summarize-long-thoughts` periodikusan futtatva, figyelni hogy nem rohad
- **P7a/b/c/d UI polish** — ad-hoc, amikor zavar
- **P11 incremental export** — csak ha az export ideje kezd fájni (jelenleg ~10sec @ 233 thought, nem prioritás)

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
