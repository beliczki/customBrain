# Second Brain Upgrade — PDF principles × repo steals × existing stack

Source: "Second Brain - Principles and Starter Prompts.pdf" (RoboNuggets). User chose: **full 5-principle program**, all three edge types (semantic + metadata + explicit), graph must beat Obsidian at: explore-around-a-note, big-picture map, orphan/hub spotting. Build on a new worktree. Target version: 0.33.0 (minor).

## Research verdicts (Principles 1+2 — DONE this session)

| Repo | Steal | Skip |
|---|---|---|
| **Karpathy wiki** | synthesis write-back (answers become thoughts); contradiction/stale-claim lint | index-first-no-embeddings retrieval; per-ingest page fan-out |
| **qmd (Tobi)** | typed sub-queries in one MCP call; `get_thought` line-range slices for long transcripts | local GGUF models; cross-encoder rerank (banned by feedback_agent_as_reranker) |
| **gbrain (Garry Tan)** | categorical `evidence` tags on every search hit; read-only contradiction probe w/ `temporal_supersession` verdict; doctor severity levels | git-markdown source of truth; 20-cron enrichment stack; `think` synthesis verb |
| **Graphify** | two-level community meta-graph; deterministic hub-based cluster labels; edge provenance styling (solid/dashed/arrow); physics-freeze recipe | tree-sitter/whisper extraction; LLM edge extraction; vis-network itself |

Cross-repo convergence: **categorical provenance on every edge and every hit** — the thing that makes a graph explainable instead of hairball, and cheap for us because every signal already exists at creation time.

Best-practice sweep: at ~300 (→3k) nodes, graphology + sigma.js (WebGL) with Louvain communities + ForceAtlas2-then-freeze is the consensus stack; UMAP/HDBSCAN semantic-map is the alternative at 10k+ (not needed yet).

## Phase A — Graph tab (the headline: beat Obsidian)

New `Graph` tab in the React UI. **This is where the "more useful than Obsidian" claim is won**: Obsidian's graph only knows explicit links; ours gets three edge types with distinct rendering.

- [ ] **Server: `GET /graph`** — new `server/routes/graph.js` (router + named `buildGraph()` per one-backend-two-interfaces). Nodes = all active thoughts (projected payload: id, title, type, source, people/projects/topics, created_at, chunk_count). Edges:
  - `metadata` (solid): shared people/projects/topics — reuse `getConnectionStats()` reverse-index maps; weight = field-weighted co-occurrence count
  - `semantic` (dashed): cosine kNN, k=3, min 0.75 — reuse `getAllWithVectors()` + `cosine()` pattern from `export.js` (same tunables as Related-thoughts)
  - `supersedes` (arrow): from `supersedes` payload field
  - Louvain communities computed server-side (`graphology` + `graphology-communities-louvain` in the route), cluster label = highest-degree member's title (deterministic, tie-break by id — Graphify recipe). Response = `{ nodes, edges, communities }` JSON.
- [ ] Mount route in `server/index.js` + **add `/graph` to the SPA wildcard guard list** (line ~45–56)
- [ ] **Client: `Graph.jsx`** — deps: `graphology`, `sigma` (client/package.json). ForceAtlas2 layout N iterations then physics OFF; `hideEdgesOnDrag`.
  - Level 0: community meta-graph (one node per cluster, sized by member count, edges = cross-cluster counts) — the "what is my brain about" map
  - Click cluster → level 1: members, full edge detail
  - Click node → existing `ThoughtModal`; neighbor list for hop-by-hop exploration
  - Edge-type legend with per-type toggles + cosine threshold slider
  - Orphan/hub side panel: degree-0 list + top hub_scores (reuse `findOverconnected` data)
  - Semantic classes per global rules (`graph-canvas`, `graph-legend`, `graph-cluster-panel`, …); match sharp-corner beliczki.hu aesthetic, CSS-var tokens
- [ ] Tab wiring: 3 edits in `App.jsx` (import, tabs array, conditional) + `api.js` function

## Phase B — Retrieval upgrades (qmd + gbrain steals)

- [ ] **`evidence` tags** on `search_brain` / `/search` hits: categorical `exact_title | alias_hit | high_dense | bm25_exact | weak_semantic` — derived from which leg won (already known in `rollupChunkHits` / `explainLegs`), zero new computation. Surface in Search UI as a micro-badge (matches P18 transparency work).
- [ ] **`get_thought` slices**: extend thought-fetch MCP tool with `from_line`/`max_lines` so the agent pulls slices of long Fireflies transcripts instead of full payloads (qmd `get`).
- [ ] **Typed sub-queries**: `search_brain` accepts optional `queries: [{type: 'lex'|'vec', q}]`, server-side RRF across legs — agent composes strategy (fits agent-as-reranker; no HyDE, no rewrite).
- [ ] Register everything in BOTH `mcp.js` and `mcp-stdio.js`.

## Phase C — Principles 3+4: ladder + index (honest framing)

The PDF's ladder targets markdown brains; our hybrid pipeline IS the ladder (keywords → sparse.js tokenize; score-without-opening → BM25/dense legs; open-one → getById; section → chunk hits; pointer → supersedes hop). The one-command store already exists: `captureThought` writes point + index in one step. Deliverables that ADD value:

- [ ] **`index.md` in the Obsidian export** — one line per thought (title, wikilink, one-sentence, type, date). Revives killed P7e with a new rationale: P7e died as a *human-facing* catalogue ("Obsidian Graph + Drive lista már eléri"); this one is the *agent-facing* routing map the PDF's principle 4 describes, generated for free inside the existing full-vault rebuild — zero drift possible since the export is atomic.
- [ ] **Routing note in CLAUDE.md**: index-first guidance for sessions reading the vault (check index → open files second; use `search_brain` for semantic).
- [ ] **`quick_lookup` deterministic path**: zero-model answers for metadata questions (counts, who/when, by-person/project/topic lists) — plain filtered scrolls, exposed as one MCP tool. The genuinely deterministic rung our stack lacks.

## Phase D — Self-cleaning (gbrain contradiction probe + Karpathy lint)

- [ ] **`scripts/contradiction-probe.js`** — read-only: sample hybrid-search top-K pairs, date pre-filter (skip pairs >30d apart? inverse — flag same-topic-different-date as candidates), Haiku judge with 6-verdict enum incl. `temporal_supersession`, content-hash cache, severity rubric, outputs paste-ready `update_thought`/supersede commands. NEVER auto-applies. Wilson-CI gate decides whether deeper lint tooling is ever justified.
- [ ] **`brain_health_check` severity levels** — error vs info so cosmetic noise can't bury real issues; history JSONL for deltas (tasks/ snapshot convention).
- [ ] **Synthesis write-back**: `capture_thought` gains `type: synthesis` convention + doc note — good search-session answers get filed back (Karpathy's compounding). No new tool needed; convention + prompt guidance.

## Phase E — Principle 5: prove it

- [ ] Extend `scripts/p8-probe.js` harness: same real questions through (a) fresh default session path, (b) brain path — compare tokens + wall time + correctness against `tasks/p8.2-annotations.json` gold set; results table snapshot to `tasks/` (audit-trail convention per feedback_literature_defaults).
- [ ] Graph perf self-check (/goal style): load Graph tab against production data, verify no lag on drag/zoom/level-switch at current node count; tune (edge caps, freeze iterations) until smooth.

## Constraints & process

- Build on a **new worktree**; every phase independently shippable, A first.
- No local .env — server-route testing via Hetzner deploy (mandatory kill: `pm2 stop all` + `fuser -k 3000/tcp` before start). Client + pure functions verifiable locally.
- Bump 4 manifests + CHANGELOG at ship: `0.32.0 → 0.33.0` (minor — new tab, new routes, new MCP tools).
- ROADMAP.md: stub the phases; note P7e revival rationale.

## Review

_(fill at completion)_
