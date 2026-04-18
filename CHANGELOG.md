# Changelog

Semantic versioning (`major.minor.patch`). Versions live in `package.json` (root, `server/`, `client/`) and `extension/manifest.json`.

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
