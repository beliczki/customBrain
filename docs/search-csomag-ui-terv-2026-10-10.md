# Search = az agent csomagja — UI-terv

**Dátum:** 2026-10-10 · **Állapot:** jóváhagyva, 0.57.0 · **ROADMAP:** „UI-teendők az ontológiához” 1. tétel · Függ: `brain_map` (0.56.x ✅)

## Cél

A Search tab ugyanazt a csomagot mutassa, amit az agent a `brain_map`-ből kap. Ne legyen külön UI-logika: a szerver összerakja a csomagot, a kliens csak megjeleníti.

## Szerver: egy route

- **új** `server/routes/brain-map.js`: `GET /brain-map?q=&project=&person=` → `buildBrainMap(...)`. A route a többihez hasonlóan Express routert exportál, és a meglévő `server/brain-map.js` függvényt hívja. Új logika nincs benne.
- `server/index.js`: router bekötése, `/brain-map` hozzáadása a SPA-wildcard guardhoz. Csak a master `UI_SECRET` férhet hozzá, a `NAMED_TOKEN_PATHS` allowlistre **nem** kerül fel, mert a csomag naptárat és vállalásokat is mutat, amit egy clipper-tokennek nem kell látnia.
- `client/src/api.js`: `brainMap(q)` a `jsonOrThrow`-val.

## Kliens

**Search.jsx: módváltó** az input alatt: `Csomag | Találatok`, alapból Csomag. Ugyanaz az input és ugyanaz a submit. A Találatok mód a mai lista változatlanul, az Anatómia gombbal együtt (a P18 explain ide tartozik). A módváltó a Graph `graph-mode-switch` mintáját követi, `search-mode-switch` néven. A Search tab egy keresésre csak az aktív mód hívását indítja el.

**új `BrainMapPackage.jsx`**, hét szekció egymás alatt. A fejlécek az Agenda napfejlécének stílusát kapják (`text-xs uppercase tracking-wider text-txt-ter … border-b border-subtle`), a darabszám `text-[10px]`. Az üres szekció dőlt „nincs adat” sort kap, mint az Agenda „no matching thoughts” sora.

| Szekció | Megjelenés (meglévő mintából) |
|---|---|
| HORGONYOK | chipek a Search mai színeivel: projekt lila, ember zöld, téma indigó. Projektenként: `repo ✓/–`, Drive-fájlok száma. A `derived_from` kis felirat, ha nem a kérdésből jött („keresésből”). A csupasz keresztnév-jelöltek halvány chipként jelennek meg. |
| HELYZET | repó-sor: `repo · vX.Y.Z · utolsó commit dátum + üzenet`. Fájl-sor: dátum mono · kind · név → Drive/Gmail link új lapon. |
| ELŐZMÉNYEK | az Agenda `agenda-thought-link` sora: dátum mono · type · source · cím. Kattintásra `ThoughtModal`. |
| KÖVETKEZŐ | vállalás-sor: határidő mono (ha lejárt: piros) · státusz · cím · gazda. Esemény-sor: időpont mono · cím · mi kötötte (`matched_by`). |
| HÁTTÉR | ugyanaz a sor, mint az ELŐZMÉNYEK-nél, `ThoughtModal`-lal. |
| HIÁNYOK | `kind` címke amber színnel (az Actions chip színe) + részletek. |
| TOVÁBB | `tool(args)` sorok monóval, csak olvasásra, mert a UI nem hív MCP-t. Kivétel a `search_brain`: azt a „Találatok” módra váltó gomb jelzi ugyanazzal a kérdéssel. |

Szemantikus osztálynevek: `brain-map`, `brain-map__section`, `brain-map__header`, `brain-map__row`, `brain-map__row--overdue`, `brain-map__gap`. Inline `style` nincs, a vizuális beállítás Tailwind-osztályokkal megy.

## Kimarad

- Az Agenda tab megszüntetése: a ROADMAP következő tétele. Ez a csomag KÖVETKEZŐ szekciója után jön, ha a használat igazolja.
- `project` és `person` mező a UI-n. v1-ben csak a kérdés van; a horgony-chipre kattintás (újrakeresés azzal a horgonnyal) jó v2 lehet.
- Szűk/teljes keresési mód (ROADMAP-ötlet): addig nem kell, amíg csak egy `brain_map` van.

## Deploy

A `client/dist` nincs verziózva, és a szerveren építettük, ami a 4 GB-os gépen OOM-veszélyes (DEPLOYMENT.md). **Javaslat:** helyben `npm run build`, majd rsync a `client/dist`-be a szerverre úgy, hogy előtte a régi dist `dist.bak`-ba kerül (ez a visszaállítási pont), aztán a szokásos `custombrain` újraindítás. Így a gépen semmit nem kell leállítani a build idejére.

## Ellenőrzés

Helyben: `npm run build` lefut. Élesben a böngészőben a 4 próbakérdés a brain_map-ellenőrzésből. Mind a hét szekció megjelenik, az előzmény-sorra kattintva megnyílik a thought, a Találatok mód változatlan, és a sötét/világos téma is jó.

Verzió: minor, `0.56.1` → `0.57.0`, mert új HTTP-route és felhasználó által látható viselkedés.
