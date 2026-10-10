# Bejárási módszerek, lassítva a gráfon — terv

**Dátum:** 2026-10-10 · **Állapot:** jóváhagyva 2026-10-10; 1. lépés (0.60.0) kész · **ROADMAP:** „UI-teendők az ontológiához”, 3. tétel, a (b) helyett · Előzmény: Runs tab (0.58.0, valódi agent-hívások visszajátszása, marad)

## Cél

Egy kérdésnél lehessen látni, hogyan jár be a brain egy módszerrel: mely csomópontokat választja, melyik élen át jut hozzájuk, miért, és mi áll össze a végén. A lejátszás lassítható. Három módszer lesz, átkapcsolhatóan:

| Módszer | Mi ez | Ma |
|---|---|---|
| **search** | ma `search_brain` = `searchThoughts`, hibrid dense+BM25, egy lépés | van |
| **map** | ma `brain_map`: horgonyok + egy lépés a horgonyokról + egy keresés | van |
| **spider** | új: a kérdésből indul, lépésenként mindig a legnagyobb súlyú élen megy tovább | nincs |

**Nevek (Robi, 2026-10-10):** ez a brain MCP-je, a „brain” a nevekben felesleges. A módszer neve mindenhol ugyanaz: MCP-tool, `method` paraméter, UI-felirat. `search_brain` → `search`, `brain_map` → `map`, az új tool `spider`. A kliensek a connector nevével előtagolják (`mcp__Brain__search`), így nem ütközik más szerverek `search`-ével.

## 1. Közös nyomkövetés (`trace`)

Mindhárom módszer ugyanolyan formájú lépéslistát ad, így egy lejátszó szolgálja ki mindet:

```
trace: [{ step, phase, node_id, from_id, edge: {kind, rel}, score, why, cut? }]
```

- `why`: rövid, emberi szöveg. Például „kérdésben: Országtuning”, „semantic 0.83 ← <cím>”, „tag: projekt ERSTE”, „levágva: ELŐZMÉNYEK max 25”.
- `cut: true`: a módszer elérte, de a felső határ kiejtette. Halványan látszik.
- **search:** lépésenként egy találat, `score` + `evidence`.
- **map:** a `buildBrainMap` már most is tudja a „miért”-et (`derived_from`, `via`, `matched_by`, `evidence`). A kódban a meglévő pontokon jegyezzük fel, nem számolunk újra. Fájl → a projekt fájlcsomag-csomópontja. Naptáresemény → nincs csomópont, csak a narratívában jelenik meg.

## 2. spider (`server/spider.js`, új)

**Gráf:** a meglévő `buildGraph()` (thought–thought: metadata, semantic, supersedes) + `buildOntology()` (dossziék, fájlcsomagok, vállalások, réteg-közi élek). Új adatforrás nincs.

**Indulás:** a `searchThoughts(question, 10)` találatai a pontszámukkal, és a `matchAnchors` horgony-dossziéi 1,0-val.

**Lépés:** prioritási sor. Mindig a legnagyobb pontszámú, még nem látogatott csomópontot veszi ki, és a szomszédait így pontozza:

```
pontszám(szomszéd) = pontszám(szülő) × élsúly × CSILLAPÍTÁS / √fokszám(szülő)
```

- **Élsúly** (kézzel beállított kezdőértékek a fájl tetején, mint a `brain_map` `MAX`-a): semantic = cosine · metadata = min(1, közös címkék / 3) · tag 0,6 · source/owner 0,8 · repo/files 0,5 · supersedes 0,3.
- **√fokszám:** a hub-büntetés. Nélküle az ERSTE-dosszié 53 éle elárasztaná a sort, és minden kérdés ugyanoda futna.
- **Megáll:** `MAX_STEPS` (25) lépés után, vagy ha a legjobb jelölt pontszáma `MIN_SCORE` (0,05) alá esik.

**Eredmény:** a meglátogatott csomópontok rétegenként (`layerOf`), sorrendben, és a sorban maradt legjobb 10 jelölt („ide ment volna még”).

LLM-hívás nincs, csak a keresés egy embeddingje. Kockázat: a `buildGraph` minden vektort beolvas, és O(N²) cosine-t számol. Ezt élesben mérni kell. Ha egy kérdésre túl lassú, a gráfot memóriában tartjuk, és a capture-nél érvénytelenítjük. Ezt csak mérés után döntjük el.

## 3. HTTP

`GET /trace?method=search|map|spider&q=` → `{ method, result, trace }`. A `result` az adott módszer mai válasza: hit-lista vagy csomag; pók esetén rétegenkénti lista. A `spider` MCP-toolként v1-ben **nem** jelenik meg: előbb a UI-n bizonyítson a `map`-pel szemben, és csak utána kapja meg az agent.

## 4. UI

- **Search tab:** a módváltó három állású lesz: `search | map | spider`. Mindegyik alatt egy „Bejárás a gráfon ▶” gomb, ami átvált a Graph tabra.
- **Graph tab, bejárás-réteg:** Ontológia csoportosítással nyílik meg. Az elején minden halvány. Lejátszáskor lépésenként kigyullad a csomópont és az él, amin át jött; a levágott csomópontok szaggatott, halvány jelet kapnak.
  - A lejátszó a Runs `Player` mintáját követi: ◀ ▶ léptetés, ▶/❚❚, sebesség 1×/4×/16×.
  - Az oldalpanelen a lépések listája fut az aktuális lépéssel és a `why` szöveggel. A végén a „mi állt össze” blokk: rétegenként a megtalált elemek.
  - A meglévő highlight-ágat bővítjük, nem írunk új renderelőt. A `trace` az App szintjén vándorol a Search-ből a Graph-ba.
- Osztálynevek: `traversal-player`, `traversal-steps`, `traversal-steps__step--current`, `traversal-summary`.

## 5. Mellékes javítás

Az előző válaszom pontatlan volt: a UI Találatok módja 5 találatot kér, de az MCP `search_brain` alapértéke is 5 (`searchThoughts(query, limit = 5)`). Tehát ugyanazt látod, amit egy `limit` nélkül hívó agent. Nincs teendő.

## Sorrend és verziók

1. **0.60.0 — átnevezés (breaking):** `search_brain` → `search`, `brain_map` → `map` a `mcp.js`-ben, a `mcp-stdio.js`-ben, a `TOOL_SCOPES`-ban, a `map` TOVÁBB-szekciójában, a `review-commitments` skillben, a CLAUDE.md-ben és az AGENTS.md-ben. Régi név aliasként nem marad. A HTTP-route `/brain-map` → `/map`. A régi docs és a CHANGELOG nem változik, mert történet.
2. **0.61.0:** a `trace` a `search` és a `map` módszerhez, `/trace` route, Graph bejárás-réteg, háromállású Search-váltó, a `spider` még letiltva.
3. **0.62.0:** a `spider` (`server/spider.js`) beköt ugyanoda.

A 2. lépés már megmutatja, milyen sekély ma a `map`. Ehhez lehet viszonyítani a `spider`-t.

## Ellenőrzés

Élesben ugyanaz a 4 próbakérdés, mint a `brain_map`-nél, mindhárom módszerrel. Az átnevezés után egy friss claude.ai- és Claude Code-session látja a `search` és a `map` toolt, a régieket nem. A lejátszás végén kigyulladt csomópontok egyezzenek a módszer `result`-jával. A `spider` mért futásideje bekerül a CHANGELOG-ba. A Graph többi módja változatlan.
