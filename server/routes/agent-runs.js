import { Router } from 'express';
import { readAgentRuns } from '../mcp-call-log.js';

const router = Router();

// Runs tab (0.58.0): logged MCP calls grouped into agent runs, for replay.
router.get('/agent-runs', (req, res) => {
  try {
    const days = req.query.days ? Number(req.query.days) : 7;
    res.json(readAgentRuns({ days }));
  } catch (err) {
    console.error('Agent runs error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
