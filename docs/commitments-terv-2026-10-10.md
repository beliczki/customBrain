# `commitments` collection — implementációs terv

**Dátum:** 2026-10-10 · **Állapot:** terv, jóváhagyásra vár · **Verzió:** 0.53.0 (minor: új collection, új MCP toolok)
**Alap:** [döntés-előkészítő](vallalas-reteg-dontes-2026-10-10.md) — D1–D5 elfogadva két módosítással: bizonyítékkal lezárás v1-ben, `kind` mező.

## 1. Mit épít, mit nem

**Épít:** külön Qdrant collection a vállalásoknak; három MCP tool (két olvasó, egy író); backup és restore mindkét collectionre.

**Nem épít (v1):**
- **Szerveroldali LLM-ítészt.** A jelöltekből a vállalást a session agentje rakja össze (ahogy a kézi próbában), Robi jóváhagyja, a szerver csak tárol. Ugyanaz a minta, mint a `summarize-long-thoughts` skillé: előfizetésből fizetett, sessionön belüli következtetés, nincs Haiku-hívás a szerveren.
- **Új cront.** Az `expired` státuszt olvasáskor számoljuk (az esemény elmúlt, és a státusz még `open`), nem háttérfolyamat írja.
- **A strukturált források automatikus betöltését** (ROADMAP-ok, repó-todo-k, naptár). A repó-backlog marad a repóban, és a Repos-dossziékon át látszik (a próba 4. tanulsága). Ez külön lépés, ha a csomag hiányolja.
- **UI-t.** A Search-csomag és a Graph-buborékok a ROADMAP-ben vannak, és erre épülnek.

## 2. Adatmodell

Collection: **`commitments`**. Vektorok: `dense` (3072, Cosine) + `bm25` sparse, ugyanaz a séma, mint a `thoughts_v2`-é. A dense vektor a jelölt ↔ vállalás párosításhoz (dedup) kell, a bm25 a szavas kereséshez. Az embedding szövege: `title` + az első forrás-idézet.

| Mező | Típus | Megjegyzés |
|---|---|---|
| `title` | string | egy sor, cselekvés: „Nyomdai verziók Emőnek" |
| `owner` | string | kanonikus People-név (Robi = a `Me.md` kanonikus neve) |
| `counterparty` | string[] | akinek / akitől |
| `projects` | string[] | Projects-whitelist, mint a capture-nél |
| `kind` | enum | `penz` · `jog` · `ugyfel` · `belso` |
| `status` | enum | `open` · `waiting` · `done` · `dropped` (az `expired` csak olvasáskor jelenik meg, lásd 4.) |
| `due` | date \| null | |
| `event_ref` | {calendar_event_id, start, end} \| null | eseményhez kötött vállalásnál; ebből jön az `expired` és a bizonyítékkal lezárás |
| `sources` | [{source, ref, quote, at}] | **legalább egy kötelező.** `source`: gmail · fireflies · calendar · repo · manual · session; `ref`: thread id / meeting id / event id / repo+path / thought id; `quote`: szó szerinti idézet |
| `candidate_refs` | [{thought_id, text}] | mely jelöltekből állt össze (dedup-nyom) |
| `status_history` | [{status, at, by, evidence}] | `by`: `human` · `agent` · `rule` |
| `created_at`, `updated_at`, `verified_at` | datetime | |

Payload-indexek: `status`, `owner`, `due`, `kind`, `projects`, `event_ref.end`.

**A jelölt-thoughton** egy új mező: `candidates_reviewed_at`. Egy thought újra a jelöltlistára kerül, ha nincs ilyen mezője, vagy ha az `updated_at` későbbi nála (pl. a Gmail-szál frissült). Ez kezeli, hogy a refresh újraírja az `action_items`-t: az új tartalom újra átnézésre kerül.

## 3. MCP toolok

| Tool | Scope | Mit csinál |
|---|---|---|
| `list_commitment_candidates` | `brain-read` | Az át nem nézett thoughtok `action_items`-e (`since` dátumtól), forrás-metaadattal (source, source_id, dátum, projects, people) + a még nyitott vállalások rövid listája, hogy az agent dedupolni tudjon. Lapozva. |
| `list_commitments` | `brain-read` | Szűrés: status, owner, project, kind, `due_before`. Az `expired` itt számolódik. Rendezés: lejárt / `due` szerint, azon belül `kind` (pénz, jog, ügyfél, belső). |
| `save_commitments` | `curate` | Kötegelt írás: új vállalás, módosítás, státuszváltás (bizonyítékkal), és a feldolgozott thoughtok `candidates_reviewed_at` bélyege. A `sources` nélküli vállalást elutasítja. |

Mindhárom tool bekerül a `server/mcp.js`-be **és** a `server/mcp-stdio.js`-be, valamint a `server/mcp-scopes.js`-be. A scope-gate a regisztrációkor eldob minden olyan toolt, amelyik nincs a térképen.

**Munkafolyamat** (a session agentje csinálja, Robi jóváhagy):
`list_commitment_candidates` → az agent a D2–D4 szabályok szerint összerakja a javaslatot (dedup, gazda, `kind`, `due`, `event_ref`, idézet; lezárási javaslat, ha van bizonyíték, pl. a meeting Fireflies-átirata) → Robi jóváhagyja → `save_commitments`.
Ezt egy rövid skill rögzíti (`review-commitments`, a `summarize-long-thoughts` mintájára), hogy minden session ugyanazokkal a szabályokkal dolgozzon.

## 4. Életciklus-szabályok

- **`expired` (rule):** ha `status = open`, van `event_ref`, és `event_ref.end < most`, akkor a `list_commitments` `expired`-ként adja vissza. A `save_commitments` véglegesítheti (`by: rule`).
- **Bizonyítékkal lezárás (v1-ben):** az agent javasol `done`-t evidence-szel (Fireflies meeting id, elküldött levél a szálban); Robi jóváhagyja. Automatikus írás nincs.
- **`waiting`:** az `owner` más, a `counterparty` tartalmazza Robit.
- Minden státuszváltás bekerül a `status_history`-ba. A vállalás nem törlődik, csak `dropped` lesz.

## 5. Backup és restore — ugyanabban a releaseben, nem utána

A 2026-09-12-i S1-hiba (118 éjszakán át a rossz collection mentése) miatt ez nem opcionális.

- `server/collections.js`: `export const COMMITMENTS = 'commitments'` + `export const BACKED_UP = [THOUGHTS, COMMITMENTS]`.
- `cron/qdrant-backup.js`: ciklus a `BACKED_UP` elemein. Collectionönként: pontszám-log, snapshot, letöltés, Drive-feltöltés. A rotáció a fájlnév-prefix szerint collectionönként külön fut, hogy a kis `commitments` snapshotok ne szorítsák ki a `thoughts_v2`-t.
- `scripts/restore-from-snapshot.js`: kötelező `--collection <név>` (ma implicit a `THOUGHTS`); a `--into` marad.
- **Igazolás deploy után:** egy kézi backup-futás, amelynek a logjában mindkét collection megjelenik a pontszámával, majd egy `commitments` restore próba-collectionbe a `--into` kapcsolóval, és darabszám-egyezés.

## 6. Init

`scripts/init-collection.js` a `commitments`-et is létrehozza (ugyanaz a vektorséma), és felveszi a 2. pont indexeit. Idempotens, mint ma.

## 7. Érintett fájlok

| Fájl | Változás |
|---|---|
| `server/collections.js` | `COMMITMENTS`, `BACKED_UP` |
| `server/commitments.js` | **új:** Qdrant-hozzáférés a `commitments`-hez (upsert, lapozott scroll, szűrés, expired-számítás), a jelöltek kigyűjtése |
| `scripts/init-collection.js` | második collection + indexek |
| `cron/qdrant-backup.js` | ciklus a collectionökön |
| `scripts/restore-from-snapshot.js` | `--collection` |
| `server/mcp.js`, `server/mcp-stdio.js` | 3 tool |
| `server/mcp-scopes.js` | 3 bejegyzés |
| `CLAUDE.md`, `CHANGELOG.md`, `ROADMAP.md`, root `package.json` | dokumentáció, 0.53.0 |
| `.claude/skills/review-commitments/` (vagy ahol a `summarize-long-thoughts` él) | munkafolyamat-skill |

Kilenc kódfájl. Ez a tárolási réteg természetes mérete, nem tünetkezelés. A `server/qdrant.js`-hez nem nyúlunk: az új modul saját kliensfüggvényeket kap, hogy a thoughts-útvonal változatlan maradjon.

Minden scroll lapozott (`next_page_offset` ciklus, ahogy a `scrollFilteredRaw`), így az 1000-soros csonkolás nem fordulhat elő.

## 8. Élesítés

1. Kód, majd helyben statikus ellenőrzés (szintaxis, scope-térkép teljessége).
2. Deploy a DEPLOYMENT.md szerint (`pm2 stop custombrain` → `fuser -k 3000/tcp` → `pm2 start custombrain`).
3. `npm run init` → a `commitments` létrejön, indexekkel.
4. Kézi backup-futás + restore próba (5. pont).
5. **Első feltöltés:** a kézi próba ~36 tétele, miután Robi jelölte, mi van kész. Ezután a `list_commitments` és a `list_commitment_candidates` éles ellenőrzése (a már átnézett 97 thought ne jöjjön vissza).

## 9. Nyitott apróság

- A skill helye: a `summarize-long-thoughts` most user-szintű skill. Ugyanoda kerüljön, vagy a repóba (`.claude/skills/`), hogy a repóval együtt verziózódjon? Javaslat: a repóba.
