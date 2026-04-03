> **ARCHIVED** — see [ROADMAP.md](../../ROADMAP.md) for current state

# Continuous Context Engine — E opció MVP
## MCP tools a meglévő customBrain szerveren → D upgrade path (All Phases Completed 2026-04-03)

---

## Feloldott ellentmondások

### 1. Külön repo vs meglévő repo
- **todo-v2**: külön `customBrain-agent` repo, külön szerver (:3001)
- **alternatives E**: meglévő mcp.js-be új tool-ok
- **Döntés**: Meglévő customBrain repo, `agent/` mappa. NINCS külön szerver.
  Az E opció lényege hogy nulla új infra. Az MCP tool-ok a meglévő Express/MCP process-ben futnak.
  Ha kinőjük → D-nél válhat külön.

### 2. Draft-ok hol élnek
- **todo-v2**: JSON fájlok vagy SQLite, review web UI-val
- **alternatives E**: draft-ok a Claude Desktop beszélgetésben (elvesznek ha bezárod)
- **Döntés**: Egyszerű JSON fájl persistence (`agent/drafts/` mappa), DE nincs review web UI.
  A review Claude Desktop-ban történik. A JSON csak biztonsági háló: ha bezárod a chat-et, 
  a pending draft-ok megmaradnak, következő alkalommal `get_pending_drafts` visszaadja őket.
  ~40 sor kód, megéri a biztonságot.

### 3. YouTube + X bookmarks mikor
- **todo-v2**: Phase 7 (jövő hét)
- **alternatives E**: benne az MVP-ben
- **Döntés**: YouTube benne az MVP-ben (a GCP OAuth2 már van, csak scope kell).
  X/Twitter API NINCS — a Chrome web clipper kiváltja. Bármilyen oldalon (X, LinkedIn, blog)
  egy kattintással brain-be küldhetsz tartalmakat. Nincs $100/hó API költség, és univerzálisabb.

### 4. Claude hol processzál
- **todo-v2**: az agent szerver hívja a Claude API-t, a draft kész eredményként jön
- **alternatives E**: az MCP tool hívja a Claude API-t
- **Döntés**: Az MCP tool-ok CSAK nyers adatot adnak vissza (transcript, video info, email).
  A Claude Desktop MAGA dolgozza fel — ő a "processzor". Egyszerűbb, olcsóbb, látod mi történik.
  A brain context (People/, Projects/) a meglévő search tool-lal érhető el.
  Ez azt jelenti: NINCS ANTHROPIC_API_KEY az MCP tool-okban, nincs "Claude hív Claude-ot".

### 5. State-aware vs event-driven
- **todo-v2**: cron-alapú intake
- **alternatives**: a naptár "él", nem event stream
- **Döntés**: E opcióban te vagy a "cron" — reggel mondod Claude-nak hogy dolgozza fel.
  D upgrade-nél jön a valódi cron, de az is state-polling lesz, nem webhook.

### 6. Gmail intake mikor
- **todo-v2**: Phase 6 (jövő hét)
- **Döntés**: Benne az MVP-ben mint MCP tool, mert a GCP OAuth2 bővítés úgyis kell
  a Calendar-hoz, és a Gmail search a context assembly-hez is fontos.

---

## Ami épül: 6 új MCP tool a meglévő brain szerveren

```
customBrain/                        (meglévő repo, bővítve)
├── server/
│   ├── index.js                    (meglévő — minimál módosítás: agent tools regisztrálás)
│   ├── mcp.js                      (meglévő — új tool-ok hozzáadása)
│   ├── ...                         (meglévő fájlok — ne nyúlj hozzá)
│   └── tools/                      (meglévő mappa)
│       ├── search.js               (meglévő)
│       ├── recent.js               (meglévő)
│       └── ...                     (meglévő)
├── agent/                          (ÚJ mappa — minden új kód ide)
│   ├── tools/
│   │   ├── fireflies.js            ~60 sor: Fireflies GraphQL → nyers transcript-ek
│   │   ├── youtube.js              ~50 sor: YouTube liked videos → video info + captions
│   │   ├── gmail.js                ~50 sor: Gmail search → email szálak
│   │   ├── calendar.js             ~50 sor: Calendar events → napi/heti bejegyzések
│   │   ├── context.js              ~60 sor: event title → brain + gmail + fireflies összegyűjtés
│   │   └── task-decompose.js       ~40 sor: task title → brain context → lépések struktúra
│   ├── drafts/
│   │   └── store.js                ~40 sor: JSON file CRUD (pending/approved/rejected)
│   └── register.js                 ~30 sor: az összes agent tool regisztrálása az MCP-be
├── extension/                      (ÚJ — Chrome web clipper)
│   ├── manifest.json               Manifest v3
│   ├── popup.html                  ~80 sor: preview + edit + brain context + save gomb
│   ├── popup.js                    ~100 sor: extract → brain search → preview → capture
│   ├── content.js                  ~40 sor: page → markdown kinyerés (Readability-szerű)
│   └── icons/                      16x16, 48x48, 128x128
├── cron/
│   ├── export.js                   (meglévő)
│   └── ...
└── .env                            (bővítve az új API key-ekkel)
```

**Összesen: ~600 sor új kód, 0 új szerver, 0 új dependency.**

---

## A 6 új MCP tool

| Tool | Input | Output | Mire jó |
|------|-------|--------|---------|
| `get_fireflies_transcripts` | since_date | Nyers transcript-ek: title, date, participants, full text | Meeting intake |
| `get_youtube_likes` | since_date | Liked videók: title, channel, description, captions ha van | Tudás intake |
| `get_gmail_threads` | query, max_results | Email szálak: subject, from, date, body | Email intake + context |
| `get_calendar_events` | date_range | Naptár bejegyzések: title, time, attendees, description | Context + task felismerés |
| `get_event_context` | event_title, attendees? | Brain search + Gmail + Fireflies eredmények összegyűjtve | Naptár context card |
| `manage_drafts` | action (list/save/approve/reject), data? | Draft CRUD JSON store-ban | Draft persistence |

A meglévő `search_brain` és `capture_thought` tool-ok megmaradnak — az approve flow végén a `capture_thought` megy.

---

## A napi flow (E opcióval)

```
Reggel, Claude Desktop:

Te: "Dolgozd fel a tegnapit"
Claude: [get_fireflies_transcripts(yesterday)]
        [get_youtube_likes(yesterday)]
        [get_calendar_events(today)]  ← mai napra context
        [search_brain("People/")]     ← brain context a feldolgozáshoz

Claude: "2 meetinged volt tegnap, 1 YouTube videót lájkoltál.

  1. ERSTE genz meeting (45 perc, Kata + Péter)
     [Claude maga összefoglalja a transcript-et a brain kontextussal]
     Javaslat: 'Mood board v2 elfogadva, TikTok irány erősítése'
     Eredeti részlet: 'Kata: szerintem a TikTok irány erősebb...'
     → Jóváhagyod?

  2. YouTube: 'MCP Server Reverse Proxy' (AI Jason)
     [Claude maga összefoglalja]
     🔗 Mai naptáradban van: MCP Matrix feladat
     → Jóváhagyod?"

Te: "1-nél Kata javasolta nem kérte. 2 is OK."
Claude: [capture_thought(...)] × 2  ← javított szöveggel brain-be
        [manage_drafts(save, approved_log)]  ← audit trail
```

### Web clipper flow (napközben, bármikor)

```
LinkedIn-en olvasol egy posztot MCP architektúráról:

1. Kattintasz a brain extension ikonra
2. Popup megjelenik:
   - Kinyert markdown (cím, szerző, szöveg, link)
   - Brain cross-reference: "🔗 Kapcsolódó: MCP Matrix feladat, AI Jason videó"
   - Szerkeszthető összefoglaló mező
   - [Save to Brain] gomb
3. Opcionálisan szerkeszted az összefoglalót
4. Save → POST /capture → brain-ben, Obsidian-ban, cross-linked

Ugyanez működik: X tweet, blog cikk, GitHub repo, HN thread, bármi.
Ez kiváltja az X/Twitter API-t — nem kell $100/hó, mert TE jelölöd meg amit értékesnek tartasz.
```

---

## Phases

### Phase 1: Projekt setup + OAuth2 scope bővítés — DONE (2026-04-03)
- [x] `agent/` mappa létrehozása a customBrain repo-ban
- [x] GCP projekt: Gmail API + Calendar API + YouTube Data API v3 engedélyezés
- [x] OAuth2 refresh token újragenerálás a bővített scope-okkal
- [x] .env bővítés: FIREFLIES_API_KEY + friss refresh token (lokál + Hetzner)
- [x] `agent/register.js` — 7 tool regisztrálva (z paraméterként átadva, zod v3)

### Phase 2: Fireflies MCP tool — DONE (2026-04-03)
- [x] `agent/tools/fireflies.js` — GraphQL client, native fetch
- [x] Tool regisztráció az MCP-ben
- [x] Teszt: Fireflies működik ✓

### Phase 3: YouTube + Gmail + Calendar MCP tools — DONE (2026-04-03)
- [x] `agent/tools/youtube.js` — liked videos + captions
- [x] `agent/tools/gmail.js` — thread search + body decode
- [x] `agent/tools/calendar.js` — events + likely_type heuristic
- [x] Calendar tesztelve Claude Desktop-ból — 7 event visszajött ✓
- [x] Gmail tesztelve ✓
- [x] YouTube tesztelve ✓

### Phase 4: Context assembler + Draft store — DONE (2026-04-03)
- [x] `agent/tools/context.js`
  - `get_event_context(event_title, attendees?)` tool
  - Lépések:
    1. `search_brain(event_title)` — meglévő brain search hívása (belső HTTP)
    2. `get_gmail_threads(event_title)` — kapcsolódó emailek
    3. `get_fireflies_transcripts` szűrve azonos cím/résztvevők
  - Output: összegyűjtött források, NEM feldolgozva — Claude Desktop dolgozza fel
    ```json
    {
      "brain_results": [...],
      "related_emails": [...],
      "past_meetings": [...],
      "event_info": { "title": "...", "attendees": [...] }
    }
    ```
- [x] `agent/drafts/store.js` — JSON CRUD (list/save/approve/reject)
- [ ] Draft store tesztelve — **NINCS TESZTELVE** (lásd lent)

### Phase 5: Task context tool — DONE (2026-04-03)
- [x] `agent/tools/task-context.js` — brain search scoped to task
- [x] Összes tool regisztrálva az MCP-ben (`agent/register.js` — 12 tool összesen)
- [ ] Task context tesztelve — **NINCS TESZTELVE** (lásd lent)

### Phase 6: Chrome web clipper extension — DONE (2026-04-03)
- [x] `extension/manifest.json` — Manifest v3
- [x] `extension/popup.html + popup.js` — preview + brain cross-ref + save
- [x] `extension/icons/` — 16, 48, 128px PNG-k
- [x] Chrome-ba betöltve developer mode-ban
- [x] Tesztelve: X poszt → clipper → Save to Brain → megjelenik ✓
- [x] Related in brain: search eredmények megjelennek (title fallback fixelve)

### Phase 7: End-to-end teszt + deploy — DONE (2026-04-03)
- [x] Hetzner deploy: git pull, npm install, pm2 restart
- [x] Remote MCP: `npx mcp-remote` bridge → Claude Desktop csatlakozik Hetznerhez
- [x] Calendar tesztelve production-ben: 7 event visszajött ✓
- [x] capture_thought tesztelve MCP HTTP-n keresztül ✓
- [x] brain_stats + list_recent + search_brain MCP-n keresztül ✓
- [ ] Egy valódi napi ciklus végigpróbálása:
  1. Reggel: "dolgozd fel a tegnapit" → Fireflies + YouTube
  2. Review a beszélgetésben → javítás → approve → brain-be kerül
  3. Napközben: X-en/LinkedIn-en látsz valamit → extension → brain-be
  4. Meeting előtt: "mi a kontextus az ERSTE meeting-hez?" → context card
  5. Task: "bontsd le az MCP Matrix feladatot" → brain context → lépések

---

## D upgrade path (ha kiderül hogy kell automatizálás)

Amikor zavar hogy reggel neked kell emlékezned:

```
Bővítés (nem újraírás):
├── cron/
│   └── intake.js              ÚJ: ~30 sor, meghívja az agent tool-okat programból
│                              (ugyanaz a kód, cron-ból hívva, nem MCP-ből)
├── agent/
│   └── notify.js              ÚJ: ~30 sor, nodemailer email értesítés
│   └── review-server.js       ÚJ: ~60 sor, minimál Express review UI (opcionális)
```

- A tool-ok kódja UGYANAZ marad — csak a hívó változik (cron vs Claude Desktop)
- Crontab: `0 6 * * * cd /customBrain && node cron/intake.js`
- Email: "3 új draft — review: [link]" VAGY továbbra is Claude Desktop-ban

---

## NEM MOST (A upgrade, ha kinőjük)

- Külön agent.beliczki.hu szerver (:3001)
- Regression detection (Phase 9 a todo-v2-ből)
- Chrome extension Calendar popup (naptár bejegyzésre kattintva context card)
- Email reply-ból approval

---

## Kockázatok

| Kockázat | Megoldás |
|----------|----------|
| OAuth2 scope bővítés eltart | Egy alkalommal kell, utána refresh token megy |
| Fireflies transcript túl hosszú (15k+ token) | Claude Desktop 200k context, nem gond |
| YouTube captions API bonyolult | Fallback: csak title + description, caption nélkül |
| X/Twitter API drága | Web clipper kiváltja — bármilyen oldalról capture, nincs API költség |
| Claude Desktop context túl hosszú sok meeting-gel | manage_drafts elmenti, több session-ben dolgozod fel |
| Meglévő brain szerver stabilitás | agent/ mappa izolált, a meglévő kódot NEM módosítjuk (csak mcp.js tool regisztráció) |

---

## Becslés

| Phase | Idő | Mit kapsz |
|-------|-----|-----------|
| 1. Setup + OAuth2 | ~1 óra | API-k elérhetők |
| 2. Fireflies tool | ~1.5 óra | Meeting transcript-ek Claude-ból |
| 3. YouTube + Gmail + Calendar | ~2 óra | Liked videók, emailek, naptár |
| 4. Context + Drafts | ~1.5 óra | Naptár context card, draft persistence |
| 5. Task decomposer | ~1 óra | Feladatbontás brain kontextussal |
| 6. Chrome web clipper | ~2 óra | Bármilyen weboldalról brain-be, Pinterest-szerűen |
| 7. E2E teszt + deploy | ~1 óra | Működő rendszer production-ben |
| **Összesen** | **~10 óra** | **Teljes E opció + univerzális web clipper** |

---

## Review
_A megvalósítás után kitöltendő_
