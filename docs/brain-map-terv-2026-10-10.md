# `brain_map` — implementációs terv

**Dátum:** 2026-10-10 · **Állapot:** jóváhagyva, 0.56.0 kódban kész (deployra vár) · **Spec:** [ontológia és helyzetcsomag](ontologia-es-helyzetcsomag-spec-2026-10-10.md), 6/3. lépés · ROADMAP munkasor 4.

## Mit csinál

Egy MCP tool, ami egy kérdésre (vagy horgonyra) visszaadja a spec 4. pontja szerinti csomagot: HORGONYOK · HELYZET · ELŐZMÉNYEK · KÖVETKEZŐ · HÁTTÉR · HIÁNYOK · TOVÁBB. **Csak összerak, nem keres újat:** minden szekciót egy meglévő függvény tölt, a tool csak hivatkozásokat és egysoros leírásokat ad, teljes szöveget nem.

Bemenet: `question?`, `project?`, `person?`, `days_back?` (alapból 60), `days_ahead?` (alapból 7). Legalább egy kell a három közül.

## Szekciók, és mi tölti őket

| Szekció | Forrás (meglévő) | Tartalom |
|---|---|---|
| HORGONYOK | `getVaultContext` + `resolveAliases` | projekt(ek), ember(ek), téma. Projektenként: van-e Repos-dosszié/repó (`repos-status.json` `project` mezője), van-e `drive_folder` (Files-katalógusban van-e hozzá Drive-fájl) |
| HELYZET | `state/repos-status.json`, `findFiles({project})` | repó: verzió, utolsó commit, drift · a projekt legutóbbi N fájlja |
| ELŐZMÉNYEK | `quickLookup({project/person, since})` + `searchThoughts(question)` | idővonal, dátum szerint: dátum · type · source · cím · thought id. Kettő összefésülve, id szerint deduplikálva |
| KÖVETKEZŐ | `listCommitments` (open/waiting/expired) + agenda-cache (`readAgendaCache`) | vállalások horgonyra szűrve (projekt, vagy owner/counterparty az emberre) · közelgő események, amelyek `detected_projects`/`projects` vagy résztvevő alapján a horgonyhoz tartoznak |
| HÁTTÉR | ugyanaz a `searchThoughts` találatlista | `type=synthesis`/`decision`, dossziék (`canonical_dossier`), youtube |
| HIÁNYOK | a fentiekből számolva | projekt repó nélkül · repo-drift · olvashatatlan repó · projekt Drive-mappa nélkül · lejárt határidejű vállalás · elavult állapotfájl (`repos-status`, files-catalog, agenda-cache `generated_at` régebbi a vártnál) · üres szekció („nincs adat”, nem elhallgatva) |
| TOVÁBB | — | szekciónként a mélyebb tool hívása kész paraméterekkel (`quick_lookup`, `find_files`, `list_commitments`, `get_thought`, `get_event_context`) |

Méretkeretek szekciónként konstansként a fájl tetején (kézzel beállított kezdőértékek; az AUTORESEARCH-profil később írja felül).

## Horgony-felismerés a kérdésből (v1, determinisztikus)

1. Ha van `project`/`person` paraméter → alias-feloldás, kész.
2. Különben a kérdés szavait `nameKey`-jel összevetjük a kanonikus nevekkel és aliasokkal, szavanként. A magyar ragozás miatt („Országtuninggal”, „Kun Miklóssal”) a legalább 4 betűs névszó a kérdésbeli szó elejére is illeszkedhet; a rövidebb szavaknak és a csupa nagybetűs projektneveknek („MET”) pontosan kell egyezniük. A helyi teszt mutatta meg: egész szavas illesztéssel a 3 ragozott kézi eset egyike sem talált. A csupasz keresztnevek gyakran rossz találatot adnak (a ROADMAP is figyelmeztet: „Attila” → Barta Attila). Ezért a csak keresztnévből álló aliast **nem** fogadjuk el horgonynak, csak jelöltként írjuk ki.
3. Ha így sincs horgony → a keresési találatok metaadatából a leggyakoribb projekt/ember, `derived_from: "search_hits"` jelöléssel, hogy az agent lássa, ez következtetés.

Nincs LLM-hívás. Az egész egy embedding (a `searchThoughts`) + payload-scrollok + állapotfájl-olvasás.

## Scope: `brain-read`, nem `live-provider-read`

A naptárat **az agenda-cache-ből** olvassa (óránkénti `cron/agenda-sync.js`), nem élőben. Így a tool nem nyúl a postafiókhoz és a naptárhoz, és szűk tokennel is hívható. A cache korát a HIÁNYOK kiírja. Az email-réteg a brainbe már befogott gmail-thoughtokból jön. Élő Gmail-keresés nincs; arra a TOVÁBB a `get_event_context`-et ajánlja.

## Érintett fájlok

- **új** `server/brain-map.js`: `buildBrainMap(args)`, kb. 200 sor
- `server/mcp-scopes.js`: `brain_map: 'brain-read'`
- `server/mcp.js` + `server/mcp-stdio.js`: regisztráció (mindkettőben, szabály szerint)
- `CLAUDE.md` (MCP tools szakasz, egy bekezdés), `ROADMAP.md`, `CHANGELOG.md`

HTTP-route és UI nincs ebben a lépésben. A „Search = az agent csomagja” UI-tétel később erre a függvényre épül.

## Tudatosan kimarad v1-ből

- Naptáresemény ↔ Fireflies-átirat egy tétellé vonása (spec 2. pont). Az agenda-cache csak előre néz, a múltbeli „meeting átirat nélkül” HIÁNY ezért v2.
- Csatolmány Files-rekord nélkül, session-döntés ROADMAP nélkül (nincs forrás hozzá).
- Messaging Matrix mint forrás (DÖNTÉS 2026-10-10: forrásként a csomagba kerül, de ez külön lépés).
- Rangsoroló modell (spec 5.: a jeleket kiírjuk, az agent dönt).

## Ellenőrzés

Helyben: szintaxis + a horgony-illesztés tiszta függvényként, néhány kézi esettel (ékezet, sorrend, csupasz keresztnév). Szerveren, deploy után: 3 kérdés: egy projekt repóval (customBrain), egy repó nélkül (pl. RMT Országtuning), egy emberre (person). Mindegyiknél azt nézzük, hogy minden szekció kitöltött vagy indokoltan üres-e, és a HIÁNYOK egyezik-e a ROADMAP-ban rögzített leletekkel (brandBrain/nexus drift, HINT-map olvashatatlan).

Verzió: `0.55.0` → `0.56.0` (minor, új MCP tool).
