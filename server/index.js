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
import { handleMcpSse, handleMcpMessage, handleMcpHttp } from './mcp.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// API routes
app.use(captureRouter);
app.use(searchRouter);
app.use(recentRouter);
app.use(statsRouter);
app.use(exportRouter);

// MCP endpoints
app.get('/mcp', handleMcpSse);              // SSE transport (legacy)
app.post('/mcp/messages', handleMcpMessage); // SSE message handler
app.all('/mcp/http', handleMcpHttp);        // Streamable HTTP transport (modern)

// Serve React client in production
app.use(express.static(join(__dirname, '..', 'client', 'dist')));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/mcp') || req.path.startsWith('/capture') ||
      req.path.startsWith('/search') || req.path.startsWith('/recent') ||
      req.path.startsWith('/stats') || req.path.startsWith('/export')) {
    return next();
  }
  res.sendFile(join(__dirname, '..', 'client', 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Open Brain server running on port ${PORT}`);
});
