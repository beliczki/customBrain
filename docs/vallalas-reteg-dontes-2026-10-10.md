# Vállalás-réteg — döntés-előkészítő

**Dátum:** 2026-10-10
**Kapcsolódik:** [Ontológia és helyzetcsomag spec](ontologia-es-helyzetcsomag-spec-2026-10-10.md), 3. réteg (Vállalás), 7. pont.
**Döntés:** hol és milyen szabályokkal éljenek a vállalások — ettől függ, lesz-e értelmes KÖVETKEZŐ szekció a csomagban.

## 1. Robi előérzete (kiindulás)

- Fájl biztosan nem.
- A thoughthoz kötött `action_items` tapasztalat szerint gyenge.
- Kell egy **külön, ellenőrzött, közvetlen forrással rendelkező** vállalás-tár.
- Ami thoughthoz tartozik, az lazább: **jelölt** (candidate), nem vállalás.

## 2. Bizonyíték: mi van ma az `action_items`-ben

Minta: a 15 legutóbbi thought (2026-09-22 … 2026-10-09, gmail / fireflies / manual), kb. 60 tétel. Kis minta, de a hibák típusa egyértelmű:

| Hiba | Példa a mintából | Következmény |
|---|---|---|
| **Ugyanaz a vállalás sokszor** | „RSVP a Daszi B2B + Norton 360 meetingre" — 5 külön thoughtban, 4 megfogalmazásban | A KÖVETKEZŐ lista ötször mutatná ugyanazt |
| **Nincs státusz, nem zárul le** | Az okt. 9-i RSVP okt. 10-én is nyitott tételként áll | A lista csak nő; a régi szemét elnyomja az újat |
| **Nem Robié** | „Pityesz: Norton 360 Markdown átnézése", „Krisztian Simon: … kreák küldése" | Keveredik a „nekem kell" és a „másra várok" |
| **Nem is feladat** | „Istvan Hollosi megkérdezi Barta Attilát…", „Watch for Sipos's … email" | Leírás vagy figyelés, nincs teendő |
| **Részfeladat-szemcse** | Egy ERSTE szálból 8 tétel (méretek, szövegcsere, kontraszt…) | Egy vállalás („Bird mutációk péntekig") szétesik |
| **Nincs stabil azonosító** | Gmail-szál frissítésekor a Haiku újragenerálja a listát | Státuszt nem lehet rá kötni — a következő frissítés felülírja |
| **Határidő szövegben, nem mezőben** | „péntekig", „okt. 12 hétfő" | Sürgősség nem számolható |

Az utolsó két sor a döntő: **a thought payloadjára tett státusz nem működhet**, mert a thought-frissítés (Gmail refresh, reprocess) újraírja az `action_items`-t. Ez megerősíti az előérzetet — nem ízlés kérdése, hanem szerkezeti ok.

## 3. A javasolt modell: jelölt → vállalás

```
FORRÁS (email, meeting, naptár, repó, session)
   │
   ├─ thought.action_items   = JELÖLT   (laza, automatikus, felülíródhat — marad, ahogy van)
   │
   └─ commitment             = VÁLLALÁS (ellenőrzött, stabil id, státusz, közvetlen forrás)
```

**Vállalás az, aminek van:**
- **gazdája** (`owner`: Robi vagy más — „másra várok" is vállalás, `waiting` státusszal)
- **közvetlen forrása** — nem a thought, hanem amire a thought épül: Gmail message id, Fireflies meeting id + időbélyeg/sor, naptár event id, repó + fájl + sor, session id. Plusz egy szó szerinti idézet a forrásból.
- **horgonya** (projekt, ember)
- **státusza** (`open` · `waiting` · `done` · `dropped` · `expired`) és státusztörténete
- opcionálisan **határideje** (`due`), mezőként

Egy vállaláshoz **több jelölt** tartozhat (az 5 RSVP-tétel → 1 vállalás, 5 forráshivatkozással). Ez oldja a duplikációt.

## 4. A döntendő kérdések

### D1. Hol éljen a vállalás-tár?

| Opció | Mellette | Ellene |
|---|---|---|
| **A. Státusz a thought payloadján** | nincs új tár | ❌ a refresh felülírja (2. pont) — kizárva |
| **B. Külön Qdrant collection (`commitments`)** ⭐ | a meglévő stack; payload-szűrés státuszra/dátumra/gazdára indexekkel; embedding a jelölt ↔ vállalás párosításhoz (dedup); a `quick_lookup` / MCP minta újrahasznosítható | Qdrant nem relációs — a státusztörténetet payload-tömbként kell tartani; **a backupba fel kell venni** (a 2026-09-12-i S1-hiba pont ez volt: a backup rossz collectiont mentett) |
| **C. SQL tábla (SQLite/Postgres)** | lifecycle-re és lekérdezésre a természetes forma | **új tárolási réteg** a customBrainben (ma nincs SQL) — új backup, új séma-migráció; ennél a méretnél (száz-ezres nagyságrend) nem hoz annyit |
| **D. Meglévő feladatkezelő (Google Tasks, Todoist…)** | kész UI, mobil, emlékeztető; a „legolcsóbb meglévő eszköz" | nincs hely a forráshivatkozásnak és idézetnek; agentnek külön hozzáférés (Google Tasks scope ma nincs az OAuth-ban); a vállalás kikerül a brain ontológiájából |

**Javaslat: B.** Ugyanaz a technológia, mint a thoughts, ezért nem új réteg; a dedup-hoz pont az embedding kell. Feltétel: a `server/collections.js`-be és a backup/restore-ba azonnal bekerül.

### D2. Ki teszi a jelöltet vállalássá?

| Forrás típusa | Javasolt szabály |
|---|---|
| **Strukturált** — ROADMAP-tétel, `TODO-*` thought, repó `tasks/todo.md` nyitott checkbox, naptáresemény | **automatikusan** vállalás (a forrás maga a döntés) |
| **Szabad szöveg** — email, meeting-átirat, jegyzet | **jelölt marad, amíg meg nem erősítik.** Agent javasol (dedup + gazda + határidő + idézet), Robi kötegben jóváhagy |

A jóváhagyás a meglévő brain-hygiene minta ismétlése: `find_overconnected → suggest_metadata_fix → update_thought` mintájára `find_candidates → suggest_commitments → confirm_commitments`. Nem új munkafolyamat-típus.

### D3. Kinek a vállalásai?

**Javaslat:** Robié + ami Robira vár másoktól (`waiting`, `owner` = a másik ember). Mások egymás közti teendői (pl. „Pityesz: Norton 360 Markdown") nem kerülnek be, hacsak nem Robira hat vissza. Ez kb. felére vágja a mintát.

### D4. Hogyan zárul le egy vállalás?

Ez a legkockázatosabb rész — ha nem zárulnak le, a lista ugyanolyan szemét lesz, mint ma.

- **v1:** kézi lezárás (agent javasolja, Robi jóváhagyja) + **automatikus `expired`** az eseményhez kötött vállalásoknál, ha az esemény elmúlt (RSVP, „meeting előtt elküldeni").
- **Később:** bizonyíték-alapú lezárás (elküldött levél a szálban, commit a repóban, Fireflies-átirat a meetingről) — ugyanaz a forrás-hivatkozás teszi lehetővé.

### D5. Mi legyen a jelöltekkel?

**Javaslat: maradnak, ahogy vannak** (`action_items` a thoughtban, migráció nélkül), és a dokumentációban „jelöltként" hivatkozunk rájuk. A Haiku-prompt javítása (gazda, határidő mezőként, explicit vs. kikövetkeztetett) külön, későbbi lépés — csak ha a jóváhagyási kör azt mutatja, hogy a jelöltek minősége a szűk keresztmetszet.

## 5. Mielőtt bármit építünk: kézi próba

A „legolcsóbb meglévő dolog" itt egy **kézi kör, kód nélkül**: egy session az utolsó 2 hét jelöltjeiből a D2–D4 szabályok szerint kézzel összerak egy vállaláslistát (forrás + idézet + gazda + határidő + státusz), és Robi megnézi.

Mit dönt el:
- Hány vállalás marad a ~kétheti jelöltekből (ha 15–30 → a modell működik; ha 150 → a szűrés rossz).
- Elég-e a gazda + határidő a sürgősséghez, vagy kell fontosság-jel is.
- Mennyi Robi ideje a jóváhagyás — ha percek, mehet; ha óra, a D2 szabályon kell lazítani.

Ha a próba jó, akkor jön a `commitments` collection (minor bump), a három tool, és a `brain_map` KÖVETKEZŐ szekciója erre épül.

## 6. Összefoglaló — mit kell eldönteni

| # | Kérdés | Javaslat |
|---|---|---|
| D1 | Hol él a vállalás? | Külön Qdrant collection (`commitments`), backupban |
| D2 | Ki emeli jelöltből vállalássá? | Strukturált forrás: automatikus. Szabad szöveg: agent javasol, Robi kötegben jóváhagy |
| D3 | Kinek a vállalásai? | Robié + amit Robi másoktól vár |
| D4 | Hogyan zárul? | v1: kézi + auto-`expired` eseményhez kötötteknél |
| D5 | Jelöltek? | Maradnak a thoughtban, változtatás nélkül |
| — | Első lépés | Kézi próba az utolsó 2 hét jelöltjein, kód nélkül |
