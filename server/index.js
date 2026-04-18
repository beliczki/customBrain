import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import captureRouter from './routes/capture.js';
import searchRouter from './routes/search.js';
import recentRouter from './routes/recent.js';
import statsRouter from './routes/stats.js';
import exportRouter from './routes/export.js';
import firefliesWebhookRouter from './routes/fireflies-webhook.js';
import { handleMcpHttp } from './mcp.js';

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
      req.path.startsWith('/thoughts') || req.path.startsWith('/fireflies-webhook')) {
    return next();
  }
  res.sendFile(join(__dirname, '..', 'client', 'dist', 'index.html'));
});

// Webhook routes use their own secret — mounted before Bearer auth.
// Parse JSON but save raw body on req so HMAC can verify the exact bytes.
app.use(
  '/fireflies-webhook',
  express.json({
    verify: (req, _res, buf) => { req.rawBody = buf; },
  }),
  firefliesWebhookRouter,
);

// Auth middleware — all routes below require Bearer token
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') return next();
  const auth = req.headers.authorization || (req.query.token ? `Bearer ${req.query.token}` : '');
  if (!auth || auth !== `Bearer ${process.env.CAPTURE_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
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

// MCP endpoint (Streamable HTTP only)
app.all('/mcp/http', handleMcpHttp);

app.listen(PORT, () => {
  console.log(`Open Brain server running on port ${PORT}`);
});
