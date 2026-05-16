import { Router } from 'express';
import { syncAgenda, readAgendaCache } from '../agenda.js';

const router = Router();

function filterByDays(cache, days) {
  if (!days || !Number.isFinite(days)) return cache;
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() + days);
  const events = cache.events.filter((e) => new Date(e.event.start) < cutoff);
  return {
    ...cache,
    events,
    event_count: events.length,
    enriched_count: events.filter((e) => e.brain_context.thoughts.length > 0).length,
  };
}

router.get('/agenda', (req, res) => {
  try {
    const cache = readAgendaCache();
    if (!cache) {
      return res.status(404).json({
        error: 'No agenda cache yet — run POST /agenda/sync or wait for the hourly cron.',
      });
    }
    const days = req.query.days ? Number(req.query.days) : null;
    res.json(filterByDays(cache, days));
  } catch (err) {
    console.error('Agenda read error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/agenda/sync', async (req, res) => {
  try {
    const cache = await syncAgenda({ daysAhead: 7 });
    const days = req.body?.days ? Number(req.body.days) : null;
    res.json(filterByDays(cache, days));
  } catch (err) {
    console.error('Agenda sync error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;

export async function getAgenda({ days = 1, force_refresh = false } = {}) {
  let cache = readAgendaCache();
  const STALE_MS = 60 * 60 * 1000;
  if (force_refresh || !cache || (cache.cache_age_ms || 0) > STALE_MS) {
    cache = await syncAgenda({ daysAhead: 7 });
  }
  return filterByDays(cache, days);
}
