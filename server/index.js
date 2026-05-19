import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
// Explicit path so we're independent of pm2 --cwd. The .env lives at repo
// root (single bootstrap secret) since 0.23.0 — moved from server/.env.
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env') });
import { applySettingsToEnv } from './config.js';
const settingsLoad = applySettingsToEnv();
import express from 'express';
import cors from 'cors';
import captureRouter from './routes/capture.js';
import searchRouter from './routes/search.js';
import recentRouter from './routes/recent.js';
import statsRouter from './routes/stats.js';
import exportRouter from './routes/export.js';
import summaryRouter from './routes/summary.js';
import agendaRouter from './routes/agenda.js';
import settingsRouter from './routes/settings.js';
import healthCheckRouter from './routes/health-check.js';
import firefliesWebhookRouter from './routes/fireflies-webhook.js';
import mcpTokensRouter from './routes/mcp-tokens.js';
import oauthRouter from './routes/oauth.js';
import { handleMcpHttp } from './mcp.js';
import { validateToken as validateMcpToken } from './mcp-token-store.js';
import { isBlocked as rateLimitCheck, recordSuccess as rateLimitOk, recordFailure as rateLimitBad } from './rate-limiter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Trust the loopback proxy (nginx → 127.0.0.1:3000) so `req.ip` resolves to
// the X-Forwarded-For client address instead of always '127.0.0.1'. Per-IP
// rate limiting depends on this (since 0.24.3). The nginx site sends
// X-Forwarded-For via `$proxy_add_x_forwarded_for`.
app.set('trust proxy', 'loopback');

// Tighten CORS to our own UI origin (was wildcard before 0.24.3). The UI is
// same-origin so doesn't need CORS at all; tightening prevents any other site's
// JS from reading API responses if a future XSS leaked the bearer token. The
// Chrome extension is unaffected — host_permissions in its manifest bypass CORS.
app.use(cors({ origin: 'https://brain.beliczki.hu' }));

// Serve React client (no auth — it's just an SPA shell)
app.use(express.static(join(__dirname, '..', 'client', 'dist')));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/mcp') || req.path.startsWith('/capture') ||
      req.path.startsWith('/search') || req.path.startsWith('/recent') ||
      req.path.startsWith('/stats') || req.path.startsWith('/export') ||
      req.path.startsWith('/thoughts') || req.path.startsWith('/agenda') ||
      req.path.startsWith('/settings') || req.path.startsWith('/health-check') ||
      req.path.startsWith('/fireflies-webhook') ||
      req.path.startsWith('/oauth') || req.path.startsWith('/.well-known')) {
    return next();
  }
  res.sendFile(join(__dirname, '..', 'client', 'dist', 'index.html'));
});

// Note: /mcp-tokens (token management UI) is covered by /mcp prefix above
// — it's an HTTP API, not an SPA route, so the wildcard passes it through.

// Webhook routes use their own secret — mounted before Bearer auth.
// Parse JSON but save raw body on req so HMAC can verify the exact bytes.
app.use(
  '/fireflies-webhook',
  express.json({
    verify: (req, _res, buf) => { req.rawBody = buf; },
  }),
  firefliesWebhookRouter,
);

// Auth middleware — path-aware split:
//   - /mcp/http accepts ONLY named tokens from state/mcp-tokens.json
//     (strict separation: the env-only master UI_SECRET never authorizes MCP
//     traffic, so a leak of the UI secret doesn't expose the MCP surface)
//   - everything else (UI, /capture, /search, /mcp-tokens management, etc.)
//     requires the master UI_SECRET only
// Bootstrap: with zero MCP tokens, MCP is locked until UI mints one — the UI
// itself uses UI_SECRET so no lockout is possible.
// Renamed from CAPTURE_SECRET in 0.24.0 for semantic clarity (the secret no
// longer guards /capture alone since 0.22.0 split MCP off; it's the UI master).
//
// Rate limit (since 0.24.2): non-MCP failed auth attempts trigger an escalating
// global lockout ladder (3 → 1min, 3 → 5min, 3 → 10min, 3 → 30min cap).
// Single-user system, single counter — see server/rate-limiter.js for the rationale.
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') return next();

  // OAuth endpoints + RFC 8414 discovery are PUBLIC — they have their own
  // auth mechanisms (PKCE / client_secret / OAUTH_USER+PASSWORD on consent).
  // Bypassing the global Bearer check lets clients reach them without holding
  // a token yet. The Settings-UI management endpoints (/oauth/clients) DO
  // require master Bearer — they're protected per-route inside oauth.js by
  // checking the Authorization header explicitly there.
  // We exempt /oauth/authorize, /oauth/token, /oauth/register, and /.well-known.
  // /oauth/clients (management) goes through the master-auth flow below.
  if (req.path.startsWith('/.well-known') ||
      req.path === '/oauth/authorize' ||
      req.path === '/oauth/token' ||
      req.path === '/oauth/register') {
    return next();
  }

  const rawToken = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : (req.query.token || '');

  if (req.path === '/mcp/http') {
    if (rawToken && validateMcpToken(rawToken)) return next();
    return res.status(401).json({ error: 'MCP requires a named token from /mcp-tokens (master secret does not authorize MCP)' });
  }

  // Check rate limit BEFORE comparing tokens — saves the comparison cost on
  // a locked-out attacker and is consistent (a request during a lockout never
  // succeeds, regardless of the token). Per-IP since 0.24.3 (was global) —
  // req.ip is the real client IP via `trust proxy` + nginx X-Forwarded-For.
  const ip = req.ip;
  const limit = rateLimitCheck(ip);
  if (limit.blocked) {
    res.setHeader('Retry-After', String(limit.retry_after_seconds));
    return res.status(429).json({
      error: `Too many failed auth attempts from your IP. Try again in ${limit.retry_after_seconds}s.`,
      retry_after_seconds: limit.retry_after_seconds,
    });
  }

  if (rawToken && rawToken === process.env.UI_SECRET) {
    rateLimitOk(ip);
    return next();
  }
  rateLimitBad(ip);
  return res.status(401).json({ error: 'Unauthorized' });
});

// Body parsing (skip /mcp/http — StreamableHTTPServerTransport needs raw body)
app.use((req, res, next) => {
  if (req.path === '/mcp/http') return next();
  express.json()(req, res, next);
});

// API routes
app.use(captureRouter);
app.use(searchRouter);
app.use(recentRouter);
app.use(statsRouter);
app.use(exportRouter);
app.use(summaryRouter);
app.use(agendaRouter);
app.use(settingsRouter);
app.use(healthCheckRouter);
app.use(mcpTokensRouter);
app.use(oauthRouter);

// MCP endpoint (Streamable HTTP only)
app.all('/mcp/http', handleMcpHttp);

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Open Brain server running on 127.0.0.1:${PORT} (nginx reverse-proxies from 443) [config: ${settingsLoad.applied} from ${settingsLoad.source}]`);
});
