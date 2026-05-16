import { Router } from 'express';
import { runHealthCheck } from '../brain-health.js';

const router = Router();

router.get('/health-check', async (req, res) => {
  try {
    const result = await runHealthCheck();
    res.json(result);
  } catch (err) {
    console.error('Health check error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
