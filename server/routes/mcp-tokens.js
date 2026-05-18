import { Router } from 'express';
import { listTokens, createToken, revokeToken } from '../mcp-token-store.js';

const router = Router();

// All three routes are mounted under the global auth middleware, which (per
// server/index.js) requires master UI_SECRET (renamed from CAPTURE_SECRET in
// 0.24.0) for any non-MCP path. `/mcp-tokens` ≠ `/mcp/http` — token management
// is master-only, MCP usage is named-token-only.

router.get('/mcp-tokens', (req, res) => {
  try {
    const revealId = req.query.reveal_id || null;
    res.json({ tokens: listTokens({ revealId }) });
  } catch (err) {
    console.error('mcp-tokens list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/mcp-tokens', (req, res) => {
  try {
    const { name } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name required' });
    const record = createToken(name);
    res.status(201).json({ token: record });
  } catch (err) {
    const status = err.message.includes('already exists') ? 409 : 400;
    res.status(status).json({ error: err.message });
  }
});

router.delete('/mcp-tokens/:id', (req, res) => {
  const ok = revokeToken(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

export default router;
