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
