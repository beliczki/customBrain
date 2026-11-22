# Server setup (one-time)

Deploy steps, the check after a deploy, rollback and the known problems are in `AGENTS.md`, section "Deploy". Which box runs production, and where the repo sits on it, is in `~/.agents/infra-map.md`. This file keeps only what is done once on a new server. `<repo>` stands for the repo folder on the box.

Production runs the server under pm2 behind nginx. Docker runs only Qdrant.

## Auto-intake setup (Fireflies + YouTube + Gmail)

One-time setup on the server:

1. **Rerun init to add payload indexes:**
   ```bash
   npm run init   # idempotent; ensures source + source_id indexes exist
   ```

2. **Set env vars** in the Settings UI tab (since 0.23.0; previously `<repo>/server/.env`, now `<repo>/.env` for `UI_SECRET` only — renamed from `CAPTURE_SECRET` in 0.24.0):
   - `FIREFLIES_WEBHOOK_SECRET` = <random 32-char string>
   - `GMAIL_BRAIN_LABEL` = `brain`
   - `GMAIL_CAPTURED_LABEL` = `brain/captured`

   These persist in `state/settings.json` and override env at boot via `applySettingsToEnv()`.

3. **Fireflies webhook** — in Fireflies Developer Settings → Webhooks, add:
   `https://brain.beliczki.hu/fireflies-webhook?secret=<FIREFLIES_WEBHOOK_SECRET>`
   Event: Transcription completed.

4. **Gmail labels** — apply the `brain` label to one email manually first (Gmail only shows labels that exist). The cron auto-creates `brain`, `brain/captured`, `brain/empty` on first run if missing (via `ensureLabel`).

5. **Crontab** — edit with `crontab -e`. These are the seven lines production runs (checked 2026-11-22):
   ```
   */30 * * * * cd <repo> && /usr/bin/node cron/youtube-intake.js >> /var/log/brain-youtube.log 2>&1
   */10 * * * * cd <repo> && /usr/bin/node cron/gmail-intake.js >> /var/log/brain-gmail.log 2>&1
   0 * * * *    cd <repo> && /usr/bin/node cron/export.js >> /var/log/brain-export.log 2>&1
   0 3 * * *    cd <repo> && /usr/bin/node cron/qdrant-backup.js >> /var/log/brain-backup.log 2>&1
   15 * * * *   cd <repo> && /usr/bin/node cron/agenda-sync.js >> /var/log/brain-agenda.log 2>&1
   */10 * * * * cd <repo> && /usr/bin/node scripts/backfill-chunks.js 10 >> /var/log/brain-backfill.log 2>&1
   30 4 * * *   cd <repo> && /usr/bin/node cron/repos-status.js >> /var/log/brain-repos.log 2>&1
   ```

6. **Restart the server** (needed for webhook route registration): steps 2, 3 and 6 of the "Deploy" section in `AGENTS.md`.

## Setup notes

- **Claude Desktop MCP config** — only supports `command`+`args` (stdio), not SSE/HTTP directly. Use `npx mcp-remote https://brain.beliczki.hu/mcp/http` as the command to bridge stdio↔Hetzner.
- **OAuth2 scope expansion** — when adding Google API scopes, must re-run `server/get-drive-token.js` and update the refresh token in `.env` on all environments (local + Hetzner).
- **`.env.example` is incomplete** — it only lists base vars. OAuth2 vars (`GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, `GOOGLE_DRIVE_REFRESH_TOKEN`) required by agent tools and Drive writes are not listed.
