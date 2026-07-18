# Dossier indexing — spec (Option B)

Date: 2026-07-18
Goal: make the canonical People/Projects/Topics `.md` dossiers retrievable by
`search_brain` (today they are NOT in the index — only read at capture time for
Haiku metadata), and keep that index fresh as agents/humans update the files.

Decision: Option A (deterministic "entity question" routing) rejected — question
classification is unreliable and would fail constantly. Dossiers must live in the
retrieval index like everything else.

## What gets indexed

One Qdrant point per dossier file, in the existing `thoughts_v2` collection:

```
kind: 'dossier'
dossier_type: 'person' | 'project' | 'topic'
path: 'Projects/Bizi'          # stable identity of the dossier
name: 'Bizi'
aliases: [...]                  # from frontmatter
text: <full file body>         # embedded
source: 'vault'
updated_at: <Drive modifiedTime>
```

- Dense vector: `embedText(text, 'RETRIEVAL_DOCUMENT')` (same as thoughts).
- Sparse vector: `sparseEncodeDoc(text)` (same as thoughts).
- **Point ID = deterministic UUIDv5 from `path`** → re-indexing a changed file
  OVERWRITES its point (no duplicates), and deletion is targetable.

## Refresh — three layered triggers (all call one idempotent function)

Core: `reindexDossiers({ paths?, types?, reconcile? })` in a new
`server/dossier-index.js`. Reads dossiers via the SA (reuse `drive-context`'s
`listWithAliases` extended to return `modifiedTime` + body), embeds, upserts by
deterministic ID.

1. **On-demand (explicit)** — new MCP tool `reindex_dossiers` + HTTP route
   `POST /reindex`. After an agent or human writes an `.md`, it calls the brain
   to reindex that file immediately. This is the "when AI updates any md, call the
   brain to reindex" path you asked for. Scoped by `paths` or `types`, or full.
2. **Opportunistic (drift detection)** — during capture, `getVaultContext()`
   already reads the dossier folders. Extend it to compare each file's Drive
   `modifiedTime` against a stored manifest (`state/dossier-index-manifest.json`);
   any file whose mtime changed (confirmed by content hash to skip no-op bumps)
   gets reindexed as a delta. So even without an explicit call, dossiers stay
   fresh because captures run every 10–30 min via the intake crons.
3. **Scheduled reconcile (backstop)** — a periodic full pass (piggyback the
   hourly `cron/export.js`, or a daily `cron/dossier-index.js`): reindex changed
   files AND delete points whose `path` no longer exists on Drive (handles
   renames/deletions the delta paths miss).

Freshness guarantee: an approved weekly agent edit is searchable immediately (via
trigger 1) or within one capture/cron tick (triggers 2–3). Cost is trivial —
~285 small files, hash-gated so unchanged files are never re-embedded.

## Retrieval integration

- Dossiers surface through the existing hybrid search automatically once indexed
  (they carry dense+bm25 vectors). No new search path needed.
- **Ranking:** give `kind:'dossier'` a boost (or a dedicated result slot) so a
  curated dossier outranks a stale raw thought on overlapping content — this is
  the fix for "search answered from a stale April thought instead of ERSTE.md".
  Boost factor is a tunable; start modest, calibrate with the evaluator.
- Evidence tag: add `canonical_dossier` so the answer path can weight it as
  higher-trust than `weak_semantic` thoughts.

## Correctness details (must-get-right)

- **Capture dedup/supersede must EXCLUDE dossiers.** `captureThought`'s near-match
  search (`server/routes/capture.js`) currently filters `m.kind !== 'chunk'`.
  Extend it to also exclude `kind:'dossier'` — only THOUGHT points may be
  archived/superseded; a dossier is never a capture duplicate.
- **Obsidian export must not re-export dossier points as thoughts.** `export.js`
  reads points to write `.md`; it must filter out `kind:'dossier'` (they already
  ARE the Drive files — round-tripping would be circular).
- **MCP tool parity:** register `reindex_dossiers` in BOTH `server/mcp.js` and
  `server/mcp-stdio.js` (duplication rule).
- **SPA route guard:** add `/reindex` to the hardcoded API-path list in
  `server/index.js`'s wildcard.
- **Manifest:** `state/dossier-index-manifest.json` = { path: {mtime, hash} },
  updated after each successful (re)index; gates re-embedding.

## Files touched

- New: `server/dossier-index.js` (`reindexDossiers` + helpers), route
  `server/routes/reindex.js`, optional `cron/dossier-index.js`.
- Edit: `server/drive-context.js` (return mtime + body), `server/routes/capture.js`
  (exclude dossiers from dedup + opportunistic drift trigger), `server/mcp.js` +
  `server/mcp-stdio.js` (tool), `server/index.js` (route mount + SPA guard),
  `server/routes/search.js` (dossier boost + evidence tag), `cron/export.js`
  (exclude dossiers from export; optional reconcile call), `scripts/init-collection.js`
  (ensure `kind` payload index for filtering).

## Open decisions for Robert

1. Dossier ranking boost: dedicated result slot (always show the matching
   dossier) vs a score multiplier in RRF? (Recommend: modest multiplier + the
   `canonical_dossier` evidence tag, calibrate via evaluator.)
2. Reconcile cadence: fold into hourly export vs a separate daily cron?
3. Do we index the dossier body verbatim, or a cleaned/summarized form for very
   long Project dossiers? (Recommend verbatim first; revisit if long files hurt
   ranking.)

## Verification

- After indexing, the batch-2/3 failing queries must surface the right dossier:
  `believeinyourself` → ERSTE.md, `Diffusion Simulator` → Nexus.md, Bizi status →
  Bizi.md. Re-run those exact searches (they returned zero dossiers on 2026-07-18).
- Edit a dossier, call `reindex_dossiers`, confirm the new text is searchable and
  the old point was overwritten (no duplicate).
- Delete a test dossier, run reconcile, confirm its point is gone.
- Confirm capture still dedups correctly and does NOT treat a dossier as a
  supersede candidate.
