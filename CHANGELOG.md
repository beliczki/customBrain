# Changelog

Semantic versioning (`major.minor.patch`). Versions live in `package.json` (root, `server/`, `client/`) and `extension/manifest.json`.

## 0.10.0 — 2026-05-01

**Skill-driven coworker loop replaces inline auto-summary.** The 0.9.0 inline preprocessor put the summary-generation hot path on the server, which meant every long capture and every Gmail thread refresh paid Anthropic API calls against the server's `ANTHROPIC_API_KEY`. Switched to a coworker-loop pattern: the server only exposes the read/write endpoints; the actual summary generation runs in a Claude Code session via a dedicated skill, which puts the inference cost on the user's subscription rather than the API key.

### Behaviour changes

- **`captureThought` and `refreshCapture` no longer summarize inline.** New long captures land in Qdrant with their raw text — embedding sees only the first ~6000 chars until the coworker loop fills in a summary. The 0.9.0 payload fields `summary_generated_at` and `original_text_length` are gone.
- **`server/auto-summary.js` deleted.** All 0.9.0 inline-preprocessor logic removed.
- **`scripts/backfill-summaries.js` deleted.** The skill (`/summarize-long-thoughts`) replaces it — repeatable, on-demand, subscription-billed.

### New MCP tools

Both registered in `server/mcp.js` AND `server/mcp-stdio.js` (per CLAUDE.md duplication rule). Both also exposed as HTTP routes for non-MCP callers.

- **`list_thoughts_needing_summary({ limit })`** — returns thoughts where `text.length > 6000` AND (no summary yet OR `summary_appended_at < updated_at`). Sorted oldest-summary-first for fair loop progress. Returns full text per thought so the coworker doesn't need a follow-up fetch. HTTP: `GET /thoughts/needing-summary?limit=N`.
- **`update_thought_text_with_summary({ thought_id, summary_text })`** — strips any existing summary block (regex on `^(# .+\n\n)?## Summary\n[\s\S]*?\n---\n+`), prepends a fresh block, hoists the first `# Title` line above. Sets `has_auto_summary: true`, `summary_appended_at`, `summary_source: 'coworker'`. Idempotent. HTTP: `POST /thoughts/:id/set-summary`.

### Stale-detection design

The summary block stays in place across `refreshCapture` calls — we do NOT strip it on every Gmail thread refresh. A summary becomes "stale" when `summary_appended_at < updated_at`; the list tool surfaces these and the coworker overwrites them on the next pass. This avoids burning a subscription call on every Gmail thread refresh (a frequently-touched thread would otherwise trigger many extra Haiku-equivalent generations per day).

### What kept from 0.9.0

- **`MAX_TRANSCRIPT_CHARS = 180000`** — Fireflies cap stays raised. ~3-hour meetings now capture cleanly; the coworker loop summarizes them on the next pass.
- **`scripts/backfill-fireflies-transcripts.js`** — kept as a one-off data-migration tool (re-fetches the full transcript for thoughts truncated by the old 30k slice). No LLM in this script — pure Fireflies API + Qdrant. Run on Hetzner once, then the coworker loop catches up.
- **`server/qdrant.js` cleanup** — `getById` now spreads the full payload (was projecting a fixed subset, dropping `has_auto_summary`, `refresh_count`); `scrollFilteredRaw(filter, limit)` for raw-payload scrolls. Both stay.

### New skill

`~/.claude/skills/summarize-long-thoughts/SKILL.md` (global, user-invocable as `/summarize-long-thoughts`). Workflow: list → for each (in-session inference using the prompt template lifted 1:1 from the deleted `auto-summary.js`) → set → repeat until empty. Designed to be wrappable in `/loop` for periodic execution.

### Deploy + first run on Hetzner

1. `git pull` on the server.
2. `pm2 stop all && fuser -k 3000/tcp` (per `feedback_hetzner_restart.md`).
3. `pm2 start all`.
4. (Optional, once) `node scripts/backfill-fireflies-transcripts.js --dry-run` then live — re-fetches Fireflies transcripts truncated by the old 30k slice. Refresh now leaves text untouched of summary logic; the coworker pass next will summarize.
5. Locally: `/summarize-long-thoughts` — runs the loop until the brain is caught up.

## 0.9.0 — 2026-04-28 (superseded by 0.10.0)

**Auto-summary preprocessor + Fireflies slice cap raised to 180k.** Long thoughts (Fireflies meetings, long Gmail threads, hand-pasted notes) silently lost their tail to the Gemini embedding window — `embedding-001` caps at 2048 tokens (~6000 chars HU/EN mixed), so anything beyond that was unreachable via semantic search even though it sat in the payload. The Fireflies webhook compounded this by hard-slicing the transcript at 30000 chars before storage; a ~90-minute meeting often hit that cap and lost its closing topics entirely (reported regression: a libikóka-question on a recent Hiflylabs sync was nowhere to be found in brain).

### Capture-pipeline change

- `server/auto-summary.js` (new) — `prepareTextForCapture(text, { priorAutoSummary })`: if `text.length > AUTO_SUMMARY_THRESHOLD` (default 6000) and the input isn't already wrapped, asks Haiku for a chronological summary (default 5000-char target, hard-capped at 5500), then prepends `## Summary\n<summary>\n\n---\n\n<original>` to the text. The first `# Heading` line, if present (Fireflies convention), is hoisted above the summary block.
- `server/routes/capture.js` — both `captureThought` and `refreshCapture` now run text through the preprocessor before embedding + Haiku metadata extraction. Embedding therefore sees the summary first, covering the full content; metadata extract (which only reads the first 5000 chars) gets a clean, dense view. New payload fields: `has_auto_summary: true`, `summary_generated_at`, `original_text_length`. `refreshCapture` passes `priorAutoSummary` so we don't re-summarize an already-wrapped point on every Gmail thread refresh.
- `server/qdrant.js` — `getById` now spreads the full payload (was projecting only a fixed subset, dropping `has_auto_summary`, `refresh_count`, etc.). New `scrollFilteredRaw(filter, limit)` for backfill scripts that need the full payload.

### Slice cap

- `server/routes/fireflies-webhook.js` — `MAX_TRANSCRIPT_CHARS`: 30000 → 180000 (~3-hour meeting). The auto-summary handles the embedding-window problem, so the cap exists only as a sanity bound against pathologically large payloads.

### Backfill scripts

- `scripts/backfill-fireflies-transcripts.js` (new) — re-fetches every `source: 'fireflies'` thought whose stored text length is ≥29000 (likely truncated by the old slice), calls Fireflies API for the full transcript, and `refreshCapture`s in place. Refresh runs the auto-summary preprocessor, so a successful refresh both restores the lost tail AND adds the summary prefix. `--dry-run` supported. Idempotent.
- `scripts/backfill-summaries.js` (new) — for every existing Qdrant point with `text.length > 6000` and no `has_auto_summary`, runs the preprocessor and `refreshCapture`s. `--dry-run` supported. Idempotent. Run AFTER the Fireflies refetch so summaries reflect the full restored content.

### Operational order on Hetzner

1. Deploy code + bump.
2. `node scripts/backfill-fireflies-transcripts.js --dry-run` → review delta sizes → run for real.
3. `node scripts/backfill-summaries.js --dry-run` → review candidate list → run for real.
4. `rebuild_obsidian_vault` (MCP) or wait for the hourly cron — Obsidian Related-thoughts links recompute from the now-better vectors.

### Tunables (env vars on the server)

- `AUTO_SUMMARY_THRESHOLD` — default 6000. Anything longer gets a summary prefix.
- `AUTO_SUMMARY_TARGET` — default 5000. Soft target the prompt asks Haiku for; hard cap is 5500.

## 0.8.1 — 2026-04-22

**Version tag in the UI header.** `client/src/App.jsx` imports the version from `client/package.json` (Vite's native JSON import) and renders `v<VERSION>` as a small secondary-grey pill next to the `customBrain` title. Visible only after login; the login screen still shows just the title. Purely cosmetic — no behaviour change, useful for spotting whether a deploy actually rolled.

## 0.8.0 — 2026-04-22

**Drive export preserves thought timestamps.** `server/routes/export.js` now passes `createdTime` and `modifiedTime` on `drive.files.create` for each thought `.md` — `createdTime` = `thought.created_at`, `modifiedTime` = `thought.updated_at || thought.created_at`. Files on Drive now sort by when the thought was captured (or last refreshed for Gmail threads), not by when the export cron last ran. Obsidian's own sort is unaffected (it reads `captured_at` frontmatter), so this is a Drive-UI-only improvement. People/Projects stub files are untouched — they aggregate across thoughts, so a single capture date doesn't apply.

Also: CLAUDE.md caught up with already-shipped code — added the `find_overconnected` / `suggest_metadata_fix` / `update_thought` brain-hygiene MCP trio, plus `PATCH /thoughts/:id` and `POST /fireflies-webhook` (HMAC, not Bearer) to the HTTP API table.

## 0.7.0 — 2026-04-18

**Gmail thread refresh + outbound auto-capture via history API.** Replaces the O(N) `label:brain -label:brain/captured` list query with an O(changes-since-last-tick) history walk. Fixes the reported bug: new messages on an already-captured thread never made it into brain because `brain/captured` excluded the thread from every subsequent tick.

### Why the old design was a dead-end

Old `cron/gmail-intake.js` filtered out threads already tagged `brain/captured`. Once a thread's first message was captured, later replies were invisible to the cron — even though Obsidian still needed them. At ~100 threads this was annoying; at 1000+ threads it would have been unbearable (the list grows monotonically with time).

### New architecture

- **Watermark file** `state/gmail-watermark.json` stores the last processed Gmail `historyId`. Added `state/` to `.gitignore`.
- **Per-tick diff**: `gmail.users.history.list({ startHistoryId, historyTypes: ['messageAdded', 'labelAdded'] })` returns only threads that changed since the watermark. Paginates, advances watermark at end.
- **Bootstrap fallback**: if the watermark is missing (first run) OR Gmail returns 404 (watermark older than Gmail's ~7-day history retention), fall back to a one-time `label:brain` scan and reset the watermark from `users.getProfile.historyId`.
- **Per-thread classification** in `processThread()`:
  - Thread has `brain` label AND existing capture exists → compare `latestInternalDate` vs stored `last_internal_date`; if newer, call `refreshCapture(existing.id, newText)` (atomic in-place replace preserving id, source, source_id, created_at).
  - Thread has `brain` label AND no existing capture → `captureThought(...)` as before.
  - Thread has no `brain` label → scan for outbound message (SENT label + recipient in vault's `peopleEmails`). If match: auto-apply `brain` label, capture, record `auto_labeled_via: outbound:<canonical>`. Otherwise ignore.
- **Label meaning shift**: `brain/captured` is now just a UI marker (Gmail sidebar "yes I saw this"), NOT a filter gate. Threads stay in the candidate pool forever; the `last_internal_date` comparison decides refresh.

### Infrastructure changes

- `server/qdrant.js` — `upsertPoint(vector, payload, id = null)` now accepts optional id (for atomic refresh); `findBySourceIdRaw(source, sourceId)` returns the full payload (scrollFiltered mapper dropped fields we now need like `last_internal_date`, `refresh_count`).
- `server/routes/capture.js` — `captureThought` gained `extraPayload` option (merged into Qdrant payload); new `refreshCapture(id, newText, { extraPayload })` export — embeds + re-extracts metadata + upserts to the SAME point id, preserving source/source_id/created_at and incrementing `refresh_count`. **Manual P10 curation can be lost on refresh** — add a `metadata_verified` flag later if that proves to be a problem in practice.
- `server/drive-context.js` — `listWithAliases()` now also parses `email: <addr>[,<addr>...]` lines from People/<Name>.md files, returns `{ names, aliases, emails }`. `getVaultContext()` exposes `peopleEmails` (email → canonical name map). Used by the outbound-match check.

### Migration

- `scripts/backfill-gmail-thread-metadata.js` — one-off, dry-run default. Iterates all `source=gmail` points, sets `thread_id = source_id` and `last_internal_date = Date.parse(created_at)` as a conservative lower bound (the original capture time is always ≤ the newest message's internalDate at that moment, so a real new reply will still trigger a refresh). Idempotent (skips points with `thread_id` already set). Required once before the new cron runs on a pre-0.7.0 brain, otherwise every gmail thread would refresh on the first history tick that touches it.

### User-side setup (post-deploy)

- Add `email: foo@bar.com` lines to People/<Name>.md for anyone whose outbound replies from you should auto-capture. Comma-separated supported. No local config — Drive is the source of truth.

### Known non-goals

- No reaction/emoji-only filter (yet). If you send "👍" to a known brain person, that outbound event auto-labels the thread. Fine for now — the body cleaner tolerates low-signal text. Revisit if noise shows up.
- No cross-check between multiple brain accounts / shared threads. Single-user system.

## 0.6.2 — 2026-04-20

Fireflies `participants` normalization. Two observed issues in one fix:

1. **Mixed delimiters** — participants line in captured text had `,` (no space) for one segment then `, ` (with space) for another, breaking Obsidian's auto-wrap on emails.
2. **Duplicated emails** — every participant appeared twice in the list.

**Root cause.** Fireflies' GraphQL `participants` field mixes shapes: one element is sometimes a comma-joined string of all organizer+attendee emails, plus additional elements for each attendee individually. Our `.join(', ')` over that produced `"joined-string, individual1, individual2, ..."` — all emails appearing both inside the joined string AND as standalone elements.

**Forward fix**: new `normalizeParticipants()` helper in `agent/tools/fireflies.js::shapeTranscript`. Handles any shape Fireflies returns — array, string, or mixed. Splits on commas/semicolons, trims, dedupes, returns clean array. All future Fireflies captures (webhook + backfill + MCP tool) get normalized emails.

**Backward correction**: `scripts/fix-fireflies-participants.js`. Scans existing `source='fireflies'` captures, rewrites ONLY the `Participants:` line of each text where the issue is detected. Dry-run default; `--apply` commits via direct `updatePayload({text})`. Embeddings are NOT re-generated — cosmetic whitespace/dedup has negligible effect on cosine similarity, and re-embedding would cost far more than it saves.

## 0.6.1 — 2026-04-20

Race-condition fix in the Fireflies webhook path. First observed 2026-04-20: `B2B Digitális Tudakozó - heti sync` meeting captured twice (points `9a36e339-...` and `f8761469-...`, both `source_id: "01KPFY7N7K9TCKBF67S5JDNTWY"`, 80 seconds apart).

**Root cause.** Our handler held the HTTP connection open for 30-90 s while fetching the transcript (up to 3× 30s retries), then embedding, then Haiku metadata. Fireflies' webhook retry timeout is shorter than that window, so it re-fired the same `meeting_id`. Both fires passed `findBySourceId` (neither had upserted yet), both ran the full pipeline, both wrote separate points.

**Fix.** Module-scoped `inFlight = new Map<source_id, timestamp>` in `server/routes/fireflies-webhook.js`. When a webhook arrives:

1. If the `meeting_id` is already in `inFlight` → respond `200 {in_flight: true}` immediately and drop out. Fireflies stops retrying; no duplicate work.
2. Otherwise: call `findBySourceId` as before. If a point already exists (late retry from a truly-completed earlier fire), respond `200 duplicate`.
3. If both checks pass, set the `inFlight` entry, do the slow work, clean up in `finally` regardless of success/error.

Single pm2 instance → in-memory Map is sufficient. At scale beyond one process we'd move to a shared lock (Redis, Postgres advisory lock, etc.).

One-off cleanup: deleted the `f8761469-...` duplicate point; kept `9a36e339-...` (the original, captured 80s earlier).

## 0.6.0 — 2026-04-19

**P1d shipped: Semantic autolinks in Obsidian export.** Ships the third of the four TODO-STEAL-4-MEMMOLT items (`11e3aa53-...`).

### The problem this fixes

The body-level `## Related thoughts` section in every exported `.md` used to list every other thought sharing ANY person / project / topic via `buildLinkIndex()` + `buildLinksSection()`. A note tagged `[Proficio, Messaging matrix, Bizi]` would backlink to every thought touching any of those three — easily 40+ "related" entries, most of them spurious. The Obsidian graph view became a hairball of false edges.

### The fix

- New `server/qdrant.js::getAllWithVectors()` — fetches all points with both payload and vectors in one pass (vs the previous payload-only scroll).
- `server/routes/export.js` now switches to `getAllWithVectors()`, computes **in-memory cosine similarity** per thought against all others, and emits only the top-N neighbors above a threshold as the Related section.
- Tunable constants at the top of `export.js`:
  - `RELATED_MIN_SCORE = 0.75` — minimum cosine. Below → edge dropped.
  - `RELATED_MAX = 3` — cap per thought.
- If no neighbors qualify, the section is omitted entirely (no empty header).
- Each link gets a small `*(score%)*` trailing marker so you can see WHY the edge is there when you open the .md.

### Dead code removed

- `buildLinkIndex()` — no longer needed.
- `buildLinksSection()` replaced with `semanticNeighbors()` + new `buildLinksSection()` signature.

### Effects to expect on next rebuild

- Obsidian graph edges drop ~80% — only genuinely similar thoughts link to each other.
- `slash-loop-projekt-health-check` (the user's pain point): 45+ related thoughts → likely 2-3 real matches (other project-health or monitoring notes).
- `agent-önbizalom-csapda` (the P10 pilot target): even with its 8 project tags, semantic neighbors are whatever's actually similar in meaning, not "anything touching those 8 projects".

### Performance

At 118 thoughts, 118 × 117 cosine ops over 3072-dim vectors ≈ 43M multiplies ≈ 1–2 sec extra at export time. Linear in `N²`; revisit if the brain hits ~1000 thoughts and export starts exceeding ~30 sec. The `scripts/eval-strict-prompt.js` pattern is available for future A/B if threshold tuning is needed.

### ROADMAP status

- **P1d** → ~~DONE~~ (2026-04-19, v0.6.0)
- Remaining TODO-STEAL-4-MEMMOLT items: P5a (hot.md), P7e (index.md), P8 (RRF hybrid search).

## 0.5.4 — 2026-04-19

Alias parser defense — matches how users actually write aliases in People/Projects markdown files.

- **Comma-separated alias values supported.** `alias: foo, bar, baz` now expands to three separate alias entries instead of being stored as a single-key string. Real-world case: `Projects/Bizi.md` had `alias: B2B asszisztens, Dasszisztens, B2B digitális tudakozó` — previously stored under one malformed key, none of the aliases resolved. Now they all resolve correctly.
- **Circular alias loop detection + auto-break.** When `A → B` and `B → A` both exist in the map, the parser breaks the loop deterministically. Rule: if one name is a real filename in the folder and the other isn't, the filename wins. Otherwise, alphabetical tie-break. Warns to the log. Real-world case: `People/Me.md` and `People/Beliczki Róbert.md` both existed and cross-referenced each other; `Me → Beliczki Róbert` silently won, breaking the pilot dry-run. User cleanup deleted the duplicate file; this patch prevents the recurrence from config mistakes.
- **Self-aliases skipped.** If a file declares `alias: <same-as-filename>`, silently ignored.

## 0.5.3 — 2026-04-19

Three fixes from the first batch-hygiene dry-run. All three were **caught in dry-run before any Qdrant writes** — the architecture worked as designed.

- **Alias resolution on `suggestCleanedMetadata` output.** Haiku sometimes returned canonical-aliases as-is (e.g., `Beliczki Róbert` instead of `Me`). `suggestCleanedMetadata` now runs `resolveAliases` on the `proposed.people` and `proposed.projects` arrays before returning, same treatment `extractMetadata` gets. Prevents duplicates like `Me` + `Beliczki Róbert` surviving side-by-side after a pilot apply.
- **Grep-verify EVERY person removal.** The previous heuristic only grep-checked when Haiku's reason literally said "not mentioned" / "nem szerepel". But Haiku's phrasing varied ("appears to be erroneous", "not actively mentioned", etc.) and real attendees were dropped. New rule in `scripts/batch-hygiene.js`: for every person in the original `people` array that Haiku proposes to drop, search the text — if the name appears, keep the person regardless of Haiku's reason. Cost: tolerate an attendee who didn't speak. Benefit: no silent participant drops.
- **Revert topics wholesale on HU→EN flip.** Previously the post-processor detected the flip and logged a note but left the English topics in place. Now: if the original had ≥3 Hungarian topics and the proposal has <50% Hungarian, the full topic replacement is rejected — original topics kept verbatim. User can tune manually. Auto-translating + auto-pruning simultaneously compounded errors; stop doing both.

Effect on the next dry-run: "Beliczki Róbert" should no longer appear as a new person. `Varfi Tamas` and similar grep-verifiable attendees won't drop. Topic-heavy Hungarian notes will see their topics preserved rather than re-imagined in English.

## 0.5.2 — 2026-04-19

Post-pilot consolidation. Pilot (10 candidates, all applied) surfaced two systemic gaps and one clear need for batch processing. Shipping all three at once.

### 0.5.1 content — Project aliases

- `server/drive-context.js`: `listPeopleWithAliases` generalized to `listWithAliases(drive, folderId)`; now called for both People/ and Projects/ folders. Vault context shape adds `projectAliases` (alias → canonical map, same as existing `aliases` for people).
- `server/metadata.js`:
  - `buildPrompt` — injects project aliases block into the Haiku prompt, same pattern as name aliases.
  - `resolveAliases` — generalized to work for any name/alias list.
  - `extractMetadata` — also runs alias resolution on the `projects` array before returning.
  - `suggestCleanedMetadata` — passes project aliases into the review prompt.
- User workflow (on Drive): add an `alias: <external name>` line inside `Projects/<Name>.md` for any project with public/client-facing names. Example: `Projects/Bizi.md` can list `alias: B2B Asszisztens`, `alias: B2B Digitális Tudakozó`, `alias: dasszisztens.telekom.hu`. Propagates to Haiku within the 5-min vault cache.

### 0.5.2 content — Language preservation + pilot-lesson hardening in `suggestCleanedMetadata`

- Explicit LANGUAGE RULE in the prompt. Hungarian thoughts (detected via Hungarian-specific characters in title/text) get a hard instruction: "Your proposed title and topics MUST be in Hungarian. DO NOT translate." Fixes the HU→EN flip we hit on every pilot candidate.
- People guidance rewritten: attendees are kept regardless of who actively spoke (matches the locked pilot convention). "Before claiming a person is not mentioned, search the text for the name. If found, the person stays regardless of role." Addresses the candidate-7 Barta Attila regression.
- `Me` guidance: keep on self-reflections or when the user was a meeting participant. Stops the silent `Me` strip on self-authored notes.

### New — `scripts/batch-hygiene.js`

Scales the pilot workflow to the remaining thoughts without per-thought manual review for the common cases.

- Iterates `find_overconnected` (defaults: `project_count ≥ 4` OR `hub_score ≥ 15`, configurable via `--min-projects` / `--min-hub` / `--limit`).
- Per thought: calls `suggestCleanedMetadata`, then runs deterministic post-processors encoding the pilot conventions:
  1. Preserve Hungarian title if original was Hungarian
  2. Restore `Me` if user originally tagged themselves
  3. Verify "not mentioned" person claims by grep-on-text; reject the drop if name appears in the text
  4. Flag HU→EN topic flip for manual review (doesn't auto-restore — needs human)
  5. Strip umbrella projects (Telekom, ERSTE, Erste, Proficio) when a product project (Bizi, ConfAI, Art AI, Messaging matrix, Országtuning RMT, CoMind) is co-tagged
- Emits `brain-hygiene-batch-YYYY-MM-DD.md` with per-thought diffs, post-processor notes, and Haiku reasoning.
- **Dry-run by default.** Pass `--apply` after reviewing the report to commit via `updateThought`.

Usage:
```
node scripts/batch-hygiene.js                # dry-run all candidates ≥ threshold
node scripts/batch-hygiene.js --limit 20     # dry-run first 20
node scripts/batch-hygiene.js --apply        # commit after review
```

### Cross-ref

- Pilot audit trail: brain thought `dcd3da9b-ff1b-4439-9976-8184a8a174cd` (marker `BRAIN-HYGIENE-PILOT-01`) — locked conventions.
- Pilot failure-mode source: brain thought `3e7538f2-2903-4dcd-ae76-d6734b6e4108` — the original "Agent önbizalom-csapda" note that was candidate 1.

## 0.5.0 — 2026-04-19

**P10: Brain Connection Hygiene** — interactive metadata curation. Problem: thoughts were over-tagged with projects they only mentioned in passing, making hubs of notes that connect to everything in Obsidian's graph. Example: `agent-önbizalom-csapda` had 8 project tags because it used them as examples of failure modes; every thought about any of those 8 projects backlinked to it.

Three new MCP tools + a tightened capture prompt.

- `find_overconnected` MCP tool — scans active thoughts and surfaces over-taggers, sorted by hub_score (sum of reachable thoughts via shared projects/people). Defaults: `project_count >= 5` OR `hub_score >= 20`, all tunable. Read-only.
- `suggest_metadata_fix` MCP tool — given a thought id, Haiku classifies each tagged project as `primary|example|context`, proposes a tighter `{people, projects, topics, title}`, and returns the diff with reasoning. Does NOT apply — review loop is Claude Desktop + user approval.
- `update_thought` MCP tool + `PATCH /thoughts/:id` HTTP route — applies a partial metadata update to a thought in Qdrant. Allowed fields: `people, projects, topics, title, action_items`. Text, source, source_id, created_at, and status stay immutable via this path. Obsidian `.md` regenerates on the next hourly export cron.
- `server/metadata.js` `buildPrompt` rewrite — projects rule now explicit: "only projects the thought is PRIMARILY ABOUT; not examples, comparisons, background, inspiration". Most thoughts should have 0–2 projects. Vault-project hint softened from "if relevant" to "do not force a match when mentioned in passing".
- `scripts/eval-strict-prompt.js` — read-only eval harness. Finds the N worst over-taggers in the brain today, re-runs extractMetadata with the new prompt, prints old-vs-new project diff. Use before relying on the prompt change for daily captures.
- New `server/brain-hygiene.js` module — pure helpers for the hygiene heuristics, no I/O, easy to test.
- New `server/qdrant.js` helpers: `getById(id)` (retrieve single point by UUID) and `getConnectionStats()` (per-thought + reverse-indexed project/person/topic counts).

Use pattern (from Claude Desktop): `find_overconnected` → pick a candidate → `suggest_metadata_fix` → review diff → `update_thought` with approved values. Wait for the hourly `cron/export.js` — Obsidian "Linked Mentions" count drops for the fixed thought.

Pilot scope per plan: 5–10 worst offenders walked interactively, NOT a full sweep. Broaden only if pilot validates.

Cross-ref: brain thought `3e7538f2-2903-4dcd-ae76-d6734b6e4108` (Agent önbizalom-csapda) documents the failure mode this release addresses and is the Phase 4 pilot target.

## 0.4.1 — 2026-04-19

Patch roll-up. All data-integrity fixes surfaced while bringing meeting + brain workflows into daily use. No new features.

- **Fireflies backfill support** — `scripts/backfill-fireflies.js` pulls transcripts from Fireflies since a date (default: last 90 days), dedup'd by meeting id. Idempotent with the live webhook path. First run imported 48 real meetings from Feb–Apr 2026.
- **Fireflies duration + date fields** — `agent/tools/fireflies.js` was dividing `duration` by 60 under the wrong assumption it was seconds. Fireflies returns duration in **minutes** directly; every meeting was reading as 0–2 min. Also converts `date` (Unix ms) to ISO string for downstream display.
- **checkContradiction prompt rewrite** — original prompt asked "do these contradict?" and Haiku correctly answered "different" which our code archived. Recurring meetings (weekly syncs, biweekly statuses) hit this every time. New prompt defaults to FALSE, requires LOGICAL contradiction (mutually exclusive claims, reversed decisions, explicit corrections), not just "different content". Covers the recurring-meeting case with an explicit NOT-a-contradiction list.
- **`scripts/unarchive-fireflies.js`** — one-off recovery script for the 13 fireflies captures wrongly archived during the first backfill run. Restored all 13 to `active`. Scoped to `source='fireflies' + status='archived'` — safe because two different meeting events are never a true logical contradiction.
- **Chrome extension search uses content, not tab title** — `extension/popup.js` was embedding only `document.title` (polluted with "(19) Defileo 🎭 on X: ... / X" and similar noise). Now concatenates title + og:description + first 800 chars of extracted content, capped at 1500 chars. Distinguishes 401 from "no matches" in the UI, shows cosine score % per related-thought.
- **Gemini video summary — architectural cleanup** — `fetchVideoSummary` moved OUT of `getYoutubeLikes` (which was calling Gemini for every liked video including music that would be filtered). Callers (cron + backfill) now call Gemini only for items they're actually keeping. Plus 3-min AbortSignal timeout to catch hung Gemini calls. MCP `get_youtube_likes` tool surface unchanged.

## 0.4.0 — 2026-04-18

New capability: **YouTube captures now include full video summaries via Gemini multimodal**, not just title + description. Behavior change — Haiku metadata extraction and semantic search now operate on dense signal from the actual video content.

- `agent/tools/youtube-gemini.js` — new. Calls Gemini 2.5 Flash with a YouTube URL fileData part, returns structured markdown: `## Summary / ## Key ideas / ## Action items / ## Frameworks, models, concepts / ## Speakers`. Language-adaptive (matches video language). Returns `__NO_CONTENT__` for music/entertainment/no-substance.
- `agent/tools/youtube.js` — replaces the broken `captions.list` / `captions.download` path (which returned 403 for third-party videos) with `fetchVideoSummary()`. Also removes the short-lived `youtube-transcript` dep (blocked from datacenter IPs by YouTube anti-bot).
- `cron/youtube-intake.js` — `buildText` now uses Gemini's structured summary as the primary body, with the original YouTube description demoted to a small footer.
- `scripts/backfill-youtube-summaries.js` — new one-off backfill for existing `source='youtube'` captures (pre-Gemini). Pulls likes over the last year, matches by title, deletes each stale capture, re-captures via the normal pipeline so old entries get summaries + fresh embeddings.
- Cost: ~$0.01–0.02 per captured video (Gemini 2.5 Flash). Latency: ~2 min for a 45-min video. Both trivial at current single-user volume.

## 0.3.2 — 2026-04-18

- YouTube intake filters by `categoryId`. Default skip: `10` (Music). Override via `YOUTUBE_SKIP_CATEGORIES` env var (comma-separated). Fixes the case where liked music videos flooded the brain — they're in the likes playlist but aren't content the user wants to remember.
- YouTube tool surfaces `category_id` on each entry for the cron to filter.
- Per-run log now shows `captured / skipped / filtered / failed` so filtered items are visible.

## 0.3.1 — 2026-04-18

Deploy-time fixes surfaced while bringing 0.3.0 live on Hetzner. No new features.

- Cron scripts load `server/.env` via script-relative path (ESM imports are hoisted, so the default `dotenv/config` pattern in a cron file was running AFTER dependent modules — they saw undefined env vars).
- Qdrant client default URL changed from `qdrant:6333` (docker-compose internal) to `localhost:6333` (host-reachable), matching `scripts/init-collection.js`.
- Service-account path now resolves relative to the module file, with env-var override handling both absolute and relative values.
- `get-drive-token.js` loads `client_id`/`client_secret` from env when `client_secret.json` isn't present; dotenv path made script-relative.
- OAuth2 scope: `gmail.readonly` → `gmail.modify` (required for label create + thread modify in the Gmail intake cron).
- Gmail `extractBody` now preserves paragraph boundaries from HTML and plain text so downstream dedup can split on blank lines.
- Gmail cleaner switched to thread-aware paragraph dedup: accepts array of message bodies oldest→newest, drops each unique paragraph once across the whole thread (kills the N² reply-chain explosion). Real test: 817k chars → 5k chars, zero unique content lost.
- Fireflies webhook: switched from `?secret=` query-param check to standard GitHub-style HMAC-SHA256 verification via `x-hub-signature` header. Body field `meeting_id` (snake_case, not camelCase). Test events (`event: "test"`) short-circuit with 200.
- `CLAUDE.md` notes: versioning rule with bump-suggestion protocol, "no local environment — deploy-tested only" section, SSH access to Hetzner with verification etiquette.

## 0.3.0 — 2026-04-18

Auto-intake: remove the manual approval gate from three capture paths so volume goes up without extra effort.

- **Fireflies webhook** (`POST /fireflies-webhook`) — transcripts auto-capture when meetings finish.
- **YouTube likes cron** — every 30 min, new liked videos auto-capture.
- **Gmail label cron** — every 10 min, emails tagged `brain` auto-capture; `brain/captured` label closes the loop.
- **Gmail body cleaner** (`agent/tools/gmail-clean.js`) — two-stage regex + Haiku strip of legal footers, confidentiality notices, signatures, quoted-reply duplicates (HU + EN). `__NO_CONTENT__` path tags `brain/empty` instead of capturing.
- **Shared dedup** — `source` + `source_id` payload + `findBySourceId` early-return in `captureThought`. Idempotent across webhook retries and cron re-runs.
- **Qdrant payload indexes** on `source`, `source_id` via idempotent `npm run init`.

## 0.2.x — pre-history

Core brain, MCP tools (brain + agent), React UI, Obsidian export, Chrome extension, Hetzner deploy, People alias resolution, conflict detection (P1b), time decay (P1a). See `ROADMAP.md` "What's Built" and session logs.

## 0.1.x — pre-history

Initial build: Qdrant + Gemini + Haiku + Express one-backend-two-interfaces scaffold.
