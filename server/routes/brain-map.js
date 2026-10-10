import { Router } from 'express';
import { buildBrainMap } from '../brain-map.js';

const router = Router();

// The Search tab's "Csomag" mode: the same package the brain_map MCP tool
// hands an agent, so the UI never grows a retrieval logic of its own.
router.get('/brain-map', async (req, res) => {
  try {
    const { q, project, person } = req.query;
    const result = await buildBrainMap({ question: q, project, person });
    if (result.error) return res.status(400).json(result);
    res.json(result);
  } catch (err) {
    console.error('Brain map error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
