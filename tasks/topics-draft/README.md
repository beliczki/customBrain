# Topics seed vocabulary — DRAFT for review

Status: proposal only. Nothing here is live.

Go-live requires two explicit decisions by Robert:
1. Approve/edit these topic files, then move them to Drive `_customBrain/_meta/topics/`.
2. Set `GOOGLE_DRIVE_TOPICS_ALIASES_FOLDER_ID` in Settings (currently NOT configured
   on Hetzner — the 0.27.0 canonicalization mechanism is dormant). Once set, capture-time
   topic canonicalization activates for all new captures → minor version bump.

Contract: `aliases:` frontmatter is what `server/drive-context.js::listWithAliases`
parses (same as People/Projects). The Description/Includes/Excludes body is
human-readable scope definition per `docs/suggested-loops-and-skills.md`.

Curation rules applied:
- A Topic is never a Project, client, product, campaign, or person.
- Observed tag "Messaging Matrix" (8 uses) is a PRODUCT → belongs to project
  `Messaging matrix`, not a topic. Not seeded.
- Observed tag "személyi kölcsön" (7 uses) is an ERSTE product/campaign subject →
  belongs to project `ERSTE Személyi kölcsön`, not a topic. Not seeded.
- Observed tag "DCO státusz" (8 uses) is a status-phrase → alias of topic `DCO`.
- "Claude Code" (19 uses, top tag) is a tool name → alias under `AI agents`
  tooling scope rather than its own topic; flag for Robert if he prefers a
  dedicated "AI coding tools" topic.

Seeded from brain_stats top tags (2026-07-18) + recent capture metadata.
