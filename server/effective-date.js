/**
 * Compute the "effective_date" for a thought — the date the CONTENT
 * happened, not when it was captured into the brain.
 *
 * Priority order:
 *   1. payload.last_internal_date (Gmail thread's most recent message, ms)
 *   2. payload.meeting_date (Fireflies meeting date, ISO string)
 *   3. payload.published_at (YouTube video publish time, ISO string)
 *   4. payload.created_at (brain capture time — fallback for manual/no source)
 *
 * Returns an ISO string. Always.
 */
export function computeEffectiveDate(payload) {
  if (payload?.last_internal_date) {
    const n = Number(payload.last_internal_date);
    if (Number.isFinite(n) && n > 0) return new Date(n).toISOString();
  }
  if (payload?.meeting_date) {
    const d = new Date(payload.meeting_date);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  if (payload?.published_at) {
    const d = new Date(payload.published_at);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  if (payload?.created_at) return payload.created_at;
  return new Date().toISOString();
}
