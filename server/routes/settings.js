import { Router } from 'express';
import { getSettingsForUI, saveSettings, loadSettings } from '../config.js';
import { isSecret, SETTINGS_SCHEMA } from '../config-schema.js';

const router = Router();

const SCHEMA_KEYS = new Set(SETTINGS_SCHEMA.map((s) => s.key));

router.get('/settings', (req, res) => {
  try {
    const reveal = req.query.reveal === 'true';
    res.json(getSettingsForUI({ revealSecrets: reveal }));
  } catch (err) {
    console.error('Settings read error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.put('/settings', (req, res) => {
  try {
    const body = req.body || {};
    if (typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ error: 'Body must be a flat object of { KEY: value }' });
    }
    const partial = {};
    const stored = loadSettings() || {};
    for (const [key, value] of Object.entries(body)) {
      if (!SCHEMA_KEYS.has(key)) {
        return res.status(400).json({ error: `Unknown setting: ${key}` });
      }
      // Skip the "no change" sentinel — UI sends an empty string OR the literal mask
      // back when the user didn't touch a secret field. Treat empty + mask both as
      // "leave as is" for secrets only; non-secrets accept empty to clear.
      if (isSecret(key) && (value === '' || (typeof value === 'string' && value.startsWith('••••')))) {
        continue;
      }
      partial[key] = value;
    }
    if (Object.keys(partial).length === 0) {
      return res.json({ ok: true, changed: 0, updated_at: stored._updated_at || null });
    }
    const updated = saveSettings(partial);
    res.json({
      ok: true,
      changed: Object.keys(partial).length,
      updated_at: updated._updated_at,
    });
  } catch (err) {
    console.error('Settings write error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/settings/restart', (req, res) => {
  res.json({ ok: true, restart_in_ms: 500 });
  // Schedule exit AFTER response is flushed. PM2 auto-restarts on exit.
  setTimeout(() => {
    console.log('[settings] Restart requested via API — exiting for PM2 to pick up new env');
    process.exit(0);
  }, 500);
});

export default router;
