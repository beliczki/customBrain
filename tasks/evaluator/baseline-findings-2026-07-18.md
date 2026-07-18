# Baseline evaluator findings — 2026-07-18

First graded batch (3 questions, Robert). The value isn't the score — it's that
every failure traces to one of four root causes, and they rank cleanly by leverage.

## Failure clusters (ranked by leverage)

### 1. Missing signal — MS Teams is not ingested  ← biggest lever
The load-bearing current state of the flagship project (Bizi/Dasszisztens:
C-dialog progress, monthly-maintenance status, reports) AND the decisive fact
that the BTS MVP offer was **declined** both live in core-team **MS Teams chats**
the brain has never seen. This is not a retrieval or interpretation failure — the
signal is simply absent. No amount of better search fixes a source that isn't
captured. Every "current status" question about Teams-coordinated work will be
wrong or blind until this is solved.

### 2. No project auto-update / no status fields
The self-model is stale and drifts from Drive reality:
- Attraction Productions reported as ongoing; actually breaking down (invoicing),
  should be flagged to close ASAP. It is not even a Drive project file.
- Nexus absent from the identity answer — but `Nexus.md` DOES exist in Drive
  (created ~2026-07-13). Gap is the brain's identity model, not Drive.
- Bizi's canonical name/URL/status not surfaced.
Root fix: the weekend project-steward pass + `status`/`reviewed_at` fields on
project files (plan Phase 2 + 4).

### 3. Haiku entity confusion at capture
Haiku folds "Hello Szülő"/BTS content under project `Bizi`, even though a
separate `Évnyito BTS App.md` project exists in Drive. So BTS has a home; capture
mis-files into Bizi anyway. Effects: BTS decline/history is invisible under its
own project, and Bizi status is polluted with BTS content.
Root fix: tighter project-matching at capture + wiki-steward review; existing
mis-tagged thoughts are a retag/reprocess backfill candidate.

### 4. Missing infrastructure context
MessagingMatrix.ai is core infrastructure to the ERSTE engagement, but the brain
treats it as a standalone "product" and omits it from ERSTE answers. Root fix:
canonical project/dossier curation linking MM ↔ ERSTE.

## Decision needed — how to ingest Teams (do NOT default to puppeteer)

Teams ingestion is a new capture source, so the honest question first: what's the
cheapest thing that gets 80%?
- **Puppeteer / web-Teams scraping** (Robert's first instinct): worst option —
  MFA/auth fragility, ToS risk, breaks on every UI change. Not recommended as v1.
- **Microsoft Graph API** (`/chats/{id}/messages`): the robust official path, but
  needs an Azure AD app + admin consent on the tenant. Telekom/ERSTE tenants are
  client-controlled → consent likely ungrantable. Viable only for Robert's own
  Grafia tenant chats.
- **Manual capture of decision-bearing threads** (cheapest, zero build): after a
  Teams decision, paste the thread into the brain via the extension/UI as a manual
  capture. Honest v1; earns an automated path only once this proves the value and
  the volume hurts.

Recommendation: start with manual capture of the few decision-bearing threads;
evaluate Graph API only for tenants where consent is obtainable; skip puppeteer.

## Proposed project-file updates (GATED — need Robert's OK before any Drive write)

- `Bizi.md`: it already documents `dasszisztens.telekom.hu` + AI Mesh. Add a
  managed weekly-state block (draft exists) noting running/monthly-maintained +
  C-dialog-in-progress + the Teams-visibility caveat.
- `Évnyito BTS App.md`: confirm this IS "BTS / Hello Szülő"; add status = MVP
  offer declined (source: Teams, uncaptured).
- Attraction Productions: no Drive project exists. Decide: create one marked
  `status: closing` for the record, or leave out entirely.
- `Nexus.md`: exists; fold Nexus into the canonical self/identity dossier when
  Phase 3 runs.
- Add `status` + `reviewed_at` to active project files (Phase 2, batch).

## Batch 2 (Q4–Q6) — new failure modes

- **Belief under-retrieval / wrong abstention (Q6).** The belief IS in the brain
  (scattered across Robert's reflections/ideas + engaged philosophy), but a single
  generic query surfaced only YouTube references and the system abstained. Two fixes:
  (a) belief questions need multi-angle retrieval over his own reflection-type
  thoughts; (b) reflections must be separated from saved references so belief
  synthesis draws from the former. Robert's belief is now recorded as gold
  (AI sovereignty/BYOAI; over-the-loop; bring work to agents; content is king;
  record everything or slop; abundance + near-term more-work optimism; anti-doomer).
  Candidate action: capture a consolidated belief reflection (Robert-owned).

- **Role/seniority confusion + People-variant duplication (Q5).** Porkoláb was
  reported as day-to-day; he is ERSTE Head of Digital Marketing Solutions (senior);
  day-to-day = Várfi + Brunner. Porkoláb/Várfi/Brunner each have multiple duplicate
  People files — Phase 2 consolidation.

- **MM6 strategic pivot entirely uncaptured (Q4).** The brain missed that MM6 is
  ERSTE-only and has pivoted to an MCP + agent model (agent-led execution, human
  quality/taste, Várfi MCP demo next, Adform monitoring, agent-built skills),
  and that Humanody/Cafe collabs stalled. Reinforces cluster 1/2: uncaptured work
  (incl. Robert's own unpushed Codex SPD/HTML work) + no project auto-update.

## Cluster 5 — retrieval is below grade (CORRECTION to an earlier claim)

An earlier draft of this doc claimed "the highest-value build is NOT better
retrieval." That was wrong (Robert, 2026-07-18). Retrieval is independently
broken, in two ways, both verified 2026-07-18:

- **Canonical dossiers are not in the search index at all.** People/Projects/Topics
  `.md` files are read only at capture time (Haiku metadata context); they are
  never upserted to Qdrant. Searching for text unique to a dossier returns nothing
  from that dossier: `Diffusion Simulator`/`Insight Hub` (Nexus.md),
  `believeinyourself` (ERSTE.md), `Gossip/Wisdom KB layers` (Bizi.md) all return
  only thoughts, never the file. So the richest curated truth Robert maintains by
  hand is unreachable by `search_brain`. This is why Q3 answered from a stale
  April synthesis thought instead of the correct, current ERSTE.md.
- **Ranking quality is poor.** Results are dominated by `weak_semantic`; saved
  references rank alongside first-person reflections (Q6); the wrong source
  (stale thought) outranks canonical content.

Plus ingest QUALITY (not just holes): Haiku mislabels at capture — folds BTS into
Bizi, mis-assigns roles/seniority, over-tags. So the pipeline is weak at three
independent layers, not one.

## What this batch proves for sequencing

There is no single lever — three layers are independently broken and all three
need work:
1. **Capture** — holes (Teams, Robert's unpushed Codex work) AND Haiku ingest
   quality (mislabeling, over-tagging, wrong entities).
2. **Retrieval** — index the canonical dossiers so curated truth can surface at
   all; fix ranking so references don't outrank reflections and stale thoughts
   don't outrank canonical files.
3. **Truth model** — project status/current-state, reflection-vs-reference
   separation.
Retrieval is NOT deferred. Indexing the canonical dossiers is likely the single
cheapest retrieval win (the content already exists and is curated; it just isn't
searchable).
