# Claude Desktop (Cowork) scheduled tasks — stewardship loops

Date: 2026-07-18
Status: handoff spec. Robert creates these in Claude Desktop himself. Both
scheduled tasks are **proposal-only** — they write nothing anywhere; output
lands in the task's chat for review. This satisfies the "read and propose only"
scheduling boundary in `docs/suggested-loops-and-skills.md` without granting
any automatic authority.

Setup notes:
- The brain connector must be named `brain` — a dot in the connector name
  breaks tool namespacing (burned us before).
- Connectors needed: **brain**, **Gmail**, **Google Calendar**.
- Enable Task 1 only after at least one manual pass looked sane
  (first one ran 2026-07-18 → `tasks/stewardship/candidates-2026-07-18.yaml`).
- Rejection memory: Desktop tasks cannot read this repo. After each reviewed
  pass, the Claude Code session captures a `Steward decisions <date>` synthesis
  thought into the brain; the morning task reads it first and suppresses
  remembered noise.

## Task 1 — Morning wiki-steward (weekdays 08:00 Europe/Budapest)

Prompt:

> Run a morning wiki-stewardship pass over my professional evidence. First,
> search the brain for the most recent thought titled "Steward decisions" and
> treat every rejection in it as noise to suppress. Then scan Gmail and
> Calendar since the previous weekday, plus recent brain captures
> (list_recent), for People, Projects, or Topics not in my registries. Match
> in this order: exact name → known alias/email → deterministic normalization
> (accents, name order) → semantic suggestion → unknown. Show at most 5
> highest-signal candidates, each with: type (person/project/topic), name,
> evidence pointers, why detected, possible existing matches, and suggested
> action (map / create / reject / defer / needs-context). Rules: being emailed
> ≠ relationship, a calendar invite ≠ attendance, a repeated phrase ≠ a Topic;
> exclude personal events, automated senders, newsletters, and any credentials
> or one-time codes. Do NOT create, merge, or write anything anywhere —
> propose only, in chat. If there are no candidates, say so and stop.

## Task 2 — Weekend project-steward (Saturdays 09:00 Europe/Budapest)

Prompt:

> Draft the weekly working-state refresh for my active Projects, one at a
> time. For each active project: gather evidence from the last 7 days (Gmail,
> Fireflies via the brain's get_fireflies_transcripts, Calendar, brain
> captures) and explicit plans for the next 7–14 days. Draft a replacement
> "Current working state" block: what changed (evidence-backed only),
> decisions and commitments in force (owner+date only when explicit), planned
> next 7–14 days (committed/scheduled only), risks/blockers/open questions,
> current people, evidence pointers, and a valid-as-of date. Rules: an email
> proves communication not completion; a calendar event proves intent not
> execution; "done" needs explicit completion evidence; no recent evidence
> means "no verified change", which is a valid result. Show conflicts instead
> of letting the newest text win. Do NOT write to any file — output the draft
> blocks in chat for my review.

## Task 3 — Commitment steward (weekdays 07:30 Europe/Budapest) — added 2026-10-10

Unlike Tasks 1–2, this one **writes after approval in the same chat**: it
proposes, Robert answers in the task's chat ("mehet", or "mehet, kivéve a
3-ast"), and only then it calls `save_commitments`. Nothing is saved without
that answer. Rejection memory needs no extra thought here: dropped items are
stored as `status: dropped` with evidence, and reviewed thoughts carry
`candidates_reviewed_at`, so they don't come back.

Connectors: **brain** (the Claude tokens are unrestricted, so `save_commitments`
— scope `curate` — is available), **Google Drive** (to read Grok's sheet).
The rules below are a condensed copy of the repo skill
`.claude/skills/review-commitments/SKILL.md` — Desktop tasks can't read the
repo, so **when the skill changes, update this prompt too.**

Prompt:

> Run my commitment-steward pass. Commitments live in the brain (tools:
> list_commitments, list_commitment_candidates, save_commitments); thought
> action_items are only loose candidates.
>
> 1. list_commitments({}) to see what is live. Then
>    list_commitment_candidates({limit: 20}), page by page until total is 0.
> 2. Turn candidates into a proposal. Keep: my own commitments (owner "Me")
>    and things others owe me (owner = them, counterparty includes "Me",
>    status waiting). Drop: other people's tasks among themselves, plain
>    descriptions, calendar routine, and repo feature requests (those belong
>    in the repo's task list — just mention them). Split by deliverable, not
>    by email thread: a new brief in an old thread is a new commitment. Read
>    the whole thread — a later message can cancel an earlier ask; quote it
>    and ask me. Merge only the same deliverable said again; the daily
>    calendar/Teams summary notes restate items — use the email, meeting or
>    calendar event as sources[0], not the summary note.
>    Fields: title (one-line action), kind (penz | jog | ugyfel | belso), due
>    only if a source states it, event_ref when tied to an event, sources
>    with a verbatim quote and ref (Gmail thread id, Fireflies meeting id,
>    calendar event id, or thought id for manual notes).
> 3. Closing: if a meeting happened (its Fireflies transcript exists), propose
>    done for its RSVP/prep items with evidence "fireflies:<id>". An open
>    commitment whose event ended is expired. A deadline that passed with no
>    evidence — ask me, don't guess.
> 4. Compare with Grok's PM slip watch (Google Drive, spreadsheet
>    1fdj1UaMXS5kjXLuV1BeVmP8e1gSRfu15f0Hdzt5sNIo, tabs ERSTE, Telekom,
>    Grafia) — READ ONLY, never edit it. Match its pointer column (gmail:…,
>    cal:…) to sources[].ref. Report: how many agree; status differences
>    (show both, ask me); rows only in the sheet (propose as new, slipped
>    first); items only in the brain (list them — Grok may have missed them).
>    If the sheet read returned fewer rows than its table range, say so.
> 5. Post, most urgent first: TODAY's KÖVETKEZŐ list (overdue, due in 3 days,
>    then fresh undated requests from the last few days), then the proposal
>    (new / merge / status change), then the slip-watch comparison. Keep it
>    compact.
> 6. Wait for my answer in this chat. Only after I say "mehet" (with any
>    exceptions I name) call save_commitments: by "human" for statuses I set,
>    evidence filled, reviewed_thought_ids = every thought you accounted for.
>    Report saved/failed. If I don't answer, save nothing.
> If there is nothing new and nothing changed, post only the KÖVETKEZŐ list.

## Not scheduled — evaluator-gardener

Its trigger is "after you grade a batch", not a clock. Run manually in any
session after grading:

> Based on my last graded evaluator batch (tasks/evaluator/runs/) and any
> newly admitted People/Projects/Topics, propose 3–5 candidate evaluator
> questions with reason, category, suggested sources, and freshness
> expectation. Do not write gold answers — I supply those.

## Applying approved proposals

Robert applies approved diffs in a Claude Code session (Drive file edits,
registry changes, evaluator activation), which also:
1. records decisions in `tasks/stewardship/candidates-<date>.yaml`, and
2. captures the compact `Steward decisions <date>` synthesis to the brain
   (the rejection memory Task 1 reads next morning).
