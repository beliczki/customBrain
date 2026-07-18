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

## What this batch proves for sequencing

The single highest-value build is **not** better retrieval — it's closing the
Teams signal gap and giving projects a reviewed current-state. That matches the
upgrade plan's Phase 4/5 ordering. Retrieval tuning stays deferred; there is no
retrieval fix for an un-captured source.
