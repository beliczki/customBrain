# Changelog

Semantic versioning (`major.minor.patch`). Versions live in `package.json` (root, `server/`, `client/`) and `extension/manifest.json`.

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
