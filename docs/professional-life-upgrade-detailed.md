# Professional life representation — detailed truth-first plan

Date: 2026-07-18  
Scope: planning and architecture only  
Requested location: `customBrain/docs`

## 1. Executive verdict

The present system is a useful evidence warehouse and retrieval engine. It is not yet a trustworthy digital representation of Robert’s professional life.

Its root problem is ontological, not cosmetic: one flat “thought” model is being asked to represent observations, communications, meetings, external references, beliefs, decisions, tasks, identity, project state, relationships, and style. Similarity search can find nearby text, but cannot reliably decide which record is authoritative, current, personally endorsed, superseded, sensitive, or relevant to the form of the question.

The upgrade should therefore not begin with a more autonomous agent. It should begin with an evaluator and a versioned truth model. The target is not “an AI that remembers everything.” The target is “an AI that knows what kind of evidence it has, what it may infer from it, what Robert has confirmed, what changed, and when it must say it does not know.”

## 2. Preliminary professional essence

This is a working hypothesis assembled from Brain MCP search, `People/Me.md`, Project files, recent mail, calendar evidence, and the April 2026 career synthesis. It is not yet the canonical self dossier.

Robert is a strategist-builder working where AI, marketing, creative production, knowledge systems, and organizational adoption meet. He moved from an EMEA addressable-content leadership role at WPP/Wavemaker into independent work through Grafia, combining client delivery with product and infrastructure creation. The portfolio includes high-volume creative/marketing work, AI-enabled production systems, messaging and knowledge products, and advisory work for organizations trying to operationalize AI.

The recurring professional pattern is not “AI for its own sake.” It is to lower the cost of useful interpretation and action: create an interface or substrate, anchor it in real source material, test it on a small sharp case, keep human expert intervention where it matters, and turn what works into a reusable workflow or product. The evidence also shows a preference for direct client relationships, pragmatic pilots, explicit interfaces and responsibilities, and product-plus-service combinations.

Robert’s professional voice is contextual rather than uniform. Operational mail can be extremely terse, informal, link-first, and action-oriented. Strategic mail can be expansive, candid, analogy-rich, numerical, and willing to challenge the framing before discussing implementation. A faithful representation must select the voice mode from audience, relationship, channel, and intent; averaging the modes would reproduce neither.

This preliminary essence is already more specific than `People/Me.md`, but it may contain stale April assumptions. The reconstruction process below exists to confirm, version, or reject each part.

## 3. Evidence and coverage audit

### 3.1 Brain MCP snapshot

The 2026-07-18 Brain MCP audit returned:

| Measure | Observed value | Truth implication |
| --- | ---: | --- |
| Total thoughts | 415 | Small enough for manual reconstruction waves |
| Active / archived | 409 / 6 | Supersession is rarely represented explicitly |
| Meetings | 153 | Event evidence dominates |
| References | 118 | Saved influence can be mistaken for Robert’s belief |
| Notes | 75 | Mixed purpose; not necessarily canonical |
| Conversations | 20 | Communication evidence is under-typed |
| Reflections | 13 | Too little deliberate self-modeling |
| Proposals | 1 | The corpus does not strongly encode preferred management responses |
| Gmail thoughts | 117 | Large, evolving thread blobs are a major input |
| Fireflies thoughts | 113 | Meeting records are a major input |
| Manual thoughts | 81 | Deliberate memory is a minority |
| YouTube thoughts | 66 | External material has significant retrieval weight |

Health findings:

- 322 duplicate-candidate **pairs** above cosine 0.92. This does not mean 322 duplicate thoughts, but it proves that recurring meetings and similar project updates create dense clusters that can swamp broad questions.
- 50 over-tagged thoughts.
- 227 active thoughts longer than 6,000 characters without the health checker’s expected summary flag.
- 50 distinct people-name values used in thought metadata but not recognized by the current People registry.
- 22 People files and 2 Project files unused by active thought metadata.

The broad semantic searches used for professional identity, operating style, current priorities, and voice produced many `weak_semantic` results and returned very large text payloads. The relevant April career note surfaced, but it was mixed with external references, old registries, and unrelated current events. The system can retrieve evidence; it cannot yet assemble a disciplined self-model from it.

### 3.2 Drive People and Projects

The local Drive mirror was read from `~/GoogleDrive/Docs/_customBrain`, excluding backup and trash paths.

- 252 People Markdown files; 217 are under 100 bytes and function mainly as stubs.
- `Me.md` contains aliases, a client list, and a generic paragraph about practical conversational AI.
- Separate stubs exist for several variants of Robert’s name, including `Beliczki Róbert`, `Robert Beliczki`, `Róbert Beliczki`, `Robi`, and `Robert`.
- 27 Project files exist. Twenty-three were last modified on or before 2026-05-20, one in June, and three in July.
- Project documents range from nearly empty files to rich strategic dossiers. Their structure and freshness are inconsistent, although all are passed into the metadata-extraction prompt.

This means a stale or incomplete Project file can influence every new capture’s metadata while providing no machine-readable statement of when its status was last reviewed.

### 3.3 Gmail

The connected account was sampled with bounded Gmail-native searches. Recent sent mail demonstrates:

- short operational instructions with links, IDs, status fields, and direct questions;
- candid creative feedback that implements a request while explicitly saying when the result becomes unclear;
- longer strategic feasibility reasoning that reframes a production question as a data, ethics, customer, automation, and economics problem;
- informal Hungarian/English mixing, audience-dependent shorthand, and highly variable length.

The sample also contains passwords, authentication codes, and other secrets. The current Gmail intake cleaner is aimed at boilerplate, not credential detection. A truthful memory system must first be a safe memory system.

The current Gmail cron also auto-labels recent outbound mail to any known person and promotes the whole cleaned thread into Qdrant. That is convenient capture, but it makes “sent something to a known contact” equivalent to “this belongs in durable professional memory.” Thread refresh then re-extracts metadata and can overwrite manual curation.

### 3.4 Calendar

The primary calendar was paged over three bounded periods from 2026-01-01 through 2026-07-18:

| Period | Events | Recurring events | Project-keyword heuristic | Online-meeting signal |
| --- | ---: | ---: | ---: | ---: |
| Jan–Mar | 627 | 89 | 289 | 78 |
| Apr–May | 276 | 70 | 136 | 40 |
| Jun–Jul 18 | 163 | 72 | 48 | 26 |

The keyword column is a rough diagnostic, not a truth label; for example, a personal utility-bill reminder can contain a word also used by a banking project. The important finding is that the calendar is an all-purpose behavioral surface: client work, self-assigned tasks, habits, family dates, purchases, and reminders coexist. Event creation proves planned intent. Acceptance proves calendar response. Neither proves execution, importance, or professional endorsement.

### 3.5 Existing capabilities worth keeping

The redesign should reuse rather than replace:

- hybrid dense + BM25 retrieval with evidence tags;
- typed lexical/vector subqueries;
- deterministic `quick_lookup` for metadata questions;
- `get_thought` line slicing;
- `brain_health_check` and its history log;
- `scripts/prove-brain.js` and existing gold annotations;
- source/effective dates and source IDs;
- explicit People/Project aliases in Drive;
- synthesis write-back convention;
- read-only contradiction probing.

These are good retrieval and audit primitives. They need clearer truth objects and evaluation, not wholesale replacement.

## 4. Root causes

### 4.1 Flat memory ontology

The payload distinguishes source and content type, but not the epistemic role of a record. A YouTube summary, a current decision, an email quote, a self-belief, and an outdated project snapshot can all compete in the same result list.

### 4.2 One date is not enough

`effective_date` correctly improves on capture time, but truth needs at least two temporal axes:

- when the source event happened or the claim was observed;
- when the claim was valid in the professional world.

A third operational date—when Robert last reviewed the claim—controls freshness. Without `valid_from`, `valid_to`, and `reviewed_at`, historical truth is easily presented as current truth.

### 4.3 Capture policy is wider than memory value

Auto-capture maximizes recall but also imports repetition, boilerplate, credentials, social reactions, minor coordination, and entire evolving threads. The system has no explicit promotion boundary between raw evidence and durable memory.

### 4.4 Canonical entities are noisy and uneven

People aliases are incomplete; numerous stub variants still exist. Project files mix identity, status, strategy, links, and prose without a freshness contract. This weakens both metadata extraction and exact lookup.

### 4.5 Retrieval is question-agnostic

The same hybrid search and global time decay serve current-status, historical, identity, belief, voice, and management questions. Stable identity should not decay like a campaign update; a writing task needs matching exemplars rather than topically similar references.

### 4.6 Full blobs are handed to the model

Search results can include complete summary-wrapped threads and transcripts. This increases token cost, duplicates evidence, and encourages the answer model to anchor on whichever blob is longest or most recent.

### 4.7 Corrections are not the product loop

Health checks find structural anomalies, but there is no evolving user-graded question bank that links a wrong answer to the exact failure: missing evidence, stale state, entity error, bad retrieval, unsupported inference, wrong voice, or wrong management choice.

### 4.8 Sensitive information lacks a dedicated boundary

Credential and authentication material can appear in Gmail and be copied into Qdrant. Retrieval quality work must not proceed before this exposure class is contained.

### 4.9 Topic tagging has no controlled vocabulary

Topics are free-form extraction output rather than canonical entities with definitions and aliases. Synonyms fragment retrieval, while project, client, product, campaign, and one-off phrases can become accidental Topics. Nothing defines inclusion or exclusion boundaries.

### 4.10 Entity discovery and entity admission are conflated

New names and labels can emerge from capture metadata or stub creation, but there is no small human review loop across recent Gmail, Calendar, Fireflies, and Brain evidence. The system either creates noise or leaves genuinely important People and Projects unmapped; it does not present a clear evidence-backed candidate decision.

## 5. Target information architecture

### 5.1 Layer A — immutable evidence

Purpose: preserve what happened without claiming what it means now.

Objects:

- email message/thread reference,
- meeting/transcript reference,
- calendar event,
- manual note,
- external reference,
- document/version.

Minimum fields:

```text
evidence_id
source
source_id
observed_at
effective_at
author_or_participants
content_or_pointer
sensitivity
integrity_hash
```

Rule: evidence can be corrected for extraction errors but is never silently rewritten into a newer meaning.

### 5.2 Layer B — canonical entities

Purpose: provide exact identity and stable routing.

Entities:

- Robert/self,
- people,
- organizations,
- clients,
- projects/products,
- topics,
- contracts/engagements where safe,
- communication contexts.

Minimum fields:

```text
canonical_id
name
aliases
entity_type
relationship_to_robert
status
valid_from / valid_to
reviewed_at
evidence_refs
```

Canonical folders should be explicit:

- `People/` for individuals and their aliases/relationships;
- `Projects/` for bounded efforts with objectives and changing state;
- `Topics/` for reusable subjects, methods, and domains.

A Topic is never a Project. Topic files define a canonical name, aliases, description, inclusions, exclusions, status, and review date. Project, client, product, campaign, and person names cannot leak into topic metadata merely because extraction produced them.

### 5.2a Stewardship queue — evidence-to-wiki boundary

Purpose: detect possible changes without granting source extraction canonical authority.

Candidate types:

- unmapped or new Person;
- unmapped or new Project;
- unmapped or new Topic;
- alias/duplicate proposal;
- Project state or description change;
- evaluator-question candidate.

Each candidate carries source pointers, first/last seen times, possible canonical matches, reason for detection, suggested action, and review status. The admissible actions are map, create, reject, defer, and needs-context.

Discovery may run automatically over bounded new evidence. Admission remains human-reviewed. Semantic similarity can suggest a match but cannot merge or create an entity. Rejected noise must be remembered so it is not proposed every morning.

### 5.3 Layer C — long-term professional model

Purpose: represent the durable “Robert” that a model needs to reason with.

Sections:

- professional narrative and roles;
- capabilities and domains;
- values and non-negotiables;
- decision principles;
- project-shaping and scoping patterns;
- delegation and feedback patterns;
- recurring risks and constraints;
- relationship strategy;
- commercial preferences and boundaries, with sensitivity controls;
- rejected paths and why they were rejected.

Every claim is marked as user-confirmed, evidence-derived, inferred, disputed, or unknown.

### 5.4 Layer D — short-term working state

Purpose: answer “what is true now?”

Per active project:

- objective;
- state: prospect / active / paused / waiting / completed / abandoned;
- current phase;
- last meaningful change;
- decisions in force;
- commitments by Robert and by others;
- next milestone;
- risks/blockers;
- unresolved questions;
- people currently involved;
- source evidence;
- `valid_as_of` and next review date.

This layer should be compact and deliberately refreshed. It must not be reconstructed from every raw email at answer time unless the current snapshot is stale.

Each active Project file should contain one explicitly delimited, system-managed weekly-state block. An accepted weekly refresh replaces that block rather than appending another diary entry. The Project's stable description, purpose, boundaries, sensitive context, and status transitions remain human-owned. The weekend pass may propose an evidence-backed description diff but cannot silently apply it.

Removing the previous weekly prose from the Project file does not delete history: the underlying Gmail, Calendar, Fireflies, Brain, and document evidence remains dated and retrievable.

### 5.5 Layer E — contextual response models

#### Voice model

Store representative sent examples by:

- audience/relationship,
- channel,
- language,
- intent,
- stakes,
- length mode,
- edit distance from the final sent text.

Suggested modes: operational instruction, client feedback, strategic exploration, proposal/brief, conflict/repair, friendly collaborator, and executive summary.

#### Management model

Store cases rather than slogans:

- situation,
- constraints,
- what Robert noticed,
- options considered,
- decision,
- intervention/delegation,
- outcome,
- what changed afterward.

This allows “how would I manage?” to retrieve analogous decisions and outcomes rather than generic project-management advice.

### 5.6 Layer F — evaluator

Purpose: make improvement measurable and prevent plausible demos from replacing truth.

Each question version should contain:

```yaml
id: stable-question-id
version: 1
status: draft | active | retired
category: identity | current_state | history | belief | relationship | voice | management | count
question: "..."
as_of: 2026-07-18
gold_answer: "..."
required_claims: []
forbidden_claims: []
acceptable_unknowns: []
required_sources: []
freshness_sla: "..."
voice_context: null
reviewed_at: 2026-07-18
```

Each run should record:

```yaml
question_id: stable-question-id
question_version: 1
run_at: "..."
model_and_prompt_version: "..."
memory_snapshot: "..."
answer: "..."
evidence_used: []
retrieval_trace: []
stated_unknowns: []
user_rating: pending
failure_tags: []
user_correction: null
```

Robert reviews 2–3 answers per batch. The primary rating can remain simple—correct, partly correct, wrong, or correctly unknown—with optional failure tags:

- missing evidence,
- stale,
- contradiction missed,
- entity confusion,
- unsupported inference,
- wrong voice,
- wrong management choice,
- too verbose/too terse,
- sensitive-data exposure.

The evaluator also needs a gardener loop. It may propose new questions after a grading batch, a new canonical entity, a material Project change, or a detected contradiction. It may not activate a question or generate and approve its own gold answer from the current Brain; that would encode the system's existing mistakes as evaluator truth.

The user correction is authoritative. The answering model does not grade itself.

## 6. Truth and answer contracts

### 6.1 Claim contract

Any durable claim should be able to answer:

- Who or what is the claim about?
- What exactly is asserted?
- Who asserted it?
- Which evidence supports it?
- When was it observed?
- During what interval was it true?
- Is it current, superseded, disputed, inferred, or unknown?
- When did Robert last review it?
- How sensitive is it?

A practical shape is:

```text
subject + predicate + object
valid_from + valid_to
observed_at + reviewed_at
epistemic_status
confidence
evidence_refs[]
supersedes / superseded_by
sensitivity
```

V1 should encode this in curated Markdown/frontmatter and existing Qdrant payloads where possible. A new database or claim store is justified only if the evaluator proves that this representation is too cumbersome.

### 6.2 Answer contract

Every professional-life answer should include, internally or visibly as appropriate:

1. normalized question type and “as of” time;
2. direct answer;
3. supporting claim/evidence pointers;
4. conflicts or stale evidence;
5. explicit unknowns;
6. confidence based on evidence coverage, not model fluency;
7. no secret or credential material.

For a writing task, add the selected voice context and exemplars. For a management task, add analogous cases and explain which constraints match or differ.

### 6.3 Freshness expectations

Initial service levels to validate with the evaluator:

| Information | Initial freshness rule |
| --- | --- |
| Active project status | review within 7 days or answer as stale |
| Commitments / blockers | review within 72 hours when active |
| New People/Project/Topic candidates | inspect recent professional evidence each reviewed morning pass |
| Topic definitions | review on scope conflict and audit monthly while the vocabulary is forming |
| Meeting/calendar facts | immutable event date; do not infer completion |
| Professional roles / client relationships | review quarterly or on change |
| Values / operating principles | review twice yearly or after explicit contradiction |
| Voice examples | no expiry; keep context and date, prefer recent comparable examples |
| External references | never promoted to belief without Robert’s reflection |

## 7. Source contracts

| Source | What it proves | What it does not prove | Target handling |
| --- | --- | --- | --- |
| Gmail | what was communicated at a time | current truth, completed work, stable belief | live source of record; promote decisions, commitments, relationship changes, and voice exemplars |
| Calendar | scheduled intent, allocation, invitation state | completion, importance, professional relevance | classify context; use as working-state signal; verify outcomes elsewhere |
| Fireflies | what was said in a meeting | final agreement unless explicit | keep evidence pointer/summary; promote confirmed decisions and commitments |
| Manual thought | what Robert chose to record | permanent truth without time/status | high-priority evidence; require type, validity, and review state |
| YouTube/reference | information Robert consumed | endorsement or intended action | reference-only unless paired with a reflection |
| People/Projects/Topics Markdown | canonical routing, controlled vocabulary, and reviewed dossiers | automatic freshness | add status, review date, evidence, and validity; stop treating undated prose or free tags as current truth |
| Qdrant thought | retrievable indexed record | authority merely because it ranks highly | evidence index; return snippets/pointers rather than full blobs by default |

## 8. Phased execution plan

### Phase 0 — security containment and snapshot

Goal: prevent memory improvement from increasing risk.

Actions:

- snapshot Qdrant and the non-backup Drive vault before cleanup;
- add a read-only secret/credential exposure report for existing thought text;
- define redaction patterns for passwords, one-time codes, tokens, cookies, API keys, and private auth links;
- stop new capture of matching material before backfilling cleanup;
- keep redaction audit pointers without retaining the secret value;
- verify that retrieval cannot return sampled authentication material.

Gate: no known recoverable credentials in the answer path.

### Phase 1 — evaluator v0 and baseline

Goal: measure the current system before changing it.

Actions:

- store the question-bank and run schema under `docs/` or `tasks/` in the existing repository;
- add the first 12–20 active questions across identity, current state, history, belief, relationship, voice, management, and exact-count categories;
- extend `scripts/prove-brain.js` only enough to accept the evolving question file and save retrieval traces;
- run a frozen baseline;
- have Robert classify 2–3 answers at a time;
- run the evaluator-gardener manually after each reviewed batch to propose a few regression and coverage questions;
- require Robert to supply or confirm the gold answer and acceptable unknowns before activation;
- keep at least 20% of active questions held out from prompt and curation work.

Gate: at least 12 reviewed questions and a visible failure distribution.

### Phase 2 — canonical entity cleanup

Goal: make exact identity and project routing reliable.

Actions:

- consolidate self variants into aliases of `Me.md`;
- resolve the highest-usage unknown people first, not all 252 files at once;
- merge person variants only after checking every referenced thought and email identity;
- mark low-value external/reference people separately from real collaborators;
- classify all 27 projects as active, paused, completed, prospect, historical, or unclear;
- create a `Topics/` folder with a small reviewed seed vocabulary, aliases, descriptions, inclusions, and exclusions;
- enforce the rule that a Topic is never a Project, client, product, campaign, or person;
- add `reviewed_at`, `status`, and evidence pointers to Project files;
- dry-run the morning wiki-steward loop over bounded recent Gmail, Calendar, Fireflies, and Brain evidence;
- review new/unmapped Person, Project, and Topic candidates in small batches rather than creating stubs automatically;
- remove or archive orphan files only after verifying they are not valid future entities.

Gate: evaluator questions no longer fail due to self/project/person alias errors or uncontrolled topic labels, and the discovery pass produces reviewable candidates rather than automatic entities.

### Phase 3 — professional core reconstruction

Goal: build the first truthful long-term model.

Artifacts to curate:

- canonical self dossier;
- career and portfolio timeline;
- capabilities and proof cases;
- operating principles;
- relationship map;
- commercial/organizational constraints with sensitivity boundaries;
- contextual voice guide;
- management case library;
- rejected directions and supersession history.

Method:

1. Start from the evaluator questions, not from every source.
2. Pull candidate evidence via Brain MCP, Gmail, Calendar, Fireflies, and Drive.
3. Write claim candidates with evidence and dates.
4. Ask Robert to confirm/reject small batches.
5. Promote only confirmed claims to the canonical dossier.

Gate: identity, belief, voice, and management questions can be answered from explicit curated records plus evidence.

### Phase 4 — current-state reconstruction

Goal: answer current project questions without rebuilding reality from raw threads each time.

Actions:

- create compact snapshots only for active/evaluator-relevant projects;
- derive candidates from the latest relevant email, meeting, calendar, and manual records;
- separate fact, commitment, decision, risk, next action, and hypothesis;
- record owner and due date only when explicit;
- keep “waiting for X” distinct from “Robert owes X”;
- expire or mark stale snapshots rather than silently refreshing them;
- review current-state changes in small batches;
- define one delimited managed weekly-state block per active Project file;
- run the weekend Project-steward loop against the previous seven days and next seven to fourteen days;
- replace the previous managed block after approval instead of appending weekly prose;
- propose stable-description and status changes as separate evidence-backed diffs that cannot overwrite human-owned text automatically.

Gate: current-status evaluator answers cite the latest source and flag stale or conflicting state.

### Phase 5 — source-specific ingestion and promotion

Goal: stop making the corpus noisier than the professional model.

Gmail:

- remove “outbound to any known person = durable memory” as the default;
- retain explicit user labeling and evaluator-driven promotion;
- store message boundaries, authors, and dates when a thread is retained;
- preserve manually reviewed metadata during refresh;
- generate a compact delta for new messages instead of repeatedly treating the whole thread as new truth.

Fireflies:

- keep transcript evidence outside the main answer payload;
- extract decisions, commitments, disputed points, and unresolved questions with line/time pointers;
- require explicit evidence for “we decided.”

Calendar:

- classify professional, personal, habit, and task-placeholder contexts;
- never convert an event into completion;
- use attendee/title/project matches as routing hints only.

References:

- keep reference summaries in a separate retrieval class;
- require an attached reflection to influence “what Robert believes.”

Gate: new evidence can enter without automatically changing canonical truth.

### Phase 6 — question router and evidence packets

Goal: retrieve according to truth need.

Router classes:

- deterministic metadata/count;
- current state;
- historical event;
- identity/relationship;
- belief/decision history;
- voice generation;
- management simulation;
- exploratory synthesis.

Evidence packet rules:

- use `quick_lookup` for counts and exact filters;
- use canonical dossiers first for identity/current state;
- use lexical + vector search to find supporting evidence;
- retrieve only matched chunks or bounded lines;
- include source/effective date and evidence tag;
- include conflicting or newer records;
- keep outside references out of belief answers unless endorsed.

Gate: top-level answer context stays compact and every important claim is traceable.

### Phase 7 — evaluator-driven iterations

Goal: improve only demonstrated failure modes.

Metrics:

- answer claim precision;
- required-claim recall;
- freshness compliance;
- contradiction detection rate;
- correct abstention rate;
- entity accuracy;
- retrieval recall@k;
- evidence packet size/latency;
- voice pairwise preference win rate;
- management decision match rate.

Iteration rule:

1. Use the evaluator-gardener to propose questions from reviewed failures, new entities, changed Projects, contradictions, and coverage gaps.
2. Let Robert select, rewrite, answer, and activate only 2–3 at a time.
3. Add and review approved questions continuously.
4. Freeze a test slice.
5. Identify the largest failure category.
6. Make the smallest change that targets it.
7. Re-run all active questions.
8. Reject changes that improve a demo but regress held-out questions or evidence quality.

Gate for any learning/ranking loop: at least 100 stable, human-reviewed question versions and repeated evidence that manual routing/curation is the bottleneck. Until then, a learned ranker is premature.

### Phase 8 — optional interface and automation

Only after the above gates:

- evaluator review UI;
- morning People/Project/Topic candidate queue;
- weekend Project-state diff queue;
- evaluator-gardener proposal queue;
- claim/source inspector;
- voice exemplar picker;
- contradiction/supersession review;
- scheduled stale-state reminders;
- proposal-only morning and weekend triggers after the manual loops prove useful.

Do not add an autonomous cleanup cron. A future scheduler may start the bounded skills specified in `docs/suggested-loops-and-skills.md` and surface proposals, but canonical entity admission, stable-description changes, Topic scope, and evaluator gold answers require review.

## 9. Likely implementation touchpoints, only after evaluator approval

| Area | Existing file/capability | Minimal likely change |
| --- | --- | --- |
| Baseline/evaluator | `scripts/prove-brain.js` | accept evolving question schema, record answer/evidence/user labels |
| Loop contracts | `docs/suggested-loops-and-skills.md` | manually validate the three bounded loops before installing skills or schedules |
| Credential containment | `cron/gmail-intake.js`, `agent/tools/gmail-clean.js` | source-boundary redaction and exposure reporting |
| Truth metadata | `server/routes/capture.js`, Qdrant payload | provenance, epistemic state, validity/review fields while preserving old records |
| Temporal model | `server/effective-date.js` | keep event time and add validity/review semantics rather than overloading one date |
| Canonical dossiers | `People/Me.md`, `Projects/*.md`, future `Topics/*.md`, `server/drive-context.js` | structured status/review fields, controlled Topics, and selective context use |
| Entity discovery | Gmail/Calendar/Fireflies tools + Drive aliases | bounded candidate detection with a human map/create/reject/defer review step |
| Project stewardship | active `Projects/*.md` + source evidence | replace one managed weekly block; propose human-owned description/status diffs separately |
| Refresh integrity | `refreshCapture()` | preserve user-reviewed metadata/claims; update evidence separately |
| Question routing | `server/routes/search.js`, MCP registration | route by answer type and return bounded evidence packets |
| Health | `server/brain-health.js` | stale canonical claims, secret exposure, missing provenance, unresolved conflicts |
| Exact facts | `quick_lookup` | reuse; add only evaluator-proven filters |
| Long evidence | `get_thought` slices/chunks | reuse instead of returning full records |

No code should be designed from this table alone. Each change starts only after its phase gate and a verified failure case.

## 10. What not to build in v1

- no new repository;
- no new vector database;
- no graph database merely to store claims;
- no fine-tuned personal model;
- no self-learning ranker;
- no nightly auto-merge or silent canonical rewrite;
- no automatic People, Project, or Topic creation from extraction output;
- no silent rewriting of human-owned Project descriptions;
- no universal “write like Robert” style prompt;
- no attempt to summarize every person and project before evaluator demand;
- no assumption that calendar completion, email transmission, or saved reference equals belief;
- no full-mailbox ingestion in the name of completeness.

## 11. Risks and countermeasures

| Risk | Countermeasure |
| --- | --- |
| Evaluator overfits to early questions | held-out slice, versioned questions, category balance |
| Robert’s answers evolve | `as_of`, question versioning, supersession rather than overwrite |
| A polished model hides missing evidence | claim-level pointers and explicit unknowns |
| Voice model becomes a caricature | context-conditioned exemplars and pairwise human choice |
| Raw mail exposes secrets | ingestion redaction, existing-corpus scan, sensitive-data tests |
| Canonical docs become another stale layer | freshness SLA, review date, stale-answer behavior |
| Morning discovery becomes a noise inbox | bounded recent window, maximum candidate batch, remembered rejections, deterministic matching first |
| Topic vocabulary grows into free tagging again | canonical `Topics/`, inclusion/exclusion definitions, no Project/client/person labels, monthly scope review |
| Weekly summaries hallucinate progress | explicit source rules, Project-by-Project diffs, human approval, “no verified change” allowed |
| Project files grow without bound | replace one managed block; preserve history in source evidence rather than appended weekly prose |
| Evaluator gardener teaches the Brain its own lies | human gold answers, versioning, held-out slice, no self-approval |
| External ideas become “Robert believes” | reference isolation and reflection-based promotion |
| Cleanup destroys history | immutable evidence, reversible merge proposals, no automatic deletion |
| Project snapshots become busywork | maintain only active/evaluator-relevant dossiers |

## 12. Review protocol with Robert

Each review session should stay small:

1. Present 2–3 evaluator questions with the current answer and evidence.
2. Robert marks each correct, partly correct, wrong, or correctly unknown.
3. If wrong, capture the failure tag and corrected claim—not just a preferred rewrite.
4. Ask whether the correction is timeless, current as of a date, or valid only in a context.
5. Update the canonical record only after confirmation.
6. Re-run the same questions plus held-out questions.

The question bank is allowed to evolve. Old versions remain in the audit trail so improvement cannot be manufactured by moving the target invisibly.

Entity and Project stewardship uses the same small-batch rhythm: review a few morning candidates or one Project diff at a time. The recurring-task contracts, truth rules, and stop conditions are specified in `docs/suggested-loops-and-skills.md`.

## 13. Definition of done for the first major upgrade

The first major upgrade is complete when:

- sensitive authentication material is absent from the answer path;
- the evaluator contains at least 30 active, human-reviewed questions across all major categories;
- self and high-value entity aliases are canonical;
- People, Projects, and Topics have separate controlled registries and unknown candidates require review;
- active projects have compact, reviewed current-state records;
- the weekly Project pass replaces a managed state block without growing the dossier or rewriting human-owned descriptions silently;
- the self dossier, operating manual, voice modes, and management case library exist with evidence;
- current, historical, belief, voice, and management questions route differently;
- every material answer claim has evidence or is labeled inference/unknown;
- historical facts survive supersession;
- held-out evaluator results improve materially over baseline without larger unsupported-claim rates;
- and the maintenance burden is low enough that Robert continues the 2–3-answer review rhythm.

## 14. Updated immediate next decision

The next implementation-sized decision remains a manual, bounded stewardship trial:

1. finish the sensitive-data exposure audit;
2. define the first evaluator file and grade the first 2–3 answers;
3. define the initial `Topics/` contract and curate a small seed vocabulary from useful existing tags;
4. dry-run `/wiki-steward` over a bounded recent Gmail and Calendar window and review only the clearest candidates;
5. draft one active Project's replaceable weekly-state block from dated evidence;
6. run `/evaluator-gardener` on the reviewed answer corrections and activate only Robert-approved questions.

No schedule should be created yet. Morning and weekend triggers become a separate decision only after repeated manual passes demonstrate acceptable candidate quality, Project-diff accuracy, stopping behavior, and review load. The remaining phases are sequenced options, not a single large feature commitment.

## 15. Planning review

- Inspected the current repository architecture, capture/refresh/search paths, health checks, and retrieval proof harness.
- Audited the live Brain structurally and sampled identity, operating-principle, career, and current-work evidence.
- Inspected non-backup People and Projects files in the local Drive mirror.
- Sampled bounded recent Gmail sent/work/Brain-labeled threads and the primary Calendar from 2026-01-01 through 2026-07-18.
- Kept observed facts, counts, hypotheses, and proposed target-state rules distinct throughout the plan.
- Added the stewardship layer, controlled Topic registry, compact weekly Project replacement model, and evaluator-gardener loop in `docs/suggested-loops-and-skills.md`.
- Made no production, ingestion, or application-code changes. Implementation remains gated by human evaluator evidence and sensitive-data containment.
