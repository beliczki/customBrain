// Single source of truth for Qdrant collection names.
//
// Why this file exists: between 0.20.0 (2026-05-17) and 0.41.2 (2026-09-12) the
// backup cron snapshotted 'thoughts' while the live server read and wrote
// 'thoughts_v2'. Both collections existed on the box — the old one was kept as a
// migration rollback net and never dropped — so every nightly run found a real
// collection, logged success, and uploaded 34 MB of the dead 596-point snapshot
// to Drive. 118 nights of green logs, zero backups of live data.
//
// Keep this module free of imports and side effects: cron entry points import it
// before dotenv.config() and applySettingsToEnv() have run, and a module-level
// QdrantClient here would capture a QDRANT_URL that isn't loaded yet.
//
// The name is imported, never retyped. One-shot migration scripts under scripts/
// that predate the hybrid migration still name 'thoughts' literally — those are
// historical records of a run against that collection, not live paths.

export const THOUGHTS = 'thoughts_v2';

// Verified commitments (0.53.0) — see docs/commitments-terv-2026-10-10.md.
// Thought `action_items` stay loose candidates in THOUGHTS; this collection
// holds what was checked against a direct source and has a status.
export const COMMITMENTS = 'commitments';

// Every collection the nightly backup snapshots. A new collection goes here
// in the same change that creates it — the S1 incident above is what an
// unlisted collection looks like.
export const BACKED_UP = [THOUGHTS, COMMITMENTS];
