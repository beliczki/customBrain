// Global rate limiter for UI auth attempts. Single-user system → one shared
// counter (no per-IP bookkeeping needed; the legitimate user IS the only
// expected traffic source, anyone else is the attacker).
//
// Ladder (per the user's spec, 2026-05-18):
//   - 3 failures            → block 1 minute
//   - 3 more failures       → block 5 minutes
//   - 3 more failures       → block 10 minutes
//   - 3 more failures       → block 30 minutes (cap; further failures keep
//                              re-arming the 30min block until a success)
//
// A successful UI auth (correct UI_SECRET on a non-MCP route) resets the
// counter and the level. The rate limiter does NOT apply to /mcp/http —
// MCP traffic uses named tokens with their own (stricter) failure mode and
// the user explicitly excluded them.

const DURATIONS_MS = [0, 60_000, 5 * 60_000, 10 * 60_000, 30 * 60_000];
const MAX_LEVEL = DURATIONS_MS.length - 1;
const FAILURES_PER_LEVEL = 3;

let state = {
  failures: 0,      // failures since last block-trigger or success
  level: 0,         // 0 = no block, 1-4 = ladder positions
  blocked_until: 0, // epoch ms; 0 = not blocked
};

export function getState() {
  // Read-only snapshot for diagnostics / tests.
  return { ...state };
}

export function isBlocked() {
  const now = Date.now();
  if (state.blocked_until > now) {
    return { blocked: true, retry_after_seconds: Math.ceil((state.blocked_until - now) / 1000) };
  }
  // Block window expired — caller may now re-attempt. Don't reset level yet:
  // a success clears it. A miss after expiry counts toward the NEXT block.
  return { blocked: false, retry_after_seconds: 0 };
}

export function recordSuccess() {
  if (state.failures > 0 || state.level > 0) {
    console.log(`[rate-limit] Success — resetting (was failures=${state.failures} level=${state.level})`);
  }
  state = { failures: 0, level: 0, blocked_until: 0 };
}

export function recordFailure() {
  state.failures++;
  if (state.failures >= FAILURES_PER_LEVEL) {
    state.level = Math.min(state.level + 1, MAX_LEVEL);
    state.blocked_until = Date.now() + DURATIONS_MS[state.level];
    const minutes = DURATIONS_MS[state.level] / 60_000;
    console.log(`[rate-limit] Locked at level ${state.level} for ${minutes} minute(s) after ${FAILURES_PER_LEVEL} failed UI auth attempts`);
    state.failures = 0;
  }
}
