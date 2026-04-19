# Changelog

Semantic versioning (`major.minor.patch`). Versions live in `package.json` (root, `server/`, `client/`) and `extension/manifest.json`.

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
