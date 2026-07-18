# Professional life representation — simplified upgrade plan

Date: 2026-07-18  
Status: evidence-based planning document; no application changes are included

## The honest diagnosis

The current brain is not failing mainly because it needs a better model. It is failing because it treats several different things as if they were the same kind of truth:

- an email that was sent,
- a meeting that happened,
- a calendar item that was merely planned,
- an idea Robert considered,
- a decision that is still current,
- a project description last edited months ago,
- and a reference Robert saved but may not agree with.

All of these become similarly shaped “thoughts.” Search can retrieve them, but nothing reliably tells the answering model what is current, what is historical, what Robert believes, what is only outside inspiration, and what has been superseded. The result is a plausible story that can be false.

## What the source audit shows

- The Brain MCP reported **415 thoughts**: 153 meetings, 118 references, 75 notes, 20 conversations, 19 tasks, 16 ideas, 13 reflections, and only 1 proposal.
- Known source counts include **117 Gmail**, **113 Fireflies**, **81 manual**, and **66 YouTube** thoughts. Raw work records and outside references outweigh deliberate self-modeling.
- The health check found **322 duplicate-candidate pairs**, **50 over-tagged thoughts**, **227 thoughts longer than 6,000 characters without the expected summary flag**, **50 person names unknown to the canonical registry**, 22 orphan People files, and 2 orphan Project files.
- Topic metadata is free-form: there is no canonical Topic registry or definition layer preventing synonyms, project names, clients, and one-off phrases from fragmenting the vocabulary.
- The Drive vault contains **252 People files**, of which **217 are under 100 bytes**. Robert currently appears in several separate stub files in addition to `Me.md`.
- The vault contains **27 Project files**. Twenty-three were last modified by 2026-05-20; only four were modified after that. Modification time is not proof of staleness, but active project state is not being deliberately reviewed.
- `People/Me.md` is a useful seed, but it is a generic description of practical conversational AI. It does not represent Robert’s actual portfolio, professional history, operating principles, voice modes, boundaries, commercial constraints, or current direction.
- The connected calendar returned **1,066 events from 2026-01-01 through 2026-07-18**, including 231 recurring events. It mixes client meetings, tasks, habits, family events, purchases, and reminders. A calendar event proves scheduled intent, not task completion or professional importance.
- Recent sent-mail evidence shows at least two distinct voice modes: terse operational coordination and expansive strategic/creative reasoning. A single “Robert style” prompt would caricature both.
- Sampled mail also contains credentials and authentication material. Email intake therefore needs secret redaction before anything else; “complete memory” is not worth turning the brain into a credential store.

## The target in one sentence

Build a truth-preserving professional memory that keeps raw evidence separate from Robert’s versioned long-term model, current working state, contextual voice, and human-graded evaluation questions.

## The seven moves

### 1. Establish the evaluator before changing the brain

Use Robert’s evolving questions as the benchmark. Run only 2–3 questions per review batch, exactly as proposed. Save the answer, evidence used, “as of” date, uncertainty, and Robert’s judgment.

Do not start with automated grading or a learning/ranking loop. The honest v1 is manual curation using the existing `scripts/prove-brain.js` harness as the technical base.

### 2. Split memory into four layers

1. **Evidence log** — immutable emails, meetings, calendar events, manual notes, and external references.
2. **Long-term professional model** — identity, roles, capabilities, principles, recurring methods, relationship history, and stable constraints.
3. **Short-term working state** — active projects, current decisions, commitments, risks, next actions, and recent changes.
4. **Response models** — contextual voice examples and project-management patterns, selected by audience and task.

An answer may use all four, but must never silently turn evidence into a current belief.

### 3. Reconstruct the canonical professional core

Curate, with Robert’s approval:

- one canonical self dossier,
- one canonical project dossier per real active project,
- one canonical record per important collaborator/client relationship,
- a professional operating manual,
- a contextual voice guide with real examples,
- and a current-state dashboard with explicit review dates.

Every current claim needs evidence, a validity period or review date, and a way to say “unknown.”

### 4. Change the ingestion contract

- Gmail remains the source of record for conversations; only decisions, commitments, relationship changes, and strong voice exemplars are promoted into durable memory.
- Calendar remains evidence of intent and allocation; it does not prove completion.
- Fireflies remains meeting evidence; decisions and commitments are promoted separately.
- YouTube and other references remain outside influence, not Robert’s belief, unless Robert adds a reflection.
- Manual thoughts can be beliefs or instructions, but still require dates and status.
- Secrets, passwords, one-time codes, and irrelevant boilerplate are rejected or redacted before storage.

### 5. Route questions before retrieval

Different questions require different truth rules:

- **“What is the current status?”** prioritizes the latest project state and recent evidence.
- **“What do I believe?”** prioritizes user-confirmed long-term claims and their history.
- **“What would I write?”** retrieves voice exemplars for the same audience, channel, and intent.
- **“How would I manage this?”** retrieves operating principles plus similar decisions and their outcomes.
- **“What happened?”** retrieves dated source evidence without converting it into a current state.

Every answer should show its effective date, evidence, uncertainty, and conflicts. Unsupported certainty is a failed answer.

### 6. Add human-reviewed stewardship loops

Put a small stewardship layer between new evidence and the human-edited wiki:

- a morning review proposes new or unmapped People, Projects, and canonical Topics from recent Gmail, Calendar, Fireflies, and Brain evidence;
- a weekend review replaces the compact working-state block in active Project files with what verifiably changed and what is explicitly planned;
- an evaluator gardener proposes new questions after each 2–3-answer grading batch or material professional change.

Create a controlled `Topics/` registry with names, aliases, descriptions, inclusions, and exclusions. A Topic is a reusable subject or method and is never a Project. Unknown People, Projects, and Topics are candidates, not automatic creations.

Keep Project files compact: replace one managed weekly block instead of appending weekly diaries. The raw Gmail, Calendar, meeting, and Brain evidence remains historical. Stable project descriptions may receive an evidence-backed proposed diff during the weekend pass, but remain human-owned.

Start these as manually invoked skills. A future morning or weekend schedule may prepare proposals, but must not silently admit entities, rewrite descriptions, or approve evaluator truth. The full loop contracts are in `docs/suggested-loops-and-skills.md`.

### 7. Improve only what the evaluator proves is broken

After a meaningful baseline, group failures into retrieval, stale state, entity confusion, unsupported inference, voice mismatch, and management mismatch. Build only against the largest measured failure classes.

No autonomous self-cleaning, silent merging, auto-rewriting of canonical files, or model-training loop in v1.

## First practical sequence

### Days 1–3: containment and baseline

- Remove or redact stored secrets and authentication material.
- Create the evaluator schema and enter the first 12–20 questions.
- Run the current brain against the first 2–3 questions and record the baseline without fixing the answers yet.

### Days 4–10: canonical reconstruction

- Consolidate Robert’s aliases into one self record.
- Classify projects as active, paused, completed, prospect, or historical.
- Create the `Topics/` contract and curate a small seed vocabulary from useful existing tags.
- Run the first bounded morning wiki-steward pass manually and review the clearest People, Project, and Topic candidates.
- Build the first self, operating-system, voice, and current-state dossiers from evidence.
- Review only the projects that appear in evaluator questions or current work.

### Days 11–14: first measured answer path

- Route each evaluator question by type.
- Assemble a small evidence packet instead of returning whole email threads or transcripts.
- Draft and approve the replaceable weekly state block for one active Project.
- Produce answers with “as of,” evidence, conflicts, and unknowns.
- Let Robert grade another 2–3 question batch and compare it with baseline.
- Use those ratings to run the first evaluator-gardener pass and activate only Robert-approved questions.

## Success criteria

The upgrade is working when:

- a current-status answer does not quote a stale project snapshot as current;
- historical facts remain accessible after newer facts supersede them;
- the system distinguishes Robert’s belief from a reference he saved;
- answers cite the evidence that supports each important claim;
- unknown or conflicting facts are stated plainly;
- generated writing matches the right Robert voice for that audience and task;
- project-management suggestions match Robert’s actual decisions, not generic best practice;
- evaluator performance improves on held-out questions, not only on corrected examples;
- new People, Projects, and Topics enter through a reviewed candidate process rather than extraction side effects;
- active Project files remain compact while their current-state sections stay fresh;
- and the brain contains no recoverable credentials or one-time authentication material.

## Updated next step

1. Finish the sensitive-data exposure audit.
2. Define the first evaluator file and grade the first 2–3 answers.
3. Define the initial `Topics/` schema and curate a small seed vocabulary.
4. Dry-run the morning wiki-steward loop over a bounded recent Gmail and Calendar window.
5. Draft one active Project's replaceable weekly working-state block.
6. Feed the reviewed corrections into the first evaluator-gardener pass.

Do not create a schedule yet. First confirm through repeated manual runs that the candidate quality, Project diffs, stopping behavior, and human review load are acceptable.

## Decision rule

Do not build a new storage layer, ranker, learning loop, or background mutation process until the curated evaluator shows that the existing Drive + Qdrant + MCP stack cannot meet the target with clearer truth types, controlled registries, better source contracts, and human-reviewed canonical documents. A future schedule may generate proposals; it does not receive canonical write authority by default.
