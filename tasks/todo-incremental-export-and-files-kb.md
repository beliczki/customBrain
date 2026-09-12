# Terv: inkrementális Drive-export + Files/Repos tudásbázis

Két fázis, sorrendben. A 2. fázis csak az 1. leszállítása után indul.

---

## 1. fázis — Inkrementális, dátum-őrző vault-export

### Probléma
- A `rebuildVault()` (server/routes/export.js) óránként MINDEN .md-t töröl, majd újraír
  (~N create + N delete Drive-hívás óránként, akkor is, ha semmi nem változott).
- A kód 0.8.0 óta állítja a `createdTime`/`modifiedTime`-ot a thought dátumára a
  create-nél — ELLENŐRIZVE 2026-09-12: a dátumok Drive API-, web- és lokális sync-oldalon is a thought dátumát mutatják — a dátum-megőrzés már működik. A delete+recreate ciklus megszüntetése ettől független indok:
  a file identitása (Drive fileId) megmarad, a sync kliens in-place update-et lát.

### Megközelítés: renderelj mindent, diffelj md5-tel, írj csak változást
Állapotfájl NEM kell — a Drive maga tárolja a `md5Checksum`-ot minden nem-Google-Docs
filera. A rendered tartalom md5-je vs. Drive md5 = változásdetektálás, öngyógyító
(ha valaki kézzel belenyúl egy filebe, a következő sync visszaírja).

### Lépések
- [x] **0. Tényellenőrzés**: egy jelenlegi exportált file `createdTime`/`modifiedTime`-ja
      a Drive API szerint (SSH Hetzner, read-only lekérés) + ugyanennek a filenak az
      mtime-ja a lokális sync mappában. Ez dönti el, kell-e bármi extra a dátumhoz
      az inkrementalitáson túl.
- [x] **1. Render fázis kiemelése**: a mostani tartalom-összeállítás (frontmatter +
      dátumsor + text + Related thoughts + index.md) változatlan logikával, de először
      teljes egészében memóriában fut le → `[{filename, content, created_at, updated_at}]`.
      (A Related-szekció más thoughtok vektoraitól függ, ezért mindig mindent renderelünk —
      csak az ÍRÁST spóroljuk meg, a renderelés olcsó, memóriában van.)
- [x] **2. Filename-ütközések feloldása render-időben**: két azonos slugú title ma
      csendben azonos nevű filet csinál. Ütközésnél a második kap `-<yyyy-mm-dd>` vagy
      `-<id első 6 karaktere>` suffixet. (Enélkül a névre-diffelés hibás párosítást adna.)
- [x] **3. Drive-lista egyszer**: `files.list` a customBrain mappára,
      `fields: files(id, name, md5Checksum)`, lapozva (megvan a pageToken-minta).
- [x] **4. Diff és végrehajtás**:
      - név megvan + md5 egyezik → SKIP (nulla API-hívás)
      - név megvan + md5 eltér → `files.update` (media + `modifiedTime: updated_at || created_at`)
        — a fileId stabil marad
      - név nincs a Drive-on → `files.create` (createdTime + modifiedTime, mint ma)
      - Drive-on van, renderben nincs (átnevezett/törölt/archivált thought) → delete
      - duplikált név a Drive-on (a régi bug hagyatéka) → az első marad/update-elődik, a többi orphanként törlődik
      Batch-elve (10-es párhuzamosság, a meglévő minta szerint).
- [x] **5. index.md ugyanígy**: md5-diff, update-in-place create helyett.
      Megjegyzés: az index "Regenerated on <date>" sora naponta változik → naponta
      egyszer update-elődik, ez rendben van.
- [x] **6. Log/összegzés frissítése**: `skipped / updated / created / deleted` számok
      a mostani "deleted N / exported N" helyett (cron log + SSE + MCP visszatérés).
- [x] **7. Deploy + verifikáció Hetzneren**: két egymás utáni cron-futás — a másodiknak
      ~0 write-ot kell mutatnia; egy thought PATCH után csak az az egy file frissül;
      lokális sync mappában a dátumok a thought dátumát mutatják.

### Nem változik
- writeStubs (People/Projects stub-létrehozás) — már most is inkrementális
- dossier reindex — külön mechanizmus, marad
- a customBrain mappa export-tulajdonú marad: ami .md-t nem a render adott, azt törli
  (kézi file oda továbbra sem való — a kézi dossziék helye People/Projects/Topics, ill. 2. fázistól Files/Repos)

---

### Review (1. fázis — leszállítva 0.40.0, 2026-09-12)
- Dátum-gyanú megcáfolva méréssel: createdTime/modifiedTime 0.8.0 óta jó volt (Drive API + lokális mtime/birthtime ellenőrizve).
- Éles verifikáció: 1. futás 6 new / 28 updated / 452 unchanged / 6 orphan (27s);
  2. futás 0 / 0 / 486 / 0 (8s). Óránkénti Drive-hívás ~970-ről ~5-re esett nyugalmi állapotban.
- Mellékesen javítva: filename-slug ütközés (determinisztikus suffix), régi duplikátumok orphanként kitakarítva.
- FELFEDEZETT KÖVETKEZŐ BUG (nem javítva, külön patch): `Dossier reindex: indexed 310, skipped 0`
  minden órában — a dossier-index hash-skipje sosem skippel, óránként 310 felesleges Gemini embedding-hívás.

## 2. fázis — Files/ és Repos/ dosszié-szekciók

### Cél
People/Projects/Topics mintájára két új Drive-mappa: `Files/` (mi milyen leadott/kapott
dokumentum, hol van Drive-on, melyik feladathoz tartozik) és `Repos/` (repo-kontextus).
A dossziékat kézzel / session-végi szokásként írjuk — NINCS git API-elemző, NINCS
automatikus csatolmány-feldolgozás v1-ben.

### Lépések
- [x] Két mappa létrehozása a Drive vaultban + folder ID-k a Settings-be
      (`GOOGLE_DRIVE_FILES_FOLDER_ID`, `GOOGLE_DRIVE_REPOS_FOLDER_ID` — settings.json
      overlay útvonalon, mint a többi)
- [x] `fetchDossiers()` specs-lista bővítése: `{ label: 'Files', type: 'file' }`,
      `{ label: 'Repos', type: 'repo' }` (server/drive-context.js) → az óránkénti
      `reindexDossiers` automatikusan embeddel + kereshetővé tesz
- [x] Ellenőrzés: `search_brain` visszaad Files/Repos dossziét; a dossier-index
      delete-reconcile működik rájuk
- [x] Frontmatter-konvenció dokumentálása (drive_link, project, direction,
      from, date) — CLAUDE.md vagy a mappa README-je
- [ ] NEM része: capture-time prompt-injektálás (tokenköltség — csak ha a keresés
      kevésnek bizonyul), Qdrant `files` payload-mező, git API-s elemző cron

---

## Verzió-javaslat (szállításkor)
- 1. fázis: minor (user-látható exportviselkedés-változás)
- 2. fázis: minor (új dosszié-típusok a keresésben)

---

### Review (2. fázis — leszállítva 0.41.0, 2026-09-12)
- Files/ (19Gy8st6LbCy4TEqWlKLQqo1sFqAgJjgL) és Repos/ (1CRwiVOkZJQO130N1QNfXZNBV27DLeHpc) mappák a vault gyökerében; folder ID-k a settings.json-ban.
- Seed: Repos/customBrain.md — reindex után azonnal #1 találat "canonical_dossier" evidenciával.
- Konvenció dokumentálva a CLAUDE.md-ben; NEM épült: git API-elemző, csatolmány-pipeline, capture-prompt injektálás.

## 3. fázis — Interaktív architektúra-HTML (artifact)

Egy interaktív HTML-oldal a customBrain teljes működéséről, tabokkal:
- [ ] **Intake** — a 4 capture-út (manual/UI/extension/MCP, fireflies webhook, youtube cron, gmail cron) + capture-pipeline (embedding ∥ Haiku metadata, dedup/supersedes, alias-feloldás)
- [ ] **Export** — vault-rebuild (1. fázis utáni inkrementális működés), index.md, Related thoughts, dossier reindex
- [ ] **Access/Security** — UI_SECRET vs. named MCP tokenek, webhook HMAC, nginx/pm2, mi nyitott és miért
- [ ] **MCP** — tool-katalógus (core + hygiene + agent), stdio vs. Streamable HTTP, kettős regisztráció gotcha
- [ ] **Agent use cases** — retrieval routing létra (quick_lookup → search_brain → get_thought), write-back szintézis, draft-workflow, dossziék
- [ ] **Gráf** — buildGraph: node-ok, metadata/semantic/supersedes élek, Louvain közösségek
- [ ] **+ ami hiányzik**: adatmodell (Qdrant payload-konvenciók), komponenstérkép (server/client/agent/cron/extension), verziózás/deploy folyamat
- Forrás: CLAUDE.md + kód; Artifactként publikálva (privát link)
