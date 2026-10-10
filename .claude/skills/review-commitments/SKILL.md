---
name: review-commitments
description: Turn customBrain commitment candidates (thought action_items) into verified commitments — dedup, owner, kind, due, direct source with quote — get Robi's approval, and save them via the customBrain MCP. Also closes commitments on evidence. Use when the user wants to review action items, refresh the "what's next" list, or run a periodic commitment pass. Invoked manually as /review-commitments.
user-invocable: true
---

# /review-commitments — candidates → commitments

## Why this exists

Thought `action_items` are **candidates**: Haiku extracts them at capture, the
same item repeats across thoughts (the 2026-10-10 pilot found one RSVP in 5
thoughts), they mix other people's tasks and plain descriptions, carry no
status, and a Gmail refresh rewrites them. A **commitment** is a separate,
checked record in the `commitments` collection. Background:
`docs/vallalas-reteg-dontes-2026-10-10.md`, `docs/commitments-terv-2026-10-10.md`.

The judgment is yours (session inference); the server only lists and stores.
**Nothing is saved before Robi approves.**

## Tools (customBrain MCP)

- `list_commitment_candidates({ since?, limit?, offset? })` — unreviewed thoughts with their action_items + `live_commitments` for dedup.
- `list_commitments({ status?, owner?, project?, kind?, due_before? })` — the current list, urgency-sorted, `expired` derived.
- `save_commitments({ commitments, reviewed_thought_ids })` — batch write after approval.
- For evidence: `get_thought`, `quick_lookup` (e.g. `source: "fireflies"` on the event's date), `search_brain`.

## Rules

**Keep as a commitment:**
- **Robi's own** (`owner: "Me"`), something he does or decides.
- **Waiting on others** — someone owes Robi something: `owner` = that person, `counterparty` includes `"Me"`, `status: "waiting"`.

**Do not keep:**
- Other people's tasks among themselves that don't come back to Robi.
- Descriptions, observations, "watch for …" with no action.
- **Repo feature requests** (e.g. HINT-map changes from Miki/Balázs meetings) — they belong in that repo's task list, visible through its `Repos/` dossier. Mention them in the summary, don't save them.
- Calendar routine ("fill in the Telekom calendar").

**Dedup:** many candidates → one commitment. The daily calendar/Teams summary notes restate the same item day after day — merge them, keep every thought in `candidate_refs`, and use the most direct source (the calendar event, the email, the meeting) — not the summary note — as `sources[0]`.

**Split by deliverable, not by thread.** One email thread often carries several deliverables over weeks; a new brief arriving in an existing thread is a NEW commitment, not a sub-point of the old one (2026-10-10 pilot: a new currency-campaign brief got folded into the "Bird mutations" commitment and vanished). Merge only when it is the same deliverable said again.

**Read the whole thread for reversals.** A later message can cancel or change an earlier ask ("végül … nem kell ezzel elkészíteni"); candidates extracted from the thread often still list the original ask. Quote the reversal and ask Robi before keeping the item.

**Fields:**
- `title`: one line, an action ("Nyomdai verziók Emőnek").
- `kind`: `penz` (payment, invoice, contributions) · `jog` (legal, compliance, e.g. a THM value) · `ugyfel` (client delivery) · `belso` (everything else).
- `due`: only if a source states it. "péntekig" → resolve against the source's date.
- `event_ref`: when the commitment is tied to an event (RSVP, "before the meeting") — enables auto-`expired`.
- `sources`: ≥1, each with a **verbatim** `quote`. `ref`: Gmail thread id (`source_id` of a gmail thought), Fireflies meeting id, calendar event id, `repo:path#line`, or the thought id for manual notes.

**Closing on evidence** (offer, Robi confirms):
- The meeting happened → its Fireflies transcript exists → RSVP/prep commitments for it are `done` with `evidence: "fireflies:<meeting id>"`.
- The event passed without evidence → `expired` (`by: "rule"`).
- A deadline passed and nothing shows it was done → **ask**, don't guess.

## Workflow

1. `list_commitments({})` — know what's already live.
2. `list_commitment_candidates({ limit: 20 })` — one page at a time.
3. Build the proposal: new commitments, merges into existing ones (by id), status changes with evidence, and the list of dropped candidates grouped by reason.
4. Show it to Robi **in full**, most urgent first (overdue / due soon, then `kind`), and put **fresh undated requests** (asked in the last few days, no deadline) right after the dated ones — undated is not the same as not urgent. Ask about deadlines that passed without evidence.
5. After approval: `save_commitments` with `by: "human"` for statuses Robi set, and `reviewed_thought_ids` = every thought on the page you accounted for (including the ones whose candidates were all dropped).
6. Report saved / failed counts; fix and resend failed items. Loop to step 2 until `total` is 0.
7. **Compare with Grok's ledger** (below) and report the result.

## Comparing with Grok's ledger — never write into it

Two independent ledgers by decision (Robi, 2026-10-10): **Grok keeps its Google Sheets** (PM slip watch `1fdj1UaMXS5kjXLuV1BeVmP8e1gSRfu15f0Hdzt5sNIo`, tabs ERSTE / Telekom / Grafia), **the brain and Claude keep `commitments`.** Neither edits the other's. The value is the comparison: where they agree, both are confirmed; where they differ, each side learns what it missed.

Read the slip watch (read-only), match rows to commitments by `pointer` (`gmail:<thread>`, `cal:<event>`) ↔ `sources[].ref`, and report four groups:
- **Agree** — same item, compatible status (`mine_open`/`slipped`/`to_deliver` ↔ `open`; `waiting_on_other` ↔ `waiting`; `closed` ↔ `done`/`dropped`). Say how many; this is the good news.
- **Status differs** — same item, incompatible status. Show both sides and their last signal; ask Robi which is right. Fix only the brain side.
- **Only in Grok's sheet** — propose as new commitments (Robi approves, as usual). Rows Grok marks `slipped` first.
- **Only in the brain** — list them for Robi; Grok may have missed them (e.g. Teams-only items). Do not add them to the sheet.

The Drive connector may return only a sample of a sheet's rows — check the table range against the rows you got, and say so if the read was partial.
