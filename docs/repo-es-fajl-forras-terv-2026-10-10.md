# Repó-dokumentáció és fájlok mint forrás — terv

**Dátum:** 2026-10-10 · **Állapot:** jóváhagyva („csináljuk ami hátra van”), 0.70.0 · **Kérés (Robi):** repóknál a README, a ROADMAP, a taskok és a hasonlók számítanak, nem a commitok vagy a kód. A Graph forrás-csoportosításából és mindenhonnan máshonnan is hiányzik a repó és a fájlok, a belőlük jövő kapcsolatok, horgonyok és előzmények.

## 1. Repó-dokumentáció → Qdrant (`kind: repo_doc`)

**Melyik repók:** a `repos-status` által olvasható repók, vagyis amelyeket egy Repos-dosszié hivatkoz, és a GitHub-token lát. A `KunMiki/HINT-map` a token kibővítéséig kimarad.

**Fájlok:**
- **be:** a gyökér `README.md`, `ROADMAP.md`, `CLAUDE.md`, `AGENTS.md`, valamint `tasks/*.md` és `docs/*.md` (csak a felső szint);
- **ki:** CHANGELOG, `archive` mappák, kód, commitok.

**Darabolás:**
- fejezetenként (`#`/`##` címek mentén) egy pont, legfeljebb 4000 karakter;
- a 80 karakternél rövidebb fejezetek kimaradnak;
- a task-fájlokból csak a nyitott `- [ ]` tételek kerülnek be, a fejezetcímükkel. Kipipált sor nem jön be, különben a confAi2 2400 soros `todo.md`-je elárasztaná a keresést.

**Payload:**

```
kind: 'repo_doc', type: 'repo_doc', source: 'repo'
repo, project, path, heading
title: "<repo>/<path> › <heading>"
text, effective_date (a fájl utolsó commitja), status: 'active'
```

A `project` egyetlen mező. Nem `projects`, hogy a `quick_lookup` és a thought-metaadat ne keverje össze egy thoughttal.

**Futás:**
- a napi `repos-status` cron után ugyanabban a menetben, `server/repo-docs.js`;
- **sha-kapu:** a fájl blob-sha-ja a GitHub-fa listájából jön, és a változatlan fájlt le sem tölti, embeddelni sem kell;
- determinisztikus pont-id-k, `state/repo-docs-manifest.json`;
- a repóból eltűnt fájlok pontjai törlődnek, de csak ha a fa-listázás sikerült.

**Thought-listák:** a `NOT_CHUNK` szűrő (Recent, Stats, export, gráf, ujjlenyomat) a `repo_doc`-ot is kizárja, ahogy a dossziét. A keresés eddig is minden típust adott, ezért a `search` megtalálja.

## 2. Gráf: Tárgy-réteg

- **`layerOf`:** a `repo_doc` a Tárgy réteg.
- **`buildOntology`:**
  - fejezetenként egy `repodoc` csomópont, éle a repó-dossziéhoz (`rel: doc`);
  - projektenként a 10 legfrissebb fájl külön `file` csomópontként, éle a fájlcsomaghoz (`rel: file`).
- **Graph:** a rétegeket (dossziék, fájlok, repó-dokumentumok, vállalások) minden csoportosításban mutatja, nem csak az Ontológia módban. Így a Source csoportosításban megjelenik a `repo`, a `files` és a `vault` csoport, a Project csoportosításban a projekt repó-dokumentumai és fájljai.

## 3. map és spider

**map, HELYZET:** új `docs` lista. A horgonyprojekt repójának fejezetei, elöl a nyitott taskok és a ROADMAP, legfeljebb 8, GitHub-linkkel. A keresésből jövő `repo_doc` találat a HELYZET-be kerül, nem az ELŐZMÉNYEK-be.

**spider:** a projekt-, forrás- és típus-lencse csoportjaiba a nem-thought csomópontok is bekerülnek: fájlok, repó-dokumentumok, vállalások. A `spider` így a projektből a repó taskjaihoz és fájljaihoz is eljut.

## Ellenőrzés

- A cron lefut, és a log kiírja, repónként hány fájl és fejezet indexelődött.
- Egy második futás 0 újraembeddelést ad.
- „melyik repóban van task a háttérváltozókról” → `search` találat.
- „confai” → a `map` HELYZET-ben a confAi2 nyitott taskjai; a `spider` Tárgy-rétegében repó-dokumentumok és fájlok.
- Graph → Source: `repo` és `files` csoport.
- A Recent, a Stats és az export nem változik.
