# Topics seed vocabulary — LIVE since 2026-07-18

Status: LIVE. These 8 topics (42 aliases) are canonical and active in capture-time
canonicalization on Hetzner.

- Drive folder: `Topics/` id `1oGc8NmXzMIiSsW0dPRF7t5y6LBRJ4qAL` (under the shared
  `_customBrain` parent, so the service account sees it by inheritance).
- Setting: `GOOGLE_DRIVE_TOPICS_ALIASES_FOLDER_ID` set in Hetzner `state/settings.json`.
- Verified: `getVaultContext()` loads 8 canonical topics / 42 aliases via SA.

The Drive files are now the source of truth (human-owned, like People/Projects).
Edit them directly in Drive; these local copies are a mirror of the seed, not canonical.

Two aliases to eyeball (judgment calls I made):
- `Claude Code` → topic `AI agents`. Fold in, or split into a dedicated "AI coding tools" topic?
- Trimmed before go-live: `mesterséges intelligencia` was removed from `AI adoption`
  aliases (too generic — would over-tag every AI-general capture).

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
