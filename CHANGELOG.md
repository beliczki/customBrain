# Changelog

Semantic versioning (`major.minor.patch`). Versions live in `package.json` (root, `server/`, `client/`) and `extension/manifest.json`.

## 0.25.2 — 2026-05-19

**OAuth error page UX: Vissza + Bezárás gombok.** When the consent flow fails (e.g. "unknown client_id" because the connector typed a client_id that wasn't registered server-side), the user was stuck in a dead-end popup with no way out except closing the browser tab manually. Added two buttons: "Vissza" (history.back(), falls back to window.close() if no history) and "Bezárás" (window.close()).

## 0.25.1 — 2026-05-19

**Custom client_id for OAuth client creation.** Users can now type a memorable client_id (e.g. `beliczki`, `grok`, `claude-desktop`) instead of accepting the auto-generated 32-hex value. Useful when the connector form on the client side wants a typed value (Grok's form lets you type one — if it doesn't match what's registered server-side, `/oauth/authorize` rejects with "unknown client_id").

- `server/oauth-store.js::createClient` accepts optional `client_id` arg. Validation: 3-64 chars of `[A-Za-z0-9._-]`, must be globally unique among registered clients. Empty/missing → auto-generates random hex (unchanged behavior).
- `server/routes/oauth.js` POST /oauth/clients passes the optional `client_id` through.
- `client/src/api.js::createOAuthClient` accepts the new field.
- `client/src/components/Settings.jsx::OAuthClientsSection` form gains a third input: "Custom client_id (optional — leave empty for random hex)".

## 0.25.0 — 2026-05-19

**OAuth 2.0 for MCP — Grok + Claude Desktop ready.** Grok's connector config requires OAuth (PKCE recommended); Claude Desktop's MCP integration is going the same way (PKCE + Dynamic Client Registration per RFC 7591). T2 scope: full OAuth 2.0 Authorization Code flow + PKCE S256 + all three token-endpoint auth methods (`none`, `client_secret_basic`, `client_secret_post`) + DCR.

### Endpoints (all public, no Bearer required — they have their own auth)

- `GET /.well-known/oauth-authorization-server` — RFC 8414 discovery
- `GET /oauth/authorize` — consent page (server-rendered HTML, dark theme)
- `POST /oauth/authorize` — process consent, mint auth code, redirect to client
- `POST /oauth/token` — exchange code for access token (PKCE OR client_secret_*)
- `POST /oauth/register` — RFC 7591 Dynamic Client Registration

### Consent authentication

OAuth consent uses a SEPARATE `OAUTH_USER` + `OAUTH_PASSWORD` (Settings UI → OAuth category) — NOT `UI_SECRET`. Two reasons:
1. Leak of an OAuth credential must not compromise the UI master, and vice versa.
2. The user wanted explicit, settable credentials independent of the UI bootstrap.

If OAUTH_USER/PASSWORD are unset, the consent page rejects all approvals with a 503 directing to Settings.

### Storage

- `state/oauth-clients.json` — registered clients. Schema: `{ id, name, client_id, client_secret_hash (scrypt), token_endpoint_auth_method, redirect_uris[], auto_registered, created_at, last_used_at }`. Manual UI mints + DCR mints coexist.
- `state/mcp-tokens.json` extended: optional `oauth_client_id` + `expires_at` fields. Existing manual tokens stay `oauth_client_id: null, expires_at: null` (never expire). OAuth-issued tokens are tagged with the client and have a 1-year expiry.
- Pending auth codes: in-memory Map, 60s TTL. Lost on pm2 restart; OAuth dances complete sub-second so this is fine.

### Files

- New: `server/oauth-store.js` (client + code management, scrypt password hashing).
- New: `server/routes/oauth.js` (all 5 endpoints + consent HTML).
- New schema entries in `server/config-schema.js`: `OAUTH_USER`, `OAUTH_PASSWORD` (category "OAuth").
- Modified: `server/mcp-token-store.js` (`createToken` accepts `oauth_client_id` + `expires_at`; `validateToken` rejects expired tokens; `publicShape` exposes new fields).
- Modified: `server/index.js` (mount oauth router; SPA wildcard + auth middleware bypass for `/oauth/*` + `/.well-known/*`).
- Modified: `client/src/api.js` (`listOAuthClients`, `createOAuthClient`, `revokeOAuthClient`).
- Modified: `client/src/components/Settings.jsx` (new `<OAuthClientsSection>` above MCP tokens).

### Rate limiting

The per-IP rate limiter (0.24.3) also applies to `/oauth/authorize` POST. Brute-force on OAUTH_USER/PASSWORD triggers the same ladder (3 → 1min, 3 → 5min, 3 → 10min, 3 → 30min cap).

### Token lifecycle

- Access token: 1 year expiry. No refresh tokens in T2 (re-do OAuth flow if expired).
- Per-token revoke from Settings UI → MCP tokens (the OAuth-issued ones show up there too with the client name in the label).

### Setup needed after deploy (one-time)

1. Settings → OAuth → set `OAUTH_USER` and `OAUTH_PASSWORD` (already pre-populated for the user on Hetzner).
2. Settings → OAuth clients → Generate a client for each connector (Grok, Claude Desktop, etc.). Pick "none — PKCE only" unless the connector specifically requires a secret.
3. Configure the connector with:
   - Authorization endpoint: `https://brain.beliczki.hu/oauth/authorize`
   - Token endpoint: `https://brain.beliczki.hu/oauth/token`
   - Discovery (if supported): `https://brain.beliczki.hu/.well-known/oauth-authorization-server`
   - Scope: `full`

## 0.24.3 — 2026-05-18

**Security hardening pass — code half.** Companion to the same-day infra hardening (chmod 600 on secret files, nginx log scrub of `?token=` to `[REDACTED]`, archived log purge, fail2ban on sshd, ufw allowlist 22/80/443). The code-side changes:

- `app.set('trust proxy', 'loopback')` in `server/index.js` — express resolves `req.ip` via the nginx X-Forwarded-For header (added to the custombrain nginx site config in the same pass). Without this, per-IP anything is global behind nginx.
- **CORS tightened to `https://brain.beliczki.hu`** — was `cors()` wildcard. UI is same-origin so unaffected. Chrome extension bypasses CORS via `host_permissions` in its manifest. Closes the "XSS leaks bearer to attacker JS that reads response" route.
- **Per-IP rate limiter** (`server/rate-limiter.js` rewritten) — global counter in 0.24.2 was a DoS vector: any IP could trigger 3 failures and lock out the legitimate user. Now keyed on `req.ip` with the same ladder (3 → 1min, 3 → 5min, 3 → 10min, 3 → 30min cap). Stale entries pruned on 5-min interval. Single-user load = tiny map.

**Same-day infra changes** (not in git, applied via SSH on Hetzner):
- `chmod 600` on `.env`, `service-account.json`, `mcp-tokens.json` (was 644).
- `/etc/nginx/conf.d/scrub-log.conf` — map directive + `scrubbed` log_format replacing `token=<value>` query params with `token=[REDACTED]` in nginx access logs.
- `access_log /var/log/nginx/access.log scrubbed;` added to custombrain site block.
- `truncate -s 0 /var/log/nginx/access.log` + `rm /var/log/nginx/access.log.*` — purged historical logs containing pre-scrub tokens.
- `apt install fail2ban` + minimal `/etc/fail2ban/jail.local` enabling sshd jail (5 fails in 10 min → 1h ban). 3 IPs already banned at deploy time.
- `ufw allow OpenSSH` + `ufw allow 'Nginx Full'` + `ufw --force enable` — default-deny firewall. Locks down the sibling mm-server-* apps' open `*:3003`/`*:3005` ports from external access (they stay bound on all interfaces; ufw blocks externally).

## 0.24.2 — 2026-05-18

**Rate limiter on UI auth failures + Unlock form pre-validation.** Defends the UI bootstrap secret against brute-force.

- `server/rate-limiter.js` — global counter (single-user system, one shared state). Ladder per the user's spec: 3 failures → 1 min lockout, 3 more → 5 min, 3 more → 10 min, 3 more → 30 min (cap; further failures keep re-arming the 30 min block until a success). Only applies to non-MCP routes — MCP token validation is excluded (separate failure mode, the user explicitly excluded it).
- `server/index.js` auth middleware checks rate limit BEFORE comparing tokens (saves comparison cost on a blocked attacker). Returns HTTP 429 with `Retry-After` header and `{ error, retry_after_seconds }` body. Successful UI auth resets the counter + level.
- `client/src/App.jsx` — Unlock form refactored to a new `UnlockForm` component that PRE-VALIDATES the entered token against `/stats` BEFORE writing to `localStorage`. Inline error messages: "Wrong token." for 401, "Too many failed attempts. Locked for X min." for 429. Submit button disables while in flight. Prior behavior (save-first, mount-time validation kicks out on 401) still in place as a second line of defense for stale tokens after server restarts.

## 0.24.1 — 2026-05-18

**`UI_SECRET` is now env-only by design — never editable from the UI.** Letting the bootstrap master secret be edited from the UI it gates is a chicken-and-egg foot-gun (a typo locks you out, no path back except SSH). Rotation flow is now: edit `/root/customBrain/.env` + `pm2 restart custombrain`.

- `server/config-schema.js` — `UI_SECRET` schema entry removed. Settings UI no longer renders a field for it; Core category now contains only `PORT` and `QDRANT_URL`.
- `server/config.js::applySettingsToEnv` — added `NEVER_OVERLAY = new Set(['UI_SECRET'])` guard. Even if a stray `UI_SECRET` key appears in `state/settings.json` (legacy migration, manual edit), the overlay refuses to set it onto `process.env`, so the `.env` value remains authoritative.
- One-time Hetzner cleanup: `UI_SECRET` key removed from `state/settings.json`. Schema-driven `PUT /settings` already rejects unknown keys, so it cannot be reintroduced via the API.

Rotation flow: `nano /root/customBrain/.env` → save → `pm2 stop custombrain && fuser -k 3000/tcp && pm2 start custombrain` (per the standard restart pattern).

## 0.24.0 — 2026-05-18

**`CAPTURE_SECRET` → `UI_SECRET` rename (clean break) + UI auto-logout on stale token.** The old name was misleading once 0.22.0 split MCP off — the secret no longer guards `/capture` alone; it's the UI master. Same value, new name, no back-compat fallback (one-time cutover via migration script).

- `server/index.js` auth middleware reads `process.env.UI_SECRET` (no fallback).
- `server/config-schema.js` Core entry key renamed `CAPTURE_SECRET` → `UI_SECRET`.
- `client/src/api.js` + `client/src/App.jsx` localStorage key renamed `capture_secret` → `ui_secret` (no migration — stale entries bounce the user to the Unlock screen via the new mount-time validation).
- `client/src/App.jsx` adds mount-time auth validation: if a stored token returns 401 from `/stats` (deploy swapped the secret, env changed, etc.), the UI clears the token and bounces to Unlock instead of letting the user see a silently-broken app. Brief "Checking token…" state during the validation fetch.
- `.env.example` + docs (`README.md`, `CLAUDE.md`, `DEPLOYMENT.md`, `INSTALL.md`) updated.
- Comments updated in `server/mcp-token-store.js` + `server/routes/mcp-tokens.js`.
- `scripts/rename-capture-to-ui.js` — idempotent Hetzner migration that renames `CAPTURE_SECRET` → `UI_SECRET` in BOTH `/root/customBrain/.env` AND `state/settings.json`. Must run after `git pull` and before `pm2 start`.

**⚠ Breaking**: any client (CLI script, curl, extension popup) hardcoding `Authorization: Bearer <CAPTURE_SECRET>` against `/stats` etc. keeps working at the wire-protocol level (the value didn't change, only the env var name on the server). The browser UI re-prompts once because localStorage key changed. Chrome extension (which uses chrome.storage with key `captureSecret`) untouched — will be addressed in 0.25.0 with capture-scope named tokens.

## 0.23.0 — 2026-05-18

**Config relocation: `.env` and `service-account.json` move from `server/` to repo root; `.env` strips to `CAPTURE_SECRET` only.** Everything else (16 vars: AI keys, Google Drive OAuth2, Fireflies, Gmail, Qdrant, port, tunables) now lives exclusively in `state/settings.json`, managed via the Settings UI. The `applySettingsToEnv()` boot overlay (already in place since 0.17.0) makes this transparent to all `process.env.X` readers.

- `server/index.js` boots `dotenv.config({ path: <repo-root>/.env })` explicitly — independent of pm2 `--cwd`.
- All 23 scripts/cron updated: `'..', 'server', '.env'` → `'..', '.env'`.
- `server/drive-context.js` + `server/routes/export.js` SA-path resolution now anchored at repo root (relative `GOOGLE_SERVICE_ACCOUNT_PATH=./service-account.json` keeps working; previously resolved to `server/service-account.json`).
- `.env.example` rewritten to `CAPTURE_SECRET` only + an explanatory header pointing to Settings UI.
- `server/get-drive-token.js` + `scripts/get-drive-token.js` console output now points to Settings UI instead of `server/.env`.
- Docs updated: `CLAUDE.md`, `README.md`, `DEPLOYMENT.md` reflect the new layout. DEPLOYMENT pm2-cwd gotcha note marked historical.
- `scripts/migrate-env-to-root.js` — idempotent one-time migration on Hetzner: moves `service-account.json`, moves `.env`, strips `.env` to just `CAPTURE_SECRET`. settings.json values already migrated (verified during planning — all 17 keys present pre-deploy).

**⚠ Local-dev breaking**: any clone that has `.env` at `server/` will fail to boot — move to repo root. Production Hetzner handled via migration script.

## 0.22.0 — 2026-05-18

**Named MCP bearer tokens, UI-managed.** Master `CAPTURE_SECRET` (env) is now UI-only — it no longer authorizes `/mcp/http`. External MCP clients (Claude Desktop, connector tests) MUST use a named token from `state/mcp-tokens.json`, manageable in the Settings tab. Bootstrap is impossible to lock out because the UI itself uses CAPTURE_SECRET to create the first MCP token.

**⚠ Breaking for MCP**: any Claude Desktop or external MCP client previously using `?token=<CAPTURE_SECRET>` will start 401-ing on `/mcp/http` after this deploy. Recovery is ~30s: open Settings → MCP tokens → Generate token → copy → paste into Claude Desktop config.

- New file `server/mcp-token-store.js` — load/validate/create/revoke with atomic write to `state/mcp-tokens.json` (cleartext at rest, same risk profile as `service-account.json`). `last_used_at` flush throttled to 5-min granularity to keep the validation hot-path off disk.
- New route `server/routes/mcp-tokens.js` — `GET /mcp-tokens` (masked list, `?reveal_id=<id>` per-row reveal), `POST /mcp-tokens` (generate from name), `DELETE /mcp-tokens/:id`.
- `server/index.js` auth middleware is now path-aware: `/mcp/http` accepts ONLY validated named tokens; everything else requires master `CAPTURE_SECRET` (unchanged).
- Tokens: 64-hex from `crypto.randomBytes(32)`. No expiry (lifecycle is create/revoke only). Per-row Show/Hide in UI (reveal-anytime, mirrors the existing env-secret reveal pattern in `Settings.jsx`).
- `client/src/components/Settings.jsx` new `<McpTokensSection>` rendered above the schema-driven fields — name input + Generate + per-row Show/Copy/Revoke + last-used display.
- `client/src/api.js` — `listMcpTokens`, `createMcpToken`, `revokeMcpToken`.
- Bootstrap path: with zero tokens, MCP is locked. UI is reachable via `CAPTURE_SECRET` and can mint the first token, so no lockout is possible.

## 0.21.0 — 2026-05-17

**P8.2 Phase 1: Gemini `task_type` asymmetric retrieval (missing-config fix).** `gemini-embedding-001` accepts a `taskType` parameter that documents how the embedding will be used; passing no `taskType` silently maps to `RETRIEVAL_QUERY` (verified by curl). The stack was therefore doing symmetric retrieval (queries and stored docs both in QUERY space) instead of Google's documented asymmetric pattern. This was locked in the P8 spec (`tasks/todo.md:141`) but skipped at execution time — formally the stack was wrong.

- `server/embeddings.js::embedText(text, taskType)` — second arg now optional; back-compat preserved by sending no `taskType` field when missing. All call sites updated to pass an explicit value: `RETRIEVAL_QUERY` from `server/routes/search.js`, `RETRIEVAL_DOCUMENT` from `server/routes/capture.js` (both `captureThought` + `refreshCapture`), `scripts/reprocess-v2-prototype.js`, `scripts/retry-failed-reprocess.js`.
- `scripts/backfill-task-types.js` — one-shot idempotent backfill (`payload.embed_task_type` marker), concurrency 8. Re-embedded all 596 points in `thoughts_v2` with `RETRIEVAL_DOCUMENT` in 23s, ~$0.50 Gemini cost. Preserves sparse `bm25` vectors.
- `scripts/calibrate-conflict-threshold.js` — per-thought nearest-non-self cosine distribution under the new doc-doc space. Output `tasks/p8.2-threshold-calibration.json` shows median 0.899, p10 0.956, max 0.986. Top-20 pairs are 17/20 same-topic recurring content (weekly Bizi syncs, monthly ERSTE status emails), only 2 true duplicates at 0.9861.
- `server/routes/capture.js::captureThought` — `conflictThreshold` default raised from 0.85 → 0.97 to match the post-task-type cosine distribution. Old 0.85 was calibrated for pre-task-type embeddings and would now fire on every capture against the long tail of same-topic content. 0.97 captures the outlier tip where actual duplicates live; trades some recall on 0.92-0.96 paraphrases for Haiku-cost sanity.
- `scripts/p8-probe.js` — extended with annotation-aware metrics: per-query right-answer hit-at-N + per-leg band-spread + aggregate winrate. Annotations in `tasks/p8.2-annotations.json` (Q8 excluded — query premise broken: name typo + wrong-person attribution). Snapshots committed in `tasks/p8.2-phase1-baseline.json` and `tasks/p8.2-phase1-after.json`.
- **Measured outcome**: hybrid winrate 4/7 → 4/7 (unchanged), dense winrate 5/7 → 4/7 (one regression on Q6 Amundi). Dense band-spread WIDENED on 4/7 queries (Q1 2.3×, Q2 1.8×, Q3 1.2×, Q7 1.2×) — discrimination signal improved within domain, but the widening doesn't translate to better hit-at-5 because the right doc isn't necessarily the one that benefits from the spread. The ship rationale stands per `feedback_literature_defaults.md`: this is the documented Google pattern, ship it because the stack was formally wrong, not because the small-sample probe shows a per-query win.
- Phase 1.5 (Haiku summary distinctiveness audit), Phase 2 (Cohere reranker), Phase 3 (HyDE) explicitly deferred per `feedback_agent_as_reranker.md` — consumer of `/search` is an LLM agent that does its own relevance reasoning; recall is the right metric, not precision.

## 0.20.1 — 2026-05-17

**RRF k=60 (literature default).** `server/qdrant.js::hybridSearch` now passes `query: { rrf: { k: 60 } }` explicitly instead of `query: { fusion: 'rrf' }`. Qdrant's built-in RRF default is k=2, which lets a single rank-1 hit in either leg (`1/(2+0) = 0.5`) numerically dominate the fusion — dense rank-2 contributes only `1/(2+1) = 0.333` and can never catch up to a different doc that's BM25 rank-1. k=60 is the value from the original Cormack/Clarke/Büttcher 2009 RRF paper and the production default in Elastic, Vespa, and Weaviate; it flattens the rank-position penalty (rank 1 vs 20: 0.0164 vs 0.0125) so both legs contribute meaningfully rather than single-leg-rank-1 winning by construction. New `scripts/p8-probe.js` parameterized by `--k N` and `--out file`; baseline (`tasks/p8-baseline-k2.json`) and after (`tasks/p8-after-k60.json`) snapshots committed for the 8 canonical queries (Boris Cherny + 7 P14 pain queries). Measured outcome: 2 queries improved (Cseperedő, Pörköláb), 5 stable, 2 slightly regressed within the dense-cluster noise band (ERSTE SZA, Amundi) — the change is not a per-query win on this data but restores the literature default and removes the structural bias of the previous Qdrant-default configuration. No schema change, no migration.

## 0.20.0 — 2026-05-17

**P14 second wave — Hybrid search (BM25 + dense + RRF).** Promoted P8 from DEFERRED → SHIPPED after a live probe showed pure-dense search structurally weak on proper-noun queries ("Boris Cherny" scoring 0.594 cosine for a tweet literally containing the name, ranked below an unrelated meeting transcript). Industry-standard hybrid lexical + semantic search with Reciprocal Rank Fusion replaces the planned project-tag re-rank + synonym dict path.

### Storage

- **New collection `thoughts_v2`** with named vectors: `dense` (Gemini 3072-dim Cosine, unchanged) + `bm25` (sparse, server-side IDF via Qdrant `modifier: "idf"`). Original `thoughts` collection preserved as instant rollback for the first week post-deploy.
- **`scripts/migrate-to-hybrid-collection.js`** — one-shot copy of all 596 points (243 thoughts + 353 chunks) from `thoughts` → `thoughts_v2`. Preserves dense vectors as-is, computes sparse from `text` (thoughts) or `chunk_text` (chunks), recreates 7 payload indexes. Idempotent with `--force`, supports `--limit N` for smoke testing.

### Sparse encoder

- **`server/sparse.js`** — BM25 sparse encoder with multilingual stemming. Tokenize: lowercase + Unicode NFC + strip non-letter/number + stopword filter + Hungarian Snowball stem (fall back to English Snowball if HU returns unchanged). Stable `term → u32` index via FNV-1a hash so indices survive process restarts without a persisted vocabulary.
- **Two encoders**: `sparseEncodeDoc(text)` applies BM25 TF normalization (k1=1.2, b=0.75, avg_doc_len=500) for stored vectors; `sparseEncodeQuery(text)` sends raw term counts and lets Qdrant apply IDF server-side. Hungarian morphology verified: `Cseperedő` / `Cseperedőt` / `Cseperedőnek` all collapse to the same stem.
- New dep: `snowball-stemmers@^0.6.0` (ISC).

### Search pipeline

- **`server/qdrant.js`** — `upsertPoint(denseVector, sparseVector, payload, id?)` now writes both vectors as named. New `hybridSearch(denseVec, sparseVec, limit)` uses Qdrant Query API with RRF prefetch — each leg over-fetches 4× the final limit. `searchVector` retained as dense-only path used by capture-time conflict detection (where lexical match would be wrong signal). `getAllWithVectors` unwraps `.dense` so consumers (Obsidian export's semantic neighbors, brain-health duplicate detector) stay back-compatible.
- **`server/routes/search.js`** — embeds query both ways, calls `hybridSearch`. `rollupChunkHits` + `applyTimeDecay` unchanged.
- **`server/routes/capture.js`** — `captureThought` + `refreshCapture` compute sparse alongside dense, write both vectors. New captures auto-flow through the hybrid stack.
- **`scripts/reprocess-v2-prototype.js`** — chunk reprocess writes `{dense, bm25}` for thought-point AND every chunk-point.
- **`scripts/init-collection.js`** — fresh installs get the new schema natively.

### Measured wins

- **"Boris Cherny"** (the originally-reported bug): tweet was previously buried (not in top-5 after chunk rollup), with raw cosine 0.594 vs unrelated DCO transcript at 0.567. Post-hybrid: tweet at `#1` with score 0.76 vs `#2` at 0.21 — **3.7× lead**, fixed end-to-end through the production `/search` API.
- **"Bizi captcha hard gate egyeztetés"**: literal-title-match thought promoted from `#3` to `#1` with clear lead.
- **"Amundi follow-up"**: surfaced "AmundiTargetingStratégia" into top-3 (previously missing from top-5).
- No regressions on `/recent`, `/stats`, `/health-check` (91 duplicate candidates / 50 over-tagged / 2 stale / 93 oversized all preserved).

### Deferred

- **`RETRIEVAL_DOCUMENT` taskType** for Gemini document embeddings: would shift cosine ranges and invalidate the calibrated 0.85 conflict-detection threshold. Provides an additional ~14% cosine lift on top of hybrid. Will be done as a separate pass once the threshold is re-tuned.

### Migration notes

- Active code points at `thoughts_v2`. Old `thoughts` collection (596 points) left on the Qdrant instance for ~1 week as rollback safety net — drop it manually (`curl -X DELETE …/collections/thoughts`) once confident.

## 0.19.0 — 2026-05-17

**P14 first wave — chunked multi-vector search + `effective_date` time-decay + Gmail outbound recency cap.** Multiple search-quality wins from the 2026-05-16 evening session, in two coupled efforts.

### A) Chunked multi-vector search (top 20 thoughts as prototype)

- **`server/reprocess-v2.js`** — one Sonnet 4.6 mega-prompt per thought returns `{ metadata, summary, summary_chunks[], content_chunks[] }`. Uses Anthropic tool-use API (`submit_reprocessed_thought` schema) for guaranteed-valid JSON. Includes verbatim-only people filter (rejects hallucinated names not in text) + Cyrillic-leak guard.
- **Multi-vector storage** in same `thoughts` collection: thought-point keeps its id (vector replaced with `embedText(summary)`); chunk-points get new UUIDs with `kind: 'chunk'`, `parent_id`, `chunk_kind: 'summary'|'content'`, `chunk_label`, `chunk_text`, `pipeline_version: 'v2'`.
- **Search rollup** in `server/routes/search.js`: over-fetches 30 raw hits, groups by parent thought id (chunk → parent, thought → self), keeps best score per group, surfaces `matched_chunk_label`. UI shows the chunk label inline ("↳ találat: <label>").
- **Chunks filtered out** of `scrollRecent`, `getAllPayloads`, `getAllWithVectors`, `getConnectionStats`, capture-time conflict check, and Stats. The thought is the canonical unit everywhere except search.
- **`scripts/reprocess-v2-prototype.js`** — batch script with `--force` flag to include v2 thoughts (default skips). Top 20 reprocess: 108 chunks created, $3.16 total Sonnet cost, ~15 min total.
- **Measured wins**: original P14 pain query "ERSTE Adform SZA frissítés 150e" — top result was previously a generic Beerste/Otthonstart hit at ~0.7; now position #2 is a precise chunk match ("Micro Számla, Cseperedő és Diverzum specifikus"). Queries like `Diákszámla remarketing PMax`, `Hintrix OTP üzenetmátrix`, `Otthonstart 150e jóváírás` return exact chunk hits with descriptive labels.

### B) `effective_date` field — content date, not capture date

- **`server/effective-date.js`** — `computeEffectiveDate(payload)`: priority `last_internal_date` (Gmail) → `meeting_date` (Fireflies) → `published_at` (YouTube) → `created_at` fallback. Returns ISO string always.
- **Set at every capture path** — `captureThought` + `refreshCapture` compute and store `effective_date` after extraPayload merge. `fireflies-webhook` now passes `meeting_date` + `meeting_duration_min`; `youtube-intake` passes `published_at`; gmail intake already passed `last_internal_date`.
- **Search time-decay** (`server/routes/search.js`) uses `effective_date` instead of `created_at`. A 7-month-old Gmail thread captured today no longer gets unfair recency boost.
- **Recent ordering** (`scrollRecent`) — `order_by: effective_date desc`. The Szintetikus-style noise capture (Oct 2025 thread surfaced today via outbound auto-label) no longer jumps to #1.
- **UI labels** (Search + ThoughtView) — when content date and capture date differ, show both: primary timestamp = content date, small "captured YYYY-MM-DD" annotation alongside.
- **Backfill**: `scripts/backfill-effective-date.js` (idempotent) walks all 238 thoughts and sets `effective_date` from the best available source field.

### Gmail outbound recency cap

- `cron/gmail-intake.js::processThread` — added a 14-day recency gate on the outbound-auto-label path. A thread with a historic SENT-to-known-person no longer gets re-captured when an unrelated Gmail event (mass archive, label cleanup) touches it. Status: `ignored_stale_outbound`.
- **Root cause traced from a real incident**: the "Szintetikus és valódi panel kutatás" Oct 2025 email was auto-captured on 2026-05-16 because the user did an Inbox cleanup → 39 history events → cron found a 7-month-old SENT-to-Miklos-Kun → captured. Stale capture deleted; recency gate prevents recurrence.

### Qdrant payload indexes added

`scripts/init-collection.js` — new keyword indexes for `kind`, `pipeline_version`, `parent_id` (chunk-filter joins), and datetime index for `effective_date` (Recent ordering, time-decay).

### Known limitations / next

- v2 chunking covers only the top 20 most recent thoughts. The Varfi-SZA email itself (~2 days old, not in top 20) is still v1 and shows up un-chunked in SZA queries. Run `node scripts/reprocess-v2-prototype.js N` to extend coverage; cost ~$0.15/thought.
- Sonnet 4.6 occasional returns `summary_chunks=0` or `content_chunks=0` on short single-topic thoughts (4 of 18 in batch). Treated as acceptable — chunking is opportunistic, not mandatory.

## 0.18.0 — 2026-05-16

**P6 Brain Health Check shipped — on-demand audit, listing-only, no auto-mutation.** Replaces the original cron-based maintenance plan from the 2026-05-16 roadmap review. Triggered from three surfaces (MCP tool / HTTP route / Stats tab UI section), all calling the same `runHealthCheck()` core.

### Five checks (v1 scope)

1. **Duplicate candidates** — pairwise cosine on all active vectors, threshold 0.92. First Hetzner run found **106 pairs** (e.g. "B2B Digitális Tudakozó heti sync" vs "...heti szinkron" at 0.954 — same recurring meeting captured twice; obvious cleanup target).
2. **Over-tagged thoughts** — reuses `findOverconnected` from 0.5.0 (`hub_score ≥ 20` OR `projects ≥ 5`).
3. **Stale auto-summaries** — `has_auto_summary && summary_appended_at < updated_at`. Result includes `hours_stale`. Use to know when the `/summarize-long-thoughts` coworker loop is overdue.
4. **Oversized without summary** — `text.length > 6000 && !has_auto_summary`. The thoughts the embedding window is truncating; coworker loop hasn't reached them yet.
5. **Metadata anomalies** — joins thought metadata with `getVaultContext` to find:
   - `unknown_projects` / `unknown_people`: names tagged on thoughts but no canonical `.md` exists (Haiku invention or alias gap)
   - `orphan_project_files` / `orphan_people_files`: canonical `.md` exists but no active thought references it (curated entries with no signal)

All checks listing-only — the brain is NEVER mutated by this. Decisions stay with the user.

### Skipped from v1 (potential v2)

- **Pure-boilerplate Gmail count** (threads with `brain/empty` label) — needs Gmail API call per run; trivially addable later if useful.
- **Auto-fix prompts** — could surface per-pair "merge?" or per-orphan "delete?" actions; deliberately not in v1 to keep the audit non-mutating.

### New files

- `server/brain-health.js` — `runHealthCheck()` core + local cosine helper (duplicated from `routes/export.js` to avoid a refactor; if a 3rd caller appears, extract to `server/vector-utils.js`)
- `server/routes/health-check.js` — `GET /health-check`, Bearer auth via shared middleware
- `client/src/components/HealthCheck.jsx` — collapsible per-check sections, count badges (green if 0, amber if non-zero), click-thought-id → ThoughtModal

### Modified files

- `server/index.js` — register router + SPA guard
- `server/mcp.js` + `server/mcp-stdio.js` — new `brain_health_check` tool (both files per CLAUDE.md duplication rule)
- `client/src/api.js` — `healthCheck()`
- `client/src/components/Stats.jsx` — `<HealthCheck />` section appended

### Performance note

Cold-cache first run: ~70s (vault context load via Drive API ~60s + pairwise cosine on 233 vectors ~5s + serialization). Subsequent runs within 5 min: ~5-10s (vault cached). The UI shows "Running…" during the call — known UX rough edge for first daily run. Streaming progress is doable later if needed; for v1 acceptable since the tool is on-demand, not on a hot path.

### First findings on Hetzner

- **Duplicate candidates: 106** — high signal. Most are likely Fireflies re-captures of recurring meetings + Gmail thread refreshes that diverged slightly. Manual review + merge via `update_thought` (existing 0.5.0 tool) is the cleanup path.
- Other categories TBD on user inspection.

### Roadmap impact

- ~~P6~~ → DONE (0.18.0)
- Execution order remaining: P13B (INSTALL.md teljes step-by-step, gated on first friend-tester), then deferred items (P14, P15, P12) only if pain dominates

## 0.17.0 — 2026-05-16

**P13A Settings UI shipped — env vars editable from the brain UI, settings.json is now the source of truth.** The hardcoded `.env`-based setup was the friction wall for any future sharing (you couldn't tell a friend "clone this and edit a .env on a server you SSH into" and expect them to actually do it). Now: clone, run, open Settings tab, paste keys, Save & Restart. Done.

### Architecture (zero-risk, no module refactor)

- **`state/settings.json`** — flat `{ KEY: "value", ..., "_updated_at": "..." }`, file perms 0600. Gitignored (`state/` already excluded).
- **`server/config-schema.js`** — hardcoded array of 18 entries: `key`, `category`, `label`, `description`, `is_secret`, `required`, `default`. Add a new env var HERE and it shows up in the UI; values keep working via process.env fallback if not in schema.
- **`server/config.js`** — `applySettingsToEnv()` reads settings.json on boot and **overrides** the matching `process.env` keys. `saveSettings(partial)` merges + writes + 0600. `getSettingsForUI({ revealSecrets })` joins schema + values with masking.
- **`server/index.js`** — top of file: `import 'dotenv/config'; applySettingsToEnv();`. This means existing modules continue to read `process.env.X` directly — zero refactor needed, zero risk of breaking call sites. Settings.json values win over .env at boot.
- **Backward compat**: if `state/settings.json` is missing or corrupt, the system transparently falls back to `.env`. Pre-0.17.0 deploys keep working.

### HTTP routes (`server/routes/settings.js`)

- `GET /settings` — schema joined with values, secrets masked as `••••••••<last4>`. `?reveal=true` returns plaintext (used by the UI "Show" button per-field).
- `PUT /settings` — accepts `{ KEY: value, ... }` partial, merges into settings.json. For secrets, empty string OR a value starting with `••••` is treated as "leave as is" (so the UI's masked display doesn't accidentally overwrite secrets on save). Returns count of changed keys.
- `POST /settings/restart` — responds 200 immediately, then `process.exit(0)` after 500ms so PM2 picks up a fresh process with the new env. UI polls `/stats` to detect when the server is back up.

### Migration script — `scripts/migrate-env-to-settings.js`

Idempotent. Reads current `process.env` (loaded from .env via dotenv), for each schema key writes to settings.json IF NOT ALREADY PRESENT. `--dry-run` mode shows what would change. After running once, the user verifies in the UI, then optionally deletes `.env`. We do NOT auto-delete .env — keeps the safety net during transition.

First migration on Hetzner: 17 keys written (AGENDA_MIN_SCORE not in .env — uses code default 0.65).

### UI — `client/src/components/Settings.jsx` + new "Settings" tab

- Categorized form (Core / AI Providers / Google Drive / Fireflies / Gmail / YouTube / Tunables)
- Per-field: label + key (mono) + description + source badge (`settings.json` / `.env` / `unset`) + value input
- Secrets: `password` input type, "Show" button fetches unmasked value (via `?reveal=true`) and reveals temporarily for that field
- Dirty tracking: changed fields get amber-bordered inputs; unsaved count shown next to Save buttons
- Two save modes:
  - **Save**: write + reload form, no restart (for non-critical changes like labels or thresholds)
  - **Save & Restart**: write → `POST /settings/restart` → poll `/stats` until server back → reload form
- Required fields starting empty get a red `REQUIRED — not set` badge

### Files

- `server/config-schema.js` (new)
- `server/config.js` (new) — `loadSettings`, `applySettingsToEnv`, `saveSettings`, `getSettingsForUI`
- `server/routes/settings.js` (new) — GET/PUT/POST
- `server/index.js` — import + apply at top, router + SPA guard
- `scripts/migrate-env-to-settings.js` (new) — one-off + idempotent re-runnable
- `client/src/api.js` — `getSettings`, `saveSettings`, `restartServer`, `waitForServer`
- `client/src/components/Settings.jsx` (new) — categorized form + secrets + restart flow
- `client/src/App.jsx` — Settings tab added

### Why minor (0.17.0)

New user-visible capability (UI tab), new HTTP routes, new boot mechanism, new source-of-truth file. Not a tweak of 0.16.x — genuinely adds a setup surface that future-shared deploys depend on.

### What this gates

P13B (agent-installable INSTALL.md) is now meaningful: a fresh Hetzner can be brought up via `INSTALL.md` instructions to a state where the user opens the UI Settings tab and pastes keys. No SSH-edit-env step. P13B itself still TBD — needs hand-testing on a fresh box.

### What this does NOT change

- Multi-user model — still single-tenant, one CAPTURE_SECRET unlocks both API and Settings tab
- Hot reload — explicitly chose restart-based to avoid the complexity of re-importing modules with new env. Restart is ~3-5 seconds
- Encryption at rest — settings.json is 0600 on disk, not encrypted. Same security profile as .env was

## 0.16.0 — 2026-05-16

**Clickable thoughts in Agenda → modal overlay with full Recent-style thought view.** Per direct user feedback after the 0.15.1 Agenda iteration: per-event thought titles are a tease without the actual content, and toggling tabs to look up a thought breaks the agenda-review flow. Now: click any thought in an Agenda event → overlay modal opens, fetches the full thought, renders it with the same template used in Recent.

### New HTTP route

`GET /thoughts/:id` in `server/routes/recent.js` — returns the full thought (text + metadata + timestamps) by id via `getById`. Bearer auth via the shared middleware. Added to the SPA wildcard guard (covered by the existing `/thoughts` prefix). 404 on miss.

### New shared component — `ThoughtView`

`client/src/components/ThoughtView.jsx`. Extracted from `Recent.jsx` so the title + body + metadata chips + timestamp layout can be rendered identically wherever a thought is displayed. Accepts optional `onDelete` prop — when provided, renders the delete button (Recent's use case); when omitted, renders read-only (modal use case). Tolerates both response shapes: scrolled (`metadata.people`) and `getById` (`people` at root).

### New overlay component — `ThoughtModal`

`client/src/components/ThoughtModal.jsx`. Fixed-position backdrop (`bg-black/60`), centered content card (`max-w-3xl, max-h-[90vh]`), internal `overflow-y-auto` for long thoughts. Closes on ESC, on backdrop click, or via the X button. Fetches the thought via the new `getThought(id)` api helper on mount (with loading + error states). Renders via `ThoughtView` for layout consistency.

### Recent refactor

`Recent.jsx` simplified — list-wrapper + `ThoughtView` per item. No visible change for the Recent tab; the layout is bit-for-bit identical, just now sourced from the shared component.

### Agenda integration

`Agenda.jsx` per-event thought rows changed from `<li><span></span></li>` to `<li><button onClick={openModal}>...</button></li>`. Hover state added (background tint + underline on title). The card's parent holds the `openThoughtId` state and renders `<ThoughtModal>` conditionally outside the event list so only one modal exists at a time. Works for both semantic matches (`%`) and project_tag fallback (`recent`).

### Files

- `server/routes/recent.js` — new GET handler
- `client/src/api.js` — new `getThought(id)`
- `client/src/components/ThoughtView.jsx` (new)
- `client/src/components/ThoughtModal.jsx` (new)
- `client/src/components/Recent.jsx` — refactored to use ThoughtView
- `client/src/components/Agenda.jsx` — clickable rows, modal state, modal mount

### Why minor bump

New user-visible feature (overlay), new HTTP route, new shared component. Not "fix to 0.15.x" — genuinely adds capability that future tabs (Search results, Stats drill-down) can reuse.

### Defer + roadmap shuffle

- **P12 X.com bookmarks** deferred — no concrete pain after agenda use; revisit when "I want this tweet in brain" actually hurts
- Execution order updated: P0 ✅, P4f ✅, P13A next, then P6, then P13B
- **P14 Agenda relevance** (added in 0.15.1) — still defer; revisit after a few days of agenda use to see if Qdrant search weakness compounds

## 0.15.1 — 2026-05-16

**Agenda refinements after first live use of 0.15.0.** Three issues surfaced on the first morning agenda view:

### 1. Score threshold raised 0.5 → 0.65

The 0.5 default let through linguistic-similarity noise. Specifically: "UJ rutinok, ne legyél cigány, pakolj el" (a personal reminder about routines) got matched to "Bizi — UIUX final check és feedback mechanizmus" at 0.64 — zero topical overlap, pure HU lexical drift. Bumped `AGENDA_MIN_SCORE` default to 0.65 (env-var-overridable). Real meetings with attendees still surface their context (DCO biweekly status etc. score 0.76+); personal events now correctly read "no matching thoughts".

### 2. Project-tag fallback

When the event title contains a known vault project name (matched case-insensitive against `getVaultContext().projects` + `projectAliases`), the cache now augments the per-event thoughts with top-N most recent active project-tagged thoughts via `scrollFilteredRaw` over the `projects` payload field. This handles the case where "customBrain dev next steps Prio agenda security update" had no semantic match above threshold, but the user reasonably expects the brain to surface customBrain-tagged thoughts. New cache fields per event: `detected_projects: [canonical]` and `project_thought_counts: { canonical: N }`. Project-tag thoughts are marked `match_reason: 'project_tag'`, semantic matches `'semantic'`. Mixing the two within the 5-slot budget gives both hybrid coverage and a visible signal that the project has more material (count) to dig into beyond the listed 3.

Per-project lazy cache inside one sync run avoids re-scrolling Qdrant for the same project across multiple events.

### 3. UI simplified — drop people / topics / projects chip aggregation, thoughts as primary

Per direct user feedback after seeing the first render: "amugy nem embereket hanem thoughokat kéne listázzon". The 0.15.0 UI showed an aggregated chip cluster per event (people from attendees + people from matched thoughts, all topics, all projects) — visually noisy and not the primary signal. 0.15.1 drops the chip aggregation entirely. Per event card now shows:

- Time range + attendee count + event title (unchanged)
- Optional `Project: <X> · N thoughts tagged` header line (when detected_projects non-empty)
- Thoughts list: `XX%` (semantic) or `recent` (project_tag) badge + thought title
- "no matching thoughts" italic line when ctx.thoughts is empty (replaces "no brain context above threshold")

The cache still aggregates people/projects/topics — UI just doesn't render them. Removing later if no consumer materializes.

### Files

- `server/agenda.js` — threshold const, buildProjectMap, detectProjectsInTitle, projectTaggedThoughts, per-event fallback logic; cache shape adds `detected_projects` + `project_thought_counts` per event and `match_reason` per thought
- `client/src/components/Agenda.jsx` — full rewrite of the per-event card

### Known limitation — see P14

The semantic search itself remains weak on Hungarian domain terminology + recency-sorted project fallback is a poor proxy for relevance. Documented as new ROADMAP item P14 (Agenda relevance / Qdrant search quality), independent of the current execution order. Will be addressed when relevance pain dominates other work.

### Deploy note — `git stash -u` gotcha

During the 0.15.0 → 0.15.1 deploy cycle we hit an unexpected interaction: `git stash push -u` followed by `git stash drop` on the Hetzner working tree wiped `state/agenda-cache.json` even though `state/` is gitignored. Likely cause: when stash includes untracked files (`-u`), it apparently doesn't respect `.gitignore` consistently for nested files inside gitignored dirs. Worked around by rerunning `cron/agenda-sync.js` after pull. For future deploys consider explicit file lists or a different deploy mechanism that doesn't touch `state/`.

## 0.15.0 — 2026-05-16

**P4f Agenda — MCP + UI preview, ships top-prio of the post-USE-IT-FIRST review.** Three-layer architecture: hourly cron writes a `state/agenda-cache.json` (today + 7 days, calendar events with brain context), HTTP route + MCP tool serve the cache, UI shows it as read-only preview. Subtask breakdown is **intentionally NOT done server-side** — that's the LLM's job in a Claude Desktop / Code session via the chat. Mirrors the 0.10.0 coworker-loop philosophy: server provides data primitives, inference happens in subscription-billed sessions.

### Backend cron — `cron/agenda-sync.js` + `server/agenda.js`

`syncAgenda({ daysAhead = 7 })` reads Google Calendar (existing `getCalendarEvents` from `agent/tools/calendar.js`), for each event calls `searchThoughts(title + attendee names, limit=5)`, filters matches by `AGENDA_MIN_SCORE` (default 0.5, env-var-overridable), aggregates per-event `{ thoughts, people, projects, topics }`. Writes the result to `state/agenda-cache.json`. Within one run, identical search queries are de-duped (recurring weekly meetings → single embed + search per unique query).

The 0.5 score threshold was added after a first test run revealed the problem the 0.6.0 P1d semantic autolinks already solved at the export side: without a threshold the search returns top-5 matches regardless of relevance, so personal events like "fekvőtámasz rutin please" (push-up routine) got "ERSTE — DCO biweekly status" matches at score 0.33-0.40 — pure linguistic similarity, zero topical relevance. With the threshold, the same 26 events drop from 26/26 falsely "enriched" to 13/13 genuinely matched.

Crontab on Hetzner: `15 * * * * cd /root/customBrain && /usr/bin/node cron/agenda-sync.js >> /var/log/brain-agenda.log 2>&1` — offset from the other crons (export :00, gmail */10, youtube */30, backup 03:00) to spread Calendar + Gemini load.

### HTTP routes — `server/routes/agenda.js`

`GET /agenda?days=N` returns the cached agenda filtered to first N days (default: full cache). `POST /agenda/sync` triggers a fresh sync (UI "Sync now" button). Both Bearer-auth via the shared middleware. `/agenda` added to the SPA wildcard guard in `server/index.js` per the existing convention.

Internal helper `getAgenda({ days, force_refresh })` is what the MCP tool calls — auto-refreshes if cache is older than 1h, otherwise serves from cache.

### MCP tool — `get_agenda`

Registered in BOTH `server/mcp.js` and `server/mcp-stdio.js` per the CLAUDE.md duplication mandate. Params: `days` (1-7, default 1 = today only) and `force_refresh` (default false). Returns the full enriched agenda as JSON. The tool description explicitly tells the LLM "YOU do the subtask breakdown in conversation — nothing persists server-side" so a Claude Desktop user invoking it gets the right framing.

### UI — `client/src/components/Agenda.jsx` + new "Agenda" tab in `App.jsx`

Read-only preview grouped by day (Today / Tomorrow / weekday names). Per-event card: time range, attendee count, matching thoughts with similarity scores, project / people / topics chips (same color tokens as Recent). "Sync now" button + "synced X min ago" status. Empty events show "no brain context above threshold" instead of empty chips — no false signal.

### What this enables

Open the Agenda tab in the morning, scan today's meetings + their brain context, decide where you need preparation. For deeper work — "ok now break this into subtasks I can fit into the 9:00 Erste meeting" — switch to Claude Desktop, call `get_agenda({ days: 1 })`, let the LLM propose the breakdown in chat. Nothing is persisted unless you explicitly capture a thought afterwards. Per CLAUDE.md memory `feedback_local_oneoff_scope.md`-style: the agenda is a thinking aid, not project management.

### Files touched

- `server/agenda.js` (new lib)
- `server/routes/agenda.js` (new route + `getAgenda` helper)
- `cron/agenda-sync.js` (new cron entry point)
- `server/index.js` (router + SPA guard)
- `server/mcp.js` + `server/mcp-stdio.js` (new `get_agenda` tool, both files per duplication rule)
- `client/src/api.js` (new `agenda()` + `agendaSync()`)
- `client/src/App.jsx` (new tab)
- `client/src/components/Agenda.jsx` (new UI)
- `.gitignore` (added `backups/`, missed in 0.14.0)
- Hetzner crontab: new `15 * * * *` line

### Deferred / not built (intentional v1 scope)

- No subtask persistence (chat history holds it; if you want it brain-side, manually `capture_thought` after)
- No Calendar block manipulation, no Google Tasks integration — "time" is just a Haiku-style estimate in the chat
- No agent that follows the agenda autonomously — flagged in ROADMAP P4f as a future possibility, blocked on (a) breakdown perzisztencia and (b) volume of past breakdowns to learn from

## 0.14.0 — 2026-05-16

**Production lockdown + first real backup pipeline.** Three independent ops changes shipped together — all P0 "before sharing" prerequisites from the 2026-05-16 roadmap review.

### Qdrant network lockdown

`docker-compose.yml` — both port mappings prefixed with `127.0.0.1:` so Qdrant's HTTP (6333) and gRPC (6334) bind only to loopback. Before: `0.0.0.0:6333` and `0.0.0.0:6334` — publicly reachable for ~2 months without auth (Qdrant has no built-in auth in this deployment). After: external `Connection refused`, Express still reaches it via `localhost:6333` (the `QDRANT_URL=http://localhost:6333` env was already correct since 0.3.1).

### Express server lockdown

`server/index.js` — `app.listen(PORT, '127.0.0.1', ...)` so the brain API is reachable only via nginx's reverse proxy on 443 (already configured to `proxy_pass http://127.0.0.1:3000`). Before: `0.0.0.0:3000` — anyone could hit the brain plaintext on port 3000, bypassing the HTTPS cert. After: external `Connection refused`, all traffic forced through `https://brain.beliczki.hu`.

### Qdrant snapshot backup (cron + Drive upload + retention)

New `cron/qdrant-backup.js` — daily 03:00 UTC: triggers `POST /collections/thoughts/snapshots` → downloads via HTTP GET → saves to `/root/customBrain/backups/<snapshot>.snapshot` → uploads to Google Drive `customBrain Backups/` (auto-created sibling of the vault folder, NOT inside it — Obsidian must not see `.snapshot` files) → rotates: **local count-based** (keep last 3, immediate-recovery safety net) and **Drive age-based** (delete anything older than 14 days). Tunables (`LOCAL_KEEP`, `DRIVE_KEEP_DAYS`, `DRIVE_BACKUPS_FOLDER`) at the top of the file. Age-based on Drive because count-based would mean 365 backups/year accumulating; 14 days is enough horizon to notice + restore a regression. After successful download the Qdrant-internal snapshot is deleted via `DELETE /collections/thoughts/snapshots/<name>` so the in-container snapshots folder doesn't grow. Crontab entry on Hetzner: `0 3 * * * cd /root/customBrain && /usr/bin/node cron/qdrant-backup.js >> /var/log/brain-backup.log 2>&1`.

New `scripts/restore-from-snapshot.js` — executable restore (Mode A: live restore via Qdrant Recover API, multipart upload + recovery) + Mode B documented in script comments (cold disaster recovery from Docker volume when Qdrant itself is gone). Backup that can't be restored isn't a backup; both paths needed to be in-repo before the cron was considered done.

First real backup ran on deploy: 233 thoughts → 20.8 MB snapshot, uploaded to Drive `customBrain Backups/` (folder auto-created), 5.9s end-to-end.

### Why these three together

All three are gates for P13 (sharing customBrain). Without lockdown, anyone owns the brain data; without backups, one disk failure deletes 2 months of captures and the consolidation history (Western-order canonicals, frontmatter migration, etc.) is unrecoverable. HTTPS was already done (cert valid 89 days, ECDSA, auto-renew). Roadmap review's P0 is now fully shipped.

### Deploy notes

Standard mandatory pattern per `feedback_hetzner_restart.md`: `pm2 stop all && fuser -k 3000/tcp` BEFORE `pm2 start`. Note: `pm2 start all` only starts MODULES (e.g. `pm2-logrotate`), not stopped apps — use `pm2 restart all` or explicit names to bring custombrain back. Burned us once during this deploy.

## 0.13.0 — 2026-05-16

**Obsidian-native YAML frontmatter for People + Project metadata.** The custom `alias: X` / `email: X` body-line convention is replaced by standard Obsidian Properties — `aliases:` array and `email:` scalar / `emails:` array — written into the `---…---` frontmatter block at the top of each `.md`. Obsidian's Properties UI now manages them natively (the user can add/remove aliases via the panel instead of editing raw text).

### Parser change — `server/drive-context.js`

- New `parseFrontmatter()` handles the subset of YAML Obsidian Properties actually emits: scalar `key: value`, multi-line `key:` + `  - item`, inline `key: [a, b]`.
- `listWithAliases` reads frontmatter first (primary), then falls back to legacy `alias:`/`email:` body lines (so files that haven't been migrated still resolve).
- Wikilink wrappers (`[[…]]`) are kept on raw frontmatter values — only stripped where aliases are *consumed*. That preserves link-shaped fields like `projects: [[Telekom]]` on the project doc side.

### Migration — `scripts/migrate-to-frontmatter.js`

78 .md files rewritten (~70 People + ~7 Projects). **Surgical** rewrite: only the `aliases:` / `email:` / `emails:` blocks inside the frontmatter (and the matching legacy body lines) are touched. Every other frontmatter key — including non-standard ones the parser doesn't even understand (`Product Groups: SZK, HK, …`) and placeholder empty `tags:` keys — is preserved byte-for-byte. Idempotent on re-run; files already in pure-frontmatter form are no-ops.

### Hatás

A `getVaultContext` 100 people / 130 aliases / 42 emails-t tölt be a migráció után (verified live). A capture-pipeline `metadata.js::resolveAliases` változatlanul működik a kibővített alias-map-pel. Obsidian Properties UI most natívan tudja kezelni az aliasokat (lásd ArtAI.md és Me.md).

## 0.12.0 — 2026-05-16

**Alias-aware `writeStubs` + Western-order People canonicals + sub-product fold.** Two-part fix for the recurring duplicate-People-stub regression and the FÉLRETESZEK/BEFCAST garbage-projects issue.

### Root-cause patch — `server/routes/export.js::writeStubs`

A `getVaultContext()` call now precedes the People/Projects sync. Each candidate name is resolved through `aliases` / `projectAliases` (case-insensitive) before the existing-file check — if the resolved form already exists as a canonical filename, the stub is skipped instead of created.

For **projects** the behavior is stricter: `skipAutoCreate: true` is passed, so unknown project names are never auto-created — they emit a `⚠ unknown project:` log line instead. Projects are now strictly user-curated; Haiku can no longer slip a new "project" into the canonical whitelist by mislabelling one capture.

Without this patch the export turned every accent variant Haiku produced (e.g. `Hollósi István`) into a brand-new canonical alongside the existing one (`Istvan Hollosi`), permanently breaking the alias map — both names became filenames and the loop-breaker in `drive-context.js` only handles A↔B circulars.

### People canonicalization — Western order

Earlier consolidation passes had picked Hungarian order (`Hollosi Istvan`) as canonical. Flipped to Western order across the board: `Istvan Hollosi`, `Anna Bodiss`, `Liza Laszlo`, etc. Accented + Hungarian-order forms become aliases. 65+ canonical files renamed/merged, 117 duplicate .md deleted (`187 → 123` People files), 135 Qdrant payloads rewritten.

`scripts/drive-consolidate-people.js` — local one-off; merges aliases + emails + body from each source file into the new canonical, then deletes sources. Idempotent.
`scripts/consolidate-people.js` — extended with the same Western-order map plus project rewrite logic (`FÉLRETESZEK→ERSTE`, `BEFCAST→ERSTE`, sub-product preserved in topics).

### Sub-product fold — FÉLRETESZEK, BEFCAST

`Projects/FÉLRETESZEK.md` and `Projects/BEFCAST.md` deleted. These were never real projects — they're Erste sub-products that slipped past the strict-whitelist rule in a past Haiku run and got auto-canonicalised by the old `writeStubs`. ERSTE.md's project doc already enumerates the sub-products, so Haiku has the hierarchy from `projectDocs`. With the orphans gone and `skipAutoCreate` on projects, the cycle can't restart.

(Qdrant data was already clean — both sub-product names only appeared in `topics`, never in `projects`. No rewrite needed.)

### Hatás

A `writeStubs` patch a `pm2 restart` után aktív, így a következő hourly export már nem fog duplikált People-fájlokat regenerálni. A 0.12.0 utáni Obsidian-vault rebuild igazolta: 233 thought, **0 new people, 0 new projects** stub keletkezett.

## 0.11.0 — 2026-05-01

**Project.md teljes tartalom a Haiku metadata-promptba + strict project-whitelist.** A Haiku-prompt eddig csak a vault projekt-neveinek listáját kapta meg (pl. `"Bizi, Hello Business, ConfAI, Erste, Telekom..."`), a project.md fájlok tartalma eldobódott a `listWithAliases`-ben az `alias:`/`email:` regex match után. Két javítás:

### A) Project documents in context (`server/drive-context.js`, `server/metadata.js`)

- `listWithAliases` opcionális `withDocuments: true` paraméterrel a `.md` teljes tartalmát visszaadja egy `documents: { canonical: text }` mapben.
- `getVaultContext` a Projects-mappára `withDocuments: true`-val hívja, eredménye `projectDocs` mezőként a kontextusban (a People-mappa változatlan — emberekre csak alias + email kell jelenleg).
- `metadata.js` `buildPrompt` új context-blokkja: `## Full project documents — markdown content of each project's .md file ...` Az üres .md-ket kihagyja.

A Haiku így egy meeting transcript besorolásakor látja, hogy pl. a "Hello Business" project Telekom B2B SMB digitalizációs chatbot, vagy hogy a "Bizi" ennek belső kódneve. Mind a négy mezőre (title, topics, projects, action_items) hat — gazdagabb context = pontosabb tagging.

Token-becslés: ~27 projekt × ~2-3 KB tartalmanként = ~15-20k extra input token capture-onként, Haiku-window 200k-ban triviális. Költség capture-onként ~$0.02 — évi 200 capture esetén ~$4. A `getVaultContext` 5 perces cache-e mérsékli a Drive-API olvasásokat.

### B) Strict project whitelist (`server/metadata.js`)

A `projects` szabály explicit utasítja a Haiku-t hogy **soha ne találjon ki új projekt-neveket** kliens / termék / kampány / pénzügyi-év fragmentumokból. Konkrét példa beírva: `"FY26 Erste-Visa Cseperedő kampány"` invalid — a canonical projekt `"Erste"`, a többi (FY26, Visa, Cseperedő, kampány) `topics`-ba kerül. Ha nincs canonical match, az `projects` array üres marad — empty correct, invented wrong.

### Hatás

A változás új capture-eken és minden refresh-en (Gmail, `update_thought_text_with_summary`, manuális) érvényesül. A meglévő thoughtok project-tag-jei nem változnak retroaktívan; ha egy thought project-tag-je rosszul invent-elt nevet tartalmaz, az egy `find_overconnected` + `update_thought` brain-hygiene körrel hozható rendbe.

## 0.10.1 — 2026-05-01

**Title-prompt bővítés: primary project név prefixelése.** A Haiku metadata extract title-szabálya most explicit kéri: ha primary project van azonosítva (és az `projects` arrayben végzi a meglévő szigorú tagging rule szerint), a title prefixelődjön a canonical project névvel és egy em-dash-szel — pl. `"Hello Business — KPI és biztonság"` a `"KPI és biztonság"` helyett. Ha nincs primary project, a title változatlan marad (nincs felesleges prefix amikor nincs projekt).

A változás akkor érvényesül, ha valami refresh-eli a thoughtot — új capture, Gmail thread-update, vagy a coworker-loop `update_thought_text_with_summary`-zése. A meglévő thoughtok címei nem változnak retroaktívan.

`server/metadata.js:56` egyetlen sor változás. Nincs új mező, nincs új tool, nincs payload-shift.

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
