# ACTIVE — Finish v2 chunking + embedding for all remaining v1 thoughts

**State (2026-05-17)**: 58 v2 / 238 = ~24% coverage. **180 v1 thoughts remain.** Process in batches of 20 by `effective_date desc` (script default since today). Each batch ~$1.50–$3, ~10–18 min.

**Run**: `node scripts/reprocess-v2-prototype.js 20` on Hetzner (defaults skip-v2 + effective_date-desc).
**Retry failed**: `node scripts/retry-failed-reprocess.js <id1> <id2> ...` (has empty-chunk fallback).

- [ ] Batch 4: next 20 by effective_date desc (~$2, ~12 min) → 78 v2 / 238
- [ ] Batch 5: 20 more → 98 / 238
- [ ] Batch 6: 20 more → 118 / 238
- [ ] Batch 7: 20 more → 138 / 238
- [ ] Batch 8: 20 more → 158 / 238
- [ ] Batch 9: 20 more → 178 / 238
- [ ] Batch 10: ~20 remaining (final tail) → 198 / 238 (the rest may be archived/odd; live with it or final sweep)

**Total budget remaining (~180 thoughts)**: ~$15–25 Sonnet 4.6, ~2–3 hours wall-clock (with breaks between batches).
**Per-batch checklist**: run → check failures → retry → next batch. Don't queue multiple batches blind.

**When to stop**: when search recall feels right OR coverage hits ~90%. Final 5–10% may be archived / pure-test thoughts not worth $2.

---

# P14 prototype — 20-thought reprocess with chunking + multi-vector

**Goal**: take 20 most recent thoughts, in-place reprocess: re-Haiku with fresh ERSTE-split vaultCtx → generate summary + topic chunks → embed each chunk as separate Qdrant point with `parent_id` link. Measure pain-query improvement before/after.

## Architecture decisions (locked)

- **Multi-vector storage**: separate Qdrant points per chunk, `payload.kind = 'chunk'` + `payload.parent_id = <thought_id>`. Thought point stays at its own id with `payload.kind = 'thought'` (or absent). Same `thoughts` collection.
- **Main thought vector**: `embedText(summary)` — not the original truncated text. Cleaner semantics, better recall on long thoughts.
- **Haiku call structure**: ONE mega-prompt per thought returns JSON: `{ metadata, summary, summary_chunks[], content_chunks[] }`. No 4-way fan-out.
- **Scope**: 20 most recent by `created_at` desc. No source filter.
- **Mode**: in-place. No backup. We accept the risk; rollback for Fireflies/Gmail = re-fetch from source.
- **UI**: chunk hits show label inline ("Bizi adattisztítás — *captcha hard gate*"). Click → full thought modal.
- **Pipeline marker**: every modified thought + every new chunk point gets `pipeline_version: 'v2'` for find/cleanup.

## Pre-flight

- [ ] **Fix typo**: `ERSET Market.md` → `ERSTE Market.md` (user confirms or skips)
- [ ] **Define success metric**: lock 7 pain queries before running. Save current top-10 + scores to `tasks/v2-baseline.json`. Suggested queries:
  1. `ERSTE Adform SZA frissítés 150e kaphatsz uj template új feed`
  2. `Bizi captcha hard gate egyeztetés`
  3. `customBrain dev next steps`
  4. `ERSTE Cseperedő számla status`
  5. `Amundi follow-up`
  6. `Telex adaptive AV csomag`
  7. `Pörköláb David Erste programmatic`

## Implementation

### Step 1 — Haiku mega-prompt module (~45min)

- [ ] New file: `server/reprocess-v2.js`
- [ ] Function: `reprocessThought(text, vaultCtx)` → `{ metadata, summary, summary_chunks, content_chunks }`
- [ ] Single Anthropic Haiku call with JSON-mode prompt. Schema:
  ```json
  {
    "metadata": { "title": "...", "type": "...", "projects": ["MOST SPECIFIC sub-project"], "people": [...], "topics": [...], "action_items": [...] },
    "summary": "<chronological, ≤6000 chars, full content compressed>",
    "summary_chunks": [ { "label": "...", "text": "..." } ],
    "content_chunks": [ { "label": "...", "text": "..." } ]
  }
  ```
- [ ] Prompt rules:
  - Project tagging: MUST pick the most specific sub-project (e.g., `ERSTE Számlák`, not `ERSTE`, when SZA/Cseperedő/Online számla/Diák referenced)
  - Aliases injected from vaultCtx (existing pattern)
  - Summary: < 6000 chars, kronológikus, kép tükrözi a tartalom dátumát ne a capture dátumot
  - summary_chunks: 2-5 chunks témánként, mindegyik ≤ 1500 char
  - content_chunks: 2-10 chunks fordulópontonként, mindegyik ≤ 2000 char
  - If thought is short and single-topic: return one chunk in each array
- [ ] Test the prompt manually on 1 thought first (the Varfi email) — confirm output JSON parses + makes sense

### Step 2 — Reprocess script (~30min)

- [ ] New file: `scripts/reprocess-v2-prototype.js`
- [ ] Fetch 20 most recent thoughts from Qdrant (ordered by `created_at` desc)
- [ ] For each:
  1. `getVaultContext()` — full vault with new ERSTE split
  2. `reprocessThought(text, vaultCtx)` → JSON output
  3. `embedText(summary)` → main vector
  4. `embedText(chunk.text)` for each chunk (parallel batch)
  5. Qdrant ops:
     - `updatePoint(thought_id, { vector: main_vec, payload: { ...new_metadata, text: summary + original, has_v2_summary: true, summary_appended_at: now, pipeline_version: 'v2' } })`
     - `upsertPoints(chunk_points)` — N new points with `kind: 'chunk'`, `parent_id`, `chunk_label`, `chunk_text`, `chunk_kind: 'summary'|'content'`, `pipeline_version: 'v2'`
  6. Log: `[ID] N chunks created, project: X→Y, cost: ~$0.02`
- [ ] Total expected cost: ~$0.50

### Step 3 — Search rollup (~30min)

- [ ] Edit `server/routes/search.js`:
  - `searchVector(query_vec, limit=30)` — over-fetch
  - Rollup: for each result, if `payload.kind === 'chunk'` group by `parent_id`, keep best-score chunk + chunk_label
  - Fetch parent thought payload for display
  - Return top-N with optional `matched_chunk_label`
- [ ] Edit `server/qdrant.js`:
  - `getRecent` — filter `must_not: kind=chunk`
  - `getStats` — filter `must_not: kind=chunk` for thought count; add separate chunk count
  - `getConnectionStats` (hygiene) — filter `must_not: kind=chunk`

### Step 4 — UI chunk-label display (~15min)

- [ ] Edit `client/src/components/Search.jsx`:
  - If result has `matched_chunk_label`, show below title: `<span className="chunk-label">↳ {matched_chunk_label}</span>`
  - Tailwind: `text-xs text-txt-sec italic`

### Step 5 — Measure + report (~15min)

- [ ] Re-run the 7 pain queries, save to `tasks/v2-after.json`
- [ ] Diff baseline vs after: rank changes per query, score deltas
- [ ] Brief report: which queries improved, which didn't, which got worse

## Rollback (if prototype is worse)

- [ ] `scripts/rollback-v2.js`:
  - Delete all points where `payload.pipeline_version === 'v2'` AND `kind === 'chunk'`
  - For thoughts where `has_v2_summary === true`: cannot restore original text without backup, BUT Fireflies/Gmail re-fetchable via source_id, manual captures lost
- [ ] **Accept risk**: manual captures in the 20 may be permanently rewritten (text replaced with `summary + original`)

## Open question for user

- [ ] **Typo fix**: rename `ERSET Market.md` → `ERSTE Market.md` on Drive? (Or is "ERSET" intentional?)
- [ ] **Manual captures in the top 20**: if rewrite is a concern, we can SKIP `source === 'manual'` thoughts from the prototype (so original text stays untouched). Default plan = rewrite all 20.

## Definition of done

- 20 thoughts have `pipeline_version: 'v2'` and `has_v2_summary: true`
- Corresponding chunk points exist with `parent_id` matching
- 7 baseline queries re-run, delta report written
- Search UI shows chunk-labels on chunk-matched hits
- No regressions: `getRecent`, `brain_stats`, `find_overconnected`, `export` all work as before (chunk points filtered out)

---

# Hybrid search (P8) — BM25 sparse + dense + RRF — NEW 2026-05-17

**Status**: spec locked, waiting user confirm before implementation. Promoted from DEFERRED based on today's "Boris Cherny" probe (see ROADMAP P8 for evidence + decisions). Replaces the planned P14 A→B→C path.

## Decisions locked (in ROADMAP P8)

- Multilingual stemmer (HU + EN) for BM25 tokenization — **user confirmed 2026-05-17**
- `RETRIEVAL_DOCUMENT` taskType on capture side (baked into the same re-embed pass)
- No cross-encoder reranker for v1
- No query-side taskType change (probed, no effect)
- No `title:` parameter (probed, hurts cross-language)

## Pre-flight (DONE 2026-05-17)

- [x] **Library choice**: custom BM25 + `snowball-stemmers` 0.6.0 (ISC, HU supported). User confirmed + correctly flagged that fastembed is SPLADE/neural-sparse (not lexical BM25) — would defeat the purpose.
- [x] **Qdrant capability**: 1.17.0 confirmed. Migration required, not in-place: current collection uses unnamed dense vector, can't mix with named sparse. Path: create `thoughts_v2` with named vectors `{ dense, bm25 }`, copy all points (596 total: 237 thoughts + 353 chunks + 6 archived) preserving dense vectors as-is + computing sparse, then swap collection name in config.
- [x] **IDF strategy**: use Qdrant native `modifier: "idf"` on the sparse vector — server-side IDF, stays in sync with collection. Client only sends TF.
- [ ] Lock baseline: capture current "Boris Cherny" + 7 pain queries → `tasks/p8-baseline.json`.

## Implementation

### Step 1 — Sparse encoder module (~1hr) — DONE 2026-05-17
- [x] New file: `server/sparse.js` — exports `sparseEncodeDoc(text)` (BM25 TF normalized) and `sparseEncodeQuery(text)` (raw TF, Qdrant applies IDF via `modifier: "idf"`). FNV-1a 32-bit stable term→index hash so indices survive restarts without persisted map.
- [x] Tokenize: lowercase + Unicode normalize + strip non-letter/number + stopword filter + HU stem (fall back to EN if HU unchanged).
- [x] Hungarian morphology verified: Cseperedő / Cseperedőt / Cseperedőnek all collapse to `cseperedő`.
- [x] Boris Cherny case verified: query→Cherny tweet dot=3.24 (2 shared stems), query→DCO transcript dot=0 (0 shared stems). Decisive separation before IDF even applies.
- [x] Installed `snowball-stemmers@0.6.0` in server/package.json.

### Step 2 — Schema migration (~30min) — SCRIPT DONE, RUN PENDING USER OK
- [x] Path decided: collection swap (existing `thoughts` has unnamed dense; Qdrant won't mix unnamed + named).
- [x] Wrote `scripts/migrate-to-hybrid-collection.js` — copies source → dest, preserves dense vectors, computes sparse from text/chunk_text, recreates 7 payload indexes. Supports `--limit N` for smoke testing, `--force` to recreate dest. Never touches source.
- [x] Smoke-tested on Hetzner with `--limit 5 --dest thoughts_v2_smoketest`: 5 points migrated cleanly, Qdrant Query API hybrid RRF returned ranked results, smoke collection then dropped.
- [x] Ran full migration 2026-05-17: all 596 points (243 thoughts + 353 chunks) → `thoughts_v2`. Source `thoughts` left untouched as rollback safety net.
- [x] Validated hybrid query on `thoughts_v2` against "Boris Cherny" + 7 P14 pain queries. Cherny case: hybrid puts target at 1.0000 vs #2 at 0.3333 — 3× lead, definitively fixes the originally reported bug. No regressions detected. Bizi captcha + Amundi also improved.
- [ ] Update `scripts/init-collection.js` to declare the new schema (for fresh installs going forward).

### Step 3 — Capture pipeline (~30min) — DONE 2026-05-17
- [SKIP] `RETRIEVAL_DOCUMENT` taskType: deferred. Reason: would shift cosine ranges across old/new captures and invalidate the calibrated 0.85 conflict-detection threshold. Hybrid alone gets the Boris-Cherny win without this. Can be added in a separate pass with a full dense re-embed.
- [x] Edit `server/routes/capture.js`: import `sparseEncodeDoc`, compute sparse alongside dense in `captureThought` AND `refreshCapture`, pass both to `upsertPoint`.
- [x] Edit `scripts/reprocess-v2-prototype.js`: write `{dense, bm25}` named vectors for both main thought (using summary text) and every chunk.
- [x] Edit `server/qdrant.js::upsertPoint`: signature now `(denseVector, sparseVector, payload, id?)`.

### Step 4 — Search pipeline (~45min) — DONE 2026-05-17
- [x] Edit `server/qdrant.js`: added `hybridSearch(denseVec, sparseVec, limit)` using Query API with RRF prefetch (each leg over-fetches 4× the final limit). `searchVector` kept as dense-only for the conflict-detection path in capture (where lexical match would be wrong signal).
- [x] Edit `server/routes/search.js`: imports `sparseEncodeQuery` + `hybridSearch`, calls hybrid path. Existing `rollupChunkHits` + `applyTimeDecay` unchanged.
- [x] Edit `server/qdrant.js::getAllWithVectors`: unwraps `.dense` so consumers (Obsidian export, brain-health duplicates) stay back-compatible.

### Step 5 — Backfill (~30min wall-time, ~$1–3 dense cost)
- [ ] New file: `scripts/backfill-hybrid.js`.
- [ ] For every point in collection: compute sparse vector locally + re-compute dense with `RETRIEVAL_DOCUMENT` (Gemini), single upsert with both vectors.
- [ ] Same for chunk points.
- [ ] Idempotent: safe to re-run. Print progress every 20 points.

### Step 6 — Verify (~15min)
- [ ] Re-run "Boris Cherny" search → tweet MUST be #1.
- [ ] Re-run 7 pain queries from baseline → save to `tasks/p8-after.json`, write delta report (rank changes + score deltas).
- [ ] Spot-check 3 Hungarian-morphology queries: "Cseperedő" should match "Cseperedőt", "Cseperedőnek"; "számla" should match "számlák", "számlát".

### Step 7 — Deploy + bump (~15min)
- [ ] Deploy to Hetzner (mandatory `pm2 stop all` + `fuser -k 3000/tcp` BEFORE `pm2 start`, per `feedback_hetzner_restart.md`).
- [ ] Bump `0.18.0` → `0.19.0` (minor: new payload field, behavioural change in ranking).
- [ ] CHANGELOG entry: "Hybrid search (BM25 sparse + dense + RRF) with HU+EN stemmer. Replaces pure-dense ranking. RETRIEVAL_DOCUMENT taskType added to capture-side embeddings."

## Definition of done

- "Boris Cherny" returns Cherny tweet at #1 (currently #2 behind irrelevant DCO transcript).
- ≥4 of 7 P14 pain queries improved on top-10 placement vs baseline.
- No regressions in: `get_recent`, `brain_stats`, `find_overconnected`, vault export, agenda.
- New thoughts auto-write both vectors on capture.
- Backfill script left in `scripts/` for future use.

## Open questions for user before starting

1. **BM25 library**: custom + `snowball-stemmers` (recommended, ~50 LOC, MIT) — confirm?
2. **Migration path**: try add-in-place first, fall back to collection swap if Qdrant rejects — confirm?
3. **Order vs v2 chunking batches**: should we (a) finish v2 chunking batches 4–10 first (current ACTIVE work above), then hybrid, OR (b) pause batches and do hybrid now so each new chunk only gets embedded once with both vectors? My recommendation: **(b)** — finishing batches without sparse means a second backfill pass on those same chunks later. Doing hybrid first means all remaining batches write both vectors natively.

---

# P8.1 — RRF k=60 fix (literature default) — NEW 2026-05-17

**Status**: spec locked, waiting user confirm before execution.

**Trigger**: live probe today on `"ERSTE Adform SZA frissítés 150e kaphatsz uj template új feed"`. Dense leg ranks the semantically right email at #1 (Diákszámla Diverzum chunk, cosine 0.7384). BM25 leg ranks it at #14. RRF fusion at current Qdrant default `k=2` drowns the dense signal — the lexically dense `"ERSTE — 2026 kampány setup"` (BM25 #1 + dense #4) wins RRF #1 with score 0.70, while the relevant `"május 1-jei ajánlatváltás"` (dense #2, BM25 not in top-20) lands at RRF #3 with score 0.36.

**Root cause**: Qdrant's default `k=2` in RRF `1/(k + rank)` makes a single BM25 rank-1 hit (=0.5) numerically unbeatable by any dense leg that didn't also win rank-1. The dense rank-2 contribution is only `1/(2+1)=0.333`. One leg's #1 dominates the fusion.

**Why k=60 is not parameter-tweaking**: Cormack/Clarke/Büttcher 2009 (the original RRF paper) specifies k=60 as default. Elastic, Vespa, Weaviate all ship with k=60. Qdrant docs reference k=2 as an *example value*, not a tuned recommendation. Restoring k=60 = restoring the literature default. With k=60 the gap between rank 1 and rank 20 shrinks from `0.5 vs 0.045` (k=2, 11× spread) to `0.0164 vs 0.0125` (k=60, 1.3× spread) — dense rank-1 can no longer be overrun by BM25 rank-1 alone; both legs contribute meaningfully.

## The change

One line in `server/qdrant.js:74`:

```js
// before
query: { fusion: 'rrf' },
// after
query: { rrf: { k: 60 } },
```

(Syntax confirmed from `@qdrant/js-client-rest` generated schema: `RrfQuery = { rrf: { k?: number } }` — the explicit form bypasses the default-null path.)

## Probe + measurement plan

- [x] Wrote `scripts/p8-probe.js` — parameterized `--k <N> --out <file>`. Runs all 8 canonical queries against `thoughts_v2`. For each query records: dense top-10 (cosine), BM25 top-10 (score), hybrid RRF top-10 (fused score).
- [x] Ran on Hetzner: `node scripts/p8-probe.js --k 2 --out tasks/p8-baseline-k2.json`.
- [x] Ran on Hetzner: `node scripts/p8-probe.js --k 60 --out tasks/p8-after-k60.json`.
- [x] Applied one-line change `server/qdrant.js:74` → `query: { rrf: { k: 60 } }` with comment block explaining why.

## Measured outcome (per query, hybrid top-N changes)

| # | Query | Baseline k=2 ranking signal | After k=60 ranking signal | Verdict |
|---|---|---|---|---|
| 1 | Boris Cherny | tweet #1 (1.0) | tweet #1 (0.033) | STABLE — both correct |
| 2 | ERSTE SZA frissítés | "kampány setup" #1, Diákszámla chunk #2, májusi ajánlatváltás #5 | "kampány setup" #1, dual-list winners flood #2-#3, Diákszámla chunk #4, májusi #6 | REGRESSED (1 rank for the dense-rank-2 needle) |
| 3 | Bizi captcha | target #1, related cluster #2-#5 | target #1, similar tail | STABLE |
| 4 | customBrain dev next steps | top 3 stable | top 3 stable | STABLE |
| 5 | ERSTE Cseperedő számla status | Cseperedő chunks at #1-#3, but Diákszámla outside top-5 | Diákszámla chunk **#1**, Cseperedő #2-#3 | IMPROVED |
| 6 | Amundi follow-up | Amundi thought #1 | unrelated ERSTE Teya chunk #1, Amundi #2 | REGRESSED |
| 7 | Telex adaptive AV csomag | top 5 identical | top 5 identical | STABLE |
| 8 | Pörköláb David Erste programmatic | Q1 Longterm tervek thought #2 | Q1 Longterm tervek thought **#1** | IMPROVED |

**Net: 2 improved, 4 stable, 2 regressed.** Below the `≥5/8 win` Definition of Done.

## Decision (user-confirmed): ship anyway

The data does not show k=60 as a per-query win. It does show: (a) no catastrophic regressions, (b) score-range compression that better reflects the underlying dense-cluster tightness (all top dense scores 0.72-0.74 for ERSTE-domain queries — Gemini does not strongly differentiate within this domain, regardless of fusion), (c) most score gaps now in the rank-position-noise band rather than fusion-amplified.

User call (2026-05-17): **ship k=60 as the literature default** (Cormack/Clarke/Büttcher 2009; Elastic, Vespa, Weaviate). Rationale: the structural argument outweighs the noisy per-query measurement on 8 queries against a 596-point collection. k=2 was an unjustified Qdrant default, not a tuned choice. The probe snapshots stay in `tasks/` as audit trail — future ranking debugging starts from the literature default, not Qdrant's example.

The interesting follow-up is **not** the fusion algorithm: it's why dense embeddings cluster so tightly across ERSTE-domain summaries (0.72-0.74 across 20+ docs for a domain-specific query). Plausible causes: (a) Haiku summary text uses near-identical templated language for ERSTE emails, (b) queries are too domain-general to differentiate within. That goes on its own work item, not this fix.

## Deploy

- [x] Commit: qdrant.js change + probe script + both JSON snapshots + version bumps (0.20.0 → 0.20.1, four files) + CHANGELOG + this todo update.
- [x] SSH: `pm2 stop all` + `fuser -k 3000/tcp` (per `feedback_hetzner_restart.md`), git pull, `pm2 start ecosystem.config.cjs`.

## Open questions for user before starting

None — direction is approved (RRF k=60). Plan above is the execution path. Confirm and I run it.

---

# P8.2 — Cross-domain dense discrimination (cone-collapse fix) — NEW 2026-05-17

**Status**: ultraplan-drafted (Plan agent, 2026-05-17), awaiting user confirm on Open Questions before Phase 1 execution. Continues from P8.1 (RRF k=60 shipped in 0.20.1). Targets the residual failure documented in P8.1: hybrid+RRF cannot rescue an in-domain dense-ranked-#2 document when the query keywords also lexically favor a different in-domain document.

## Problem (locked from P8.1 measurement)

For `"ERSTE Adform SZA frissítés 150e kaphatsz uj template új feed"`:
- Dense top-20 packed into cosine **0.7176–0.7384** (0.02 spread)
- The "right" doc (`"május 1-jei ajánlatváltás"`, `65f02ce1-…`) sits at dense **#3** behind two other ERSTE-domain docs with effectively-equal cosine
- BM25 winner is `"ERSTE — 2026 kampány setup"` (`61e7367d-…`, BM25 score 17.39) because the query terms `feed/kampány/template` land in that doc. The "right" doc isn't in BM25 top-20
- RRF at any k cannot save it: neither leg ranks it #1, both legs rank a wrong-but-plausible doc #1, fusion math cannot promote a leg-#3 over two leg-#1's

**This is not a fusion problem.** The dense embedding itself fails to discriminate among ERSTE-domain documents. Either separate the band, or add a second pass that reasons over candidate text.

## Plausible causes (any combination)
1. **Embedding anisotropy** — pretrained embeddings cluster within a narrow cone of the embedding space, especially for in-domain texts (well-documented across LMs, e.g. arxiv 2504.16318)
2. **NOT using Gemini's `task_type` parameter** — currently both queries and documents are embedded with the default `task_type`. Google's canonical pattern is `RETRIEVAL_DOCUMENT` for storage and `RETRIEVAL_QUERY` for queries. This was DEFERRED in P8 because "would shift cosine ranges and invalidate the 0.85 conflict-detection threshold"
3. **Summary text uniformity** — Haiku-generated summaries (`server/reprocess-v2.js`) may use near-identical templated phrasing for each ERSTE email, making embeddings near-identical regardless of content

## Scope decision (2026-05-17, user-confirmed)

**Ship Phase 1 only. Phases 1.5, 2, 3 explicitly deferred — not gated, deferred.**

### Why deferred (the agent-as-reranker insight)

The real consumer of `/search` is NOT a human reading top-3 results in a UI. It's an LLM agent (Claude Desktop, Coworker, or the MCP tool path). The agent already does textual relevance reasoning over the candidates we return — that's exactly what a cross-encoder reranker does, except the agent does it for free as part of its own reasoning step.

This inverts the optimization target:
- **Old framing**: "make `/search` precise — put the right doc at rank #1"
- **New framing**: "make `/search` recall-focused — give the agent enough candidates that the right doc is in the set; the agent decides which one"

Concrete implications:
- Phase 2 (Cohere $1/mo + 200ms latency) and Phase 3 (HyDE +500ms) buy precision the agent doesn't need
- DoD shifts from "top-3" to "top-5" — high-recall threshold matching the agent's working memory
- If a query genuinely doesn't surface the right doc in top-5, the agent can re-query with refined terms — agent-as-query-rewriter is also free

### Phase 1 still ships unconditionally

Phase 1 is **not an optimization** — it's a missing config. Google's own docs specify `RETRIEVAL_DOCUMENT` / `RETRIEVAL_QUERY` task types for `gemini-embedding-001`; we're currently passing nothing, which gets default behavior (likely `SEMANTIC_SIMILARITY` or null-semantics). The P8 spec already locked this in (`tasks/todo.md:141`) and it was skipped at execution time — formally the stack is wrong.

Ship Phase 1 because the stack is wrong, not because it provably fixes the SZA query. It might, it might not — that's not the gate.

### D (anisotropy whitening) — dropped permanently

At 596 points / 3072-dim with single-user load, projecting through a whitening matrix on every query is heavier than the agent-as-reranker fallback. Not on the roadmap.

---

## Phase 1 — `task_type`-aware embeddings + threshold migration

**Goal**: Re-embed all 596 points with `task_type: RETRIEVAL_DOCUMENT`; switch query path to `RETRIEVAL_QUERY`. Quantify the band-spread change. Re-calibrate the 0.85 near-duplicate threshold on the new cosine distribution.

**Budget**: ~3h impl + ~30min wall-clock backfill + ~$1 Gemini backfill cost.

### Files to touch
- `server/embeddings.js` — extend signature to `embedText(text, taskType)`, default `RETRIEVAL_QUERY` (search is hotter than capture; getting the search default right reduces script accidents)
- `server/routes/capture.js:40,119` — pass `RETRIEVAL_DOCUMENT` explicitly in `captureThought` + `refreshCapture`
- `server/routes/search.js:106` — pass `RETRIEVAL_QUERY` explicitly
- `scripts/reprocess-v2-prototype.js:100-102` + `scripts/retry-failed-reprocess.js:71-73` — chunk + summary embeds become `RETRIEVAL_DOCUMENT`
- `scripts/p8-probe.js:54` — wrap query embed; ALSO dump pre-RRF per-leg cosines for band-spread measurement

### New files
- `scripts/backfill-task-types.js` — idempotent backfill via `payload.embed_task_type` marker; concurrency 8; preserves existing sparse `bm25` vector via `with_vector: ['bm25']`
- `scripts/calibrate-conflict-threshold.js` — sample paraphrase pairs + unrelated pairs, output empirical threshold distribution, recommend new default
- `tasks/p8.2-phase1-baseline.json` + `tasks/p8.2-phase1-after.json` — same probe shape + new `band_spread` field

### Threshold re-calibration (the gate everyone misses)
Conflict-check at `capture.js:50` (`m.score > 0.85`) operates on doc-vs-doc cosine in `searchVector`. Under Phase 1 both sides become RETRIEVAL_DOCUMENT — well-defined doc-doc, range may shift modestly. Calibration script confirms; new default documented inline.

### Win condition (Phase 1)
Any of:
- Band-spread on SZA query ≥ 0.05 (~2.4× widening, baseline 0.0208)
- The "right" doc (`65f02ce1-…`) moves to dense rank #1 or #2 on SZA query
- Average band-spread across 5 ERSTE-domain queries widens by ≥ 50%

Partial win (band widens but ranks don't improve) → triggers Phase 1.5. No-op (band doesn't widen) → skip 1.5, go straight to Phase 2.

---

## ~~Phase 1.5 / 2 / 3~~ — DEFERRED (see "Scope decision" above)

Plan agent's original phases 1.5 (summary audit), 2 (Cohere rerank), 3 (HyDE) are documented in git history for reference but **not in this plan**. The agent-as-reranker architecture makes them unjustified for this stack. If we later add a non-LLM consumer of `/search` (e.g. a fully autonomous batch process with no agent in the loop), reopen.

## Definition of Done (Phase 1 only)

1. **Stack correctness** (hard gate): every Gemini embed call across capture, refresh, reprocess, search, and probe carries an explicit `task_type` (`RETRIEVAL_DOCUMENT` for stored, `RETRIEVAL_QUERY` for queries). Verified by grep across the repo.
2. **Backfill complete**: all 596 points in `thoughts_v2` carry `payload.embed_task_type = 'RETRIEVAL_DOCUMENT'`. Verified by Qdrant count filtered on the field.
3. **Threshold re-calibrated**: `server/routes/capture.js:29` conflict-detection default has an empirical basis (output of `scripts/calibrate-conflict-threshold.js` committed to `tasks/p8.2-threshold-calibration.json`), with a one-line comment at the constant pointing at the data file.
4. **Recall-oriented success metric** (soft signal, not a hard gate): on the 8 canonical probe queries, the known-relevant doc is in `/search` **top-5** on ≥6/8 queries. Top-5 not top-3 because the consumer is an LLM agent that filters from a candidate set, not a human reading rank #1.
5. **Band-spread report**: `tasks/p8.2-phase1-after.json` carries the new band-spread metric per query; commit even if the numbers are unchanged (a "task types didn't widen the band" finding is also useful data).
6. No agenda sync regression (current: ~15-20s for 27 events at PARALLEL=5).
7. No new external dependencies. No ongoing $-cost.

If (4) fails, that's not a Phase 1 failure — it's data that the agent-as-reranker is now doing more work per query. Acceptable.

## Critical files reference

- `server/embeddings.js` — 17 LOC, the surface to extend
- `server/routes/search.js:106` — query-side task type
- `server/routes/capture.js:29,40,50,119` — doc-side task type + threshold re-calibration sites
- `scripts/reprocess-v2-prototype.js:100-102` + `scripts/retry-failed-reprocess.js:71-73` — chunk/summary embed sites
- `scripts/p8-probe.js` — extend with band-spread + top-5 metric (don't replace)
- `server/agenda.js` — unchanged in Phase 1 (no rerank means MIN_SCORE gate stays valid)

## Open questions (resolved 2026-05-17)

1. Annotated all 7 evaluable queries; Q8 marked excluded (broken premise). See `tasks/p8.2-annotations.json`.
2. Curl test: `taskType` (camelCase) + `RETRIEVAL_DOCUMENT` / `RETRIEVAL_QUERY` (UPPER_SNAKE) accepted. Bonus finding: default-no-taskType is identical to `RETRIEVAL_QUERY` (verified on long text; the previous "stack is doing SEMANTIC_SIMILARITY" guess was wrong — we've been doing symmetric `RETRIEVAL_QUERY` retrieval all along).
3. Live-rolling chosen. Backfill completed in 23.4s (faster than the 90s estimate) with no failures.

## Outcome (2026-05-17 — Phase 1 shipped as 0.21.0)

**DoD scoring (Phase 1)**:
1. ✅ Stack correctness: all 6 embedText sites carry explicit task_type (grep-verified)
2. ✅ Backfill complete: 596/596 points marked `payload.embed_task_type='RETRIEVAL_DOCUMENT'`
3. ✅ Threshold re-calibrated: 0.85 → 0.97 with inline comment + `tasks/p8.2-threshold-calibration.json` data
4. ⚠ Recall-oriented soft signal: hybrid winrate 4/7 → 4/7 (unchanged), dense 5/7 → 4/7 (one regression). Below the ≥6/8 target. As predicted in the plan, this is NOT a per-query win — the stack-correctness gate (1) is the hard one.
5. ✅ Band-spread report committed; dense band WIDENED on 4/7 queries (Q1 2.3×, Q2 1.8×, Q3 1.2×, Q7 1.2×) confirming the asymmetric pattern does discriminate better within domain — just doesn't translate to right-doc-at-top-5 on this small sample.
6. ✅ No agenda regression measured (out of scope but no code paths touched).
7. ✅ No new external dependencies, no ongoing $-cost.

**Per-query rank deltas** (baseline default-taskType → after RETRIEVAL_QUERY):

| Q | Query | Hybrid baseline | Hybrid after | Dense baseline | Dense after |
|---|---|---|---|---|---|
| 1 | Boris Cherny | HIT@1 | HIT@1 | HIT@1 | HIT@1 |
| 2 | ERSTE SZA frissítés | miss@6 | miss@6 | HIT@3 | HIT@3 |
| 3 | Bizi captcha | HIT@1 | HIT@1 | HIT@1 | HIT@1 |
| 4 | customBrain dev next | HIT@5 | HIT@5 | miss@6 | miss@8 |
| 5 | Cseperedő status | HIT@2 | HIT@2 | HIT@1 | HIT@1 |
| 6 | Amundi follow-up | miss@10 | miss@>10 | HIT@4 | miss@10 |
| 7 | Telex AV | miss@6 | miss@8 | miss | miss |
| 8 | Pörköláb David | excluded | excluded | excluded | excluded |

**Threshold calibration finding** (`tasks/p8.2-threshold-calibration.json`): RETRIEVAL_DOCUMENT space pulls related docs CLOSER together than the pre-task-type default. Median nearest-non-self cosine is now 0.899 (vs old space probably ~0.5-0.7). Top-20 highest-cosine pairs are 17/20 same-topic recurring content (weekly Bizi syncs, monthly ERSTE status emails), only 2 are true duplicates (0.9861). The 0.97 threshold captures the outlier tip; lowering would trigger Haiku contradiction-check on every capture.

## Done

- [x] Curl test verifying taskType accepted
- [x] `server/embeddings.js` extended with optional taskType arg, back-compat preserved
- [x] All 6 embedText call sites updated (search RETRIEVAL_QUERY, capture/refresh/reprocess RETRIEVAL_DOCUMENT)
- [x] `scripts/backfill-task-types.js` — idempotent, run successfully on all 596 points
- [x] `scripts/p8-probe.js` extended with annotation-aware metrics + band-spread
- [x] `tasks/p8.2-annotations.json` — 7 evaluable + 1 excluded canonical query
- [x] `scripts/calibrate-conflict-threshold.js` + output to `tasks/p8.2-threshold-calibration.json`
- [x] `server/routes/capture.js` conflict threshold default raised 0.85 → 0.97 with inline calibration comment
- [x] `tasks/p8.2-phase1-baseline.json` + `tasks/p8.2-phase1-after.json` committed for audit
- [x] CHANGELOG entry for 0.21.0
- [x] Version bumped 0.20.1 → 0.21.0 across 4 manifests
- [ ] Deploy to Hetzner (pm2 stop + fuser -k 3000/tcp + git pull + pm2 start)

---

# Export observability — last-run state + UI live progress — NEW 2026-05-18

**Status**: plan drafted, awaiting user confirm.

## Goal

Surface the export pipeline (which runs hourly via `cron/export.js` and on-demand from `POST /export`) on the Export UI page:
- "Legutóbbi export: <timestamp>" + collapsible log, persistent across page reloads
- Live tempo of the log lines updating in the UI while an export is running, regardless of whether it was triggered from the UI button OR from cron — UI parity with the existing SSE behavior

## Architectural decision (locked)

**Storage**: single JSON file `state/export-last-run.json` — same pattern as `state/agenda-cache.json` and `state/gmail-watermark.json`. No new DB, no schema, no migrations. Always overwritten (only "most recent" matters per user spec).

**Update mechanism**: SSE stays as the existing UI-triggered live channel (no behavior change for the button path). The state file gets written **in parallel** by a thin wrapper around `rebuildVault`, throttled to 250ms flushes so a 45s export with 1000+ log lines doesn't bash the disk. UI polls `/export/last` every 1.5s while `status === 'running'`, stops polling otherwise — this surfaces cron-triggered runs without bidirectional comms.

**No SSE removal**: the existing `POST /export` SSE stream keeps working as-is; the wrapper just calls the existing onLog AND appends to the state file. Adding-not-replacing keeps the change small (CLAUDE.md: "Every change as small as possible").

## State file shape

```json
{
  "id": "<uuid>",
  "started_at": "2026-05-18T10:00:00Z",
  "ended_at": null,                    // null while running
  "status": "running",                 // running | completed | failed
  "triggered_by": "cron",              // cron | ui (mcp deferred — no rebuild trigger in MCP yet)
  "log_lines": ["[0.0s] ...", "[0.1s] ..."],
  "result": null,                      // rebuildVault return when status === completed
  "error": null                        // error.message when status === failed
}
```

## Files to touch

- `server/routes/export.js`:
  - Add `EXPORT_STATE_PATH` (resolves to `state/export-last-run.json` relative to `server/`).
  - Add `runExportWithStatus(triggeredBy, onLogPassthrough)` wrapper:
    - Generates uuid, writes initial state (`status: 'running'`, `ended_at: null`).
    - Calls existing `rebuildVault(onLog)` with a multi-target onLog: (a) calls `onLogPassthrough` (SSE), (b) appends to in-memory log_lines, (c) throttled flush to state file (250ms).
    - On success: status=`completed`, result, ended_at=now, final flush.
    - On error: status=`failed`, error.message, ended_at=now, final flush.
  - Atomic write: write `.tmp` then rename, so partial reads never see a half-written JSON.
  - Modify `POST /export` to call `runExportWithStatus('ui', sseOnLog)` instead of `rebuildVault(sseOnLog)`.
  - Add `GET /export/last`: reads state file, returns JSON, 404 if absent.
- `cron/export.js`: replace `await rebuildVault(onLog)` with `await runExportWithStatus('cron', onLog)`. stdout still gets the lines via `onLog = console.log`.
- `client/src/api.js`: add `getLastExport()` → GET `/export/last`, returns parsed JSON or null on 404.
- `client/src/components/Export.jsx`:
  - On mount: `getLastExport()`, if exists show "Legutóbbi export: <formatDate(started_at)> · <status badge> · triggered by <triggered_by>", render collapsible log.
  - If `status === 'running'`: setInterval(1500) polling `getLastExport`, merge new log lines into displayed state, clear interval when status changes.
  - "Export to Drive" button: unchanged — still uses `exportToObsidian` (SSE). After SSE completes, refresh from `/export/last` so the persistent view reflects the run.
  - Add status badge component using existing color tokens (green for completed, blue for running, red for failed).
- `server/index.js`: NO change. SPA wildcard guard already lists `/export` at line 28-34, so `GET /export/last` falls through to the router correctly.

## SPA wildcard already covers `/export/*` — verified line 31:
```js
req.path.startsWith('/export') ||
```

## Risks
- **State file write contention** if cron tick fires while UI export is running: both wrappers write the same file. Single-user, hourly cron + intentional UI click — collision rate is near zero. If it happens, last-write-wins; the actual exports both complete (they don't share runtime state apart from this log). Acceptable.
- **State file growth**: a 45s export emits ~30-50 log lines (one per phase + one per uploaded file at default batch). At 596 thoughts the log can hit ~600 lines. JSON file size ~30-50KB. Not a concern.
- **Atomic-write rename**: on the same FS this is atomic on POSIX (Hetzner ext4) — no partial-read risk.
- **Polling cost**: 1.5s polling for the ~5min/day a cron export runs = ~200 polls/day from one open browser tab. Trivial.
- **`/export/last` returns 404 before first run**: UI gracefully shows "No exports yet" empty state.

## Definition of Done

1. `state/export-last-run.json` exists and updates during BOTH a cron-triggered AND a UI-triggered run.
2. UI Export page shows last run on load (date, status, collapsed log).
3. During a running export, UI log updates within 1.5s of new line append (test by triggering an export from another tab/CLI and watching the page).
4. UI-triggered button still works exactly as before (SSE-driven instant updates).
5. No regression in cron export behavior (stdout still gets log lines).
6. Version bumped 0.21.0 → 0.22.0 (minor: new HTTP route + new state field + UI behavior change).

## Open questions

1. **mcp trigger source** — the original spec note mentioned `triggered_by: 'mcp'` but the MCP tool surface has `rebuild_obsidian_vault` which uses `rebuildVault` directly. Want me to also wrap the MCP tool's path so MCP-triggered runs show up in UI, or skip until needed? Skipping = simpler now, easy to add later.
2. **Show running export inline OR replace the existing "log terminal" component on click?** Current Export.jsx renders the SSE log only after the user clicks the button. New design needs to ALSO render the cron-triggered log when no button has been clicked. Simplest: one log component, source is the state file (filled at mount via `getLastExport`, updated via polling). When user clicks button, SSE updates the SAME log component live (alongside polling, which becomes redundant but harmless). Confirm this UI shape vs. keeping two separate log areas (one for "last run" + one for "this manual run")?
3. **Polling interval** — 1.5s is the proposed default. Lower (500ms) feels snappier but trebles request rate. Higher (3s) saves requests but feels laggy on short runs. Stick with 1.5s?

---

# MCP token management — UI-managed named tokens, env stays master — NEW 2026-05-18

**Status**: plan drafted, awaiting user confirm. Scope-narrowed Tier-2 of the auth-system pushback (single-user, MCP-only, env stays master).

## Goal

UI-managed list of named MCP bearer tokens, so Claude Desktop / MCP connector tests / temporary integrations each get their own token. Revoke any one without touching the others. CAPTURE_SECRET env var stays as the master-only secret used by the browser UI itself — never leaves the operator's machine. MCP endpoint accepts master OR any named-list token.

## Architectural decisions (locked)

**Storage**: new file `state/mcp-tokens.json`. List-shape, not KV-shape — incompatible with the existing schema-driven `state/settings.json`. Atomic write (`.tmp` + rename).

```json
{
  "tokens": [
    {
      "id": "<uuid>",
      "name": "Claude Desktop",
      "token": "<64-char hex from crypto.randomBytes(32)>",
      "created_at": "2026-05-18T...",
      "last_used_at": "2026-05-18T..." | null,
      "expires_at": null | "2026-06-18T..."
    }
  ]
}
```

**Auth split**:
- All non-MCP routes: master only (CAPTURE_SECRET env), unchanged behavior.
- `/mcp/http`: master OR any valid (non-expired) named token.
- Single smart middleware in `server/index.js` that reads `req.path` and accepts either form for `/mcp/http`, only master for everything else.
- Token can be passed in `Authorization: Bearer <token>` OR `?token=<token>` query — same as current pattern (Claude Desktop config uses query form).

**Token format**: `crypto.randomBytes(32).toString('hex')` = 64 hex chars. Easy to copy, ~256 bits of entropy.

**Last-used tracking**: throttled. On successful validation, update `last_used_at` if `now - prev > 5 min`. Else skip the disk write. Keeps disk thrash off the hot path.

**Token expiry**: optional. `expires_at` null = never; ISO string = hard cutoff. Expired tokens fail auth with 401. Don't auto-delete (let user see + manually revoke for audit).

**Token display**: at creation, full token shown ONCE so user can copy. Subsequent reads (UI list) return masked form (e.g. `…last-4-chars`). Tokens stored in cleartext in the JSON file (HMAC/hash would prevent the UI from displaying anything useful for testing — single-user, file is readable only by the same user that runs node, acceptable).

## Files to touch

### Backend
- `server/index.js:50-58` — replace global auth middleware with a path-aware one: master-only for non-MCP routes, master-or-named-token for `/mcp/http`. Order: keep the same; webhooks above, auth below, routers below auth.
- `server/index.js:28-38` — add `/mcp-tokens` to the SPA wildcard guard so `GET/POST/DELETE /mcp-tokens` falls through to the router.
- New file `server/mcp-token-store.js`:
  - `loadTokens()` → returns `{ tokens: [...] }`, creates empty file on first call
  - `validateToken(token)` → returns matching token record or null (checks expiry); on match updates `last_used_at` throttled
  - `createToken(name, expiresInDays?)` → uuid + random hex + ISO timestamps, returns full record
  - `revokeToken(id)` → boolean
  - `listTokensMasked()` → public list with token masked to last-4-chars
  - In-memory cache + atomic flush; safe to call from concurrent requests (single Node process, no real concurrency issue)
- New file `server/routes/mcp-tokens.js`:
  - `GET /mcp-tokens` → `listTokensMasked()`
  - `POST /mcp-tokens` body `{ name, expires_in_days? }` → returns the FULL token + record (only call where full token returned)
  - `DELETE /mcp-tokens/:id`
  - All three require master auth (which is already the case — the route mounts under the master-only path of the middleware)
- `server/index.js` — import + mount the new router

### Frontend
- `client/src/api.js` — add `listMcpTokens()`, `createMcpToken({ name, expiresInDays })`, `revokeMcpToken(id)`
- `client/src/components/Settings.jsx` — render a new section ABOVE the schema-driven fields with the MCP token list UI:
  - Table: name · last used · expires · masked-token · `[Copy]` `[Revoke]`
  - `[+ Add MCP token]` button → modal: name (required) + optional expiry days → POST → display full token ONCE in a copy-to-clipboard banner with a clear "this won't be shown again" warning
  - Match existing global semantic class patterns (`toolbar`, `toolbar-btn`, `form-field`) per `CLAUDE.md` design-reuse-over-invention rule

### Docs
- `CHANGELOG.md` — 0.21.0 → 0.22.0 entry (or 0.23.0 if it lands after export observability)
- `tasks/todo.md` — Done section per the workflow

## Risks & edge cases

- **Bootstrap chicken-egg**: empty token list on first install = fine, all MCP traffic uses master CAPTURE_SECRET until user creates a named token. No lockout possible.
- **Master compromise**: if CAPTURE_SECRET leaks, attacker can manage tokens (create/revoke) AND directly call MCP with master. Acceptable — that's the master's role.
- **Named token leak**: attacker can call MCP only. Rotate via UI revoke. Compromise blast radius limited to MCP surface.
- **State file write race**: single-user, very low traffic — last-write-wins on the rare collision is fine.
- **Token cleartext at rest**: filesystem-only readable by the node user; same risk profile as `service-account.json` or `.env`. Acceptable for single-user. NOT acceptable if this becomes multi-user.
- **`Mcp-Session-Id` header**: per `server/mcp.js:202` the MCP transport uses this header for session continuity. The auth check happens BEFORE the transport sees the request, so token-vs-session is orthogonal. No interaction issue.
- **Token-via-query in URL**: same exposure pattern as current `?token=<CAPTURE_SECRET>` (URLs can leak to logs/history). User already accepts this for master; named tokens inherit the same trade-off. Document this in the UI ("don't paste tokens into pastebins / git").

## Definition of Done

1. Master CAPTURE_SECRET still works for ALL endpoints (including MCP) — backwards compatible.
2. UI Settings page shows MCP token list; can add named token; full token displayed at creation only.
3. Generated token successfully authenticates `/mcp/http` (verified by curl).
4. Revoking a token causes subsequent calls with that token to 401.
5. Non-MCP endpoints (`/search`, `/capture`, etc.) ONLY accept master — verified that a named MCP token returns 401 on `/search`.
6. `last_used_at` updates on use (throttled to 5min granularity).
7. Expired tokens (where `expires_at` < now) fail auth.
8. Version bumped (minor — new HTTP routes + new auth flow + new UI section).

## Decisions locked (2026-05-18)

1. **Strict separation**: master CAPTURE_SECRET works ONLY for non-MCP routes (UI). MCP routes accept ONLY named tokens from the list — no master fallback. Bootstrap: with zero tokens, MCP is locked until UI generates one (UI itself uses CAPTURE_SECRET, so no lockout possible).
2. **No token expiry** — drop the `expires_at` field entirely. Lifecycle is purely create/revoke.
3. **Reveal anytime** — UI list shows masked tokens by default, with per-row Show/Hide toggle (same pattern as `Settings.jsx::SettingsField` reveal-toggle for env secrets at line 38-51). NOT creation-only.
4. **Storage**: flat `state/mcp-tokens.json`, follows existing pattern (`state/agenda-cache.json`, `state/gmail-watermark.json`, `state/settings.json`). No nested `state/auth/` subfolder.

## Updated shape (no expires_at)

```json
{
  "tokens": [
    {
      "id": "<uuid>",
      "name": "Claude Desktop",
      "token": "<64-char hex>",
      "created_at": "2026-05-18T...",
      "last_used_at": "2026-05-18T..." | null
    }
  ]
}
```

## Updated auth split

- All non-MCP routes: master CAPTURE_SECRET only (unchanged).
- `/mcp/http`: ONLY tokens from `state/mcp-tokens.json`. CAPTURE_SECRET fails on MCP.
- Single path-aware middleware in `server/index.js`.

## Updated frontend behavior

- Per-row `[Show]` / `[Hide]` toggle on the token list (reveal-anytime, like env-secret reveal).
- Creation flow: name → POST → display full token in an inline highlighted row (no separate "shown only once" warning needed since reveal-anytime).
