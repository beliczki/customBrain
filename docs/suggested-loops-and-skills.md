# Suggested recurring loops and skill specifications

Date: 2026-07-18  
Status: planning specification only; no skill, scheduler, cron, storage, or production change is included

## Purpose

The truth-first Brain needs maintenance rhythms, not just better retrieval. Gmail, Calendar, Fireflies, manual notes, and the existing Brain continually reveal:

- people who are not yet in the People registry;
- possible projects that are not yet in the Projects registry;
- useful recurring topics that are not part of a controlled topic vocabulary;
- changes in active projects;
- and new questions that would make the evaluator more representative.

The cheap v1 is a set of manually invoked, skill-like loops. A scheduler may later start the read-only proposal pass, but it must not silently admit entities, rewrite human-owned descriptions, activate evaluator questions, or turn calendar intent into fact.

## Architectural place

These loops form a **stewardship layer between evidence and canonical truth**:

```text
Gmail · Calendar · Fireflies · Brain · Drive
                    ↓
        candidate detection and evidence
                    ↓
       human-reviewed stewardship queue
                    ↓
      People · Projects · Topics · Evaluator
                    ↓
        answer routing and evidence packets
```

The stewardship layer has two separate operations:

1. **Discover** — identify candidate changes from new evidence.
2. **Admit** — accept, map, reject, defer, or correct the candidate.

Discovery may be automated. Admission remains human-reviewed until repeated evaluator evidence proves a specific write operation safe.

## Canonical registry model

### People

A Person is a real individual with a professional relationship or meaningful professional evidence.

Discovery signals include:

- sender, recipient, or attendee email not mapped to a People file;
- a recurring participant name not covered by an alias;
- a person explicitly assigned a commitment or decision role;
- an explicit relationship change.

A single newsletter sender, calendar service account, automated mailbox, or copied recipient is not automatically a Person worth admitting.

### Projects

A Project is a bounded professional effort with an objective, work, ownership, and a changing state.

It is not automatically:

- a client or organization;
- a product name;
- a campaign fragment;
- a meeting series;
- a topic;
- or any capitalized phrase repeated in mail.

A project candidate should have evidence of at least an objective or deliverable plus a relationship, owner, commitment, or time boundary. Ambiguous candidates stay pending or map to an existing project alias.

### Topics

A Topic is a reusable subject, method, domain, or question that can appear across multiple projects. A Topic is never a Project.

Examples of topic-shaped concepts:

- AI adoption;
- adaptive creative production;
- knowledge systems;
- organizational change;
- behavioral science;
- project scoping.

Examples that should remain Projects or project aliases:

- a named client engagement;
- a campaign;
- an internal product build;
- a deliverable with an owner and deadline.

Create a `Topics/` folder alongside `People/` and `Projects/`. Each topic file should be human-readable and have a small contract:

```yaml
---
type: topic
name: Adaptive creative production
aliases: []
status: active
reviewed_at: 2026-07-18
---

## Description

One short explanation of what this topic means in Robert's professional world.

## Includes

- concepts that should receive this tag

## Excludes

- nearby concepts that belong to another topic or to a project

## Related topics

- links only to other canonical Topic files
```

Topic tagging should use only canonical topic names or aliases. An extractor may propose an unknown topic, but may not invent and persist one. Prefer a small useful vocabulary over exhaustive tagging. Project names, client names, and person names are prohibited as Topics.

## Loop 1 — morning wiki stewardship

### Goal

Find new or unmapped People, Projects, and Topics in recent professional evidence, then let Robert review a small candidate queue.

### Initial cadence

- Run manually in the morning.
- Scan only evidence created or changed since the previous reviewed pass.
- Show no more than five highest-signal candidates by default.
- Stop when the candidate queue is empty or Robert chooses to stop.

A future morning schedule may prepare the queue. It should not apply registry changes without review.

### Inputs

- new Gmail participants and project/topic mentions;
- new or changed Calendar attendees, titles, descriptions, and linked notes;
- new Fireflies participants, decisions, commitments, and project references;
- recent Brain captures and their extracted metadata;
- existing People, Projects, and Topics names, aliases, emails, statuses, and descriptions.

Personal calendar events, automated email senders, authentication material, and obvious boilerplate are excluded before candidate generation.

### Matching order

1. Exact canonical ID or name.
2. Exact alias or known email address.
3. Strong deterministic normalization, such as accents or name order.
4. Semantic candidate suggestion with evidence.
5. Unknown.

Semantic similarity may propose a match but cannot merge or create an entity.

### Candidate record

```yaml
candidate_id: stable-id
candidate_type: person | project | topic
candidate_name: "..."
first_seen_at: "..."
last_seen_at: "..."
source_refs: []
reason_detected: "..."
possible_matches: []
suggested_action: map_alias | create | reject | defer | needs_context
status: pending
```

### Review actions

- **Map** to an existing canonical entity or alias.
- **Create** a minimal canonical file.
- **Reject** as noise, personal, automated, or not professionally useful.
- **Defer** until more evidence exists.
- **Needs context** when the evidence cannot distinguish person, organization, project, product, or topic.

Accepted candidates should be written as the smallest possible diff. Rejected decisions should be remembered so the same noise does not return every morning.

### Output

- reviewed registry diffs;
- unresolved candidate list;
- duplicate/alias proposals;
- source pointers for every proposal;
- a short count by candidate type and decision.

### Truth rules

- Being emailed does not prove an important relationship.
- Being invited does not prove attendance.
- Appearing in a calendar title does not prove a Project exists.
- Repetition does not turn a phrase into a Topic.
- A new entity file does not need a fabricated description; `unknown` is allowed.

## Loop 2 — weekly project stewardship

### Goal

Keep active Project files compact, current, and useful without growing an endless weekly diary.

### Initial cadence

- Run manually during the weekend.
- Process only Projects marked `active`, plus explicitly selected prospects or paused projects.
- Evidence window: previous seven days for observed changes and the next seven to fourteen days for explicit plans.
- Review one Project diff at a time.

A future weekly schedule may draft the diffs. In v1, Robert approves each write.

### Project document ownership

Project files need protected human-owned sections and one replaceable managed section.

Human-owned:

- project identity and aliases;
- stable description;
- purpose and boundaries;
- sensitive commercial or relationship context;
- explicit status transitions.

Replaceable weekly section:

```markdown
<!-- brain:managed:start weekly-state -->
## Current working state

Valid as of: YYYY-MM-DD
Next review: YYYY-MM-DD

### What changed in the last 7 days
- evidence-backed changes only

### Decisions and commitments in force
- owner and date only when explicit

### Planned next 7–14 days
- scheduled or explicitly committed work only

### Risks, blockers, and open questions
- distinguish fact, concern, and unknown

### Current people
- canonical People links

### Evidence
- bounded source pointers
<!-- brain:managed:end weekly-state -->
```

Each accepted weekly pass replaces this entire managed section. It does not append another week. The previous prose may disappear from the Project file because the underlying emails, meetings, calendar events, and Brain evidence remain preserved and dated.

### Stable description update

The weekend pass may propose a new stable description when evidence shows the project's objective, boundary, deliverable, or relationship has materially changed.

It must show:

- current description;
- proposed description;
- evidence for each changed claim;
- removed or narrowed claims;
- whether the change is correction, evolution, or status transition.

The stable description remains human-owned. The loop cannot silently rewrite it.

### Evidence rules

- An email proves communication, not completion.
- A Calendar event proves scheduled intent, not that work happened.
- A completed meeting proves the meeting occurred, not that every discussed point was accepted.
- “Done” requires explicit completion evidence or a finished artifact.
- A plan requires an explicit commitment, scheduled event, or user confirmation.
- Absence of recent evidence means `no verified change`, not `nothing happened`.
- Conflicts are shown; the newest text does not automatically win.

### Output

For every processed Project:

```yaml
project: canonical-project
window_start: "..."
window_end: "..."
evidence_reviewed: []
managed_block_diff: "..."
description_diff: null
status_change_proposal: null
uncertainties: []
review_decision: pending
```

The final report lists updated, unchanged, deferred, and conflicted Projects. “Unchanged” is a valid result.

## Loop 3 — evaluator gardener

### Goal

Turn Robert's real uncertainties, corrections, new entities, and changing projects into an increasingly trustworthy question bank without teaching the evaluator the Brain's own mistakes.

### Triggers

- after Robert grades a batch of 2–3 answers;
- after a new Person, Project, or Topic is admitted;
- after a material project-description or status change;
- when a contradiction or stale answer is found;
- optionally once a week to propose coverage gaps.

### Inputs

- current evaluator questions and versions;
- recent answer runs and Robert's ratings;
- failure tags and user corrections;
- new canonical People, Projects, and Topics;
- recent material project changes;
- untested answer categories and freshness rules.

### Workflow

1. Identify gaps, regressions, and newly important truths.
2. Propose a small set of candidate questions.
3. Mark whether each is a regression test, current-state check, identity/relationship check, belief test, voice case, management case, exact-count check, or deliberate unknown.
4. Ask Robert to select or rewrite 2–3.
5. Capture Robert's answer and evidence requirements.
6. Activate a question only after human review.
7. Version changed questions rather than overwriting their history.
8. Keep a held-out slice that is not used to tune prompts or dossiers.

### Non-negotiable boundary

The loop may propose questions from Brain evidence. It may not generate and approve its own gold answer from that Brain evidence. Doing so would encode the current system's lies as the evaluator's truth.

### Candidate output

```yaml
candidate_question: "..."
reason: new_entity | changed_state | prior_failure | coverage_gap | contradiction
category: "..."
as_of: "..."
suggested_sources: []
expected_freshness: "..."
status: proposed
```

### Weekly result

- 2–3 reviewed questions, not a large unreviewed pile;
- explicit retired or superseded question versions;
- category and entity coverage gaps;
- failure distribution changes;
- held-out-set integrity check.

## Draft skill contracts

These are behavioral specifications for future user-invocable skills. They are not installed skills and do not authorize implementation.

### `/wiki-steward`

**Use when:** Robert wants to review newly observed People, Projects, and Topics.

**Tools/data:** bounded Gmail, Calendar, Fireflies, Brain, and Drive reads; exact registry/alias matching; reviewed Drive writes.

**Loop:** fetch since last reviewed point → normalize → compare to registries → rank candidates → show up to five → apply only selected actions → repeat or stop.

**Must never:** ingest secrets into proposals, create entities automatically, merge on semantic similarity, classify personal events as professional by default, or invent descriptions.

**Stop:** no candidates remain, Robert stops, or unresolved ambiguity requires context.

### `/project-weekly-steward`

**Use when:** Robert wants a compact weekend refresh of active Project dossiers.

**Tools/data:** bounded previous-week and next-period Gmail, Calendar, Fireflies, Brain, and canonical entity reads; Project-file diff after approval.

**Loop:** choose active Project → gather evidence → draft managed-block replacement → optionally draft description/status diff → show evidence and uncertainty → apply approved diff → continue.

**Must never:** append weekly sections forever, overwrite outside the managed block, claim completion from calendar presence, invent owners/dates, or silently alter the stable description.

**Stop:** all selected Projects are reviewed, Robert stops, or evidence conflicts require a decision.

### `/evaluator-gardener`

**Use when:** Robert wants the question bank to evolve from recent grading and professional changes.

**Tools/data:** evaluator versions/runs, reviewed corrections, canonical registry changes, and bounded supporting evidence.

**Loop:** find gaps → propose a few candidates → review 2–3 → capture human gold/unknown rules → version and activate approved questions → report coverage.

**Must never:** approve its own gold answer, rewrite historical question versions, expose held-out answers during tuning, or create hundreds of low-value questions.

**Stop:** the selected batch is reviewed or Robert stops.

## Scheduling model, if manual use earns it

The schedule and the skill have different responsibilities:

- **Schedule:** start a bounded pass and surface a notification or proposal queue.
- **Skill:** retrieve evidence, enforce truth rules, produce diffs, and stop safely.
- **Human:** admit entities, approve canonical changes, supply evaluator truth, and resolve conflicts.

Suggested future cadence:

| Time | Proposed task | Automatic authority |
| --- | --- | --- |
| Weekday morning | `/wiki-steward` candidate pass | read and propose only |
| Weekend | `/project-weekly-steward` for active Projects | draft diffs only in v1 |
| After each 2–3 answer review | `/evaluator-gardener` | propose questions only |
| Monthly | Topic vocabulary audit through `/wiki-steward` | propose merge/retire/scope changes |

Do not schedule any loop until it has been run manually enough times to show that its inputs, output size, stopping behavior, and review burden are acceptable. Do not create three separate schedulers merely because there are three skill contracts; a single stewardship task can invoke the due pass.

## Evaluation of the loops themselves

The maintenance system also needs evidence:

- candidate acceptance, mapping, rejection, and deferral rates;
- repeated-noise rate;
- missed-entity rate found later by Robert;
- unsupported project-state claims;
- project diff acceptance/edit/rejection rate;
- time required per review;
- evaluator questions activated versus proposed;
- evaluator coverage and held-out performance;
- stale Project files and Topics with unclear scope.

Automation earns more authority only when these measures show that the human review step is repetitive and predictable. Frequency alone is not evidence that a ranker or autonomous writer is needed.

## Recommended rollout

### First manual pass

1. Define the Topic file contract and curate a small seed vocabulary from existing useful tags.
2. Run `/wiki-steward` as a dry review against the most recent professional Gmail and Calendar window.
3. Admit or map only the clearest People, Projects, and Topics.
4. Select one active Project and draft its first replaceable weekly state block.
5. Grade the next 2–3 evaluator answers.
6. Run `/evaluator-gardener` on those ratings and activate only Robert-approved questions.

### After several successful manual passes

- schedule proposal generation, not canonical writes;
- keep each morning queue small;
- widen weekly Project coverage only to Projects that remain active;
- consider automatic replacement of the managed weekly block only after unsupported-state errors have disappeared from reviewed samples;
- keep stable descriptions, entity admission, Topic scope, and evaluator gold answers human-owned.

## Next step

The next implementation-sized decision remains deliberately small:

1. finish the sensitive-data exposure audit;
2. define the first evaluator file and grade the first 2–3 answers;
3. define the initial Topic schema and manually curate a small seed vocabulary;
4. perform one dry `/wiki-steward` pass over a bounded recent window;
5. draft one active Project's replaceable weekly state block;
6. use the resulting corrections to run the first `/evaluator-gardener` pass.

Only after these manual loops are useful should the project decide whether a morning or weekend schedule is justified.
