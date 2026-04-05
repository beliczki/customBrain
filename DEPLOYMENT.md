# Deployment — Hetzner CX22

Production at `brain.beliczki.hu`, one Docker Compose stack.

## Process management
pm2 manages the server process. Restart with `pm2 restart all --cwd /root/customBrain/server`. Nginx reverse-proxies port 3000.

## Build
**Stop all services before `npm run build`** — CX22 has 4GB RAM, will OOM otherwise.

## Known gotchas

- **pm2 cwd matters** — pm2 must start with `--cwd /root/customBrain/server` on Hetzner, otherwise `dotenv` can't find `.env` and Qdrant/API calls fail with "fetch failed".
- **express.json() blocks Streamable HTTP** — `/mcp/http` route is excluded from `express.json()` middleware because `StreamableHTTPServerTransport` needs the raw body.
- **Claude Desktop MCP config** — only supports `command`+`args` (stdio), not SSE/HTTP directly. Use `npx mcp-remote https://brain.beliczki.hu/mcp/http` as the command to bridge stdio↔Hetzner.
- **OAuth2 scope expansion** — when adding Google API scopes, must re-run `server/get-drive-token.js` and update the refresh token in `.env` on all environments (local + Hetzner).
- **Dockerfile omits `agent/` and `client/`** — the Dockerfile only copies `server/` and `scripts/`. Since `mcp.js` imports from `../agent/register.js`, the Docker image currently can't serve MCP tools that include agent tools. Client must be pre-built and served separately or the Dockerfile extended.
- **`.env.example` is incomplete** — it only lists base vars. OAuth2 vars (`GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, `GOOGLE_DRIVE_REFRESH_TOKEN`) required by agent tools and Drive writes are not listed.
- **zod must be v3** — zod v4 causes `_zod` property errors with `@modelcontextprotocol/sdk`. Keep `zod@3.x` in `server/package.json`.
