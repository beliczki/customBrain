import 'dotenv/config';
import { applySettingsToEnv } from './config.js';
const settingsLoad = applySettingsToEnv();
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
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
import { handleMcpHttp } from './mcp.js';
import { validateToken as validateMcpToken } from './mcp-token-store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// Serve React client (no auth — it's just an SPA shell)
app.use(express.static(join(__dirname, '..', 'client', 'dist')));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/mcp') || req.path.startsWith('/capture') ||
      req.path.startsWith('/search') || req.path.startsWith('/recent') ||
      req.path.startsWith('/stats') || req.path.startsWith('/export') ||
      req.path.startsWith('/thoughts') || req.path.startsWith('/agenda') ||
      req.path.startsWith('/settings') || req.path.startsWith('/health-check') ||
      req.path.startsWith('/fireflies-webhook')) {
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
//     (strict separation: the env-only master CAPTURE_SECRET never authorizes
//     MCP traffic, so a leak of the UI secret doesn't expose the MCP surface)
//   - everything else (UI, /capture, /search, /mcp-tokens management, etc.)
//     requires the master CAPTURE_SECRET only
// Bootstrap: with zero MCP tokens, MCP is locked until UI mints one — the UI
// itself uses CAPTURE_SECRET so no lockout is possible.
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') return next();
  const rawToken = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : (req.query.token || '');

  if (req.path === '/mcp/http') {
    if (rawToken && validateMcpToken(rawToken)) return next();
    return res.status(401).json({ error: 'MCP requires a named token from /mcp-tokens (master secret does not authorize MCP)' });
  }

  if (rawToken && rawToken === process.env.CAPTURE_SECRET) return next();
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

// MCP endpoint (Streamable HTTP only)
app.all('/mcp/http', handleMcpHttp);

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Open Brain server running on 127.0.0.1:${PORT} (nginx reverse-proxies from 443) [config: ${settingsLoad.applied} from ${settingsLoad.source}]`);
});
