# customBrain — Agent-Driven Install

**Written for Claude Code (or any LLM-driven shell operator), not human readers.** Step-by-step playbook for setting up customBrain on a fresh Linux VPS. Default target: Hetzner CX22 or similar 2GB+ Ubuntu 24.04.

> **STATUS: SKELETON 2026-05-16.** Section structure locked, detailed commands TBD in next iteration. Will be hand-tested on a fresh Hetzner before each section's commands are finalized.

Each step has:
- **Goal** — what this step achieves
- **Commands** — exact shell commands to run *(TBD)*
- **Verify** — how to confirm success before moving on *(TBD)*
- **Recover** — what to do if verify fails *(TBD)*

---

## Prerequisites (provided by the user before invoking the agent)

- Target hostname or IP (e.g., `brain.example.com`)
- SSH private key with root or sudo access
- Domain pointing to the host (A record) — required for HTTPS step
- API keys ready to paste later via Settings UI:
  - Anthropic API key
  - Google Drive: OAuth2 client ID, client secret, refresh token (lásd `scripts/get-drive-token.js`)
  - Google service account JSON (Drive vault context reads)
  - Google Gemini API key
  - Fireflies API key + webhook signing secret
  - Gmail OAuth2 (ugyanaz mint Drive OAuth2, `gmail.modify` scope-pal)
  - YouTube API key (Data API v3 enabled a Google Cloud projekten)

---

## Step 1 — Reach + sudo check

**Goal**: confirm SSH access and privilege escalation work before installing anything.

**Commands** — TBD

**Verify** — TBD

**Recover** — TBD

---

## Step 2 — Base install (node 20, docker, nginx, certbot, pm2)

**Goal**: install system-level dependencies needed by every later step.

**Commands** — TBD

**Verify** — TBD

**Recover** — TBD

---

## Step 3 — Clone repo + npm install

**Goal**: get the customBrain code on the host and install deps in root, `server/`, `client/`.

**Commands** — TBD

**Verify** — TBD

**Recover** — TBD

---

## Step 4 — Qdrant up + collection init

**Goal**: start Qdrant via docker compose, create the `thoughts` collection idempotently (`npm run init`).

**Commands** — TBD

**Verify** — TBD

**Recover** — TBD

---

## Step 5 — PM2 + startup

**Goal**: start the Express server under PM2, register PM2 with systemd so it auto-restarts on reboot. Honor the mandatory restart pattern (`pm2 stop all && fuser -k 3000/tcp` BEFORE `pm2 start`).

**Commands** — TBD

**Verify** — TBD

**Recover** — TBD

---

## Step 6 — Nginx + HTTPS

**Goal**: reverse proxy 443 → localhost:3000, certbot issues + auto-renews cert for the user's domain.

**Commands** — TBD

**Verify** — TBD

**Recover** — TBD

---

## Step 7 — First-run health check

**Goal**: confirm the server responds, Qdrant is reachable, no missing required env / settings.

**Commands** — TBD

**Verify** — TBD

**Recover** — TBD

---

## Step 8 — Hand-off to user

**Goal**: tell the user what to do next.

**Output to user**:
- `https://<host>/` is live
- Open the Settings tab, paste API keys (categories: Google Drive, Fireflies, Anthropic, Google API, Gmail OAuth, YouTube, CAPTURE_SECRET)
- After "Save & Restart", the brain is functional
- For Claude Desktop integration: add the MCP snippet below to `~/Library/Application Support/Claude/claude_desktop_config.json` *(snippet TBD)*

---

## Recovery / common pitfalls (TBD — to be filled from `feedback_*.md` memory + experience)

- **PM2 zombie process during deploy** → `feedback_hetzner_restart.md` pattern (pm2 stop + fuser -k 3000/tcp BEFORE pm2 start)
- **OOM during npm install on 2GB Hetzner** → add swap *(exact command TBD)*
- **zod must stay v3** → v4 breaks `@modelcontextprotocol/sdk` via `zod-to-json-schema`
- **Service account vs OAuth2 visibility for Drive reads** → SA sees all shared files; OAuth2 may miss them. See `CLAUDE.md` "Google auth" section
- **PM2 cwd matters** → must start from the right working directory, see `DEPLOYMENT.md`

---

## What this file is NOT

- Not a human-readable tutorial. Each step assumes an agent that can read shell output, parse errors, and recover.
- Not a complete reference. For architecture / why-decisions, see `CLAUDE.md` and `ROADMAP.md`.
- Not multi-user. Each install is single-tenant; one box = one user.
