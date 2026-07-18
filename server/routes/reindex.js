import { Router } from 'express';
import { reindexDossiers } from '../dossier-index.js';

const router = Router();

// On-demand dossier reindex. Call after an agent or human edits a canonical
// People/Projects/Topics `.md` so the change is searchable immediately, without
// waiting for the hourly reconcile. Body (all optional):
//   { paths?: string[], types?: ('person'|'project'|'topic')[], reconcile?: bool }
router.post('/reindex', async (req, res) => {
  try {
    const { paths, types, reconcile } = req.body || {};
    const result = await reindexDossiers({ paths, types, reconcile: !!reconcile });
    res.json(result);
  } catch (err) {
    console.error('Reindex error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
