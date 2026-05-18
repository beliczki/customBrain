// Per-IP rate limiter for UI auth attempts (since 0.24.3 — was global in 0.24.2).
// A global counter let an attacker from any IP lock out the legitimate user by
// triggering 3 failures from anywhere; per-IP eliminates that DoS vector.
//
// Ladder per the user's spec:
//   - 3 failures            → block 1 minute
//   - 3 more failures       → block 5 minutes
//   - 3 more failures       → block 10 minutes
//   - 3 more failures       → block 30 minutes (cap; further failures re-arm
//                              the 30 min block until a success).
//
// IP source: req.ip (Express, with `app.set('trust proxy', 'loopback')` in
// index.js so the nginx X-Forwarded-For header is honored — without that
// every request would look like 127.0.0.1 and per-IP becomes global again).
//
// Memory: in-memory Map<ip, state>. Pruned opportunistically on success +
// on a 5-minute interval (entries with no failures, no level, expired block).
// At single-user load the map stays tiny.
//
// Not applied to /mcp/http — MCP tokens have their own (stricter) failure mode.

const DURATIONS_MS = [0, 60_000, 5 * 60_000, 10 * 60_000, 30 * 60_000];
const MAX_LEVEL = DURATIONS_MS.length - 1;
const FAILURES_PER_LEVEL = 3;
const PRUNE_INTERVAL_MS = 5 * 60_000;
const STALE_AGE_MS = 60 * 60_000; // an idle entry older than 1h is stale

const STATE = new Map(); // ip → { failures, level, blocked_until, last_touch }

function getOrInit(ip) {
  let s = STATE.get(ip);
  if (!s) {
    s = { failures: 0, level: 0, blocked_until: 0, last_touch: Date.now() };
    STATE.set(ip, s);
  } else {
    s.last_touch = Date.now();
  }
  return s;
}

function pruneStale() {
  const now = Date.now();
  for (const [ip, s] of STATE) {
    if (s.blocked_until < now && s.level === 0 && s.failures === 0 && (now - s.last_touch) > STALE_AGE_MS) {
      STATE.delete(ip);
    }
  }
}

// Opportunistic background prune so the map doesn't grow unbounded under
// attacker IP churn. Single setInterval at module load; cleared on process exit.
setInterval(pruneStale, PRUNE_INTERVAL_MS).unref();

export function isBlocked(ip) {
  const s = getOrInit(ip);
  const now = Date.now();
  if (s.blocked_until > now) {
    return { blocked: true, retry_after_seconds: Math.ceil((s.blocked_until - now) / 1000) };
  }
  return { blocked: false, retry_after_seconds: 0 };
}

export function recordSuccess(ip) {
  const had_state = STATE.has(ip);
  STATE.delete(ip);
  if (had_state) {
    console.log(`[rate-limit] Success from ${ip} — state cleared`);
  }
}

export function recordFailure(ip) {
  const s = getOrInit(ip);
  s.failures++;
  if (s.failures >= FAILURES_PER_LEVEL) {
    s.level = Math.min(s.level + 1, MAX_LEVEL);
    s.blocked_until = Date.now() + DURATIONS_MS[s.level];
    s.failures = 0;
    const minutes = DURATIONS_MS[s.level] / 60_000;
    console.log(`[rate-limit] IP ${ip} locked at level ${s.level} for ${minutes} minute(s) after ${FAILURES_PER_LEVEL} failed UI auth attempts`);
  }
}

export function getState() {
  // Read-only snapshot for diagnostics.
  return Array.from(STATE.entries()).map(([ip, s]) => ({ ip, ...s }));
}
