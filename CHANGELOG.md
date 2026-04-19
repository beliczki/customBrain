# Changelog

Semantic versioning (`major.minor.patch`). Versions live in `package.json` (root, `server/`, `client/`) and `extension/manifest.json`.

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
