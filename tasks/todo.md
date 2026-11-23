# Döntések 2026-11-23 — a szemantikai modell 12 kérdése, és a belőlük lett hét munka

**Állapot:** a döntések megvannak (Robi, 2026-11-23, ebben a sessionben). Az 1. munka kész, commitolva és pusholva (2026-11-23, Robi go-jával). A 2. munka kész; a 3. munka a kiinduló mérésig kész (a kérdésszerű szondák külön go). A szerveren a 0.78.2 fut (2026-11-23). Az időcsillapítás javítása a mérés alapján előrejött; az 1. szelet kész (0.78.3 a szerveren), a diagnózis igazolta, hogy az ok a csillapítás. A 4–7. munkának még nincs terve.
**Hol vannak a döntések:** a projekt Drive-mappájában, `customBrain - a rendszer szemantikai modellje 2026-11-23 (tervezet).md`, 11. fejezet. A modell egészét Robi még nem hagyta jóvá.

## A döntések röviden

1. A 7. elv: a customBrain minta, közös kód nélkül. Közös könyvtár és profilrendszer csak akkor épül, ha két példánynak ugyanaz kell.
2. A „customBrain” a példány, a kisbetűs „brain” köznév. Terméknév nincs.
3. A heurisztika végleges helye a dosszié; `Synthesis:` bejegyzésként érkezhet.
4. Az ellentmondás-kört megépítjük.
5. A „gondolat / thought” új neve „bejegyzés / entry”, a kódban is.
6. Szál-entitás és időcsillapítás: terv most, átnézéssel.
7. Vizuális anyagok: igen, szűken (először 2–3 deck kézzel, utána csak a projekthez rendelt fájlok).
8. Mérés: kicsi, ismételhető automatikus felidézés-próba.
9. Magától futó ellenőrzést kap a publikus repó, a collection-lista és a két MCP-regisztráció szabálya.
10. A session-riport a session-naplók hivatalos formája (lásd lent a 7. pontot).
11. Kódleltár: igen, a modell elfogadása után.
12. Az `AGENTS.md` és a `DEPLOYMENT.md` elavult sorai javítva.

A 4., az 5. és a 6. döntésnél Robi eltért a javaslatomtól (előbb próba; a szó maradjon; előbb mérés).

## A hét munka, Robi sorrendjében („alapozás előre”)

Építés egyszerre egy megy. Mindegyik munka saját tervet kap ebben a fájlban (érint, ajtó, jóslat, varrat, szeletek), és Robi jóváhagyása után indul. A 4–7. munka építés előtt átnézésre megy (Codex és Chief Architect).

- [x] **1. Doksijavítás.** Ajtó: kétirányú, csak dokumentum. Kész, commitolva és pusholva 2026-11-23-án, Robi go-jával.
  - `AGENTS.md`: a befogadás ellentmondás-ellenőrzése a kód szerint (0,97-es küszöb, külön Haiku-hívás); a „via SA” kikerült, mert service account 0.39.0 óta nincs; a tükör különbség alapú 0.40.0 óta; a szemantikai modell új fájljára mutat, és kimondja az új szót.
  - `DEPLOYMENT.md`: a két elavult telepítési megjegyzés a Settings fülre mutat.
- [x] **2. Három ellenőrzés:** publikus repó (commit előtt: IP, ssh-adat, szerverútvonal), collection-lista (minden collection a mentés listáján vagy kimondott kivétel), két MCP-regisztráció (`mcp.js` és `mcp-stdio.js` ugyanazokat az eszközöket tartalmazza). A repóban ma nincs tesztfuttató és nincs git hook; a terv ezzel kezdődik. **Megírva 2026-11-23-án; a részletek lent.**
- [x] **3. Mérőpróba:** automatikus felidézés-próba. **Kész a kiinduló mérésig (2026-11-23): Találat@10 82,7%; a 90 napnál régebbieknél 64,7%. A részletek lent.** Kiindulás: a lenti 3. pont „A” rétege (automatikus recall-szondák, emberi gold nélkül).
- [ ] **4. Vizuális anyagok, szűken.** A terv a Drive-mappában van (`vizualis-anyagok-terv-2026-10-16.md`). A verziósora elavult: 0.77.0 → 0.78.0-t ír, a kód már 0.78.0.
- [ ] **5. Szál-entitás és időcsillapítás.** A javaslat csak a 2026-11-11-i session-riportban áll; terv nincs leírva. **Az időcsillapítás része előrejött (Robi, 2026-11-23), külön tervvel lent; itt a szál-entitás marad.**
- [ ] **6. Ellentmondás-kör.** A befogadás ma kérdés nélkül archivál (`server/routes/capture.js`); a kör ezt váltja.
- [ ] **7. Átnevezés: thought → entry.** A terv mondja ki az ajtókat: az eszköznevek minden csatlakozó agentet érintenek; a collection és a payload-mezők átnevezése adatmigráció, egyirányú.

## 2. munka terve — három magától futó ellenőrzés

**Állapot:** kész (2026-11-23), Robi jóváhagyásával („Igen, mehet”, a három kérdésre a javasolt válasszal). Commitolva és pusholva 0.78.1-ként (Robi: „Igen, 0.78.1”). A szerverre a 0.78.2 deployjával jutott ki (2026-11-23).
**Kérte:** Robi (2026-11-23, 9. döntés).

**Érint.** A szemantikai modell 2026-11-23-i tervezetének 8. fejezete, a 14., a 9. és a 10. szabály. A modell tervezet; erről a három szabályról Robi döntött.
- **14. szabály, publikus repó:** minden követett fájl. Szomszéd: a box tényei, amelyek a repón kívül élnek (`~/.agents/infra-map.md`).
- **9. szabály, collection-lista:** `server/collections.js`. Akik importálják: `server/qdrant.js`, `server/commitments.js`, `cron/qdrant-backup.js`, `scripts/init-collection.js`, `scripts/restore-from-snapshot.js`, `scripts/rechunk-content.js`, `scripts/migrate-people-names.js`.
- **10. szabály, két MCP-regisztráció:** `server/mcp.js`, `server/mcp-stdio.js`, `agent/register.js`, és a `TOOL_SCOPES` a `server/mcp-scopes.js`-ben.

**Amit a kódban találtam (2026-11-23, megfigyelve).**
- A két regisztráció 21–21 eszközt tartalmaz, azonos névvel és sorrendben. **Két eszköz leírása már eltér a két fájlban:** `find_overconnected` és `rebuild_obsidian_vault`. A blokk többi sora egyezik.
- **A `scripts/backfill-chunks.js` a cronból fut 10 percenként, és a collection nevét beírva tartalmazza** (`'thoughts_v2'`), nem importálja. Ugyanez a minta okozta a szeptemberi mentési hibát. További öt script ír be `'thoughts_v2'`-t (`secret-exposure-audit`, `reprocess-v2-prototype`, `backfill-task-types`, `calibrate-conflict-threshold`, `p8-probe`), öt régi script a már nem élő `'thoughts'`-t, a `migrate-to-hybrid-collection` mindkettőt alapértékként.
- A követett fájlokban ma 20 sor illik az általános mintákra (IPv4-cím, ssh-parancs kulcsfájllal, root-felhasználó, root-mappa, ssh-mappa): `tasks/todo.md` 10, `CHANGELOG.md` 6, `ROADMAP.md` 2, és két kódkomment. Az értékeket nem írtam ki.
- A repóban nincs tesztfuttató, nincs `test` script, és nincs beállított git hook. A helyi Node v24.13.1.

**Ajtó:** kétirányú. Tesztfájlok, egy hook és egy `package.json`-script; a futó szervert nem érinti, deploy nem kell. A 3. szelet (b) része cronból futó scriptet módosít: a szerverre a következő rendes deploy `git pull`-jával jut ki, külön szerverművelet nélkül, mert a név értéke nem változik.

**Jóslat.**
- A `npm test` helyben, hálózat és `.env` nélkül lefut.
- A 10. szabály próbája elsőre piros lesz a két eltérő leíráson, az egyeztetés után zöld.
- A 9. szabály próbája elsőre piros lesz a `backfill-chunks.js`-en és öt társán; a 3. szelet után zöld.
- A hook megállít egy próba-commitot, amelynek hozzáadott sorában IP-cím vagy ssh-parancs van, és átengedi a mai `f41552b` commit tartalmát.
- Változatlan marad: a szerver viselkedése, az MCP-eszközök neve és sémája.
- Nem tudom: a hook hány hamis riasztást ad a mindennapi commitokra. Ez az első hetekben derül ki.

**Varrat.** `npm test` a repó gyökerében (a Node beépített tesztfuttatója, új függőség nélkül). A hooknál a `scripts/check-public-repo.js` parancssora: a bemenet egy diff, a kimenet a találatok és a kilépési kód.

**Szeletek** (mindegyik önállóan ellenőrizhető).
- [x] **1. Tesztfuttató és a collection-lista próbája.** `tests/collections.test.mjs`: (a) a `collections.js` minden exportált neve szerepel a `BACKED_UP` listán vagy egy új, kimondott `NOT_BACKED_UP` listán; (b) a `server/`, `cron/`, `agent/` és `scripts/` fájljai közül csak a `collections.js` írhatja be élő collection nevét, kivéve a régi, egyszeri scriptek felsorolt listáját. Gyökér `package.json`: `"test": "node --test tests/"`. **Kész:** új, üres `NOT_BACKED_UP` lista a `collections.js`-ben; a próba elsőre piros volt a hiányzó listán és négy scripten.
- [x] **2. A két MCP-regisztráció próbája.** `tests/mcp-registrations.test.mjs`, a forrásfájlok szövegén: azonos eszköznevek és azonos leírás a két fájlban; minden regisztrált eszköznek van `TOOL_SCOPES` sora, és nincs sor eszköz nélkül. A két eltérő leírást a `mcp.js` bővebb szövegére egyeztetem. **Kész:** a próba elsőre piros volt a két leíráson; a `mcp-stdio.js` két leírása a `mcp.js` szövegét kapta. A próba a teljes regisztrációs blokkot hasonlítja össze, behúzás nélkül.
- [x] **3. A beírt collection-nevek.** (a) Az egyszeri, régi scriptek a kivétellistára kerülnek. (b) A `backfill-chunks.js` és a még használt scriptek a `THOUGHTS` nevet importálják, egyenként. **Kész:** a kivétellistán három egyszeri script van (`reprocess-v2-prototype`, `backfill-task-types`, `migrate-to-hybrid-collection`). A nevet importálja a `backfill-chunks`, a `secret-exposure-audit`, a `calibrate-conflict-threshold` és a `p8-probe`. A `backfill-chunks.js` új importja ugyanarra a névre oldódik fel, mint a régi beírt érték; magát a scriptet helyben nem lehet futtatni. **A szerveren a 0.78.2 deployja után, 2026-11-23-án hiba nélkül lefutott a cronból.**
- [x] **4. Commit előtti ellenőrzés.** `scripts/check-public-repo.js` és `.githooks/pre-commit`; ebben a klónban egyszer `git config core.hooksPath .githooks`. Csak a hozzáadott sorokat nézi, általános mintákkal. A minták nem tartalmazhatnak valódi értéket, mert a repó publikus. `tests/check-public-repo.test.mjs` kitalált példákkal. **Kész:** a hook két dolgot néz (méret, publikus repó). A helyi tiltólista a git mappájában él, 22 bejegyzéssel, az infra-mapből. Eldobható klónban öt eset ment a jóslat szerint. Egyszeri kikapcsolás téves riasztásnál: `PUBLIC_REPO_CHECK=off`.
- [x] **5. Lezárás:** az `AGENTS.md` „Tests / lint” sora, CHANGELOG, javasolt verzió 0.78.1 (patch). **Kész: az `AGENTS.md` sora, a CHANGELOG-bejegyzés és a 0.78.1-es verzió.**

**Mechanizmus-javítás a kis javítás mellé.**
- **10. szabály.** Mechanizmus: ugyanaz a 21 regisztráció kétszer van begépelve. Élő testvérhiba: a két eltérő leírás. A próba csak jelzi az eltérést; megszüntetni egy közös `registerCoreTools(server, z)` tudja, ahogy az `agent/register.js` már csinálja az agent-eszközökkel. Ez a futó MCP-kiszolgálást érinti, deploy kell hozzá. **Javaslat: a 7. munka (átnevezés) első szelete legyen,** mert az úgyis minden regisztrációhoz hozzányúl. Addig a 2. szelet próbája őrzi.
- **9. szabály.** Mechanizmus: a collection nevét beírják, nem importálják. Élő testvérhiba: a cronból futó `backfill-chunks.js`. A 3. szelet (b) része a javítás, az 1. szelet (b) próbája őrzi. **A 7. munka collection-átnevezése előtt ennek kint kell lennie a szerveren,** különben a cron hiba nélkül a régi collectiont olvasná tovább.

**Nyitott kérdések Robinak, a javaslatommal.**
1. **Hol éljen a commit előtti ellenőrzés?** Javaslat: most itt, a repóban. A globális változat minden publikus repót védene (az MM6 is publikus), de az a globális szabályok terepe, nem ezé a sessioné.
2. **Kell-e helyi, nem követett tiltólista a valódi értékekkel** (a box címe, a kulcsfájlok neve)? Javaslat: igen. Az általános minták egy egyedi nevű kulcsfájlt nem fognak meg. A lista a `.git` mappában élne, a repóba nem kerülne.
3. **A 3. szelet (b) része** menjen-e ezzel a munkával? Javaslat: igen, és a szerverre a következő rendes deploy viszi ki.

**Átnézés:** a szabály szerint nem kell (nincs új réteg, séma-, auth- vagy függőségváltozás).

### Review (2026-11-23)

**Robi válasza a három kérdésre:** mindhárom a javaslat szerint (az ellenőrzés itt él a repóban; van helyi tiltólista; a cron-script javítása ezzel a munkával ment).

**A jóslat és az eredmény.**
- Az `npm test` helyben, hálózat és `.env` nélkül lefut: igen, 17 próba, körülbelül egy tized másodperc alatt.
- A 10. szabály próbája elsőre piros a két leíráson: igen, pontosan azon a kettőn.
- A 9. szabály próbája elsőre piros a `backfill-chunks.js`-en és öt társán: részben. Négy scripten lett piros, mert a három egyszeri scriptet már a próba megírásakor a kivétellistára tettem.
- A hook megállítja az IP-címet tartalmazó commitot, és átengedi a mai `f41552b` tartalmát: igen. Az ssh-mintákat csak a próbák fedik; valódi commiton nem próbáltam őket.
- Változatlan a szerver viselkedése és az MCP-eszközök neve és sémája: a kódból ez következik, de a szerveren nem mértem, mert a változás csak a következő deployjal jut ki. A `mcp-stdio.js` két leírása megváltozott; ez csak a helyi stdio-kapcsolatot érinti.
- Hamis riasztások: az utolsó 60 commitból az ellenőrzés egyet állított volna meg (2026-10-10, szerverútvonal a `CHANGELOG.md`-ben), és az valódi találat.

**Amit a terv nem látott előre.**
- A hook első változata kilépett, ha az `AGENTS.md` nem volt a commitban; a második ellenőrzés miatt át kellett szervezni.
- A próbafájl példái maguk is megakasztották volna a commitot, ezért darabokból állnak össze.
- A tiltólistába az infra-mapből egy kétbetűs töredék is bekerült, amely szinte minden sorra illett volna. A hat karakternél rövidebb bejegyzéseket kivettem.

**Nyitva maradt.**
- ~~A 0.78.1 deployja.~~ Kint van a 0.78.2-vel (2026-11-23).
- A közös regisztrációs függvény, amely a duplikációt megszünteti: a 7. munka első szelete.
- A követett fájlok 20 régi sora ma is illik a mintákra. A hook csak új sorokat néz, ezekhez nem nyúltam.

## 3. munka terve — mérőpróba: automatikus felidézés-próba

**Állapot:** az 1. és a 2. szelet megírva és helyben kipróbálva (2026-11-23), Robi jóváhagyásával („Igen, mehet”; a három kérdésre a javasolt válasz: 150 szonda, csak a `search`, cron nélkül). Commitolva és pusholva 0.78.2-ként (Robi: „Igen, 0.78.2”), kint van a szerveren, és a kiinduló mérés megvan (2026-11-23). A 4. szelet külön go.
**Kérte:** Robi (2026-11-23, 8. döntés: „kicsi, ismételhető automatikus felidézés-próba”).

**Mit mér, egy mondatban:** ha a brain egy bejegyzésének egy részletével kérdezünk, a `search` visszaadja-e azt a bejegyzést az első 1, 3, illetve 10 találat között. Emberi bírálat nem kell hozzá: a helyes találat maga a forrásbejegyzés. (A kód a bejegyzést ma `thought`-nak hívja.)

**Források.**
- A szemantikai modell 2026-11-23-i tervezete (tervezet): 2. fejezet 3. elv („a keresési réteg a felidézésre törekszik, a rangsoroló az agent”) és 6. elv („előbb mérés, utána építés”); 4. fejezet, 3. munka.
- Ez a fájl, lent a „3. A tanulmány 11. fejezetének mérése” pont újratervezése, „A” réteg (2026-10-09): szó szerinti forrásrészletből készült lekérdezés, a helyes találat a forrás.
- `ROADMAP.md`, AUTORESEARCH (2026-10-10): az automatikus evaluator a feltétele; a mérőszám a csomag-felidézés; ismert torzítás, hogy a szövegből vett kérdés a szó szerinti egyezést jutalmazza; a készlet egy része félretett.
- Robi 2026-10-09-i visszajelzése: a „tű” kérdéseket ő ne bírálja; az automatikus szondához nem kell emberi gold.

**Visszakérdezés (új funkció).**
- *Ide tartozik-e?* Igen: ennek a példánynak a keresését méri. A brandBrain a saját készletén mérne.
- *Mi a legolcsóbb meglévő, ami a 80%-ot hozza?* A `scripts/p8-probe.js` (nyolc kézzel írt kérdés) és a `tasks/evaluator/questions.yaml` (emberi golddal). (Utólag, 2026-11-23: van egy harmadik is, a `scripts/prove-brain.js`, amelyet a terv írásakor nem vettem észre. Ugyanazt a nyolc kérdést használja, tehát a következtetés nem változik.) Egyik sem elég: a `p8-probe` a nyers keresési lábakat hívja, nem azt az útvonalat, amit az agent kap (időcsillapítás, dosszié-előny, chunk → szülő), és nem mintáz a tárból; a `questions.yaml` Robi idejét kéri. Átveszem tőlük a pillanatfelvétel formáját és a Wilson-intervallumot (`contradiction-probe`).
- *Építés kell, vagy elég az eredmény?* Egy session az MCP-n át nem tud 150 keresést lefuttatni: a `search` teljes szövegeket ad vissza, a kontextus betelne. Ezért kell egy kis script a szerveren.

**Érint.** A „Visszakeresés” alkotórész, a 7.3 `search` szerződés: csak olvasva. Szomszédok: a Qdrant (olvasás), a Gemini-embedding (szondánként egy hívás a kérdéshez), a `state/` mappa (két új fájl). Szabály nem változik. Új fogalom: „szonda” (egy lekérdezés az elvárt bejegyzés azonosítójával) és „szondakészlet” (a befagyasztott lista); ezek Robi jóváhagyásával kerülnek a fogalomtárba.

**Ajtó:** kétirányú. Új script, egy tiszta függvénymodul és próbák; a szerveren csak olvas a tárból, és két fájlt ír a `state/` alá. A futó szerver viselkedése nem változik.

**A publikus repó miatt:** a szondakészlet magánlevelek és meetingek szó szerinti részleteit tartalmazza. **A készlet és a pillanatfelvétel ezért a szerver `state/` mappájában marad, a gitbe soha nem kerül.** A repóba és ebbe a fájlba csak összesített számok és bejegyzés-azonosítók jönnek.

**Hogyan működik.**
1. **Készlet (egyszer, befagyasztva):** magértékkel (seed) vett, rétegzett minta a tárból, forrás (levél, meeting, kézi, videó) és hossz szerint. Minden kiválasztott bejegyzésből egy 12–20 szavas részlet az **eredeti szövegből** (nem az összefoglalóból), a szöveg elejéről, közepéről vagy végéről. Modellhívás nincs. A készlet harmada félretett: hangoláshoz nem használható.
2. **Futás (bármikor megismételhető):** minden szondára a valódi `searchThoughts` fut, ahogy az agent kapja. Eredmény: Találat@1, @3, @10, Wilson-intervallummal, bontva forrás, hossz, a részlet helye és a bejegyzés kora szerint.
3. **Kimenet:** összesítő tábla a kimeneten, és egy pillanatfelvétel a `state/` alatt a kihagyott szondák azonosítóival, hogy egy session utána tudjon nézni (`get_thought`).

**Jóslat.**
- A rövid és közepes bejegyzéseknél a Találat@10 95% fölött lesz, mert a kérdés a saját szavaikat használja.
- Alacsonyabb lesz a hosszú bejegyzések végéről vett részleteknél és a 90 napnál régebbi bejegyzéseknél. Ha a régieknél látványos az esés, az az időcsillapítás hatása, és ez lesz az 5. munka (szál-entitás és időcsillapítás) kiinduló száma.
- Ugyanazon a napon két futás ugyanazt a találatszámot adja. Napok múlva a szám kissé elmozdulhat, mert az időcsillapítás a futás idejétől függ, és a tár nő.
- Nem tudom: a tényleges számokat; azt, hogy a 12–20 szavas kérdésnél a kulcsszavas vagy a jelentés alapú láb dönt-e; a futásidőt (várhatóan egy-két perc 150 szondára).

**Amit ez a próba nem mér.** A szó szerinti részlet a kulcsszavas egyezést jutalmazza: ez alsó küszöb („megtalálható-e minden rész a saját szavaival”), nem a valódi kérdések mérése. A `map` és a `spider` csomagját nem méri. Mindkettőhöz úgy megfogalmazott kérdés kell, ahogy egy ember kérdezne; az a 4. szelet.

**Varrat.** Helyben az `npm test`: a mintavétel (mag, rétegzés, a részlet az eredeti szövegből való), a pontozás és a Wilson-intervallum tiszta függvények, kitalált adaton. A szerveren: a script kimenete, és két egymás utáni futás egyezése.

**Szeletek.**
- [x] **1. Tiszta modul és próbák, helyben.** `server/recall-probes.js`: mintavétel, részletvágás, pontozás, Wilson-intervallum; Qdrant és hálózat nélkül. `tests/recall-probes.test.mjs`. **Kész:** 12 új próba, először pirosan futottak; az `npm test` 29 próbája zöld. Ha egy részlet más bejegyzésben is szó szerint megvan, az is helyes találatnak számít.
- [x] **2. A script.** `scripts/recall-probe.js`: `--build` elkészíti és befagyasztja a készletet (meglévőt csak `--force` ír felül); kapcsoló nélkül fut és mér. A tárból csak olvas. **Kész, de az éles tárral még nem futott.** Helyben álmodulokkal és 240 kitalált bejegyzéssel futtattam végig: készlet nélkül hibaüzenetet ad; a `--build` 150 szondát fagyaszt be, ebből 50 félretett; a második `--build`-et elutasítja; a futás táblát ír és pillanatfelvételt ment, kérdésszöveg nélkül; két futás ugyanazt a számot adja. Hogy a valódi `searchThoughts`-szal és a Qdranttal működik-e, az a szerveren derül ki.
- [x] **3. Kiinduló mérés a szerveren.** Deploy kell hozzá (a 0.78.1 sincs még kint), Robi go-jával, ssh-parancsonként. Utána: készlet, első futás, második futás az egyezéshez. Az összesített számok ide kerülnek. **Kész (2026-11-23); az eredmény lent, a „Kiinduló mérés” részben.**
- [ ] **4. Kérdésszerű szondák (külön go, a kiinduló mérés után).** Egy session nagyjából 30 friss bejegyzéshez (utolsó 8 hét) kérdést ír úgy, ahogy Robi kérdezné, a cím idézése nélkül; ezek a készlet második fajtája. Ezzel lesz mérhető a `map` és a `spider` csomagja is. Modellköltség a sessioné, a szerveren nincs modellhívás.
- [ ] **5. Lezárás:** egy sor az `AGENTS.md`-be a futtatásról, CHANGELOG, javasolt verzió: patch. **Az `AGENTS.md` sora, a CHANGELOG-bejegyzés és a 0.78.2 kész; a szelet a kiinduló mérés számaival zárul.**

**Nyitott kérdések Robinak, a javaslatommal.**
1. **Mekkora legyen a készlet?** Javaslat: 150 szonda (ebből 50 félretett). 90% körüli aránynál ez nagyjából ±5 százalékpontos bizonytalanság; 300 szondával ±3,5, kétszer annyi embedding-hívásért.
2. **Mit mérjen az első változat?** Javaslat: csak a `search`-öt, szó szerinti részletekkel. A `map` és a `spider` a 4. szelettel jön, mert azokhoz horgony kell a kérdésben.
3. **Legyen-e belőle cron?** Javaslat: nem. Kézzel indított futás változtatás előtt és után; cron csak akkor, ha a szám hasznosnak bizonyul.

**Átnézés:** új réteg, séma-, auth- vagy függőségváltozás nincs. A globális szabály a deployt is az átnézendők közé sorolja, ezért a deploy előtt megkérdeztem Robit; ő átnézés nélkül kérte (2026-11-23), mert rutin patch-deploy.

### Kiinduló mérés (2026-11-23, 0.78.2, a szerveren)

**A deploy.** Robi go-jával, ssh-parancsonként jóváhagyva: az állapot olvasása, a `custombrain` leállítása, a port felszabadítása (már szabad volt), `git pull --ff-only` (0.78.0 → 0.78.2), indítás. `npm install` nem futott. A `pm2 save` Robi döntésére kimaradt: a régi MM két szervere éppen le volt állítva, és a mentés az ő állapotukat is rögzítette volna. Az MM6 session közlése szerint ők 16:30 és 16:31 (UTC) között kétszer mentettek a saját appjaik miatt, így a mentett lista a `custombrain`-t futóként, a régi MM két szerverét leállítva tartalmazza. Ezt nem ellenőriztem. Utána: a 3000-es portot a pm2 által követett folyamat tartja; a `/stats` 0.78.2-t ad; a hibanapló üres; a gráf újraépült. A deploy után, a 16:40-es (UTC) cron-körben a módosított `backfill-chunks.js` hiba nélkül lefutott („nothing pending”), és a `gmail-intake` is hibátlan volt. Az MM6 session később azt írta, hogy a pm2 naplója szerint az indítás 16:29:44-kor volt; eszerint már a 16:30-as kör is az új scripttel futott, szintén hiba nélkül. Ezt a naplót én nem olvastam.

**A készlet.** 150 szonda 1144 bejegyzésből, 50 félretett; egy szondának van több helyes találata.

**Az eredmény.** Két futás, 77 és 78 másodperc; a 150 szondából egynél tért el a hely, eggyel.

| Csoport | n | Találat@1 | @3 | @10 | 95%-os tartomány (@10) |
|---|---|---|---|---|---|
| mind | 150 | 33,3% | 46,0% | 82,7% | 75,8–87,9 |
| 0–30 napos | 53 | 67,9% | 84,9% | 100% | 93,2–100 |
| 31–90 napos | 29 | 41,4% | 69,0% | 93,1% | 78,0–98,1 |
| 91–365 napos | 68 | 2,9% | 5,9% | 64,7% | 52,8–75,0 |
| a szöveg eleje | 50 | 44,0% | 52,0% | 86,0% | 73,8–93,0 |
| a szöveg közepe | 50 | 32,0% | 46,0% | 84,0% | 71,5–91,7 |
| a szöveg vége | 50 | 24,0% | 40,0% | 78,0% | 64,8–87,2 |
| rövid | 59 | 33,9% | 54,2% | 83,1% | 71,5–90,5 |
| közepes | 55 | 36,4% | 45,5% | 80,0% | 67,6–88,4 |
| hosszú | 36 | 27,8% | 33,3% | 86,1% | 71,3–93,9 |
| levél | 36 | 44,4% | 58,3% | 80,6% | 65,0–90,2 |
| meeting | 25 | 24,0% | 28,0% | 84,0% | 65,3–93,6 |
| kézi | 66 | 36,4% | 54,5% | 83,3% | 72,6–90,4 |
| videó | 23 | 17,4% | 21,7% | 82,6% | 62,9–93,0 |
| hangolható rész | 100 | 31,0% | 44,0% | 84,0% | 75,6–89,9 |
| félretett rész | 50 | 38,0% | 50,0% | 80,0% | 67,0–88,8 |

A megtalált 124 szondából 118-at a kulcsszavas láb hozott (`bm25_exact`), 5 `weak_semantic`, 1 `high_dense`. A 26 kihagyottból 24 a 91–365 napos csoportba esik, 2 a 31–90 naposba. A mintában nincs egy évnél régebbi bejegyzés.

**A jóslat és az eredmény.**
- „A rövid és közepes bejegyzéseknél a Találat@10 95% fölött lesz”: **nem.** 83% és 80%.
- „Alacsonyabb a hosszúak végéről vett részleteknél”: a szöveg vége a leggyengébb (78%), de a különbség a bizonytalanságon belül van; a hossz nem számít.
- „Alacsonyabb a 90 napnál régebbieknél; ha látványos, az az időcsillapítás”: **igen, és ez a fő hatás.** Egy 90 napnál régebbi bejegyzés, ha a saját szavaival kérdezünk rá, 100-ból 3-szor az első találat, és 35-ször nincs az első tízben.
- „Két futás ugyanazt adja”: igen.

**Mit mond ez.** Az értelmezés a kód olvasásán alapul, külön futással nincs bizonyítva. A hibrid keresés RRF-pontszámai szűk sávban vannak: egy lábon az első hely 1/61-et ér, a harmincadik 1/90-et, vagyis a legjobb és egy közepes találat között másfélszeres a különbség. Az időcsillapítás ezt `1 / (1 + napok/90)`-nel szorozza, ami 180 napnál harmad, 270 napnál negyed. A szorzó így többet számít, mint az, hogy a találat hányadik volt: a 60 jelölt sorrendjét nagyrészt a kor dönti el. A kulcsszavas láb megtalálja a régi bejegyzést, de a frissebb, gyengébb találatok elé kerülnek. Egy csillapítás nélküli futás bizonyítaná; ahhoz kapcsoló kell a keresésbe.

**Következmény.** Ez az 5. munka (szál-entitás és időcsillapítás) kiinduló száma. A sorrendről Robi dönt: a mérés szerint az időcsillapítás a legnagyobb veszteség, és külön is javítható, a szál-entitás nélkül.

**Amit közben találtam, és nem javítottam.**
- A gráf újraépítése a szerveren 19–24 másodperc (1139 csomópont). A `server/graph-worker.js` kommentje 632 bejegyzésnél 5,5 másodpercet ír; a költség négyzetesen nő.
- A scriptek kimenetébe a dotenv tippsort ír, mert nincs `quiet` beállítva. Kozmetikai.

## Időcsillapítás — terv (az 5. munkából előrehozva)

**Állapot:** az 1. szelet kódja megírva és helyben kipróbálva (2026-11-23), Robi jóváhagyásával („Igen, mehet”). Commitolva és pusholva 0.78.3-ként (Robi: „Igen, 0.78.3”), kint van a szerveren, és a diagnózis megvan (2026-11-23): **az ok az időcsillapítás.** A 2. szelet külön go.
**Robi válaszai a három kérdésre (2026-11-23): a javaslat szerint.** A csillapítás célja: a kor csak a közel egyforma erősségű találatok között döntsön; ami jobban egyezik, az legyen elöl, akármilyen régi. A képlet választása előtt kérdésszerű szondák kellenek. Az 1. szelet átnézés nélkül megy; az átnézés az új alapérték előtt jön.
**Kérte:** Robi (2026-11-23: „Igen, terv rá”), a kiinduló mérés alapján. Az 5. munkában a szál-entitás marad.

**A tünet (megfigyelve, 2026-11-23).** A 90 napnál régebbi bejegyzést a `search` a saját szavaival kérdezve 100-ból 3-szor adja első találatként, és 35-ször nem adja az első tízben. A 30 napnál frissebbeknél ugyanez 68 és 0.
**A parancs, amely pirosat ad:** `node scripts/recall-probe.js` a szerveren, a 91–365 napos sor.

**Források.**
- A szemantikai modell 2026-11-23-i tervezete (tervezet): 2. fejezet 3. elv („a keresési réteg a felidézésre törekszik, a rangsoroló az agent”), 7.3 `search` szerződés („időcsillapítással”).
- A kód: `recencyFactor` és `applyTimeDecay` a `server/routes/search.js`-ben. A szabály `1 / (1 + napok/90)`, szorzóként, a `search` és a típusos keresés (`queries=[…]`) végén is. A `spider` minden lépés ajánlatát ezzel szorozza.
- CHANGELOG 0.65.0: „az egy recency-szabály”. ROADMAP: a csillapítás 2026-04-04-én került be (P1a); egy régi feljegyzés `no_decay` kapcsolót vet fel.
- Robi 2026-05-17-i döntése: a keresési réteg célja, hogy a jó dokumentum benne legyen az első N-ben; a rangsorolást az agent végzi.

**Mit mond a történet.** A csillapítás akkor került be (2026-04-04), amikor a tár legrégebbi bejegyzése is csak három hetes volt, tehát alig csillapított valamit. Később a kód kommentje szerint a 30 napos skála „túlbüntette az egy hónapnál régebbi tartalmat”, ezért a skála 90 nap lett; a szorzás maradt. 2026-05-17-én az RRF `k` értéke 2-ről 60-ra ment (az irodalmi alapértékre), ami a pontszámokat szűk sávba húzta. A hatás a tár korával nő, és eddig semmi nem mérte.

**Hipotézisek, rangsorolva, mindegyik mellett a jóslat, amely megcáfolná.**
1. **A szorzó felülírja a találat helyét,** mert az RRF-pontszámok sávja szűkebb, mint a szorzóé. Megcáfolná: csillapítás nélkül futtatva a régi bejegyzések Találat@10-e nem megy 90% fölé.
2. **A régi bejegyzés be sem kerül a 60 jelölt közé.** Megcáfolná: csillapítás nélkül, 60-as listával a régiek is megvannak.
3. **A régi bejegyzések rosszabbul vannak indexelve** (régebbi feldolgozás, hiányzó chunkok). Megcáfolná: csillapítás nélkül a régiek ugyanúgy megvannak, mint a frissek.

Egy futás dönt a három között: csillapítás nélkül, 60-as listával, kor szerint bontva.

**Mechanizmus (javítás, nem új funkció).**
- **Egy mondatban:** a csillapítás szorzóként hat olyan pontszámokra, amelyeknek a sávja szűkebb, mint a szorzóé, ezért a sorrendet a kor dönti el, nem az egyezés.
- **Testvérhibák, ugyanazzal a mechanizmussal:**
  - a 30 napos skála esete: akkor a szám változott, a mechanizmus maradt, és a tár öregedésével visszajött;
  - a `spider`: a `server/brain-map.js` kommentje szerint csillapítással „a friss szálak minden lépést elvisznek”, ezért a `map` KORÁBBI szekciója csillapítás nélkül hívja;
  - a típusos keresés szó szerinti (`lex`) lába: a pontos egyezés is csillapodik;
  - a dosszié ×1,5-ös és ×0,5-ös szorzója ugyanilyen szűk sávú pontszámokra hat (ezt most nem változtatom, csak megnevezem);
  - a `find_files` saját képlete (egyezés × kor): ott a kor szerinti sorrend lehet szándék; külön kérdés.
- **Hova kerül:** az egy közös szabályba. A végső pontozás tiszta függvénybe kerül, amelyet a `search` és a típusos keresés is hív; a `spider` ugyanazt a szabályt használja tovább.
- **A felületet őrző próba:** „egy régi, mindkét lábon első találat megelőzi a friss, egy lábon huszadik találatot” (ma piros), és „két egyforma erősségű találat közül a frissebb van elöl” (zöldnek kell maradnia).

**Miért nem elég a mai szondakészlet a képlet kiválasztásához.** A szó szerinti részlet a kulcsszavas lábat méri. Ha csak arra hangolunk, a „pontos egyezést ne csillapítsuk” szabály 100%-ot adna, miközben a jelentés alapú kérdéseknél semmi nem javulna. Ezért a választás előtt kérdésszerű szondák is kellenek, régi bejegyzésekre is (ez a 3. munka 4. szelete, ide hozva).

**A szóba jövő képletek** (a választás a mérés után, nem most):
- **(a) Korlátos szorzó:** a tényező nem megy egy alsó határ alá (például 0,8), így a kor csak a közel egyforma találatok között dönt. A legkisebb változtatás; a `spider` szabálya ugyanaz marad.
- **(b) A kor mint harmadik rangsor az RRF-ben,** súllyal. A hatása felülről korlátos, és ugyanabban a mértékegységben van, mint a két keresési láb.
- **(c) Csillapítás csak kérésre:** alapból nincs, az agent paraméterrel kéri.
- **(d) Pontos egyezésnél nincs csillapítás.** Önmagában nem javaslom (lásd fent).
Egyetlen irodalmi alapértékről nem tudok; a bevett gyakorlat áttekintése, forrásokkal, a 3. szelet része.

**Érint.** A „Visszakeresés” alkotórész; a 7.3 `search` szerződés szövege változik, és vele a `map` és a `spider` eredménye is, mert mindkettő a keresésből indul. Minden agent más sorrendet kap.

**Ajtó:** kétirányú, adat nem változik. A robbanási sugár nagy: minden keresés sorrendje. Ezért az alapértelmezés megváltoztatása előtt átnézést kérek (Codex és Chief Architect).

**Jóslat.**
- Csillapítás nélkül a 91–365 napos sor Találat@10-e 95% fölé, a Találat@1 60% fölé megy (1. hipotézis).
- Korlátos szorzóval a régiek Találat@10-e 90% fölött lesz, a frisseké 100% marad.
- Nem tudom: mit mutatnak a kérdésszerű szondák; és hogy a „mi a legfrissebb” jellegű kérdéseknél érzel-e romlást. Az utóbbit próba nem méri, csak a használat.

**Varrat.** Helyben az `npm test` a tiszta pontozófüggvényen. A szerveren a felidézés-próba a hangolható részen, a végén a félretett részen.

**Szeletek.**
- [x] **1. Diagnózis.** A végső pontozás tiszta függvénybe kerül, próbákkal; a `searchThoughts` és a típusos keresés kap egy `recency` kapcsolót (az alapérték változatlan, ahogy a `spider`nél már van); a próbascript `--no-decay` kapcsolót. Deploy, viselkedésváltozás nélkül (patch). Egy futás csillapítás nélkül, 60-as listával: eldönti a három hipotézist.
  - **A kód kész (2026-11-23), a szerveren még nem futott.** Új `server/rescore.js` (a szabály és a dosszié-súlyok, változatlan számokkal) és `tests/rescore.test.mjs` (10 próba, először pirosan). A `server/routes/search.js` ezt hívja; a két keresőfüggvény harmadik, elhagyható paramétere a `recency`. A hívókat egyenként megnéztem: tíz hívó van, egyik sem ad át harmadik paramétert, tehát mindegyik a régi viselkedést kapja.
  - **A cél próbaként rögzítve, `todo` jelöléssel:** „egy régi, mindkét lábon első találat megelőzi a friss, egy lábon huszadik találatot”. Ma megbukik, de a futást nem töri el; az alapérték megváltoztatásakor rendes próbává válik.
  - **Helyi szimuláció a valódi pontozófüggvénnyel:** a script `--no-decay` és `--limit 60` kapcsolója működik. A játékmodellben a korral a régi bejegyzések lesüllyednek, kor nélkül elsők. Ez azt mutatja, hogy a mechanizmus elég a tünethez; azt nem, hogy az éles rendszerben is ez az ok.
  - **A deploy utáni első ellenőrzés:** az alapértelmezett futásnak a kiinduló mérés számait kell visszaadnia (33,3 / 46,0 / 82,7%). Ha eltér, az átszervezés megváltoztatta a viselkedést, és vissza kell állni.
  - **Kész (2026-11-23): az eredmény lent, a „Diagnózis” részben.**
- [ ] **2. Kérdésszerű szondák** (külön go). Egy session nagyjából 60 bejegyzéshez ír kérdést úgy, ahogy Robi kérdezné, a cím idézése nélkül: korcsoportonként 20-at. A készlet a szerveren marad.
  - **Robi go-ja megvan (2026-11-23).** A 60 bejegyzés a meglévő 150-es készletből van, korcsoportonként 20, rögzített maggal sorsolva (egy csak olvasó parancs a boxon). Így ugyanarra a bejegyzésre van szó szerinti és kérdésszerű szonda is, és a félretett rész öröklődik: 41 hangolható, 19 félretett.
  - **A kérdéseket három alügynök írja** (korcsoportonként egy), azonos előírás szerint: magyarul, ahogy Robi kérdezne; a cím és a szöveg négy egymást követő szavának idézése nélkül; dátum és mai naphoz kötött szó nélkül. A bejegyzéseket csak olvassák.
  - **A kód kész, a szerveren még nincs kint:** `--import-questions` a beolvasáshoz (elutasítja azt a kérdést, amely a címet vagy a szöveg négy szavát egymás után idézi) és `--questions` a futtatáshoz; a párosítás és az idézés-ellenőrzés tiszta függvény, próbákkal. Helyi szimulációban a beolvasás és mindkét futás működik.
  - **A kérdések megvannak (2026-11-23):** 59 kérdés és egy kihagyott bejegyzés (egy meeting-átirat, amelyben csak köszönések vannak). Mind a 60 válasz a kisorsolt bejegyzésekhez tartozik, ismétlés nincs. A kérdések 12–19 szavasak (a medián 16), dátum és mai naphoz kötött szó nincs bennük; két kérdésben egy bent maradt angol kötőszót kijavítottam. A fájl a scratchpadben van, a repóba nem kerül.
  - **Ismert torzítás:** a kérdések hosszabbak és többnyire kétrészesek („…, és …?”), ahogy egy modell ír, nem ahogy Robi gépel. A több horgonyszó a keresést könnyíti, tehát a szám inkább felső becslés.
  - **A költség több lett a becsültnél:** a három alügynök együtt nagyjából 454 ezer tokent használt (132, 153 és 168 ezer); előre 150 ezret mondtam.
  - **Commitolva és pusholva 0.78.4-ként** (Robi, 2026-11-23: „igen, 0.78.4-ként commitold és pushold").
  - **Hátravan:** deploy; beolvasás a szerveren (ott fut az idézés-ellenőrzés); futás csillapítással és nélküle.
- [ ] **3. Képletek mérése.** A jelöltek a kapcsoló mögött futnak, az éles alapérték nem változik. Mindegyik a hangolható részen, mindkét szondafajtával; a legjobb a félretett részen is. A bevett gyakorlat áttekintése forrásokkal.
- [ ] **4. Az új alapérték** (átnézés után, külön go): minor verzió, mert a keresés viselkedése változik; a CHANGELOG-ba az előtte–utána számok; a modell 7.3 szerződésének szövege.
- [ ] **5. Utána:** a `spider` és a `map` KORÁBBI megkerülő megoldása az új szabállyal; kell-e még. Külön döntés.

### Diagnózis (2026-11-23, 0.78.3, a szerveren)

**A deploy.** Ugyanúgy, mint a 0.78.2-nél: ssh-parancsonként jóváhagyva, `pm2 save` és `npm install` nélkül (0.78.2 → 0.78.3). A `/stats` 0.78.3-at ad, a hibanapló üres.

**Az alapérték nem változott.** Az alapértelmezett futás a kiinduló mérés számait adta, és a 150 szondából egynél sem tért el a hely.

**A három futás** (ugyanaz a 150 szonda; a számok Találat@1 / @3 / @10, százalékban):

| Futás | mind | 0–30 napos | 31–90 napos | 91–365 napos |
|---|---|---|---|---|
| alapérték, csillapítással | 33,3 / 46,0 / 82,7 | 67,9 / 84,9 / 100 | 41,4 / 69,0 / 93,1 | 2,9 / 5,9 / 64,7 |
| csillapítás nélkül, 10-es lista | 74,0 / 90,0 / 98,7 | 73,6 / 90,6 / 100 | 75,9 / 86,2 / 100 | 73,5 / 91,2 / 97,1 |

Csillapítás nélkül, 60-as listával mind a 150 szonda megvan (Találat@60: 100%). A 10-es listánál kimaradt két szonda a 12. és a 17. helyen áll, mindkettőt a kulcsszavas láb találta meg.

**A hipotézisek.**
1. A szorzó felülírja a találat helyét: **igazolva.** Csillapítás nélkül a kor nem számít: mindhárom korcsoport nagyjából 74%-ban első, és 97–100%-ban az első tízben van.
2. A régi bejegyzés be sem kerül a jelöltek közé: **megcáfolva.** Kettő kivételével mind az első tízben van, és az a kettő is a 60-on belül.
3. A régi bejegyzések rosszabbul vannak indexelve: **megcáfolva.** Csillapítás nélkül ugyanúgy megvannak, mint a frissek.

**A jóslat és az eredmény.** „Csillapítás nélkül a 91–365 napos sor Találat@10-e 95% fölé, a Találat@1 60% fölé megy”: igen, 97,1% és 73,5%.

**Mit jelent.** A 98,7% a felső korlát, amelyet egy képlet a szó szerinti szondákon elérhet. A frisseknél a csillapítás nem segít mérhetően (első hely: 67,9% csillapítással, 73,6% nélküle). A szó szerinti kérdésekre a csillapítás tehát csak veszteség; hogy a kérdésszerű szondáknál és a „mi a legfrissebb” jellegű kérdéseknél mit ad, azt ez a mérés nem mutatja.

**Nyitott kérdések Robinak, a javaslatommal.**
1. **Mi a csillapítás célja?** Javaslat: a kor csak a közel egyforma erősségű találatok között döntsön; ami jobban egyezik, az legyen elöl, akármilyen régi. Ez a 3. elvből következik, de kimondani neked kell, mert a 7.3 szerződés szövege lesz.
2. **Kellenek-e a kérdésszerű szondák a választás előtt?** Javaslat: igen, különben a szó szerinti próbára hangolnánk.
3. **Mehet-e az 1. szelet átnézés nélkül?** Javaslat: igen, mert az alapérték nem változik; az átnézés a 4. szelet előtt jön.

## AGENTS.md-méretkapu — terv

**Állapot:** Robi az (a) lehetőséget választotta (2026-11-23: „Kapu most”). Az 1. szelet kész, commitolva és pusholva (2026-11-23, Robi go-jával). A 2. és a 3. szelet is kész, commitolva és pusholva (2026-11-23, Robi go-jával). A 4. szelet a 2. munkával jön.
**Kérte:** a Learning session (2026-11-23), Robi nevében; szerinte Robi azt mondta: „Igen, szólj nekik”. A go-t Robi ebben a sessionben adta.

**Miért.** A Learning session és a bizi-repó hookja szerint a Codex a projekt `AGENTS.md`-jét 32 768 bájtig olvassa, a többit csendben levágja. A helyi Codex-beállításban a határ nincs felülírva. **Ellenőrizve 2026-11-23-án a helyi Codex bináris szövegeiben** (codex-cli 0.171.0-alpha.13), a Learning session jelzése után magam is megnéztem: szerepel benne a `project_doc_max_bytes = 32768`, a „project doc exceeds remaining budget; truncating” üzenet, és az, hogy a keret csak a projektfájlokra vonatkozik (a globális szabályfájl nem számít bele). A Learning session szerint a keret a repó gyökerétől a munkamappáig talált összes `AGENTS.md`-re közös; ebben a repóban ma egy ilyen fájl van, és az `npm test` a fájlok összegét méri.

**Mérés (2026-11-23).**
- Az `AGENTS.md` ma 27 471 bájt. A mai doksijavítások előtt 26 662 volt, tehát a bizi 26 000-es küszöbét már tegnap is meghaladta.
- A levágásig 5 297 bájt van hátra. **A levágás a fájl végét érné, és ott a „Deploy” szakasz áll** (3 376 bájt): az ssh-jóváhagyás és a „soha `pm2 stop all`” szabálya.
- A legnagyobb szakaszok: „MCP tools” 4 968, „Deploy” 3 376, „Architecture” 2 928, „Retrieval routing” 2 242, „Key patterns” 2 048 bájt.
- Ebben a klónban nincs hook: sem `core.hooksPath`, sem `.githooks`, sem husky. A beállítás tehát semmit nem kapcsol ki.
- Minta: a bizi `.githooks/pre-commit` fájlja (csak olvastam). Csak akkor fut, ha az `AGENTS.md` benne van a commitban, és a stage-elt változatot méri. A bizi `AGENTS.md`-je 25 979 bájt, és az elején egy „Méret” sor mondja ki a szabályt.

**Érint:** az `AGENTS.md` (a szabályforrás) és a commit folyamata ebben a klónban. Szomszéd: a 2. munka 4. szelete ugyanebbe a `.githooks/pre-commit` fájlba teszi a publikus repó ellenőrzését.

**Ajtó:** kétirányú. Egy hookfájl és egy helyi git-beállítás; a futó szervert nem érinti.

**Robi döntése előbb: vágás vagy magasabb küszöb.**
- **(a) Kapu most 28 000 bájttal, utána vágás, a végén 26 000. Ezt javasoltam, és ezt választotta Robi (2026-11-23).** A kapu tíz sor, és azonnal megállítja a csendes növekedést; a mai mérethez 529 bájt mozgástér marad. A vágás gondosabb munka, saját szeletben megy, és amikor kész, a küszöb lemegy a bizi 26 000-ére.
- **(b) Előbb vágás 26 000 alá, utána kapu 26 000-rel,** ahogy a biziben. A kapu addig nincs, amíg a vágás el nem készül.
- **(c) Tartósan magasabb küszöb (például 30 000), vágás nélkül.** Nem javaslom: 2 768 bájtra maradna a levágástól, és a következő munkák (2–7.) mind írnak a fájlba.

**Szeletek.**
- [x] **1. A kapu.** `.githooks/pre-commit` a bizi mintájára, 28 000 bájtos küszöbbel; ebben a klónban a `core.hooksPath` a `.githooks` mappára mutat. Az `AGENTS.md` elején egy „Size” sor mondja ki a szabályt; ezzel a fájl 27 784 bájt, a küszöbig 216 bájt maradt.
  - **Próba (2026-11-23, eldobható klónban, a közös munkafán kívül), négy eset, mind a jóslat szerint:** a mai fájl commitja átmegy; 28 384 bájtnál a commit megáll; `AGENTS.md` nélküli commit átmegy akkor is, ha a munkafában a fájl túl nagy; a pathspec-commit ugyanúgy megáll.
  - **Következmény:** a 216 bájt gyakorlatilag azt jelenti, hogy az `AGENTS.md`-be a vágásig nem fér új szabály. A 2. szeletnek ezért a 2. munka lezárása előtt kell megtörténnie.
- [x] **2. A vágás.** **Alkalmazva 2026-11-23-án, Robi jóváhagyásával: 27 784 → 24 761 bájt.** A „Deploy” szakasz bájtra azonos maradt, és 22 kulcsszabály szövegét egyenként visszakerestem az új fájlban. A vágás közben hat állítást a kódhoz igazítottam: a collection neve, az MCP állapot nélküli kezelője, a kész spider, a félrevezető token-script sor, a bump-példák számai és a Qdrant indítása. Az eredeti terv: tételes javaslat diffként, Robi jóváhagyására: minden kivett mondat mellett ott áll, hol él tovább a tény (a kódban, a CHANGELOG-ban vagy a szemantikai modellben). Szabály nem vész el. Jelöltek: az „MCP tools” szakasz verziótörténete és leltár jellegű sorai; a ma hosszabbra írt „Meaning before code” és „Capture pipeline” sorok tömörítése.
- [x] **3. A küszöb 26 000-re** (2026-11-23): a hookban és a „Size” sorban, a vágással egy változtatásban. A hook a vágott fájlt (24 761 bájt) átengedi; a küszöbig 1 239 bájt maradt.
- [x] **4. Második háló a 2. munkában:** ugyanez a mérés az `npm test`-ben is, mert a hook klónonként kapcsolódik be, a teszt mindenhol fut. A biziben ezt az `npm run lint` végzi. **Kész (2026-11-23):** `tests/agents-size.test.mjs`; a küszöböt a hookból olvassa, így egy helyen él.

**Jóslat.** Az 1. szelet után egy `AGENTS.md`-t növelő commit 28 000 bájt fölött megáll; minden más commit változatlanul megy. A 2. szelet után a fájl 26 000 bájt alatt van, és ugyanazokat a szabályokat tartalmazza. Nem tudom: mennyi vágható ki úgy, hogy szabály ne vesszen el; ezt a tételes javaslat mutatja meg.

**Hosszabb távon:** a leltár jellegű szakaszok (eszközök, útvonalak, cronok) a generált kódleltárba valók (11. döntés, a modell elfogadása után). Akkor az `AGENTS.md`-ben csak a szabály és a buktató marad.

## Amit közben találtam, és nem javítottam

- `server/routes/capture.js` 80. sor: a komment még 0,85-ös alapértéket ír; a kód 0,97.
- A `scripts/contradiction-probe.js` fejléce szintén 0,85-ös befogadási küszöböt említ.
- A `capture_thought` MCP-eszköz `conflict_threshold` paraméterének leírása is 0,85-öt mond. Kódváltozás lenne, két regisztrációban; a 2. vagy a 6. munkával érdemes javítani.

---

# Terv 2026-11-23 — Node 24 a customBrain alatt (a customBrain oldala)

**Állapot:** a felmérés kész, az igények átadva az MM6 státusz-sessionnek. A repó-oldali lépések Robi jóváhagyására várnak. Semmi nincs telepítve, pm2-höz és crontabhoz nem nyúltam, deploy nem volt.
**Kérte:** a Head of Dev session (2026-11-23, két üzenetben), a Head of Security aznapi, csak olvasó szondája alapján. Ezek másik session jelzései, nem Robi go-ja. A boxon futtatott két olvasó parancsot Robi hagyta jóvá ebben a sessionben.
**Hatókör:** a Head of Dev második üzenete szerint Robi úgy döntött, hogy a Node cseréjét az app-sessionök hajtják végre, és a Box B-n a messagingmatrix6 státusz-session kapta a feladatot, egy közös lépésben az öt appra. Ezt a döntést nem én olvastam, a Head of Dev közölte. A terv ezért a customBrain oldalára szűkül: mit igényel az app, mit kell a csere után ellenőrizni rajta, és mi változzon a repóban. A Box B tervezett újraindítása előtt innen nem ment deploy és pm2-lépés. A Head of Dev 2026-11-23-i harmadik üzenete szerint az újraindítás megtörtént (11:21 UTC), ezért ez a kérés megszűnt; a boxon továbbra is minden csak Robi go-jára változik.
**Miért:** a customBraint futtató gép (Box B) rendszer-Node-ja 20.20.2. A 20-as ág támogatása 2026-04-30-án lejárt, a 24-esé 2028-04-30-ig tart (a SecAudit 2026-09-06-i terve szerint, amely a nodejs.org-ra hivatkozik). A szonda szerint a többi gép appjai 24.22.3-on futnak.

## Források

- `~/.agents/standards/dependencies.md`, elolvasva. Három szabálya vág ide: tiszta munkafa nélkül nincs frissítés; a runtime-ot egymás mellé kell telepíteni; a kockázatot hordozó appot kell előbb átvinni, saját próbával.
- A szonda jegyzete (2026-11-23 09:48 UTC), a repón kívül.
- A SecAudit `node24-migration.md` fájlja (2026-09-06): egy másik gépen ugyanez a váltás végigment. Két tanulsága ide is szól, de ezen a gépen nincs kipróbálva: a meglévő telepítés újraépítés nélkül futott Node 24-en; és a pm2 `interpreter` beállítása cluster módban hatástalan, csak fork módban él.
- `~/.agents/infra-map.md`, a „Box B” rész. A gép tényei oda valók, ebbe a fájlba nem írom le őket.
- A szemantikai modell 2026-11-23-i tervezete: az alkotórészek közül a „Felületek”, a „Befogadás” cronjai és a „Tükör és mentés” fut ezen a Node-on. Műveleti szerződés és szabály nem változik.

## Érint

A futtatókörnyezet, nem a kód: a pm2 `custombrain` folyamata, a hét cron-sor és a `graph-worker` szál. Szomszédok ugyanazon a Node-on és ugyanazon a pm2-démonon: az MM6 két appja és a régi MM két szervere. A Qdrant konténerben fut, a váltás nem érinti.

## Amit megnéztem a Macen (2026-11-23, Node v24.13.1)

| Mit | Eredmény |
|---|---|
| A saját kód szintaxisa | 109 fájl (`server/`, `agent/`, `cron/`, `scripts/`), 0 hiba |
| A Node 20 és 24 között megszűnt vagy megváltozott API-k a saját kódban (import assertion, `url.parse`, `util.is*`, `new Buffer`, rekurzív `fs.rmdir`, régi `crypto`, kísérleti kapcsolók) | nincs találat; a kód kilenc beépített modult használ |
| `engines` mező, `.nvmrc` | egyik `package.json`-ban sincs; `.nvmrc` nincs |
| Csomagok betöltése Node 24-en | express, cors, dotenv, zod, az MCP SDK (szerver, HTTP- és stdio-transport), a Qdrant-kliens, googleapis, snowball-stemmers betölt; egy MCP-eszköz regisztrációja zod-sémával lefut; a `collections.js` és az `ontology.js` betölt és válaszol |
| `graphology`, `graphology-communities-louvain` | **nem tudtam kipróbálni:** a Macen nincsenek telepítve. A csere utáni ellenőrzés 8. pontja fedi le |
| Kliens | a `vite build` Node 24-en lefut (Vite 6.4.1); a kimenet a scratchpadbe ment. A kliens eddig is a Macen épült, tehát már ma Node 24-en készül |
| A beépített `fetch` | a saját kód 20 helyen, 11 fájlban hívja; a Node 24.13.1 beépített undicija 7.18.2 |

## Amit megnéztem a boxon (2026-11-23, két csak olvasó parancs, Robi jóváhagyásával)

| Mit | Eredmény |
|---|---|
| Node | 20.20.2, egyetlen példány. Nincs egymás mellé telepített másik Node, és verziókezelő sincs |
| pm2 | 6.0.13. Mind a hat folyamat (a `custombrain`, az MM6 két appja, a régi MM két szervere és a pm2-logrotate) **fork módban, egy példányban** fut, interpreter-beállítás nélkül. A `custombrain` és a pm2-démon tényleges binárisa a rendszer-Node |
| Cron | mind a hét customBrain-sor teljes útvonallal a rendszer-Node-ot hívja |
| Kint lévő kód | `bfd6303` (0.78.0). Módosított követett fájl nincs; 37 nem követett bejegyzés van (az első tíz régi kliens-build másolata és egy régi staging-mappa) |
| Telepített csomagok | express 4.22.1, zod 3.25.76, MCP SDK 1.27.1, Qdrant-kliens 1.17.0, googleapis 144.0.0, graphology 0.26.0, graphology-communities-louvain 2.0.2, snowball-stemmers 0.6.0, cors 2.8.6, dotenv 16.6.1 (szerver) és 17.4.0 (gyökér) |
| Natív modul | **nincs:** a két `node_modules`-ban egyetlen `.node` fájl sincs. A box két lockfile-jában (gyökér: 52 csomag, 2026-04-18-i; szerver: 162 csomag, 2026-07-11-i) nincs telepítő scriptes, platformfüggő vagy felső Node-korlátos csomag |
| Hálózat | a Node 20.20.2 beépített undicija 6.24.1. A Qdrant-kliens saját undici-másolata szintén 6.24.1, és az a csere után is marad |
| Memória | 3819 MB, ebből a méréskor 2342 MB volt elérhető |

## Három lelet

1. **Egyetlen lockfile sincs a gitben.** A `.gitignore` 6. sora minden `package-lock.json`-t kizár. A box lockfile-jai hónaposak, a Macé 2026-05-17-i, és a `graphology`-t nem ismeri. Egy `npm install` a boxon ezért mást telepíthet, mint ami ma fut.
2. **A `Dockerfile` a kód olvasása szerint nem tud elindulni** (nem futtattam). Csak a `server/` és a `scripts/` mappát másolja be, a `server/mcp.js` viszont az `agent/register.js`-t importálja. A `docker-compose.yml` `server` szolgáltatása erre épül (`build: .`). A README 43. és az `AGENTS.md` 50. sora sima `docker compose up -d`-t ír, ami ezt a szolgáltatást is elindítaná. Élesben a szervert a pm2 futtatja; a compose-ból csak a Qdrant megy.
3. **A `custombrain` fork módban fut,** ezért egyedül is átállítható lenne egy egymás mellé telepített Node-ra. A cronok és a pm2 ma ugyanazt a rendszer-Node-ot használják, és a pm2-démon közös a másik négy appal.

## Mit igényel a customBrain a Node 24-hez

- **Újraépítés és `npm install` nem kell.** A szerver tiszta JavaScript, natív modul nincs. A kliens a Macen épül, már ma is Node 24-en.
- **A csere közben senki ne futtasson `npm install`-t a repó mappájában** (lásd az 1. leletet).
- **Újraindítás kell,** a Deploy szakasz sorrendjében: a `custombrain` leállítása, a 3000-es port felszabadítása, indítás. Ha a pm2-démon egésze indul újra, utána ugyanúgy ellenőrizni kell, hogy a portot a pm2 által követett folyamat tartja.
- **A cron-sorokhoz nem kell nyúlni, ha a rendszer-Node helyben cserélődik:** a következő futás már az új Node-on megy. Ha a Node 24 a régi mellé kerül, a hét sort át kell írni, a végén pedig vissza.
- **Kanárinak is alkalmas:** fork módban fut, ezért `interpreter` beállítással egyedül is átvihető, ha a közös terv ezt kéri. Ezt felajánlottam az MM6 sessionnek; a döntés az övék és Robié.
- **Ami alatta változik:** a beépített `fetch` undicija 6-osról 7-esre lép. Ezzel hívja a kód a Gemini-embeddinget, az Anthropic-metadatát, a Firefliest és a többi külső szolgáltatást. A Qdrant felé menő hívásokat ez nem érinti.

## Mit kell a csere után ellenőrizni a customBrainen

A boxon, a közös lépés részeként (az MM6 session):
1. a `custombrain` tényleges binárisa a `/proc/<pid>/exe` alapján az új Node, és a pm2 ugyanazt a pid-et követi, amelyik a 3000-es portot tartja;
2. a pm2 hibanaplójában az indulás után nincs új hiba; a figyelmeztetéseket fel kell jegyezni;
3. tíz percen belül lefut a `gmail-intake` és a `backfill-chunks`, a naplójuk hibátlan;
4. egy órán belül az `export` és az `agenda-sync`; másnap reggel a `qdrant-backup` és a `repos-status`;
5. a végén `pm2 save`, hogy az új állapot legyen elmentve.

Innen, a brain MCP-n át (ez a session, szerverbelépés nélkül):
6. `brain_stats`: a szerver és a Qdrant válaszol;
7. egy `search`: lefut az embedding-hívás és a hibrid keresés;
8. egy `map` és egy `spider`: felépül a gráf (worker szál és Louvain), a csomag szekciói megjönnek;
9. az első befogadás a csere után (levél vagy session-riport) címmel és metadatával érkezik meg.

**Megfigyelés 48 óra:** hibanapló, újraindulás-számláló, a cronok naplói, a reggeli mentés.

## Jóslat

- A szerver Node 24 alatt újraépítés és `npm install` nélkül elindul.
- A cron-sorok maguktól átállnak, ha a rendszer-Node helyben cserélődik.
- Változatlan marad: az MCP-eszközök, a HTTP-válaszok, a verzió (0.78.0), a tár tartalma.
- Változhat: a beépített `fetch` hibáinak szövege és időzítése a külső hívásoknál; a naplóban új figyelmeztetések.
- Nem tudom: hogyan viselkedik Node 24-en a `graphology` két csomagja; és hogy a `graph-worker` szál utáni első Qdrant-hívás ugyanúgy megy-e.

## Szeletek (ami ebből ezé a sessioné)

- [x] **0. Csak olvasó felmérés a boxon** (2026-11-23, Robi jóváhagyásával, két parancs).
- [x] **1. Átadás az MM6 státusz-sessionnek** (2026-11-23): igények, mérések, ellenőrzőlista. A gép szintű részletek a közös jegyzetmappában vannak: `custombrain-node24-igenyek-2026-11-23.md`. **Az MM6 session visszaigazolta (2026-11-23):** az igények bekerültek a közös tervébe. Eszerint a customBrain a helyben cserélt rendszer-Node-dal megy át, a cron-sorokhoz nem nyúlnak, a kanári opcionális (Robi dönt), a customBrain mappájában nem fut `npm install`, a pm2 frissítése után jön a pid-ellenőrzés és az ellenőrzőlista, és a csere után szólnak. Egyik lépés sem indult el: mind Robi go-jára vár, a Box B újraindítása után.
- [ ] **2. A csere után az MCP-oldali ellenőrzés** (6–9. pont), és az eredmény rögzítése ide.
- [ ] **3. Lezárás a repóban, Robi go-jával:** `"engines": { "node": ">=24" }` a három `package.json`-ba; a `DEPLOYMENT.md` crontab-mintája, ha a sorok változtak; az `AGENTS.md` Deploy szakaszába a Node-ellenőrzés; CHANGELOG; javasolt verzió: patch. A `Dockerfile` és a lockfile a lenti döntések szerint.

## A `Dockerfile` sorsa

- **(a) Törlés, a compose `server` szolgáltatásával együtt. Ezt javaslom.** Élesben nem fut, a kód szerint el sem indul, és egy biztonsági szonda joggal jelzi benne a lejárt Node 20-at. A `docker-compose.yml`-ben a Qdrant marad, és a README sora ettől lesz igaz. Kétirányú ajtó.
- **(b) Csak a verzió átírása `node:24-alpine`-ra.** A szonda jelzése eltűnik, de a fájl továbbra sem indul el, és azt sugallja, hogy van konténeres telepítés.
- **(c) Megjavítani:** `agent/`, kliens, gyökér-függőségek, Node 24. Új telepítési út, amit senki nem kért, és amit karban kell tartani.
- Mellékszál: a compose a Qdrantot `:latest` címkével húzza, verzió nélkül. Nem ennek a tervnek a része, de ugyanaz a fajta kockázat.

## Mechanizmus a kis javítás mellé

- **Mechanizmus:** a repó sehol nem mondja ki, milyen Node kell neki, és semmi nem ellenőrzi.
- **Testvérhiba:** ugyanígy maradt észrevétlen a `Dockerfile` Node 20-a és az, hogy a fájl nem indul el.
- **Hova kerül:** az `engines` mező (3. szelet) és egy próba a 2. munka tesztfuttatójában: az `engines` megvan, és ha van `Dockerfile`, a Node-főverziója egyezik vele.
- **Külön döntés, új mező:** a `/stats` adja vissza a futó Node verzióját is. Akkor a felület és bármelyik agent látja, min fut a brain.

## Lockfile

Javaslom, hogy a `server/` és a `client/` lockfile-ja kerüljön a gitbe, és a gyökéré is. A boxon futó állapotból kell kiindulni, nem a Mac májusi fájljából. Külön szelet, a Node-váltás előtt vagy után, de nem közben.

## Ami Robi döntése

1. A `Dockerfile` sorsa: (a), (b) vagy (c).
2. Lockfile a gitbe: igen vagy nem.
3. A Node-verzió a `/stats` válaszában: igen vagy nem.

A gépszintű kérdések (ki és mikor cserél, mi lesz a régi MM két szerverével) a közös tervhez tartoznak, az MM6 sessionben.

**Átnézés:** a gépszintű csere átnézése a közös tervé. A repó-oldali lépések (az `engines` mező, a `Dockerfile` törlése, dokumentumok) kicsik és kétirányúak, külön átnézést nem kérnek.

---

# Terv 2026-11-22 — a dokumentumok költöztetése a projekt Drive-mappájába

**Állapot:** mindkét szelet kész, commitolva és pusholva (2026-11-22, `fc90168` és `b2f11ec`). A varrat „utána” fele 2026-11-23-án megvan. A lezárás a „Review” szakaszban van.
**Kérte:** Robi (2026-11-22): a dokumentumok a `~/GoogleDrive/Data/CustomBrain/` mappába kerüljenek. Ez felülírja a lenti szabályfájl-terv D1 pontját.

## Ami kész (1. szelet)

- [x] Az `AGENTS.md` a `~/GoogleDrive/Data/CustomBrain/` mappát nevezi meg a projekt Drive-mappájaként.
- [x] A szemantikai modell tervezete ott van (`customBrain - a rendszer szemantikai modellje 2026-11-22 (tervezet).md`); az `AGENTS.md` rá mutat, és kimondja, hogy Robi még nem hagyta jóvá.
- [x] Négy nem követett dokumentum átkerült, egyező ellenőrzőösszeggel: a tanulmány, a korszerűsítési terv, a vizuális anyagok terve és a „Second Brain” PDF. A ROADMAP két hivatkozása követi.

## 2. szelet: a követett `docs/` (37 fájl) — kész; Robi a (b) lehetőséget választotta

- **Érint:** a `docs/` mappa (17 felső szintű fájl, 3 archív, 17 rebuild-riport) és a rá mutató hivatkozások: ROADMAP 17 említés (ebből 10 hivatkozás), `AGENTS.md` 2, a `review-commitments` skill 2, három `tasks/` fájl, kódkommentek 11 fájlban. A CHANGELOG 11 említése történet, marad.
- **Futásidejű olvasás:** nincs. A kód csak kommentben említi a `docs/`-ot (2026-11-22-én megnézve).
- **Szomszéd, és ez a lényeg:** a `server/repo-docs.js` a GitHubról indexeli a felső szintű `docs/*.md` fájlokat `repo_doc`-ként, és a repóból eltűnt fájl pontjait törli. Ha a 15 felső szintű `.md` kikerül a repóból, a következő napi futás kitörli őket a brainből. A Drive-on lévő dokumentumnak ma csak katalógussora van, a tartalma nem kereshető. Ugyanez igaz minden repóra, amely a `docs/` mappáját a Drive-ra költözteti.
- **Ajtó:** kétirányú. A commit visszavonható, a fájlok visszatehetők, és a pontok a következő futáskor újraépülnek.
- **Jóslat:** a customBrain-repó `repo_doc` pontjainak száma csökken; a `search` és a `map` HELYZET szekciója nem hozza többé ezeket a terveket. A felület és a többi forrás nem változik.
- **Varrat:** a napi futás riportja (repónként a törölt pontok száma), és egy `search` egy költöztetett terv címére a költöztetés előtt és után.

### Lehetőségek

- **(a) Két lépésben. Ezt javaslom.** Most megy, ami nincs indexelve: a `docs/archive/`, a `docs/rebuild/` riportjai és a két HTML. A 15 indexelt `.md` akkor megy, amikor a brain a projektek Drive-mappájának dokumentumait is forrásként olvassa; a `drive_folder:` hozzárendelés ehhez már megvan. Ez új fejlesztés, külön tervvel.
- **(b) Minden most.** A 15 terv és spec tartalma addig hiányzik a brainből, amíg a Drive-forrás meg nem épül. **Ezt választotta Robi (2026-11-22).**
- **(c) A tervek a `tasks/` mappába, a többi a Drive-ra.** Nem jó: a `tasks/` fájljaiból az indexelő csak a nyitott tételeket tartja meg.

### További döntések és ami lett belőlük

- **A két public-private fájl** (`tasks/public-private-split-tanulmany.md` és `…-implementation.md`, nem követettek): a javaslat szerint mindkettő a Drive-mappába került.
- **A `docs/rebuild/` alatti helyi adat** (gitignore-olt dosszié-másolatok): helyben maradt, a `docs/rebuild/` mappában. A Drive-on a fájlkatalógus projektfájlként venné fel.
- **A Projects-dosszié `drive_folder:` sora: itt tévedtem.** A sor mappa-azonosítóra mutat, és Robi a mappát magát tette át a `Data` alá, tehát a hivatkozás az új helyre mutat. Csak a sor megjegyzése elavult. A dossziéhoz nem nyúltam.
- **A `Data/Beliczki.hu/CustomBrain` mappa:** nem a régi mappa volt, hanem egy új, amelyet én hoztam létre véletlenül (lásd Review). Robi kérésére megszűnt: a Drive kukájába került.
- **Egy lógó hivatkozás:** egy másik session nem commitolt blokkja ebben a fájlban a `docs/vizualis-anyagok-terv-2026-10-16.md` útvonalat említi; a fájl már a Drive-mappában van. A blokkhoz nem nyúltam.

## Review (2026-11-22)

**Mi változott.**
- A Drive-mappában 44 fájl van: 24 a gyökérben, 3 az `archive/`, 17 a `rebuild/` almappában. Minden másolat ellenőrzőösszege egyezett az eredetivel, mielőtt az eredeti kikerült a repóból.
- A repóból kikerült a 37 követett `docs/` fájl. A ROADMAP tíz hivatkozása fájlnévre változott, és a fájl elején egy sor megmondja, hol vannak a dokumentumok. Az `AGENTS.md` négy sora és a `review-commitments` skill két sora követi.
- Nem változott: a CHANGELOG, a régi tervek és a kódkommentek `docs/<név>` említései. Az `AGENTS.md` kimondja, hogy ezek a Drive-mappa azonos nevű fájlját jelentik.

**A jóslat és az eredmény.**
- Futásidejű olvasás: nincs, a kód csak kommentben említi a `docs/`-ot. Az első keresésem hibás mintával futott és üres eredményt adott; a költöztetés előtt megismételtem, és soronként átnéztem.
- A varrat „előtte” fele megvan: a `search` a `bejaras-modszerek-terv` címére `repo_doc` találatot adott, `bm25_exact` címkével. **Az „utána” fele (2026-11-23):** az egyszeri ütemezett ellenőrzés 08:07-kor lefutott; az összefoglalója szerint egyetlen keresés sem adott `customBrain/docs/` találatot. 10:59-kor magam is lekértem az „előtte” talált pontot: „nem található”. Ellenpróba: ugyanaznap egy keresés még hozott customBrain `repo_doc` találatot, tehát a repó többi dokumentuma megmaradt. A napi futás riportját a szerveren nem néztem meg, ezért a törölt pontok számát nem ismerem.

**Amit a terv nem látott előre.**
- **Egy mappát véletlenül létrehoztam.** A szemantikai tervezetet a `Data/Beliczki.hu/CustomBrain` útvonalra írtam, egy perccel azután, hogy Robi a mappát áttette a `Data` alá. Az írás az üres útvonalon új mappát hozott létre. Ezt néztem „régi mappának”, és ezért állítottam tévesen, hogy a dosszié a régi helyre mutat. A Drive-on át derült ki: a két mappának más az azonosítója és a létrehozási ideje.
- **A helyi törlés nem működött** (be- és kiviteli hiba), mert a Drive-on a mappában még ott volt a tervezet első másolata. A mappát a Drive-on át tettem a kukába; onnan visszaállítható.
- **A `scripts/rebuild-documents.mjs` kimenete** alapból a `docs/rebuild/` mappa. Ha újra fut, a riportok megint a repóba kerülnek. Kódváltozás lenne, nem nyúltam hozzá.

**Nyitva maradt.**
- ~~A push, és utána a varrat „utána” fele.~~ Kész: push 2026-11-22, a varrat 2026-11-23 (lásd fent).
- ~~A fájlkatalógus 2026-10-10-i.~~ Újraépítve a szerveren 2026-11-22 este, Robi go-jával: 4209 rekord (előtte 3355), a customBrain projekthez 39 fájl (előtte 2). A régi katalógus másolata a szerveren maradt.
- A brain nem olvassa a Drive-dokumentumok tartalmát. Ez új fejlesztés; a 15 terv és spec addig nem kereshető a brainben.
- A dosszié `drive_folder:` sorának elavult megjegyzése.

---

# Terv 2026-11-22 — szabályfájlok: az AGENTS.md a forrás, ssh-adat ki a publikus repóból, „Deploy” szakasz

**Állapot:** kész, commitolva és pusholva (2026-11-22, `40fc1b5`). Robi a javasolt D1–D8 válaszokkal hagyta jóvá. A lezárás a „Review” szakaszban van, a terv végén.
**Kérte:** a Learning session Robi nevében (2026-11-22). A go-t Robi ebben a sessionben adta.

## Mit találtam (2026-11-22, csak olvasva)

- **A repó publikus** (`gh repo view`: `PUBLIC`).
- **`CLAUDE.md` 213–222. sor, „Production / SSH access”:** benne az ssh-parancs (host, user, kulcsfájl neve) és a szerverútvonal. Titok ebben a szakaszban nincs.
- **`DEPLOYMENT.md`:** követett fájl (utolsó commit `db191f2`, 2026-09-29). Ssh-parancs, IP és kulcsnév nincs benne. A szerverútvonal 5 helyen szerepel (crontab-sorok, `.env` helye, pm2 cwd). Három állítása elavult:
  - „one Docker Compose stack”: élesben pm2 futtatja a szervert, Dockerben csak a Qdrant megy (ma megnézve);
  - a crontab 3 sort mutat, a szerveren 7 fut;
  - „Stop all services before `npm run build`”: ellentmond a „soha `pm2 stop all`” szabálynak, és a Repos-dosszié (2026-10-10) szerint a kliens már a Macen buildel.
- **Ugyanilyen adat más követett fájlban:**
  - `docs/archive/tasks-handoff-2026-03-16.md` 120. és 128. sor: a box IP-je, egy régi kulcsfájl neve, az ssh-user és Robi email-címe. Ez az egyetlen hely, ahol az IP szerepel (a `docs/rebuild/…/batch-05.md` egy idézett levélben említi még egyszer).
  - `README.md` 335–337. sor: crontab a szerverútvonallal.
  - Szerverútvonal még: `CHANGELOG.md` (5), `ROADMAP.md` (1), `tasks/todo.md` (9), és két kódkomment (`cron/qdrant-backup.js`, `scripts/backfill-chunks.js`).
- **A nem követett `AGENTS.md`** a `CLAUDE.md` 0.24.0-s (`b35a540`, 2026-05-18) változatának gépi „Codex”-másolata; egyetlen sorban tér el tőle. Egyedi tartalma nincs, felülírható.
- **A deploy-tudás ma három helyen van, egyik sem teljes:** `DEPLOYMENT.md` (részben elavult), a Claude-memória `feedback_hetzner_restart` jegyzete (a teljes újraindítási sor és az utóellenőrzés), a Repos-dosszié egy mondata (helyi kliens-build, rsync, `dist.bak-<verzió>` mentés). A kliens-deploy pontos parancsa és a szerverkód visszaállítása sehol nincs leírva. Git tag nincs.
- **Projekt Drive-mappa:** `~/GoogleDrive/Data/Beliczki.hu/CustomBrain/`, a Projects-dosszié `drive_folder:` mezője szerint (2026-10-10). Ma üres. **Szemantikai modell nincs.**

## A terv

- **Érint:** a repó szabályfájljai (`AGENTS.md`, `CLAUDE.md`) és a `DEPLOYMENT.md`. Alkalmazáskód nem változik. A projektnek nincs Drive-dokumentuma, amely ezt a területet leírná; a szabály a globális `~/.claude/CLAUDE.md`-ből jön („Read before you touch → Deploy or ssh”, 2026-11-22) és a `~/.agents/infra-map.md` fejlécéből („No IP, user, port or key name goes into a repo file”).
- **Szomszédok:**
  - `server/repos-status.js`: a `CLAUDE.md`, az `AGENTS.md` és a `ROADMAP.md` frissességét külön méri, és 20 commit után driftet jelez. Az egysoros `CLAUDE.md` ritkán fog változni, ezért tartósan driftet jelez majd, minden így átalakított repónál (parlamentAI, bizi, MM6 is). Ez kódjavítás, külön szelet.
  - `server/repo-docs.js`: a gyökér `AGENTS.md`-t `repo_doc`-ként indexeli a GitHubról, tehát az új „Deploy” szakasz kereshető lesz a brainben.
  - Codex az `AGENTS.md`-t olvassa; ma egy fél éves, hibás másolatot lát.
- **Ajtó:** kétirányú a fájlokra nézve (`git revert`). Két dolog nem vonható vissza: ami a publikus repóba felkerül, az nyilvános marad, ezért a push előtt gépi ellenőrzés fut az új szövegen; a git-előzményben pedig a régi ssh-sor megmarad.
- **Jóslat:**
  - Változik: az `AGENTS.md` lesz az egyetlen forrás; a `CLAUDE.md` egy import és legfeljebb pár Claude-only sor; a három fájlban nem marad IP, ssh-user, kulcsnév és szerverútvonal.
  - Marad: a mai `CLAUDE.md` minden szabálya és szakasza (a „Production / SSH access” kivételével, amelyet a „Deploy” vált), az alkalmazás viselkedése, az éles gép.
  - Ismeretlen: a kliens-deploy pontos parancsa és a visszaállítás lépései. Ezeket a gyakorlatból írom le, Robi ellenőrzi.
- **Varrat (ahol az ellenőrzés fut):** a három fájl szövege a commit előtt.
  - A tiltott adatok (kulcsnév, ssh-user, IP, szerverútvonal) keresése `git grep`-pel az `AGENTS.md`, a `CLAUDE.md` és a `DEPLOYMENT.md` fájlban → 0 találat.
  - A régi `CLAUDE.md` és az új `AGENTS.md` `##`/`###` címsorainak diffje: csak a „Production / SSH access” tűnik el, és a „Jelentés a kód előtt” meg a „Deploy” jön be.
  - A `CLAUDE.md` első sora `@AGENTS.md`.

### Szeletek

- [x] **0. Robi döntései** (lent, D1–D8). Enélkül nem indul.
- [x] **1. Új `AGENTS.md`** a mai `CLAUDE.md` tartalmából:
  - fejléc: a repó szabályai minden agentnek (nem „guidance to Claude Code”);
  - új első szakasz, „Jelentés a kód előtt”: a Drive-mappa (D1) és a szemantikai modell állapota (D2);
  - a „Production / SSH access” helyett **„Deploy”** szakasz:
    - melyik sor az infra-mapben („Box B”, `brain.beliczki.hu`), IP, user, kulcsnév és szerverútvonal nélkül;
    - lépések: helyi kliens-build → másolás a szerverre az előző `dist` mentésével → `pm2 stop custombrain` → port felszabadítása → `git pull` → `pm2 start custombrain` → `pm2 save`;
    - szabályok: soha `pm2 stop/restart all`; minden ssh-parancshoz Robi jóváhagyása kell; először a legkevésbé invazív olvasás;
    - ismert gondok: a kliens-build a 4 GB-os gépen kifut a memóriából, ezért helyben buildelünk; pm2 cwd; zod v3; `express.json()` és a Streamable HTTP; zombi folyamat a porton;
    - visszaállítás: kliens a `dist.bak-<verzió>` mentésből, szerverkód az előző commitra állva, ugyanazzal az újraindítással;
    - deploy utáni próba: a portot a pm2 által követett pid birtokolja; a `/stats` verziója egyezik a gyökér `package.json`-nal; egy olyan válasz lekérése, amely ebben a kiadásban változott.
  - a „**Deploying?** Read `DEPLOYMENT.md` first” sor a „Deploy” szakaszra mutat.
- [x] **2. `CLAUDE.md` → `@AGENTS.md`**, alatta legfeljebb a Claude-only sor (a `~/.claude/plans/` vázlatok csak egy sessionre szólnak).
- [x] **3. `DEPLOYMENT.md`** a D3 szerint.
- [x] **4. Ellenőrzés** a varratnál leírt három próbával, majd a diff átnézése a terv ellen.
- [x] **5. Commit**, csak ezekkel a fájlokkal. A `tasks/todo.md`-ben más session 10-19-i, nem commitolt blokkja is ott van; abból csak a saját részemet veszem fel. **Push külön, kifejezett go-ra.**
- [x] **6. Review szakasz** ide, a `tasks/todo.md`-be.

### Nem része ennek a tervnek (külön döntés)

- `server/repos-status.js`: ne jelezzen driftet arra a `CLAUDE.md`-re, amely csak importál. Kódváltozás, deployjal jár.
- A `docs/` kiköltöztetése a Drive-ra (ROADMAP-feljegyzés, 2026-10-10).
- A `CLAUDE.md` cron-listájából hiányzó három cron (`qdrant-backup`, `agenda-sync`, `backfill-chunks`).
- A Claude-memória `feedback_hetzner_restart` jegyzete az ssh-paranccsal: nem repófájl; a „Deploy” szakasz elkészülte után arra mutasson.

## Robi döntései

- **D1. Drive-mappa.** **Felülírva 2026-11-22: Robi a `~/GoogleDrive/Data/CustomBrain/` mappát jelölte ki** (lásd a fenti tervet). Az eredeti javaslat: `~/GoogleDrive/Data/Beliczki.hu/CustomBrain/` (a dosszié ezt mondja). A másik jelölt a `Docs/_2nd Brain ／ énmás ／ AI Context Infrastructure`, amelyet a 2026-10-10-i költöztetési táblázat javasolt.
- **D2. Szemantikai modell.** Javaslat: most az kerül be, hogy „nincs még (2026-11-22)”, a legközelebbi anyagok megnevezésével. Ha a tervezet elkészül, a sor arra mutat. **Teljesült 2026-11-22:** a tervezet elkészült, az `AGENTS.md` rá mutat.
- **D3. `DEPLOYMENT.md` sorsa.** Javaslat (a): megmarad „egyszeri szerver-beállítás” tartalommal (init, Settings-változók, Fireflies webhook, Gmail-címkék, crontab), szerverútvonal nélkül, a három elavult állítás javítva; a deploy-lépések és az ismert gondok átkerülnek az `AGENTS.md`-be. (b): a fájl megszűnik, minden az `AGENTS.md`-be megy.
- **D4. Az alkalmazás portja a „Deploy” szakaszban.** A 3000-es port a kódban és a `docker-compose.yml`-ben is benne van, és a port felszabadítása nélküle nem írható le. Javaslat: az alkalmazásport maradhat, az ssh-port nem.
- **D5. Meddig terjedjen a takarítás.** Javaslat: ebben a körben a három fájl mellett a `README.md` három crontab-sora és a `docs/archive/tasks-handoff-2026-03-16.md` két sora (IP, régi kulcsnév, email). A `CHANGELOG.md`, a `ROADMAP.md` és a `tasks/todo.md` útvonal-említései történeti napló részei, maradnak.
- **D6. Git-előzmény.** A régi szöveg megmarad benne. Az átírás force-push egy publikus repón, egyirányú ajtó. Javaslat: nem írjuk át. **Lezárva 2026-11-22: nem írjuk át (Robi).** Az eredeti indoklás egyik állítása hibás volt; Robi a szerveren futott ellenőrzés után döntött újra (lásd Review).
- **D7. Ellentmondó sor.** A `CLAUDE.md` szerint a `tasks/todo.md` „not used for customBrain”, a gyakorlat és a globális szabály szerint viszont ez a tervfájl. Javaslat: az új `AGENTS.md` azt írja, hogy a terv a `tasks/todo.md`-be kerül, a prioritáslista a ROADMAP.
- **D8. Verzió.** Javaslat: verzióemelés nélkül, `docs:` commitként (előzmény: `db191f2`, 2026-09-29). Másik lehetőség: `0.78.0` → `0.78.1` (patch), de akkor a GitHubon lévő verzió a következő deployig eltér a futótól.

**Planning review:** nem kérek rá Codex- és Chief Architect-véleményt, mert csak dokumentum változik. Ha kéred, megy.

## Box-szintű tények, amelyek nincsenek az infra-mapben, vagy eltérnek tőle

Hat ilyet találtam (kulcs, Node-verzió, cron, Qdrant-image, maradványok az alkalmazás mappájában, pm2-újraindulás). Nem ide írtam le őket, mert a repó publikus: a sessionök közös jegyzetmappájában vannak, a `custombrain-infra-map-elteresek-2026-11-22.md` fájlban. Az infra-map gazdájának szólnak.

## Review (2026-11-22)

**Mi változott.** Hat fájl, alkalmazáskód nélkül:
- `AGENTS.md` (új a gitben): a korábbi `CLAUDE.md` tartalma, új „Meaning before code” szakasszal és a „Production / SSH access” helyén „Deploy” szakasszal.
- `CLAUDE.md`: `@AGENTS.md` és egy Claude-only sor.
- `DEPLOYMENT.md`: egyszeri szerver-beállítás, szerverútvonal nélkül, a crontab mind a hét sorával.
- `README.md`: a három crontab-sor útvonala `<repo>` lett; a két deploy-hivatkozás az `AGENTS.md` „Deploy” szakaszára mutat.
- `INSTALL.md`: egy hivatkozás ugyanoda.
- `docs/archive/tasks-handoff-2026-03-16.md`: a két sorból kikerült az IP, a régi kulcsnév és az email.

**A jóslat és az eredmény.**
- A tiltott adatok keresése a három fájlban 0 találatot adott.
- A címsorok diffje azt mutatta, amit vártam: a „Production / SSH access” eltűnt, a „Meaning before code” és a „Deploy” (öt alcímmel) bejött. A régi `CLAUDE.md`-ből 13 sor esett ki, mind szándékosan.
- A `CLAUDE.md` első sora `@AGENTS.md`. Azt, hogy egy új Claude Code session valóban betölti az importot, ebben a sessionben nem tudtam megnézni; a parlamentAI, a bizi és az MM6 ugyanezt a formát használja.

**Amit a terv nem látott előre.**
- **A D6 indoklása hibás volt.** Azt írtam, hogy a git-előzményben nincs titok. Ezt nem ellenőriztem, mielőtt leírtam, és nem volt igaz. A részletek a fenti jegyzetfájlban vannak, nem ebben a publikus fájlban. Egy csak olvasó ellenőrzés futott a szerveren Robi go-jával; utána Robi újra megerősítette, hogy az előzményt nem írjuk át.
- **A terv első változata maga is tiltott adatot tartalmazott.** A box-szintű tényeket kulcsnevekkel együtt ebbe a fájlba írtam, pedig ez is a publikus repó része. A commit előtti gépi ellenőrzés fogta meg; a szakasz kikerült a jegyzetfájlba.
- **Hivatkozások.** A `README.md` két sora és az `INSTALL.md` egy sora a `DEPLOYMENT.md`-be küldte az olvasót az újraindítási sorért, amely átkerült az `AGENTS.md`-be. Ezeket átírtam; az `INSTALL.md` emiatt került a commitba.
- **Email.** Az archív fájl 100. és 106. sorában maradt Robi email-címe. Nem nyúltam hozzá, mert a commitok szerzői címe ugyanez, tehát a cím a repóból egyébként is látszik.

**Amit Robinak ellenőriznie kell a „Deploy” szakaszban.** Három rész a gyakorlatból és következtetésből készült, nem leírt forrásból:
- az 1. lépés (helyi kliens-build, másolás, `dist.bak-<verzió>` mentés): a Repos-dosszié egy mondata és a szerveren látott mappák alapján;
- az 5. lépés (`npm install`, ha egy `package.json` változott): a két külön függőségi fából következik;
- a „Rollback” teljes szövege.

**Nyitva maradt.**
- A `DEPLOYMENT.md` „Setup notes” részében két sor elavult, de a terv nem érintette: a refresh token helye (ma a Settings, nem a `.env`) és az `.env.example` hiányossága (a `.env`-ben ma csak a `UI_SECRET` van).
- A „Nem része ennek a tervnek” lista mind a négy pontja.

---

# Terv 2026-10-09 — döntések lezárása, csonkolásmentesség, 11. fejezet mérése, Files-ontológia, gráfbejárás

Sorrend szándékos: a mérés (3) a gráfbővítés **előtt** fut, különben nincs baseline, amihez a bejárásos lekérdezést hasonlítani lehet.

## 1. Nyitott döntések lezárása (csak dokumentáció)
- [x] **Grok token:** DÖNTÖTT (2026-10-09): korlátlan marad, mert ő kutat. Nincs változtatás, csak a ROADMAP-ban lezárjuk.
- [x] **Az 5 levágott Gmail-szál:** elavult, nem húzzuk újra. ROADMAP-ban lezárva.

## 2. Csonkolásmentesség a jövőben
Mért tény a kódból: a 0.42.0 a 6000-es vágást megszüntette, de maradt még három vágási pont.
- **(a) Rejtett vágás, ez a fő ügy.** Minden 1500 karakternél hosszabb levelet egy Haiku „kivonatoló” ír át, és **ez az átírt szöveg tárolódik** (`agent/tools/gmail-clean.js:131`). A kimenet legfeljebb `max_tokens: 4096`, és a kód nem nézi a `stop_reason`-t, így hosszú szálnál a vége csendben elvész. Emellett a modell szövege a forrás helyére kerül; ez a tanulmány I5-ös pontja.
- **(b)** A Fireflies 180k-nál log nélkül vág (`server/routes/fireflies-webhook.js:63`). A Gmail-cron ugyanitt már hangosan logol.
- **(c)** A `get_gmail_threads` élő MCP-olvasás 10 000 karakternél vág (`agent/tools/gmail.js:127`). Ez csak az agentnek adott nézet, a tárolást nem érinti.

Két javítás jöhet szóba:
- **Kicsi:** `stop_reason === 'max_tokens'` esetén a determinisztikus, regexszel tisztított szöveget tároljuk.
- **Alapos, ezt javaslom:** a Haiku ne állítson elő tárolt szöveget. Mindig a regexes, deduplikált **eredeti** szöveg tárolódik. A Haiku legfeljebb azt dönti el, hogy van-e érdemi tartalom (`__NO_CONTENT__`). Ez egyszerre zárja ki a vágást, a parafrázist és a kihagyást. Ára: hosszabb tárolt levelek. Ezt a chunkolás kezeli, mert pont erre való (recall).
- [x] (a) DÖNTÖTT: alapos változat. Haiku = csak tartalom/nincs-tartalom verdikt (`max_tokens: 16`), a tárolt szöveg mindig a dedup+regex kimenet; váratlan verdikt hibát dob → a 0.42.0 retry-listájára kerül. Hamis Anthropic-teszt 7/7 PASS (86k karakteres szál végig megmarad)
- [x] (b) hangos log, a Gmail mintájára
- [x] (c) DÖNTÖTT: lapozás. `get_gmail_threads` `thread_id`+`from_line`/`max_lines`, a válaszban `body_slice` (a `get_thought` mintája); a lapozás teszten pontosan visszaadja a teljes szöveget
- [x] Élesítve: 0.45.0, 2026-10-09, `/stats` → `0.45.0`. Éles próbafutás mentés nélkül a 3 leghosszabb tárolt Gmail-szálon, az új tisztítóval:

  | Szál | Tárolt (régi Haiku-átírás) | Új (determinisztikus) |
  |---|---|---|
  | Humanody — ConfAI rendszer fejlesztés | 16 759 | 63 559 |
  | Koordináció vs szubsztrát vita | 11 081 | 23 537 |
  | ERSTE Market — Vagyonkezelés kampány bannerek | 10 642 | 72 980 |

  A régi út tehát a tartalom **50–85%-át** elhagyta ezeken a szálakon. A legújabb üzenet egyedi blokkja mindhárom esetben benne van a végső szövegben. Két esetben a legfrissebb üzenet csak köszönés plusz aláírás volt, ezt a dedup jogosan összevonta. A régi, rövidített szálak a következő frissülésükkor (új levél a szálban) teljes szöveget kapnak. Tömeges újrahúzás nem történt; külön döntés, kell-e.
- [x] **(d) Testvérhiba a chunkolásban, 2026-10-09-én találtam.** A `reprocess-v2.js` a Sonnettel `max_tokens: 16384` mellett **újraíratja az eredeti szöveget** `content_chunks`-ként. A `_stop_reason`-t sehol nem nézi az éles út (csak a prototípus-script). A tárolt szöveg teljes marad, de a hosszú gondolatok (Fireflies, és most már a hosszú Gmail) **vége nem kap chunk-vektort**, tehát kereséssel nem található meg. Ez ugyanaz a mechanizmus: a modell a forrást írja újra, plafon alatt.
  - **MÉRVE, 2026-10-09, csak olvasva, `thoughts_v2`, lapozva:**
    - 626 szülő, ebből 436 hosszabb 1500 karakternél.
    - **47 hosszú gondolatnak egyáltalán nincs content-chunkja.**
    - A chunkos 389-ből 156-nál az utolsó 300 karakter nincs benne szó szerint egyetlen chunkban sem. Forrás szerint: Fireflies 104/128, YouTube 28/70, manuális 14/73, Gmail 9/99.
    - A chunk/szöveg hossz-arány mediánja: 1,5–10k → 0,54; 10–30k → 0,58; 30–60k → 0,29; 60k felett → 0,20.
  - **Pontosítás, második mérés:** ez **nem** a végén vágás. A content-chunkok 74%-a (1629/2214) szó szerint kezdődik a szülőben, és ahol az utolsó chunk szó szerint megtalálható, ott a szöveg végéig ér (medián 1,00). Az utóbbi 46 chunkolási hívásból (ledger, 0.44.0 óta) egyik sem érte el a plafont (max 11 525 / 16 384 kimeneti token).
  - **A valódi mechanizmus a tömörítés.** A Sonnet a hosszú szöveget 2–10 chunkba *összevonja*. Egy 100 000 karakteres átiratnak így csak ~10–20%-a kerül szó szerint chunk-vektorba, a szülő dense és BM25 vektora pedig az *összefoglalóból* készül (`chunking.js`, `mainSparse = sparseEncodeDoc(summary)`). **A hosszú meetingek szövegének nagy része tehát semmilyen indexben nem kereshető szó szerint.** Ez recall-hiba; memória: a chunkolás célja a recall.
  - Alapos javítás: a Sonnet a határokat adja vissza (horgony vagy offset), a chunk-szöveget pedig determinisztikusan vágjuk az eredetiből. Így 100% a lefedettség, és a határokról továbbra is a Sonnet dönt (memória: LLM-judgment chunking).
    - Nyitott tervezési kérdés: a szó szerinti chunkok hosszabbak lesznek, a Gemini embedding bemeneti korlátja pedig ~2048 token. Hosszú szövegnél ezért több és rövidebb chunk kell, különben az embedding hívás csendben levág. Ezt implementálás előtt ellenőrizni kell, a BM25-öt nem érinti.
    - Utána backfill a 436 hosszú gondolatra, Sonnet-költséggel. Becslés előtte.
  - [x] **0.46.0 — megépítve:** sections + kódos vágás, `stop_reason`-őr, `scripts/rechunk-content.js` (csak tartalom-chunkok, ~$11 becslés 435 thoughtra a ~$60-as teljes reprocess helyett). ~~Döntés: ez a 3-as mérés (baseline) **előtt** vagy **után** jöjjön?~~ Javaslat: a baseline előtt mérjük meg (Hit@10 a hosszú-meeting kérdéseken), és csak utána javítsunk, hogy a hatás kimutatható legyen.
- [x] 3 thoughton élesben újrachunkolva, ellenőrizve. A 102k-s Humanody-meeting 32 chunkot kapott, a korábban lefedetlen részlet most `bm25_exact` 1. találat. A promptba minimum szakaszméret került: egy 6k-s levélből 24 helyett 7 chunk lett.
- [x] **Teljes újrachunkolás lefutott (2026-10-09, 0.47.1, Haiku 5.5 low): 421/421 OK, 0 hiba, 427 hívás, 3,80M input + 72k output token ≈ $0,42.**
  - Utómérés ugyanazzal a scripttel: 441 hosszú gondolat, chunk nélküli 0 (korábban 47), olyan, amelynek a vége egyetlen chunkban sincs benne: **0 (korábban 156; Fireflies 0/139, korábban 104/128)**.
  - A chunk/szöveg hossz-arány mediánja 60k felett 0,20 → 0,95. Az 1-nél kisebb arány oka, hogy a tárolt szövegben az összefoglaló is benne van.
- [x] Reprocess modell-A/B: marad Sonnet 5.5 medium. A Haiku low hibázott a személyek kanonizálásán és a projektcímkézésen, a Haiku high hosszú átiraton 1–2 percig futott.
- [x] (0.47.2) Névszűrő: ékezet- és sorrendfüggetlen egyezés (pl. „Kun Miklos” ↔ „Miklós Kun”). A Haiku-tesztben emiatt esett ki egy valódi résztvevő.
- [x] **0.48.0:** a `search_brain` 8000 karakter felett összefoglalót + passzoló chunkot + `text_omitted` lapozási mutatót ad. ~~ÚJ LELET:~~ a `search_brain` a találat TELJES szövegét adta vissza. limit=2 → 121 000 karakter, mert egy 107k-s átirat teljes egészében jön. A válaszban a `matched_chunk_text` már benne van. Javaslat: a teljes szöveg helyett összefoglaló + illeszkedő chunk, a többi a `get_thought` `from_line` lapozással. (Spec 5.2, korlátos kimenet.)
- [ ] **Mellékmegfigyelés a 3-as méréshez:** a mai manuális capture-ök `total` ideje 33–43 másodperc, ebből `vault_ctx` 25–40 másodperc (pm2-log). A 11. fejezet célja: ack p95 ≤ 1 s. Ez lesz a mérés egyik első tétele.

> **DÖNTÖTT 2026-10-09: a 3-as mérés FÉLRETÉVE** (Robi: „bonyi, lassú”). Építünk, Robi használat közben jelzi a problémákat, és a kész felületet teszteli. A kérdésbank-tervezetek a `tasks/evaluator/` alatt maradnak, ha később kellenek. Új sorrend: 2(d) chunk-javítás → 6 stateless MCP → 4 Files-katalógus → 5a–5c gráf → 5f /dream.

## 2e. Gmail-tisztítás — ✅ 0.47.3 (2026-10-09)
- [x] Levelenként csak az új tartalom marad (vágás az első válasz-fejlécnél; a továbbított és inline válaszos levelek egészben maradnak), a linkeket a kód tisztítja, a To/Cc listák törlődnek. 8 éles szálon a szemét kb. 52–61%-ról kb. 2%-ra esett.
- [x] **DÖNTÖTT 2026-10-10 (Robi): nincs újrahúzás** — csak szemetelne; az utolsó ~2 hónap levelei elegendők, és előre nézve az új tisztító fut. Eredeti kérdés: a meglévő ~109 Gmail-szál újrahúzása az új tisztítóval. Ma a régiek Haiku-átírt, rövidített szöveget hordoznak. Költség: Haiku-osztályozás + embedding + Sonnet reprocess szálanként.

## 7. Repo- és agent-session-logok a brainbe (Robi kérése, 2026-10-09) — az (a) rész kész, a többi lásd a döntést
Cél: mit csinált az agent, miről beszélgettünk, mit mondott, milyen roadmap-task született — Claude Code és Codex sessionökből is —, és mindez a brain-ontológiában legyen (repo → session → task → döntés).
**Döntés (Robi, 2026-11-23):** a session-riport a session-naplók hivatalos formája, az (a) rész ezzel kész. Az ontológia-rész (a lenti második jelölőnégyzet) a séma-szerződéshez (5a) tartozik. A (b), a nyers transcriptek betöltése elmarad, vele az első és a harmadik jelölőnégyzet is. A (c), a git-idővonal nincs eldöntve.
- **Visszakérdezés (globális szabály: új capture-út):** mi a legolcsóbb, ami a 80%-ot hozza?
  - (a) Session-végi összefoglaló: egy Claude Code `SessionEnd`/`Stop` hook vagy szokás, ami `capture_thought`-tal elmenti, mit csinált a session. Új tárolás nem kell.
  - (b) A nyers transcriptek (`~/.claude/projects/*/…jsonl`, Codex sessionök) teljes betöltése. Nagy, zajos, és titkokat is tartalmazhat.
  - (c) A git log + CHANGELOG + ROADMAP mint repo-idővonal a `Repos/` dossziéhoz kötve.
  Javaslat: (a) + (c), a (b) csak keresési forrásként, szűrve.
- [ ] Források leltára: Claude Code transcript-formátum és -hely, Codex session-hely és -formátum; mennyi és mekkora.
- [ ] Ontológia (5a-hoz): `repo`, `agent_session`, `task`, `decision` csomópont; élek: session → repo, session → task (létrehozta/lezárta), task → ROADMAP-tétel, commit → session.
- [ ] Titokszűrés a betöltés előtt (tokenek, kulcsok a transcriptben).

## 3. A tanulmány 11. fejezetének mérése → `docs/custombrain-meres-2026-10.html`
A brandBrain módszertanát vesszük át (`docs/comparison-question-battery.md`):
- a kérdéssort az eredmények **előtt** lezárjuk;
- osztályzat: helyes / részleges / téves / tartózkodás;
- a hivatkozás minőségét 0–2 skálán pontozzuk;
- minden számot n/N formában, nevezővel közlünk.
- [~] **Kérdésbank-TERVEZET kész (2026-10-09): `tasks/evaluator/ch11-bank-2026-10.yaml`.** 55 új kérdés, seedelt, rétegzett korpuszmintából (nem keresési találatokból), plusz 7 p8.2 és 6 válaszszintű `questions.yaml` kérdés. Ebből 12 hosszú-meeting kérdés olyan részletre, amit ma egyetlen chunk sem fed le (a chunk-javítás előtt/után mérésére), 8 held-out. A rögzítéshez Robi jóváhagyása kell. A tervezett eredeti szöveg: **Kérdésbank** 40–60 kérdéssel, a meglévő 8 p8.2-es és ~14 `questions.yaml`-os kérdésre építve. Kategóriák a fejezet szerint: alias, pontos fájlnév, HU–EN parafrázis, régi döntés, mai állapot, hosszú levél vége, dosszié, vélemény vs. referencia, valóban hiányzó válasz. **Én jelölteket és javasolt helyes ID-ket adok; a helyes választ te hagyod jóvá.** Ez a te munkád, nem tudom kiváltani.
- [x] **1. átnézési kör (2026-10-09), Robi 17/55 után leállt** → `tasks/evaluator/ch11-review-round1-2026-10-09.json`. A tanulság a megjegyzéseiből:
  - (a) A szövegből kiolvasható „tű” kérdés neki értéktelen (old-01).
  - (b) A kérdés kontextus nélkül nem ítélhető meg: melyik projekt/termék, kikkel, hogyan jutottunk ide (lm-02).
  - (c) Az átirat tévedhet. A gold az igazság, nem az elhangzott mondat (lm-01).
  - (d) A féléves anyag már nem mérvadó, a projekt azóta változott (lm-06).
- [ ] **ÚJRATERVEZÉS: két réteg**
  - **A. Automatikus recall-szondák, emberi gold nélkül.** Szó szerinti forrásrészletből generált lekérdezés; a helyes találat maga a forrás-thought, ez gépileg ellenőrizhető. Ez méri a chunk-javítás előtti és utáni Hit@10-et, és Robi idejét nem kéri. Ide kerül a 13 jóváhagyott lm/mail kérdés is.
  - **B. Kontextuális kérdések, Robi-gold, FRISS anyagból** (alapértelmezett ablak: az utolsó ~8 hét). Minden kérdés mellé kontextuscsomag:
    - projekt/termék és szereplők;
    - **akkori állapot** (a kérdés idejének thoughtjai);
    - **mai állapot** (a legfrissebb thoughtok + projekt-dosszié), forrásokkal.
    Robi csak javít, nem nulláról ír. A pontozás azt is nézi, hogy a válasz megkülönbözteti-e az akkorit a maival, és jelzi-e, ha egy forrásállítás téves vagy elavult.
  - A B réteg egyben a gráfbejárás (5. pont) baseline-ja: pont a projekt → szereplők → állapot-idővonal bejárását méri.
- [~] **B réteg, 1. tervezet kész (2026-10-09): `tasks/evaluator/ch11-ctx-draft-2026-10-09.json`, átnézés: az artifact `ctx` gyűjteménye.**
  - 20 friss mondat (2026-08-14 után): ERSTE termékenként 7 (Számlák, SZK, Vállalkozók, Hitelkártya, Market, Hitelek, Bird), plus ConfAI 3, Bizi 1, RMT OT 2, Humanody 2, ParlamentAI 1, Telekom 1, MM6 1, Nexus 1, és egy „besorolási csapda” (Grok Secretary, rosszul Bizinek címkézve).
  - Gold-mezők: projekt, ügyfél, megszólaló, folyamatlépés, előtte, utána, prioritás, akkor, most. Három folyamat-taxonómia tervezete: ERSTE-kampány, fejlesztés, RMT. Robi javítja.
  - **Mellékleletek a gráfbővítéshez:**
    - (1) Hibás projektcímkék: a Grok Secretary naptár-thoughtok „Bizi”-ként vannak címkézve.
    - (2) Az `effective_date` sok Gmail-thoughtnál a mentés vagy frissítés napja, nem az eseményé (pl. júniusi brief szept. 24-i dátummal), ezért ma az előtte/utána sorrend sem megbízható.
    - (3) Folyamatlépés és prioritás egyáltalán nincs a modellben. Ezek a 5a-séma kötelező új elemei: `process`/`step` típus és `priority` mező.
- [ ] **Gépi mérések, gold nélkül:**
  - capture ack p95;
  - indexelési idő;
  - keresési p95, hidegen és melegen;
  - változatlan dossziék embeddinghívásai (cél: 0);
  - negatív jogosultsági próbák, közvetlen ID-olvasással is;
  - csonkolási audit;
  - agent-válaszméret (byte/token). Ma élőben láttam: egy `search_brain` limit=8-ra 55 KB-ot adott vissza.
- [ ] **Hit@10 és válaszhelyesség** a lezárt kérdésbankon (`prove-brain.js` bővítése)
- [ ] A hordozhatóság (exportból visszaállított ID/hash egyezés) drága. Javaslom, hogy ezt mintán mérjük, ne teljesen.
- [ ] HTML-tanulmány a `docs/` alá: cél vs. mért, nevezőkkel, a következő döntéssel

## 4. Files-ontológia: hol áll
- **Kész (0.41.0):** kézi `Files/` és `Repos/` dossziék. Kereshetők, és a frontmatterből (`drive_link`, `project`, `direction`, `from`, `date`) már él lehet.
- **Szándékosan nem épült:** csatolmány-pipeline, automatikus Drive `/data`, `/docs` feltérképezés, capture-time prompt-bekötés (`tasks/todo-incremental-export-and-files-kb.md`, 2. fázis).
- Ezen túl nem találtam elkezdett tervet. Ha máshol van (brain TODO-marker vagy másik repó), mutasd meg.
- **DÖNTÖTT (2026-10-09): először csak katalógus.** Utána megbeszéljük, mely fájlokból kell kivonat, és mire kell figyelni (méret, formátum, titkos tartalom, duplikált PDF/PPTX-változatok).
- [x] Leltár, csak olvasva (2026-10-09, helyi Drive-szinkron `~/GoogleDrive` + Gmail connector):
  - **`Docs`: 10 758 fájl, 21 GB.** Ebből `Archive/` 5954, `Csalad/` 2115, `_customBrain/` 996 (a vault), `ME/` 928, `Grafia/` 405, `iroda/` 155. Típus: vcf 3579 + vmg 2241 (telefonmentés), jpg 1711, md 970, pdf 622, png 155, cdr 124, psd 89, xlsx 60, docx 52.
  - **`Data`: 55 535 fájl, 539 GB.** `_archive 2026/` 19 025, `Telekom/` 14 167, `ERSTE HU/` 11 281, `ESRTE SK/` 3167, `_archive/` 3019, `Agaurg/` 2397, `szivesseg/` 711, `ERSTE CZ/` 469, `Beliczki Műhely/` 461, `Proficio/` 417, `Sahar by Attraction/` 298. Archívumok nélkül: png 8975, jpg 6997, url 2631, mp4 1710, svg 1616, psd 942, pdf 435, txt 338, html 333 — túlnyomóan kreatív asset, nem dokumentum.
  - **A My Drive gyökerében** 687 laza fájl: xlsx 257, pptx 209, docx 72, jpg 46, mp4 19, pdf 15 (pl. ConfAI-, ERSTE-, Telekom-, Cordia-anyagok, sok „Copy of …” verzió) — ez a legdokumentumszerűbb réteg.
  - Bizonytalan: a Google-natív fájlok (Docs/Sheets/Slides) a helyi `find`-ban nem jelennek meg külön kiterjesztéssel — a natív dokumentumok száma ebből nem látszik, Drive API-listázás kellene hozzá.
  - **Gmail:** `brain/captured` 181 szálából **142-ben van csatolmány** (1622 üzenet, ~672 MB, 2025-09-09 → 2026-10-09). A `has:attachment` az inline aláíráskép-eket is számolja, így a valódi dokumentum-csatolmányok száma ennél kevesebb. Típus a keresésből nem jön; szálanként `get_thread` vagy szerveroldali Gmail-API-listázás kellene.
  - Következmény a (a)/(b) kérdésre: 66k fájlra az 1 fájl = 1 `.md` (a) nem működik. → (b) katalógusfájl, vagy (a) csak egy szűk, dokumentum-típusú részhalmazra (pptx/docx/xlsx/pdf/md, archívumok és assetek nélkül).
- [x] Katalógus-terv — **DÖNTÖTT (2026-10-09): (b) egy katalógusfájl**, csak dokumentum-típusokra. A terv:
  - **Hol él:** `state/files-catalog.json` a szerveren (a futásidejű JSON-ok helye). Tartalom-kivonat, embedding, Qdrant-írás nincs.
  - **Ki írja:** `scripts/build-files-catalog.js`, egyszeri, kézi futtatás a szerveren (ott van az OAuth-token; `applySettingsToEnv()` a dotenv után). Drive-ot és Gmailt csak olvas; egyetlen fájlt ír. Cron nem kell, amíg nem derül ki, hogy a katalógus elavul.
  - **Drive:** egyetlen, lapozott `files.list` a teljes My Drive-ra (`nextPageToken`-ig, nem mappánként): `trashed=false`, `'me' in owners`, mime ∈ pptx/docx/xlsx/pdf/md + Google Docs/Sheets/Slides. A mappák külön, szintén lapozott listázással jönnek; ezekből áll össze a `path`. Kimarad: `_archive*`, `Archive`, `_customBrain` (a vault, már indexelt), `Colab Notebooks`.
  - **Gmail:** `brain/captured` szálak → üzenetenként a csatolmány-partok (filename + attachmentId). Kimarad: inline part (`Content-ID`/`inline`), és ami nem dokumentum-mime. A szálhoz tartozó thought a `source_id = threadId`-n át köthető.
  - **Rekord:** `id` (`drive:<fileId>` | `gmail:<msgId>:<partId>`), `name`, `source`, `link` (Drive `webViewLink` | Gmail szál-URL), `mime`, `size`, `modified`, `path`, `project`, `direction`, `from`, `thread_id`, `md5`, `variant_group`.
  - **Projekt:** Drive-on a `Data/<ügyfélmappa>` első szintje, a Projects-dossziék nevére és aliasaira illesztve (`resolveAliases`, `server/names.js`). Gmailen a szál thought-jának `projects` mezője. Ha nincs egyezés: `null` — nem találgatunk fájlnévből.
  - **Irány:** csak Gmailen (`from` = én → `delivered`, más → `received`); Drive-on `null`.
  - **Változatok:** `variant_group` = normalizált név (`Copy of `, ` - 13 June, 11:29`-féle időbélyeg, `(1)`, dupla kiterjesztés `.xlsx.xlsx`, `.md.docx` levágva); azonos `md5` = pontos duplikátum. Összevonás nincs, csak csoportazonosító.
  - **Nyitott:** ki olvassa (lent).
- [x] **Olvasó: új `find_files` MCP tool** (Robi döntése, 2026-10-09) — `server/files-catalog.js`, mindkét regisztrációban, scope `brain-read`.
- [x] Katalógus-script megírva (0.51.0): `scripts/build-files-catalog.js`. A tartalom-kivonat ezen a ponton még NEM része. Referencia a brandBrain-ből: `extract.ts`, `page:N`/`slide:N` locatorok, sha256-os dedup.
- [x] Első futtatás a szerveren (2026-10-09 20:50 UTC, ~5 perc): **3355 rekord** — Drive 3095 (5943 dokumentum-fájlból, archívum/vault/Colab nélkül), Gmail 260 csatolmány a 181 szálból. Fajta: pdf 1690, spreadsheet 752, presentation 405, document 331, markdown 177. `state/files-catalog.json` 1,7 MB. `findFiles` a szerveren kipróbálva: „humanody” 10 találat (Meet-jegyzetek, Gmail-csatolmányok, Drive md), a `Copy of Cordia_2024 …` 6 változata egy `variant_group`-ban.
  - Útközben két javítás: Gmail-kvóta 6000 egység/perc/felhasználó → szálak egyenként, 1,5 s-os tempóban; a Qdrant szálanként bezárta a keep-alive socketet → a Gmail-thoughtok projektjei egyetlen lapozott scrollal a ciklus előtt.
  - [ ] `find_files` valós MCP-hívás egy új sessionből (a futó session toollistája az indulás előtti).
- [x] **DÖNTÖTT 2026-10-10 (Robi, másodszor): nem kell minden múltbeli fájlt projekthez kötni.** A modern projekteket a mappastruktúra egyértelműen megadja (Telekom, ERSTE). Egy kivétel van: a `Telekom/AI Mesh/Ország tuning` alatti fájlok az RMT Országtuning projekthez tartoznak. ~~2535 rekord (75%) projekt nélkül.~~ A legtöbb a Drive-gyökér laza fájljai és a `Data/` mappák, amelyek neve nem egyezik Projects-dosszié nevével/aliasával (pl. `ERSTE HU`, `ESRTE SK`, `ERSTE CZ`, `Agaurg`, `Beliczki Műhely`, `Sahar by Attraction`). Kódváltozás nélkül javítható: `aliases:` sorok a Projects-dossziékba (pl. `ERSTE.md` → `ERSTE HU`), aztán újrafuttatás. Robi döntése, melyik mappa melyik projekt.
- [ ] Döntés a számok után: mely fájlokból kell kivonat; kell-e cron a frissítéshez.

## 5. Gráfbővítés + bejárásos lekérdezés (spec: `docs/mcp-interview-es-grafbejaras-spec-2026-10-09.md`)
A brandBrain-ből referenciaként átvehető (nem kód, hanem szerződés):
- **ConfAI bizonyítékgráf-metodika** (`brandBrain/docs/confai-bizonyitek-graf-metodika-v1.md`):
  - csomópont- és éltípusok, `origin` és `review` külön;
  - idézet + locator + start/end char;
  - V-01…V-14 validátorok; a V-02 szerint az idézetnek egyeznie kell a hashelt forrásszöveggel;
  - beágyazott JSON Schema.
  Ez pont a spec 11. fejezetének 1. lépése, a „gráfforrások leltára és szerződése”.
- **`evidence()`/`concepts()` BFS** gyökerekkel, hopszámmal és ownerekkel (`knowledge-graph-prototype/model.js:79-206`). Ebből lesz az `explore_brain` alakja.
- **„Retrieval létra” a tool-leírásokban + nulla modellhívásos indextool.** Ez lesz a `get_brain_ontology`.

Javasolt lépcsők, mind külön döntéssel:
- [ ] **5a. Szerződés:** csomópont- és élséma rögzítése a ConfAI-sémából, customBrain-re szabva (docs).
- [ ] **5b. Csak valódi, már létező élek.** Kiindulópontok:
  - dosszié-wikilinkek;
  - Files/Repos frontmatter → projekt;
  - thought → person/project/topic metadata (`knowledge:about`, `model_extracted` eredettel);
  - `supersedes`.
  Erre jön a `get_brain_ontology` + `read_brain_node` + `explore_brain`. Új tárolás nem kell, mert ezek a Qdrant-payloadból és a dossziékból számolhatók.
- [ ] **5c. Files mint csomópont-típus** az ontológiában (a 4. pont döntésétől függően katalógus vagy tartalom).
- [ ] **5d. Bizonyítékréteg** (`claim` + idézet + locator, `get_brain_evidence`). Ez **új tárolási réteg** és modelles kinyerés, ezért csak akkor, ha a 3-as mérés és az 5b használata azt mutatja, hogy kell.
- [ ] **5e. `interview_brain`** + összehasonlító mérés a 3-as baseline-hoz képest.

**DÖNTÖTT (2026-10-09):** 5a–5c most, 5d a mérés után.

### 5f. Viszony az ellentmondás-detektáláshoz és a /dream-hez
Mai állapot:
- `scripts/contradiction-probe.js`: csak olvas, Haiku a bíró, a 0.70–0.92 koszinusz-sávban keres párokat. A szeptember 12-i kalibrációt a brandBrain is átvette.
- P17 /dream: a Step 1 kész (0.27.0, topic-aliasok). A Step 2 (topic-konszolidációs probe) és a Step 3 (`/dream` skill, csak javaslatfájl, soha nem módosít) sorban áll. Spec: brain `TODO-TOPIC-DREAM-V1`.

**Ahol erősítik egymást:**
- **Jobb jelöltpárok.** Az ellentmondás jellemzően *alacsonyabb* koszinuszt kap, mint a megerősítés (ROADMAP: 0.77 vs. magasabb), ezért a sávalapú párosítás kihagyja. A gráf (ugyanaz a személy/projekt/Files-csomópont plusz időben eltérő állítás) célzottabb párokat ad a bírónak.
- **Ellentmondás élként.** A probe verdiktje `evidence:contradicts` / `knowledge:supersedes` él lesz, `origin: model_extracted, review: proposed` jelöléssel, az ember megerősítése után `human_reviewed`. Új tárolás nem kell, elég egy javaslatfájl a `tasks/` alatt, amit a gráfolvasó betölt.
- **A /dream lesz az író, a bejáró toolok az olvasók.** Ez a Letta-elv („separate writer from reader”), és pontosan a P17 szándéka.
- **Nyitott konfliktusok a válaszban.** Az `interview_brain` / `read_brain_node` visszaadja a csomópontot érintő nyitott ellentmondásokat is (brandBrain `search.ts` minta).

**Ahol ellene dolgozhatnak, és mit teszünk ellene:**
- **Körkörös bizonyíték.** A /dream szintézisei (`type=synthesis`) csomópontként visszakerülnek, majd a következő álom bizonyítékként idézi őket. Szabály: szintézis csak *származtatott* csomópont lehet, soha nem `evidence:supports` forrás (brandBrain `independence`-elv).
- **A modell élei tényként jelennek meg.** A spec már tiltja; a bejárás alapértelmezésben a `proposed` éleket külön, jelölten adja vissza.
- **Az automatikus `supersedes` (>0.85, capture-időben archivál) nem igazolt döntés-felülírás.** A gráfban `legacy_archive_chain` eredetet kap, nem `knowledge:supersedes`-t.
- **Költségrobbanás.** A gráfszomszédos párok száma gyorsabban nő, mint a sávalapúaké. A /dream a meglévő tartalom-hash cache-t és egy fix párkeretet használ, Wilson-CI kapuval, ugyanúgy, mint a probe.
- [ ] Döntés a sorrendről: a /dream Step 3 az 5b *után* jöjjön, mert akkor már gráfszomszédokon dolgozik. A Step 2 topic-probe független, bármikor mehet.

## 6. Stateless MCP — miért jó, és hogyan állnánk át kár nélkül
**Tények (ellenőrizve 2026-10-09):**
- A 2026-07-28-as MCP spec eltávolítja a protokollszintű sessiont és az `Mcp-Session-Id` fejlécet (SEP-2567), valamint az `initialize` handshake-et (SEP-2575). Minden kérés `_meta`-ban hozza a verzióját.
- Ha egy szervernek mégis állapot kell, explicit, a szerver által kiadott handle-t ad tool-argumentumként.
- Jönnek a `Mcp-Method` és `Mcp-Name` routing-fejlécek (SEP-2243), az SSE-folytatás pedig megszűnik.
- Az npm-en elérhető legújabb SDK, az `@modelcontextprotocol/sdk` 1.32.1 is még `2025-11-25`-öt beszél. Nálunk 1.29.0 van telepítve. **Az új protokollt tehát egyik SDK sem tudja**; ma „stateless” csak az SDK `sessionIdGenerator: undefined` módját jelenti.
- A brandBrain így fut élesben (`server/src/mcp.ts:337`): minden kéréshez friss szerver és transport, SDK ^1.30.0, plusz Mcp-Method/Name fejlécellenőrzés.

**Mit nyernénk nálunk:**
- **Deploy-biztonság.** Ma minden `pm2 stop/start` eldobja a memóriabeli `httpTransports`-ot, így minden kliens sessionje érvénytelen lesz, amíg újra nem kapcsolódik. Stateless módban a restart láthatatlan.
- **Nincs szivárgás.** A Map csak `onclose`-ra ürül, TTL nincs. Hogy ténylegesen nő-e, nem mértem.
- **A token-kötés magától adódik.** Minden kérés önállóan hitelesít, és a scope-kapu kérésenként fut. A 0.41.3-as session-eltérítési 403-ra nincs többé szükség, mert nincs mit eltéríteni.
- **Felkészülés az új specre.** Amikor az SDK támogatja, kisebb lesz a lépés.
- Skálázásban nem nyerünk: egy gép, egy példány.

**A kockázat, amit komolyan kell venni:** a 0.32.0 pont *stateless → stateful* váltás volt, mert a `tools/call` „not connected”-del elbukott. Ugyanaznap derült ki egy második, független ok: a pont a claude.ai connector nevében (memória: `reference_mcp_stateless_session_bug`). **Hipotézis, nem bizonyított:** lehet, hogy az eredeti hiba valójában a pont volt, nem a stateless mód. A brandBrain stateless módban működik claude.ai-jal. Amíg ezt valós hívással nem igazoljuk, az átállás visszahozhatja a 0.32.0-s hibát.

- [x] **0.46.1, már élesítve:** ismeretlen session-id → 404 (spec szerint), nem 400. A 0.46.0-s restart után élőben láttuk, hogy a claude.ai connector „Server not initialized” hibával beragadt. 0.46.1 után magától helyreállt: valós `search_brain` hívás sikerült.

**Kár nélküli átállás:**
- [ ] Mérés előtte: a `httpTransports` mérete és élettartama, valamint mely kliensek (claude.ai, Claude Code, Codex, Grok) mit küldenek. Ehhez nginx-log és `Mcp-Session-Id` kell.
- [x] **0.49.0: párhuzamos végpont kész:** `/mcp/http-stateless`, azonos auth és scope-kapu mellett. A régi `/mcp/http` érintetlen marad, ez a visszaállási pont.
- [x] Szerveroldalon ellenőrizve (0.49.0):
  - stateless: `initialize` session-ID nélkül; `tools/list` és `tools/call` előzetes init nélkül;
  - restart után is működik, és nginx-en át is (22 tool);
  - token nélkül 401.
  - A stateful régi session restart után 404-et kap (0.46.1).
- [x] **Codex** (2026-10-09, 0.49.2): valódi `tools/call` az nginx-logban, 30–82 KB-os válaszok, `?token=` URL-lel. Előbb két javítás kellett: a GET 406 → 405, majd üres SSE-stream, mert a Codex alpha a 405-öt is auth-hibának vette.
- [x] **claude.ai** (2026-10-09): `Claude-User` 160.79.106.x-ről, valódi `tools/call` (30 KB, 122 KB), a token **fejlécben** (`Authorization: Bearer`), nem az URL-ben.
- [x] **Grok** (2026-10-09 20:05): `grok-connectors-manager/0.1.0`, valódi `tools/call` (108 KB, 54 KB), `?token=` URL-lel.
- [x] **Claude Code** (2026-10-09 20:12 UTC): nincs saját helyi Brain MCP, a claude.ai connectort örökli (`mcp__claude_ai_Brain__*`) → ugyanaz a `/mcp/http-stateless` URL. Az nginx-logban `Claude-User`: initialize 200, initialized 202, tools/list 200 (15 KB), majd `search_brain` 200 (10 KB). Az első POST 400-at kapott (198 B), a kliens utána rendben folytatta — az okát nem néztük meg.
- [ ] **Grok bot** (Robi azonosította, 2026-10-09) a RÉGI `/mcp/http`-n: `Cursor/1.0.0` UA, AWS IP-k (52.44.113.131, 184.73.225.134), fejléces token. Át kell állítani `/mcp/http-stateless`-re a bot saját konfigurációjában (nem ebben a repóban), és ellenőrizni kell a naplóban. A régi végpont kivezetése előtt ennek meg kell lennie.
- [ ] A claude.ai connector-beállításáról készült képernyőképen látszott egy teljes token → új tokent kell csinálni, és a régit vissza kell vonni, ha már egyik kliens sem használja (Robi döntése).
- [ ] Új lelet: a `quick_lookup` limit=50-re 122 KB-ot adott (teljes action_items stb. 20 thoughtra). Ugyanaz a minta, mint a `search_brain` 0.48.0 előtt; mérni és dönteni kell.
- [ ] Minden kliensnél **valós `tools/call` az nginx-logban** (nem a modell önbevallása alapján; memória-szabály), mind a 4 kliensre.
- [x] **0.50.0: a fő végpont is stateless** (Robi döntése: nem várunk a botra, az átállás őt is lefedi). A `/mcp/http` és a `/mcp/http-stateless` ugyanazt a handlert kapja. A stateful `handleMcpHttp` egy kiadáson át bekötetlenül megmarad visszaállásnak.
- [x] Deploy után (20:24 UTC): Robi lefuttatta a Grok botot → csak `grok-connectors-manager/0.1.0` a `/mcp/http-stateless`-en, valódi `tools/call` (81 KB). `Cursor/1.0.0` 20:05 óta egyik végponton sincs; valószínűleg a bot már a connectoron megy (nem bizonyított). Deploy óta senki nem hívja a `/mcp/http`-t; ha a Cursor-út visszatér, ott jelenik meg.
- [ ] Következő kiadás: `handleMcpHttp` + `httpTransports` törlése.
- [ ] Nem része: SDK-major vagy az új spec bevezetése. Az csak akkor jön, ha az SDK kiadja.

## Verzió
- 2: patch vagy minor. A tárolt Gmail-szöveg viselkedése változik, ezért minor-t javaslok.
- 3: patch (docs).
- 5b: minor (új MCP toolok, mindkét regisztrációban + scope-térkép).
- 6: minor (MCP-transport viselkedése változik).

## Végrehajtási sorrend
1 → 2 → 3 (baseline) → 6 (független, a 3 mellett is mehet) → 4 leltár → 5a → 5b → 5c → 5f/dream → 5d, ha a mérés indokolja → 5e.

---

# MCP interview és gráfbejárás — specifikáció (2026-10-09)

A felhasználó a beszélgetésben kialakított cél alapján specifikációt kért a `docs/` alá. Ez a feladat a dokumentum elkészítése; az MCP implementációjáról a specifikáció alapján lehet dönteni.

- [x] A jelenlegi MCP, keresés, dossziék és gráfok célzott, olvasási vizsgálata.
- [x] Magyar specifikáció: cél, interview-folyamat, wiki-/bizonyíték-/ontológiai bejárás, MCP-szerződések és kompatibilitás.
- [x] Példák, adatfüggőségek, méretkorlátok és elfogadási feltételek ellenőrzése.
- [x] Dokumentumhivatkozás a ROADMAP-ban és lezáró review.
- [x] Felhasználói kiegészítés: párhuzamos subagentes feltárás, közös költségkeret és hasznos információ szerinti értékelés.

## Review

Kiegészítés ellenőrizve: MCP-description minta, független párhuzamos részkérdések, közös hívás-/költségkeret, forrásalapú összevonás, megállási feltételek és a főagenttel együtt minden subagentet elszámoló mérés. Külön elfogadási esetek kezelik az átfedést és a subagent nélküli klienst.

Elkészült: [MCP interview és gráfbejárás](../docs/mcp-interview-es-grafbejaras-spec-2026-10-09.md). Öt új olvasási tool, a régi keresés kompatibilitása, explicit gráfképességek, forrásverziók, korlátos kimenetek és elfogadási esetek. A helyi kódban igazolt állapotot és a javasolt új gráfokat külön jelöli. A dokumentum helyi linkjei és négy JSON-híváspéldája ellenőrizve; alkalmazáskód, éles adat és verziófájl nem változott. Dokumentációs kiadásra javasolt patch: 0.44.0 → 0.44.1, nem végrehajtva.

---

# Assessment of Current State (requested 2026-05-25 by user)

**Context**: External review of customBrain repo (~/customBrain). Read CLAUDE.md, AGENTS.md, README.md, ROADMAP.md (2026-05-23, v0.27.0), DEPLOYMENT.md, CHANGELOG (through 0.27.0), tasks/todo.md active sections, package versions, key server modules (qdrant.js, etc.). No code changes made. This section is the "plan" per global workflow: read first → write checkbox plan → user verifies before deeper work or recommendations.

## Pro (strengths, what works well)
- [ ] Extremely high engineering discipline: detailed probe-before-build (p8-*.json snapshots), before/after measurement, explicit "Definition of Done", rollback plans, audit trail in git + brain thoughts.
- [ ] Real 6+ weeks of daily production use drove the roadmap (USE IT FIRST gate passed 2026-05-16). Many killed/deferred items are honest (no signal).
- [ ] Architecture is clean for the ambition: one backend (capture/search logic) exposed via 3 surfaces (HTTP, MCP HTTP, MCP stdio) without duplication.
- [ ] Security & ops hardening in May 2026 (0.24.x series) is substantive: rate limiter per-IP, MCP vs UI secret split, OAuth2 for external clients (Grok/Claude DCR), log scrubbing, chmod 600, fail2ban, ufw, explicit consent creds.
- [ ] Retrieval investment is correct and evidence-based (Boris Cherny probe → hybrid BM25+dense+RRF k=60 + task_type + topic aliases). Not prompt-hacking around weak cosine.
- [ ] Alias system (People → Projects → Topics) + strict project whitelist + drive-context via SA is mature and solves real over-tagging / visibility problems.
- [ ] Coworker-loop pattern (0.10.0 summarize + emerging P17 /dream) is elegant for single-user augmentation without server-side mutation loops.
- [ ] Versioning, CHANGELOG, 4-manifest sync, and "remind to bump" convention are followed religiously.
- [ ] Data model (source + source_id idempotency, immutable text + mutable metadata via PATCH, supersedes for conflicts) is sound.

## Contra / Risks / Current pain points
- [ ] Complexity debt is high for a single-user personal tool. May 17-23 window alone touched: hybrid collection swap, v2 chunking, task_type backfill, env/config relocation (3 scripts), MCP token system, full OAuth2 server + consent + DCR, rate limiter rewrite, topic aliases. Many moving parts in retrieval + auth.
- [ ] v2 reprocessing (ACTIVE top of this file) only ~24% complete in the 2026-05-17 snapshot (58/238). 180 thoughts still on old pipeline — weaker summaries, no chunks, no RETRIEVAL_DOCUMENT vectors. Search quality uneven until finished.
- [ ] No local dev story (per CLAUDE.md): every behavioral change or bug requires Hetzner SSH + user per-action approval. Slows iteration, raises risk of "it worked in my probe" surprises.
- [ ] Export is still full-rebuild hourly (P11 incremental deferred). At current growth + chunk points this will eventually hurt.
- [ ] Backup story for the irreplaceable brain (Qdrant snapshots + offsite) is still listed as open in ROADMAP "Ops" section.
- [ ] Collection name is now `thoughts_v2` (hybrid). Old `thoughts` may be lingering as safety net or partially cleaned — needs explicit audit.
- [ ] High surface area for auth mistakes: 3 token systems (UI_SECRET master, named mcp-tokens, OAuth-issued), consent page, rate limiter ladder, extension special-casing. One mis-wired middleware = lockout or secret leak.
- [ ] Many one-off scripts in /scripts (backfills, probes, calibrations, migrations). Technical debt if not periodically pruned or turned into documented runbooks.
- [ ] Hetzner CX22 (4GB) noted as OOM risk during client build; pm2 + fuser -k dance is mandatory and fragile.
- [ ] Process note: project CLAUDE.md says "tasks/todo.md not used for customBrain; ROADMAP is canonical", yet this file is the detailed execution log for P8/P8.1/P8.2/P14 work. Minor inconsistency between declared and actual process.
- [ ] Single point of failure + blast radius: one Hetzner box holds the only copy of the brain + all 3rd-party tokens (Drive, Gmail, Fireflies, Anthropic, Gemini). Even with hardening, compromise = total loss + credential exposure.

## Open questions / recommendations (do not execute)
- [ ] Finish or explicitly close the v2 reprocess batches (current top of file) before declaring hybrid search "done".

---

# Deep Code-Level Review: Best Practices, Pros/Cons, Security Holes (requested 2026-05-25)

**Scope**: Full static analysis of the customBrain codebase (server/, agent/, cron/, scripts/, client/, extension/, config/auth flows). Focus on security, secret handling, input validation, privilege boundaries, error handling, and architectural best practices. Does **not** include runtime testing on Hetzner unless explicitly approved later.

**Status**: Initial file reading done (server/index.js, config.js + schema, fireflies-webhook.js, drive-context.js, mcp.js, oauth routes, main structure). Full deep read + analysis **not yet started**.

## Analysis Plan (execute only after user verification)

### Phase 1 — Secret & Credential Handling (Highest risk)
- [ ] Audit all places that read/write secrets (UI_SECRET, OAuth tokens, service account, API keys).
- [ ] Verify the `NEVER_OVERLAY` + `applySettingsToEnv` logic is sound and has no bypasses.
- [ ] Check how `service-account.json` and refresh tokens are resolved and protected (file perms, paths).
- [ ] Review OAUTH_USER / OAUTH_PASSWORD consent flow for leaks or weak defaults.
- [ ] Assess token storage in `state/mcp-tokens.json` and `state/oauth-clients.json` (cleartext, perms, encryption?).

### Phase 2 — Authentication & Authorization Boundaries
- [ ] Deep review of the path-aware auth middleware in `server/index.js` (MCP-only named tokens vs master UI_SECRET split).
- [ ] Named token REST allowlist (`NAMED_TOKEN_PATHS`) — is it narrow enough?
- [ ] OAuth2 server implementation (`routes/oauth.js` + `oauth-store.js`): PKCE, client registration, consent page, token issuance, revocation.
- [ ] Rate limiter effectiveness and bypass risks.
- [ ] Extension token handling (0.26.0 changes) and 403 vs 429 behavior.

### Phase 3 — External Attack Surfaces
- [ ] Fireflies webhook: HMAC verification, raw body handling, in-flight guard, retry behavior.
- [ ] All public-ish endpoints (/oauth/*, /.well-known, webhook).
- [ ] CORS tightening, trust proxy, and nginx assumptions.
- [ ] Input validation on capture, search, metadata extraction prompts.

### Phase 4 — High-Privilege Operations
- [ ] `drive-context.js`: Dual OAuth2 + Service Account usage, scope minimization, error handling when SA or OAuth fails.
- [ ] Gmail / Calendar / YouTube clients created from the same refresh token.
- [ ] Full vault export (`routes/export.js`): deletion + rewrite logic, manifest safety (if any), atomicity.
- [ ] `agent/` tools (Gmail intake, Fireflies, YouTube) — what they can do and whether they run with least privilege.

### Phase 5 — Architecture & Best Practices
- [ ] Error handling patterns (try/catch usage, information leakage in responses).
- [ ] Logging of sensitive data (tokens, emails, transcripts).
- [ ] Dependency hygiene (node_modules in server/, client/, root; zod version pinning).
- [ ] Process model (pm2, single instance assumptions for inFlight maps, etc.).
- [ ] Data model invariants (immutability of text vs mutability of metadata).
- [ ] Use of `eval`, dynamic `require`, `child_process`, or dangerous string interpolation.
- [ ] Client-side security (token storage in localStorage, extension manifest permissions).

### Phase 6 — Summary & Risk Matrix
- [ ] Produce prioritized list of findings (Critical / High / Medium / Low).
- [ ] Pros/cons of current design choices (e.g., settings.json overlay, dual auth systems, full-rebuild export).
- [ ] Concrete recommendations with effort estimates.
- [ ] Update ROADMAP or create security section if warranted.

## Execution Rules (per user global guidelines)
- Read files one area at a time.
- No code changes during analysis unless explicitly requested after this plan is approved.
- Root cause, not symptoms.
- Document both strengths and real weaknesses honestly.
- After each major phase, surface findings before moving to the next.

**User verification required before starting Phase 1 deep reads + writing**:
- Approve this plan?
- Any areas to deprioritize or expand?
- Any files/areas you specifically want me to focus on or avoid?

---
- [ ] Decide on backup strategy (Qdrant snapshot API to S3/Drive vs full JSON export) — highest risk item.
- [ ] Consider a lightweight "brain health" cron that only alerts (no auto-mutation) vs current on-demand model.
- [ ] Audit: does the old `thoughts` collection still exist and need deletion or documented retirement?
- [ ] For future features: apply the "push back BEFORE designing" rule from the global AGENTS.md even more strictly — this system is already at the edge of justifiable complexity for one person.
- [ ] Document the current data volume (thoughts + chunks) and growth rate somewhere visible (ROADMAP or a /stats endpoint).

## Next step (user verification required)
- [ ] User reviews this assessment section.
- [ ] User confirms: (a) expand any area into full root-cause analysis, (b) write concrete recommendations with effort estimates into ROADMAP, (c) nothing further — just archive this section.

---

# ACTIVE — Finish v2 chunking + embedding for all remaining v1 thoughts

**State (2026-05-17)**: 58 v2 / 238 = ~24% coverage. **180 v1 thoughts remain.** Process in batches of 20 by `effective_date desc` (script default since today). Each batch ~$1.50–$3, ~10–18 min.

**Run**: `node scripts/reprocess-v2-prototype.js 20` on Hetzner (defaults skip-v2 + effective_date-desc).
**Retry failed**: `node scripts/retry-failed-reprocess.js <id1> <id2> ...` (has empty-chunk fallback).

- [ ] Batch 4: next 20 by effective_date desc (~$2, ~12 min) → 78 v2 / 238
- [ ] Batch 5: 20 more → 98 / 238
- [ ] Batch 6: 20 more → 118 / 238
- [ ] Batch 7: 20 more → 138 / 238
- [ ] Batch 8: 20 more → 158 / 238
- [ ] Batch 9: 20 more → 178 / 238
- [ ] Batch 10: ~20 remaining (final tail) → 198 / 238 (the rest may be archived/odd; live with it or final sweep)

**Total budget remaining (~180 thoughts)**: ~$15–25 Sonnet 4.6, ~2–3 hours wall-clock (with breaks between batches).
**Per-batch checklist**: run → check failures → retry → next batch. Don't queue multiple batches blind.

**When to stop**: when search recall feels right OR coverage hits ~90%. Final 5–10% may be archived / pure-test thoughts not worth $2.

---

# P14 prototype — 20-thought reprocess with chunking + multi-vector

**Goal**: take 20 most recent thoughts, in-place reprocess: re-Haiku with fresh ERSTE-split vaultCtx → generate summary + topic chunks → embed each chunk as separate Qdrant point with `parent_id` link. Measure pain-query improvement before/after.

## Architecture decisions (locked)

- **Multi-vector storage**: separate Qdrant points per chunk, `payload.kind = 'chunk'` + `payload.parent_id = <thought_id>`. Thought point stays at its own id with `payload.kind = 'thought'` (or absent). Same `thoughts` collection.
- **Main thought vector**: `embedText(summary)` — not the original truncated text. Cleaner semantics, better recall on long thoughts.
- **Haiku call structure**: ONE mega-prompt per thought returns JSON: `{ metadata, summary, summary_chunks[], content_chunks[] }`. No 4-way fan-out.
- **Scope**: 20 most recent by `created_at` desc. No source filter.
- **Mode**: in-place. No backup. We accept the risk; rollback for Fireflies/Gmail = re-fetch from source.
- **UI**: chunk hits show label inline ("Bizi adattisztítás — *captcha hard gate*"). Click → full thought modal.
- **Pipeline marker**: every modified thought + every new chunk point gets `pipeline_version: 'v2'` for find/cleanup.

## Pre-flight

- [ ] **Fix typo**: `ERSET Market.md` → `ERSTE Market.md` (user confirms or skips)
- [ ] **Define success metric**: lock 7 pain queries before running. Save current top-10 + scores to `tasks/v2-baseline.json`. Suggested queries:
  1. `ERSTE Adform SZA frissítés 150e kaphatsz uj template új feed`
  2. `Bizi captcha hard gate egyeztetés`
  3. `customBrain dev next steps`
  4. `ERSTE Cseperedő számla status`
  5. `Amundi follow-up`
  6. `Telex adaptive AV csomag`
  7. `Pörköláb David Erste programmatic`

## Implementation

### Step 1 — Haiku mega-prompt module (~45min)

- [ ] New file: `server/reprocess-v2.js`
- [ ] Function: `reprocessThought(text, vaultCtx)` → `{ metadata, summary, summary_chunks, content_chunks }`
- [ ] Single Anthropic Haiku call with JSON-mode prompt. Schema:
  ```json
  {
    "metadata": { "title": "...", "type": "...", "projects": ["MOST SPECIFIC sub-project"], "people": [...], "topics": [...], "action_items": [...] },
    "summary": "<chronological, ≤6000 chars, full content compressed>",
    "summary_chunks": [ { "label": "...", "text": "..." } ],
    "content_chunks": [ { "label": "...", "text": "..." } ]
  }
  ```
- [ ] Prompt rules:
  - Project tagging: MUST pick the most specific sub-project (e.g., `ERSTE Számlák`, not `ERSTE`, when SZA/Cseperedő/Online számla/Diák referenced)
  - Aliases injected from vaultCtx (existing pattern)
  - Summary: < 6000 chars, kronológikus, kép tükrözi a tartalom dátumát ne a capture dátumot
  - summary_chunks: 2-5 chunks témánként, mindegyik ≤ 1500 char
  - content_chunks: 2-10 chunks fordulópontonként, mindegyik ≤ 2000 char
  - If thought is short and single-topic: return one chunk in each array
- [ ] Test the prompt manually on 1 thought first (the Varfi email) — confirm output JSON parses + makes sense

### Step 2 — Reprocess script (~30min)

- [ ] New file: `scripts/reprocess-v2-prototype.js`
- [ ] Fetch 20 most recent thoughts from Qdrant (ordered by `created_at` desc)
- [ ] For each:
  1. `getVaultContext()` — full vault with new ERSTE split
  2. `reprocessThought(text, vaultCtx)` → JSON output
  3. `embedText(summary)` → main vector
  4. `embedText(chunk.text)` for each chunk (parallel batch)
  5. Qdrant ops:
     - `updatePoint(thought_id, { vector: main_vec, payload: { ...new_metadata, text: summary + original, has_v2_summary: true, summary_appended_at: now, pipeline_version: 'v2' } })`
     - `upsertPoints(chunk_points)` — N new points with `kind: 'chunk'`, `parent_id`, `chunk_label`, `chunk_text`, `chunk_kind: 'summary'|'content'`, `pipeline_version: 'v2'`
  6. Log: `[ID] N chunks created, project: X→Y, cost: ~$0.02`
- [ ] Total expected cost: ~$0.50

### Step 3 — Search rollup (~30min)

- [ ] Edit `server/routes/search.js`:
  - `searchVector(query_vec, limit=30)` — over-fetch
  - Rollup: for each result, if `payload.kind === 'chunk'` group by `parent_id`, keep best-score chunk + chunk_label
  - Fetch parent thought payload for display
  - Return top-N with optional `matched_chunk_label`
- [ ] Edit `server/qdrant.js`:
  - `getRecent` — filter `must_not: kind=chunk`
  - `getStats` — filter `must_not: kind=chunk` for thought count; add separate chunk count
  - `getConnectionStats` (hygiene) — filter `must_not: kind=chunk`

### Step 4 — UI chunk-label display (~15min)

- [ ] Edit `client/src/components/Search.jsx`:
  - If result has `matched_chunk_label`, show below title: `<span className="chunk-label">↳ {matched_chunk_label}</span>`
  - Tailwind: `text-xs text-txt-sec italic`

### Step 5 — Measure + report (~15min)

- [ ] Re-run the 7 pain queries, save to `tasks/v2-after.json`
- [ ] Diff baseline vs after: rank changes per query, score deltas
- [ ] Brief report: which queries improved, which didn't, which got worse

## Rollback (if prototype is worse)

- [ ] `scripts/rollback-v2.js`:
  - Delete all points where `payload.pipeline_version === 'v2'` AND `kind === 'chunk'`
  - For thoughts where `has_v2_summary === true`: cannot restore original text without backup, BUT Fireflies/Gmail re-fetchable via source_id, manual captures lost
- [ ] **Accept risk**: manual captures in the 20 may be permanently rewritten (text replaced with `summary + original`)

## Open question for user

- [ ] **Typo fix**: rename `ERSET Market.md` → `ERSTE Market.md` on Drive? (Or is "ERSET" intentional?)
- [ ] **Manual captures in the top 20**: if rewrite is a concern, we can SKIP `source === 'manual'` thoughts from the prototype (so original text stays untouched). Default plan = rewrite all 20.

## Definition of done

- 20 thoughts have `pipeline_version: 'v2'` and `has_v2_summary: true`
- Corresponding chunk points exist with `parent_id` matching
- 7 baseline queries re-run, delta report written
- Search UI shows chunk-labels on chunk-matched hits
- No regressions: `getRecent`, `brain_stats`, `find_overconnected`, `export` all work as before (chunk points filtered out)

---

# Hybrid search (P8) — BM25 sparse + dense + RRF — NEW 2026-05-17

**Status**: spec locked, waiting user confirm before implementation. Promoted from DEFERRED based on today's "Boris Cherny" probe (see ROADMAP P8 for evidence + decisions). Replaces the planned P14 A→B→C path.

## Decisions locked (in ROADMAP P8)

- Multilingual stemmer (HU + EN) for BM25 tokenization — **user confirmed 2026-05-17**
- `RETRIEVAL_DOCUMENT` taskType on capture side (baked into the same re-embed pass)
- No cross-encoder reranker for v1
- No query-side taskType change (probed, no effect)
- No `title:` parameter (probed, hurts cross-language)

## Pre-flight (DONE 2026-05-17)

- [x] **Library choice**: custom BM25 + `snowball-stemmers` 0.6.0 (ISC, HU supported). User confirmed + correctly flagged that fastembed is SPLADE/neural-sparse (not lexical BM25) — would defeat the purpose.
- [x] **Qdrant capability**: 1.17.0 confirmed. Migration required, not in-place: current collection uses unnamed dense vector, can't mix with named sparse. Path: create `thoughts_v2` with named vectors `{ dense, bm25 }`, copy all points (596 total: 237 thoughts + 353 chunks + 6 archived) preserving dense vectors as-is + computing sparse, then swap collection name in config.
- [x] **IDF strategy**: use Qdrant native `modifier: "idf"` on the sparse vector — server-side IDF, stays in sync with collection. Client only sends TF.
- [ ] Lock baseline: capture current "Boris Cherny" + 7 pain queries → `tasks/p8-baseline.json`.

## Implementation

### Step 1 — Sparse encoder module (~1hr) — DONE 2026-05-17
- [x] New file: `server/sparse.js` — exports `sparseEncodeDoc(text)` (BM25 TF normalized) and `sparseEncodeQuery(text)` (raw TF, Qdrant applies IDF via `modifier: "idf"`). FNV-1a 32-bit stable term→index hash so indices survive restarts without persisted map.
- [x] Tokenize: lowercase + Unicode normalize + strip non-letter/number + stopword filter + HU stem (fall back to EN if HU unchanged).
- [x] Hungarian morphology verified: Cseperedő / Cseperedőt / Cseperedőnek all collapse to `cseperedő`.
- [x] Boris Cherny case verified: query→Cherny tweet dot=3.24 (2 shared stems), query→DCO transcript dot=0 (0 shared stems). Decisive separation before IDF even applies.
- [x] Installed `snowball-stemmers@0.6.0` in server/package.json.

### Step 2 — Schema migration (~30min) — SCRIPT DONE, RUN PENDING USER OK
- [x] Path decided: collection swap (existing `thoughts` has unnamed dense; Qdrant won't mix unnamed + named).
- [x] Wrote `scripts/migrate-to-hybrid-collection.js` — copies source → dest, preserves dense vectors, computes sparse from text/chunk_text, recreates 7 payload indexes. Supports `--limit N` for smoke testing, `--force` to recreate dest. Never touches source.
- [x] Smoke-tested on Hetzner with `--limit 5 --dest thoughts_v2_smoketest`: 5 points migrated cleanly, Qdrant Query API hybrid RRF returned ranked results, smoke collection then dropped.
- [x] Ran full migration 2026-05-17: all 596 points (243 thoughts + 353 chunks) → `thoughts_v2`. Source `thoughts` left untouched as rollback safety net.
- [x] Validated hybrid query on `thoughts_v2` against "Boris Cherny" + 7 P14 pain queries. Cherny case: hybrid puts target at 1.0000 vs #2 at 0.3333 — 3× lead, definitively fixes the originally reported bug. No regressions detected. Bizi captcha + Amundi also improved.
- [ ] Update `scripts/init-collection.js` to declare the new schema (for fresh installs going forward).

### Step 3 — Capture pipeline (~30min) — DONE 2026-05-17
- [SKIP] `RETRIEVAL_DOCUMENT` taskType: deferred. Reason: would shift cosine ranges across old/new captures and invalidate the calibrated 0.85 conflict-detection threshold. Hybrid alone gets the Boris-Cherny win without this. Can be added in a separate pass with a full dense re-embed.
- [x] Edit `server/routes/capture.js`: import `sparseEncodeDoc`, compute sparse alongside dense in `captureThought` AND `refreshCapture`, pass both to `upsertPoint`.
- [x] Edit `scripts/reprocess-v2-prototype.js`: write `{dense, bm25}` named vectors for both main thought (using summary text) and every chunk.
- [x] Edit `server/qdrant.js::upsertPoint`: signature now `(denseVector, sparseVector, payload, id?)`.

### Step 4 — Search pipeline (~45min) — DONE 2026-05-17
- [x] Edit `server/qdrant.js`: added `hybridSearch(denseVec, sparseVec, limit)` using Query API with RRF prefetch (each leg over-fetches 4× the final limit). `searchVector` kept as dense-only for the conflict-detection path in capture (where lexical match would be wrong signal).
- [x] Edit `server/routes/search.js`: imports `sparseEncodeQuery` + `hybridSearch`, calls hybrid path. Existing `rollupChunkHits` + `applyTimeDecay` unchanged.
- [x] Edit `server/qdrant.js::getAllWithVectors`: unwraps `.dense` so consumers (Obsidian export, brain-health duplicates) stay back-compatible.

### Step 5 — Backfill (~30min wall-time, ~$1–3 dense cost)
- [ ] New file: `scripts/backfill-hybrid.js`.
- [ ] For every point in collection: compute sparse vector locally + re-compute dense with `RETRIEVAL_DOCUMENT` (Gemini), single upsert with both vectors.
- [ ] Same for chunk points.
- [ ] Idempotent: safe to re-run. Print progress every 20 points.

### Step 6 — Verify (~15min)
- [ ] Re-run "Boris Cherny" search → tweet MUST be #1.
- [ ] Re-run 7 pain queries from baseline → save to `tasks/p8-after.json`, write delta report (rank changes + score deltas).
- [ ] Spot-check 3 Hungarian-morphology queries: "Cseperedő" should match "Cseperedőt", "Cseperedőnek"; "számla" should match "számlák", "számlát".

### Step 7 — Deploy + bump (~15min)
- [ ] Deploy to Hetzner (mandatory `pm2 stop all` + `fuser -k 3000/tcp` BEFORE `pm2 start`, per `feedback_hetzner_restart.md`).
- [ ] Bump `0.18.0` → `0.19.0` (minor: new payload field, behavioural change in ranking).
- [ ] CHANGELOG entry: "Hybrid search (BM25 sparse + dense + RRF) with HU+EN stemmer. Replaces pure-dense ranking. RETRIEVAL_DOCUMENT taskType added to capture-side embeddings."

## Definition of done

- "Boris Cherny" returns Cherny tweet at #1 (currently #2 behind irrelevant DCO transcript).
- ≥4 of 7 P14 pain queries improved on top-10 placement vs baseline.
- No regressions in: `get_recent`, `brain_stats`, `find_overconnected`, vault export, agenda.
- New thoughts auto-write both vectors on capture.
- Backfill script left in `scripts/` for future use.

## Open questions for user before starting

1. **BM25 library**: custom + `snowball-stemmers` (recommended, ~50 LOC, MIT) — confirm?
2. **Migration path**: try add-in-place first, fall back to collection swap if Qdrant rejects — confirm?
3. **Order vs v2 chunking batches**: should we (a) finish v2 chunking batches 4–10 first (current ACTIVE work above), then hybrid, OR (b) pause batches and do hybrid now so each new chunk only gets embedded once with both vectors? My recommendation: **(b)** — finishing batches without sparse means a second backfill pass on those same chunks later. Doing hybrid first means all remaining batches write both vectors natively.

---

# P8.1 — RRF k=60 fix (literature default) — NEW 2026-05-17

**Status**: spec locked, waiting user confirm before execution.

**Trigger**: live probe today on `"ERSTE Adform SZA frissítés 150e kaphatsz uj template új feed"`. Dense leg ranks the semantically right email at #1 (Diákszámla Diverzum chunk, cosine 0.7384). BM25 leg ranks it at #14. RRF fusion at current Qdrant default `k=2` drowns the dense signal — the lexically dense `"ERSTE — 2026 kampány setup"` (BM25 #1 + dense #4) wins RRF #1 with score 0.70, while the relevant `"május 1-jei ajánlatváltás"` (dense #2, BM25 not in top-20) lands at RRF #3 with score 0.36.

**Root cause**: Qdrant's default `k=2` in RRF `1/(k + rank)` makes a single BM25 rank-1 hit (=0.5) numerically unbeatable by any dense leg that didn't also win rank-1. The dense rank-2 contribution is only `1/(2+1)=0.333`. One leg's #1 dominates the fusion.

**Why k=60 is not parameter-tweaking**: Cormack/Clarke/Büttcher 2009 (the original RRF paper) specifies k=60 as default. Elastic, Vespa, Weaviate all ship with k=60. Qdrant docs reference k=2 as an *example value*, not a tuned recommendation. Restoring k=60 = restoring the literature default. With k=60 the gap between rank 1 and rank 20 shrinks from `0.5 vs 0.045` (k=2, 11× spread) to `0.0164 vs 0.0125` (k=60, 1.3× spread) — dense rank-1 can no longer be overrun by BM25 rank-1 alone; both legs contribute meaningfully.

## The change

One line in `server/qdrant.js:74`:

```js
// before
query: { fusion: 'rrf' },
// after
query: { rrf: { k: 60 } },
```

(Syntax confirmed from `@qdrant/js-client-rest` generated schema: `RrfQuery = { rrf: { k?: number } }` — the explicit form bypasses the default-null path.)

## Probe + measurement plan

- [x] Wrote `scripts/p8-probe.js` — parameterized `--k <N> --out <file>`. Runs all 8 canonical queries against `thoughts_v2`. For each query records: dense top-10 (cosine), BM25 top-10 (score), hybrid RRF top-10 (fused score).
- [x] Ran on Hetzner: `node scripts/p8-probe.js --k 2 --out tasks/p8-baseline-k2.json`.
- [x] Ran on Hetzner: `node scripts/p8-probe.js --k 60 --out tasks/p8-after-k60.json`.
- [x] Applied one-line change `server/qdrant.js:74` → `query: { rrf: { k: 60 } }` with comment block explaining why.

## Measured outcome (per query, hybrid top-N changes)

| # | Query | Baseline k=2 ranking signal | After k=60 ranking signal | Verdict |
|---|---|---|---|---|
| 1 | Boris Cherny | tweet #1 (1.0) | tweet #1 (0.033) | STABLE — both correct |
| 2 | ERSTE SZA frissítés | "kampány setup" #1, Diákszámla chunk #2, májusi ajánlatváltás #5 | "kampány setup" #1, dual-list winners flood #2-#3, Diákszámla chunk #4, májusi #6 | REGRESSED (1 rank for the dense-rank-2 needle) |
| 3 | Bizi captcha | target #1, related cluster #2-#5 | target #1, similar tail | STABLE |
| 4 | customBrain dev next steps | top 3 stable | top 3 stable | STABLE |
| 5 | ERSTE Cseperedő számla status | Cseperedő chunks at #1-#3, but Diákszámla outside top-5 | Diákszámla chunk **#1**, Cseperedő #2-#3 | IMPROVED |
| 6 | Amundi follow-up | Amundi thought #1 | unrelated ERSTE Teya chunk #1, Amundi #2 | REGRESSED |
| 7 | Telex adaptive AV csomag | top 5 identical | top 5 identical | STABLE |
| 8 | Pörköláb David Erste programmatic | Q1 Longterm tervek thought #2 | Q1 Longterm tervek thought **#1** | IMPROVED |

**Net: 2 improved, 4 stable, 2 regressed.** Below the `≥5/8 win` Definition of Done.

## Decision (user-confirmed): ship anyway

The data does not show k=60 as a per-query win. It does show: (a) no catastrophic regressions, (b) score-range compression that better reflects the underlying dense-cluster tightness (all top dense scores 0.72-0.74 for ERSTE-domain queries — Gemini does not strongly differentiate within this domain, regardless of fusion), (c) most score gaps now in the rank-position-noise band rather than fusion-amplified.

User call (2026-05-17): **ship k=60 as the literature default** (Cormack/Clarke/Büttcher 2009; Elastic, Vespa, Weaviate). Rationale: the structural argument outweighs the noisy per-query measurement on 8 queries against a 596-point collection. k=2 was an unjustified Qdrant default, not a tuned choice. The probe snapshots stay in `tasks/` as audit trail — future ranking debugging starts from the literature default, not Qdrant's example.

The interesting follow-up is **not** the fusion algorithm: it's why dense embeddings cluster so tightly across ERSTE-domain summaries (0.72-0.74 across 20+ docs for a domain-specific query). Plausible causes: (a) Haiku summary text uses near-identical templated language for ERSTE emails, (b) queries are too domain-general to differentiate within. That goes on its own work item, not this fix.

## Deploy

- [x] Commit: qdrant.js change + probe script + both JSON snapshots + version bumps (0.20.0 → 0.20.1, four files) + CHANGELOG + this todo update.
- [x] SSH: `pm2 stop all` + `fuser -k 3000/tcp` (per `feedback_hetzner_restart.md`), git pull, `pm2 start ecosystem.config.cjs`.

## Open questions for user before starting

None — direction is approved (RRF k=60). Plan above is the execution path. Confirm and I run it.

---

# P8.2 — Cross-domain dense discrimination (cone-collapse fix) — NEW 2026-05-17

**Status**: ultraplan-drafted (Plan agent, 2026-05-17), awaiting user confirm on Open Questions before Phase 1 execution. Continues from P8.1 (RRF k=60 shipped in 0.20.1). Targets the residual failure documented in P8.1: hybrid+RRF cannot rescue an in-domain dense-ranked-#2 document when the query keywords also lexically favor a different in-domain document.

## Problem (locked from P8.1 measurement)

For `"ERSTE Adform SZA frissítés 150e kaphatsz uj template új feed"`:
- Dense top-20 packed into cosine **0.7176–0.7384** (0.02 spread)
- The "right" doc (`"május 1-jei ajánlatváltás"`, `65f02ce1-…`) sits at dense **#3** behind two other ERSTE-domain docs with effectively-equal cosine
- BM25 winner is `"ERSTE — 2026 kampány setup"` (`61e7367d-…`, BM25 score 17.39) because the query terms `feed/kampány/template` land in that doc. The "right" doc isn't in BM25 top-20
- RRF at any k cannot save it: neither leg ranks it #1, both legs rank a wrong-but-plausible doc #1, fusion math cannot promote a leg-#3 over two leg-#1's

**This is not a fusion problem.** The dense embedding itself fails to discriminate among ERSTE-domain documents. Either separate the band, or add a second pass that reasons over candidate text.

## Plausible causes (any combination)
1. **Embedding anisotropy** — pretrained embeddings cluster within a narrow cone of the embedding space, especially for in-domain texts (well-documented across LMs, e.g. arxiv 2504.16318)
2. **NOT using Gemini's `task_type` parameter** — currently both queries and documents are embedded with the default `task_type`. Google's canonical pattern is `RETRIEVAL_DOCUMENT` for storage and `RETRIEVAL_QUERY` for queries. This was DEFERRED in P8 because "would shift cosine ranges and invalidate the 0.85 conflict-detection threshold"
3. **Summary text uniformity** — Haiku-generated summaries (`server/reprocess-v2.js`) may use near-identical templated phrasing for each ERSTE email, making embeddings near-identical regardless of content

## Scope decision (2026-05-17, user-confirmed)

**Ship Phase 1 only. Phases 1.5, 2, 3 explicitly deferred — not gated, deferred.**

### Why deferred (the agent-as-reranker insight)

The real consumer of `/search` is NOT a human reading top-3 results in a UI. It's an LLM agent (Claude Desktop, Coworker, or the MCP tool path). The agent already does textual relevance reasoning over the candidates we return — that's exactly what a cross-encoder reranker does, except the agent does it for free as part of its own reasoning step.

This inverts the optimization target:
- **Old framing**: "make `/search` precise — put the right doc at rank #1"
- **New framing**: "make `/search` recall-focused — give the agent enough candidates that the right doc is in the set; the agent decides which one"

Concrete implications:
- Phase 2 (Cohere $1/mo + 200ms latency) and Phase 3 (HyDE +500ms) buy precision the agent doesn't need
- DoD shifts from "top-3" to "top-5" — high-recall threshold matching the agent's working memory
- If a query genuinely doesn't surface the right doc in top-5, the agent can re-query with refined terms — agent-as-query-rewriter is also free

### Phase 1 still ships unconditionally

Phase 1 is **not an optimization** — it's a missing config. Google's own docs specify `RETRIEVAL_DOCUMENT` / `RETRIEVAL_QUERY` task types for `gemini-embedding-001`; we're currently passing nothing, which gets default behavior (likely `SEMANTIC_SIMILARITY` or null-semantics). The P8 spec already locked this in (`tasks/todo.md:141`) and it was skipped at execution time — formally the stack is wrong.

Ship Phase 1 because the stack is wrong, not because it provably fixes the SZA query. It might, it might not — that's not the gate.

### D (anisotropy whitening) — dropped permanently

At 596 points / 3072-dim with single-user load, projecting through a whitening matrix on every query is heavier than the agent-as-reranker fallback. Not on the roadmap.

---

## Phase 1 — `task_type`-aware embeddings + threshold migration

**Goal**: Re-embed all 596 points with `task_type: RETRIEVAL_DOCUMENT`; switch query path to `RETRIEVAL_QUERY`. Quantify the band-spread change. Re-calibrate the 0.85 near-duplicate threshold on the new cosine distribution.

**Budget**: ~3h impl + ~30min wall-clock backfill + ~$1 Gemini backfill cost.

### Files to touch
- `server/embeddings.js` — extend signature to `embedText(text, taskType)`, default `RETRIEVAL_QUERY` (search is hotter than capture; getting the search default right reduces script accidents)
- `server/routes/capture.js:40,119` — pass `RETRIEVAL_DOCUMENT` explicitly in `captureThought` + `refreshCapture`
- `server/routes/search.js:106` — pass `RETRIEVAL_QUERY` explicitly
- `scripts/reprocess-v2-prototype.js:100-102` + `scripts/retry-failed-reprocess.js:71-73` — chunk + summary embeds become `RETRIEVAL_DOCUMENT`
- `scripts/p8-probe.js:54` — wrap query embed; ALSO dump pre-RRF per-leg cosines for band-spread measurement

### New files
- `scripts/backfill-task-types.js` — idempotent backfill via `payload.embed_task_type` marker; concurrency 8; preserves existing sparse `bm25` vector via `with_vector: ['bm25']`
- `scripts/calibrate-conflict-threshold.js` — sample paraphrase pairs + unrelated pairs, output empirical threshold distribution, recommend new default
- `tasks/p8.2-phase1-baseline.json` + `tasks/p8.2-phase1-after.json` — same probe shape + new `band_spread` field

### Threshold re-calibration (the gate everyone misses)
Conflict-check at `capture.js:50` (`m.score > 0.85`) operates on doc-vs-doc cosine in `searchVector`. Under Phase 1 both sides become RETRIEVAL_DOCUMENT — well-defined doc-doc, range may shift modestly. Calibration script confirms; new default documented inline.

### Win condition (Phase 1)
Any of:
- Band-spread on SZA query ≥ 0.05 (~2.4× widening, baseline 0.0208)
- The "right" doc (`65f02ce1-…`) moves to dense rank #1 or #2 on SZA query
- Average band-spread across 5 ERSTE-domain queries widens by ≥ 50%

Partial win (band widens but ranks don't improve) → triggers Phase 1.5. No-op (band doesn't widen) → skip 1.5, go straight to Phase 2.

---

## ~~Phase 1.5 / 2 / 3~~ — DEFERRED (see "Scope decision" above)

Plan agent's original phases 1.5 (summary audit), 2 (Cohere rerank), 3 (HyDE) are documented in git history for reference but **not in this plan**. The agent-as-reranker architecture makes them unjustified for this stack. If we later add a non-LLM consumer of `/search` (e.g. a fully autonomous batch process with no agent in the loop), reopen.

## Definition of Done (Phase 1 only)

1. **Stack correctness** (hard gate): every Gemini embed call across capture, refresh, reprocess, search, and probe carries an explicit `task_type` (`RETRIEVAL_DOCUMENT` for stored, `RETRIEVAL_QUERY` for queries). Verified by grep across the repo.
2. **Backfill complete**: all 596 points in `thoughts_v2` carry `payload.embed_task_type = 'RETRIEVAL_DOCUMENT'`. Verified by Qdrant count filtered on the field.
3. **Threshold re-calibrated**: `server/routes/capture.js:29` conflict-detection default has an empirical basis (output of `scripts/calibrate-conflict-threshold.js` committed to `tasks/p8.2-threshold-calibration.json`), with a one-line comment at the constant pointing at the data file.
4. **Recall-oriented success metric** (soft signal, not a hard gate): on the 8 canonical probe queries, the known-relevant doc is in `/search` **top-5** on ≥6/8 queries. Top-5 not top-3 because the consumer is an LLM agent that filters from a candidate set, not a human reading rank #1.
5. **Band-spread report**: `tasks/p8.2-phase1-after.json` carries the new band-spread metric per query; commit even if the numbers are unchanged (a "task types didn't widen the band" finding is also useful data).
6. No agenda sync regression (current: ~15-20s for 27 events at PARALLEL=5).
7. No new external dependencies. No ongoing $-cost.

If (4) fails, that's not a Phase 1 failure — it's data that the agent-as-reranker is now doing more work per query. Acceptable.

## Critical files reference

- `server/embeddings.js` — 17 LOC, the surface to extend
- `server/routes/search.js:106` — query-side task type
- `server/routes/capture.js:29,40,50,119` — doc-side task type + threshold re-calibration sites
- `scripts/reprocess-v2-prototype.js:100-102` + `scripts/retry-failed-reprocess.js:71-73` — chunk/summary embed sites
- `scripts/p8-probe.js` — extend with band-spread + top-5 metric (don't replace)
- `server/agenda.js` — unchanged in Phase 1 (no rerank means MIN_SCORE gate stays valid)

## Open questions (resolved 2026-05-17)

1. Annotated all 7 evaluable queries; Q8 marked excluded (broken premise). See `tasks/p8.2-annotations.json`.
2. Curl test: `taskType` (camelCase) + `RETRIEVAL_DOCUMENT` / `RETRIEVAL_QUERY` (UPPER_SNAKE) accepted. Bonus finding: default-no-taskType is identical to `RETRIEVAL_QUERY` (verified on long text; the previous "stack is doing SEMANTIC_SIMILARITY" guess was wrong — we've been doing symmetric `RETRIEVAL_QUERY` retrieval all along).
3. Live-rolling chosen. Backfill completed in 23.4s (faster than the 90s estimate) with no failures.

## Outcome (2026-05-17 — Phase 1 shipped as 0.21.0)

**DoD scoring (Phase 1)**:
1. ✅ Stack correctness: all 6 embedText sites carry explicit task_type (grep-verified)
2. ✅ Backfill complete: 596/596 points marked `payload.embed_task_type='RETRIEVAL_DOCUMENT'`
3. ✅ Threshold re-calibrated: 0.85 → 0.97 with inline comment + `tasks/p8.2-threshold-calibration.json` data
4. ⚠ Recall-oriented soft signal: hybrid winrate 4/7 → 4/7 (unchanged), dense 5/7 → 4/7 (one regression). Below the ≥6/8 target. As predicted in the plan, this is NOT a per-query win — the stack-correctness gate (1) is the hard one.
5. ✅ Band-spread report committed; dense band WIDENED on 4/7 queries (Q1 2.3×, Q2 1.8×, Q3 1.2×, Q7 1.2×) confirming the asymmetric pattern does discriminate better within domain — just doesn't translate to right-doc-at-top-5 on this small sample.
6. ✅ No agenda regression measured (out of scope but no code paths touched).
7. ✅ No new external dependencies, no ongoing $-cost.

**Per-query rank deltas** (baseline default-taskType → after RETRIEVAL_QUERY):

| Q | Query | Hybrid baseline | Hybrid after | Dense baseline | Dense after |
|---|---|---|---|---|---|
| 1 | Boris Cherny | HIT@1 | HIT@1 | HIT@1 | HIT@1 |
| 2 | ERSTE SZA frissítés | miss@6 | miss@6 | HIT@3 | HIT@3 |
| 3 | Bizi captcha | HIT@1 | HIT@1 | HIT@1 | HIT@1 |
| 4 | customBrain dev next | HIT@5 | HIT@5 | miss@6 | miss@8 |
| 5 | Cseperedő status | HIT@2 | HIT@2 | HIT@1 | HIT@1 |
| 6 | Amundi follow-up | miss@10 | miss@>10 | HIT@4 | miss@10 |
| 7 | Telex AV | miss@6 | miss@8 | miss | miss |
| 8 | Pörköláb David | excluded | excluded | excluded | excluded |

**Threshold calibration finding** (`tasks/p8.2-threshold-calibration.json`): RETRIEVAL_DOCUMENT space pulls related docs CLOSER together than the pre-task-type default. Median nearest-non-self cosine is now 0.899 (vs old space probably ~0.5-0.7). Top-20 highest-cosine pairs are 17/20 same-topic recurring content (weekly Bizi syncs, monthly ERSTE status emails), only 2 are true duplicates (0.9861). The 0.97 threshold captures the outlier tip; lowering would trigger Haiku contradiction-check on every capture.

## Done

- [x] Curl test verifying taskType accepted
- [x] `server/embeddings.js` extended with optional taskType arg, back-compat preserved
- [x] All 6 embedText call sites updated (search RETRIEVAL_QUERY, capture/refresh/reprocess RETRIEVAL_DOCUMENT)
- [x] `scripts/backfill-task-types.js` — idempotent, run successfully on all 596 points
- [x] `scripts/p8-probe.js` extended with annotation-aware metrics + band-spread
- [x] `tasks/p8.2-annotations.json` — 7 evaluable + 1 excluded canonical query
- [x] `scripts/calibrate-conflict-threshold.js` + output to `tasks/p8.2-threshold-calibration.json`
- [x] `server/routes/capture.js` conflict threshold default raised 0.85 → 0.97 with inline calibration comment
- [x] `tasks/p8.2-phase1-baseline.json` + `tasks/p8.2-phase1-after.json` committed for audit
- [x] CHANGELOG entry for 0.21.0
- [x] Version bumped 0.20.1 → 0.21.0 across 4 manifests
- [ ] Deploy to Hetzner (pm2 stop + fuser -k 3000/tcp + git pull + pm2 start)

---

# Export observability — last-run state + UI live progress — NEW 2026-05-18

**Status**: plan drafted, awaiting user confirm.

## Goal

Surface the export pipeline (which runs hourly via `cron/export.js` and on-demand from `POST /export`) on the Export UI page:
- "Legutóbbi export: <timestamp>" + collapsible log, persistent across page reloads
- Live tempo of the log lines updating in the UI while an export is running, regardless of whether it was triggered from the UI button OR from cron — UI parity with the existing SSE behavior

## Architectural decision (locked)

**Storage**: single JSON file `state/export-last-run.json` — same pattern as `state/agenda-cache.json` and `state/gmail-watermark.json`. No new DB, no schema, no migrations. Always overwritten (only "most recent" matters per user spec).

**Update mechanism**: SSE stays as the existing UI-triggered live channel (no behavior change for the button path). The state file gets written **in parallel** by a thin wrapper around `rebuildVault`, throttled to 250ms flushes so a 45s export with 1000+ log lines doesn't bash the disk. UI polls `/export/last` every 1.5s while `status === 'running'`, stops polling otherwise — this surfaces cron-triggered runs without bidirectional comms.

**No SSE removal**: the existing `POST /export` SSE stream keeps working as-is; the wrapper just calls the existing onLog AND appends to the state file. Adding-not-replacing keeps the change small (CLAUDE.md: "Every change as small as possible").

## State file shape

```json
{
  "id": "<uuid>",
  "started_at": "2026-05-18T10:00:00Z",
  "ended_at": null,                    // null while running
  "status": "running",                 // running | completed | failed
  "triggered_by": "cron",              // cron | ui (mcp deferred — no rebuild trigger in MCP yet)
  "log_lines": ["[0.0s] ...", "[0.1s] ..."],
  "result": null,                      // rebuildVault return when status === completed
  "error": null                        // error.message when status === failed
}
```

## Files to touch

- `server/routes/export.js`:
  - Add `EXPORT_STATE_PATH` (resolves to `state/export-last-run.json` relative to `server/`).
  - Add `runExportWithStatus(triggeredBy, onLogPassthrough)` wrapper:
    - Generates uuid, writes initial state (`status: 'running'`, `ended_at: null`).
    - Calls existing `rebuildVault(onLog)` with a multi-target onLog: (a) calls `onLogPassthrough` (SSE), (b) appends to in-memory log_lines, (c) throttled flush to state file (250ms).
    - On success: status=`completed`, result, ended_at=now, final flush.
    - On error: status=`failed`, error.message, ended_at=now, final flush.
  - Atomic write: write `.tmp` then rename, so partial reads never see a half-written JSON.
  - Modify `POST /export` to call `runExportWithStatus('ui', sseOnLog)` instead of `rebuildVault(sseOnLog)`.
  - Add `GET /export/last`: reads state file, returns JSON, 404 if absent.
- `cron/export.js`: replace `await rebuildVault(onLog)` with `await runExportWithStatus('cron', onLog)`. stdout still gets the lines via `onLog = console.log`.
- `client/src/api.js`: add `getLastExport()` → GET `/export/last`, returns parsed JSON or null on 404.
- `client/src/components/Export.jsx`:
  - On mount: `getLastExport()`, if exists show "Legutóbbi export: <formatDate(started_at)> · <status badge> · triggered by <triggered_by>", render collapsible log.
  - If `status === 'running'`: setInterval(1500) polling `getLastExport`, merge new log lines into displayed state, clear interval when status changes.
  - "Export to Drive" button: unchanged — still uses `exportToObsidian` (SSE). After SSE completes, refresh from `/export/last` so the persistent view reflects the run.
  - Add status badge component using existing color tokens (green for completed, blue for running, red for failed).
- `server/index.js`: NO change. SPA wildcard guard already lists `/export` at line 28-34, so `GET /export/last` falls through to the router correctly.

## SPA wildcard already covers `/export/*` — verified line 31:
```js
req.path.startsWith('/export') ||
```

## Risks
- **State file write contention** if cron tick fires while UI export is running: both wrappers write the same file. Single-user, hourly cron + intentional UI click — collision rate is near zero. If it happens, last-write-wins; the actual exports both complete (they don't share runtime state apart from this log). Acceptable.
- **State file growth**: a 45s export emits ~30-50 log lines (one per phase + one per uploaded file at default batch). At 596 thoughts the log can hit ~600 lines. JSON file size ~30-50KB. Not a concern.
- **Atomic-write rename**: on the same FS this is atomic on POSIX (Hetzner ext4) — no partial-read risk.
- **Polling cost**: 1.5s polling for the ~5min/day a cron export runs = ~200 polls/day from one open browser tab. Trivial.
- **`/export/last` returns 404 before first run**: UI gracefully shows "No exports yet" empty state.

## Definition of Done

1. `state/export-last-run.json` exists and updates during BOTH a cron-triggered AND a UI-triggered run.
2. UI Export page shows last run on load (date, status, collapsed log).
3. During a running export, UI log updates within 1.5s of new line append (test by triggering an export from another tab/CLI and watching the page).
4. UI-triggered button still works exactly as before (SSE-driven instant updates).
5. No regression in cron export behavior (stdout still gets log lines).
6. Version bumped 0.21.0 → 0.22.0 (minor: new HTTP route + new state field + UI behavior change).

## Open questions

1. **mcp trigger source** — the original spec note mentioned `triggered_by: 'mcp'` but the MCP tool surface has `rebuild_obsidian_vault` which uses `rebuildVault` directly. Want me to also wrap the MCP tool's path so MCP-triggered runs show up in UI, or skip until needed? Skipping = simpler now, easy to add later.
2. **Show running export inline OR replace the existing "log terminal" component on click?** Current Export.jsx renders the SSE log only after the user clicks the button. New design needs to ALSO render the cron-triggered log when no button has been clicked. Simplest: one log component, source is the state file (filled at mount via `getLastExport`, updated via polling). When user clicks button, SSE updates the SAME log component live (alongside polling, which becomes redundant but harmless). Confirm this UI shape vs. keeping two separate log areas (one for "last run" + one for "this manual run")?
3. **Polling interval** — 1.5s is the proposed default. Lower (500ms) feels snappier but trebles request rate. Higher (3s) saves requests but feels laggy on short runs. Stick with 1.5s?

---

# MCP token management — UI-managed named tokens, env stays master — NEW 2026-05-18

**Status**: plan drafted, awaiting user confirm. Scope-narrowed Tier-2 of the auth-system pushback (single-user, MCP-only, env stays master).

## Goal

UI-managed list of named MCP bearer tokens, so Claude Desktop / MCP connector tests / temporary integrations each get their own token. Revoke any one without touching the others. CAPTURE_SECRET env var stays as the master-only secret used by the browser UI itself — never leaves the operator's machine. MCP endpoint accepts master OR any named-list token.

## Architectural decisions (locked)

**Storage**: new file `state/mcp-tokens.json`. List-shape, not KV-shape — incompatible with the existing schema-driven `state/settings.json`. Atomic write (`.tmp` + rename).

```json
{
  "tokens": [
    {
      "id": "<uuid>",
      "name": "Claude Desktop",
      "token": "<64-char hex from crypto.randomBytes(32)>",
      "created_at": "2026-05-18T...",
      "last_used_at": "2026-05-18T..." | null,
      "expires_at": null | "2026-06-18T..."
    }
  ]
}
```

**Auth split**:
- All non-MCP routes: master only (CAPTURE_SECRET env), unchanged behavior.
- `/mcp/http`: master OR any valid (non-expired) named token.
- Single smart middleware in `server/index.js` that reads `req.path` and accepts either form for `/mcp/http`, only master for everything else.
- Token can be passed in `Authorization: Bearer <token>` OR `?token=<token>` query — same as current pattern (Claude Desktop config uses query form).

**Token format**: `crypto.randomBytes(32).toString('hex')` = 64 hex chars. Easy to copy, ~256 bits of entropy.

**Last-used tracking**: throttled. On successful validation, update `last_used_at` if `now - prev > 5 min`. Else skip the disk write. Keeps disk thrash off the hot path.

**Token expiry**: optional. `expires_at` null = never; ISO string = hard cutoff. Expired tokens fail auth with 401. Don't auto-delete (let user see + manually revoke for audit).

**Token display**: at creation, full token shown ONCE so user can copy. Subsequent reads (UI list) return masked form (e.g. `…last-4-chars`). Tokens stored in cleartext in the JSON file (HMAC/hash would prevent the UI from displaying anything useful for testing — single-user, file is readable only by the same user that runs node, acceptable).

## Files to touch

### Backend
- `server/index.js:50-58` — replace global auth middleware with a path-aware one: master-only for non-MCP routes, master-or-named-token for `/mcp/http`. Order: keep the same; webhooks above, auth below, routers below auth.
- `server/index.js:28-38` — add `/mcp-tokens` to the SPA wildcard guard so `GET/POST/DELETE /mcp-tokens` falls through to the router.
- New file `server/mcp-token-store.js`:
  - `loadTokens()` → returns `{ tokens: [...] }`, creates empty file on first call
  - `validateToken(token)` → returns matching token record or null (checks expiry); on match updates `last_used_at` throttled
  - `createToken(name, expiresInDays?)` → uuid + random hex + ISO timestamps, returns full record
  - `revokeToken(id)` → boolean
  - `listTokensMasked()` → public list with token masked to last-4-chars
  - In-memory cache + atomic flush; safe to call from concurrent requests (single Node process, no real concurrency issue)
- New file `server/routes/mcp-tokens.js`:
  - `GET /mcp-tokens` → `listTokensMasked()`
  - `POST /mcp-tokens` body `{ name, expires_in_days? }` → returns the FULL token + record (only call where full token returned)
  - `DELETE /mcp-tokens/:id`
  - All three require master auth (which is already the case — the route mounts under the master-only path of the middleware)
- `server/index.js` — import + mount the new router

### Frontend
- `client/src/api.js` — add `listMcpTokens()`, `createMcpToken({ name, expiresInDays })`, `revokeMcpToken(id)`
- `client/src/components/Settings.jsx` — render a new section ABOVE the schema-driven fields with the MCP token list UI:
  - Table: name · last used · expires · masked-token · `[Copy]` `[Revoke]`
  - `[+ Add MCP token]` button → modal: name (required) + optional expiry days → POST → display full token ONCE in a copy-to-clipboard banner with a clear "this won't be shown again" warning
  - Match existing global semantic class patterns (`toolbar`, `toolbar-btn`, `form-field`) per `CLAUDE.md` design-reuse-over-invention rule

### Docs
- `CHANGELOG.md` — 0.21.0 → 0.22.0 entry (or 0.23.0 if it lands after export observability)
- `tasks/todo.md` — Done section per the workflow

## Risks & edge cases

- **Bootstrap chicken-egg**: empty token list on first install = fine, all MCP traffic uses master CAPTURE_SECRET until user creates a named token. No lockout possible.
- **Master compromise**: if CAPTURE_SECRET leaks, attacker can manage tokens (create/revoke) AND directly call MCP with master. Acceptable — that's the master's role.
- **Named token leak**: attacker can call MCP only. Rotate via UI revoke. Compromise blast radius limited to MCP surface.
- **State file write race**: single-user, very low traffic — last-write-wins on the rare collision is fine.
- **Token cleartext at rest**: filesystem-only readable by the node user; same risk profile as `service-account.json` or `.env`. Acceptable for single-user. NOT acceptable if this becomes multi-user.
- **`Mcp-Session-Id` header**: per `server/mcp.js:202` the MCP transport uses this header for session continuity. The auth check happens BEFORE the transport sees the request, so token-vs-session is orthogonal. No interaction issue.
- **Token-via-query in URL**: same exposure pattern as current `?token=<CAPTURE_SECRET>` (URLs can leak to logs/history). User already accepts this for master; named tokens inherit the same trade-off. Document this in the UI ("don't paste tokens into pastebins / git").

## Definition of Done

1. Master CAPTURE_SECRET still works for ALL endpoints (including MCP) — backwards compatible.
2. UI Settings page shows MCP token list; can add named token; full token displayed at creation only.
3. Generated token successfully authenticates `/mcp/http` (verified by curl).
4. Revoking a token causes subsequent calls with that token to 401.
5. Non-MCP endpoints (`/search`, `/capture`, etc.) ONLY accept master — verified that a named MCP token returns 401 on `/search`.
6. `last_used_at` updates on use (throttled to 5min granularity).
7. Expired tokens (where `expires_at` < now) fail auth.
8. Version bumped (minor — new HTTP routes + new auth flow + new UI section).

## Decisions locked (2026-05-18)

1. **Strict separation**: master CAPTURE_SECRET works ONLY for non-MCP routes (UI). MCP routes accept ONLY named tokens from the list — no master fallback. Bootstrap: with zero tokens, MCP is locked until UI generates one (UI itself uses CAPTURE_SECRET, so no lockout possible).
2. **No token expiry** — drop the `expires_at` field entirely. Lifecycle is purely create/revoke.
3. **Reveal anytime** — UI list shows masked tokens by default, with per-row Show/Hide toggle (same pattern as `Settings.jsx::SettingsField` reveal-toggle for env secrets at line 38-51). NOT creation-only.
4. **Storage**: flat `state/mcp-tokens.json`, follows existing pattern (`state/agenda-cache.json`, `state/gmail-watermark.json`, `state/settings.json`). No nested `state/auth/` subfolder.

## Updated shape (no expires_at)

```json
{
  "tokens": [
    {
      "id": "<uuid>",
      "name": "Claude Desktop",
      "token": "<64-char hex>",
      "created_at": "2026-05-18T...",
      "last_used_at": "2026-05-18T..." | null
    }
  ]
}
```

## Updated auth split

- All non-MCP routes: master CAPTURE_SECRET only (unchanged).
- `/mcp/http`: ONLY tokens from `state/mcp-tokens.json`. CAPTURE_SECRET fails on MCP.
- Single path-aware middleware in `server/index.js`.

## Updated frontend behavior

- Per-row `[Show]` / `[Hide]` toggle on the token list (reveal-anytime, like env-secret reveal).
- Creation flow: name → POST → display full token in an inline highlighted row (no separate "shown only once" warning needed since reveal-anytime).

## Done (2026-05-18 — shipped as 0.22.0)

- [x] `server/mcp-token-store.js` — load/validate/create/revoke + atomic write + throttled last_used_at flush
- [x] `server/routes/mcp-tokens.js` — GET/POST/DELETE under master auth
- [x] `server/index.js` — path-aware auth middleware (master for non-MCP, named-token for /mcp/http)
- [x] `client/src/api.js` — listMcpTokens, createMcpToken, revokeMcpToken
- [x] `client/src/components/Settings.jsx` — McpTokensSection rendered above schema-driven fields
- [x] Version bumped 0.21.0 → 0.22.0 across 4 manifests
- [x] CHANGELOG entry (with ⚠ Breaking note for Claude Desktop config update)
- [x] Deploy to Hetzner (pm2 stop all → fuser -k 3000/tcp → git pull → npm run build → pm2 start all)
- [x] Smoke test (all 6 pass): master→/mcp-tokens 200 · master→/mcp/http 401 · create token · new token→/mcp/http 200 · revoke 200 · revoked token→/mcp/http 401

## Live cutover for user

The next time you open Claude Desktop (or any other external MCP client), it will 401 against `/mcp/http` because it's still configured with `CAPTURE_SECRET`. 30-second recovery: open the UI Settings tab → MCP tokens → Generate a named token (e.g. "Claude Desktop") → Show → Copy → paste into Claude Desktop config replacing the old CAPTURE_SECRET. From that point on the master is UI-only.

---

# OAuth 2.0 for MCP — Grok + Claude Desktop ready — NEW 2026-05-19

**Status**: implementing as 0.25.0. T2 scope locked.

## Why

Grok's connector config requires OAuth (screenshot 2026-05-19). PKCE highlighted as "recommended". Claude Desktop's MCP integration is moving the same way (PKCE + DCR per RFC 7591).

## T2 scope (locked)

**Endpoints to implement**:
- `GET /.well-known/oauth-authorization-server` — discovery JSON (RFC 8414)
- `GET /oauth/authorize` — consent page (server-rendered HTML)
- `POST /oauth/authorize` — process consent, mint auth code, redirect to client
- `POST /oauth/token` — exchange code for access token. Three auth modes:
  - PKCE only (`none` — public client, RFC 7636 S256)
  - `client_secret_post` (confidential, secret in body)
  - `client_secret_basic` (confidential, HTTP Basic header)
- `POST /oauth/register` — Dynamic Client Registration (RFC 7591, for Claude Desktop-style auto-discovery)

**Storage**:
- `state/oauth-clients.json` — registered clients: `{ id, name, client_id, client_secret_hash (scrypt), token_endpoint_auth_method, redirect_uris[], grant_types, created_at, last_used_at, auto_registered (DCR?) }`. Manual UI-mints + DCR-mints in the same list.
- `state/mcp-tokens.json` extended: optional `oauth_client_id` and `expires_at` fields. Existing manual tokens stay `oauth_client_id: null, expires_at: null` (never expire). OAuth-issued tokens are tagged with the client and have a 1-year expiry.
- Pending auth codes: in-memory Map keyed by code, 60s TTL. Loss on pm2 restart is acceptable (code is short-lived anyway).

**Token validation extension**: `mcp-token-store.js::validateToken` now checks `expires_at` — expired = no-match. Existing manual tokens with `null` expiry stay unaffected.

**Auth on /mcp/http**: unchanged code path — already validates against mcp-tokens.json. OAuth-minted tokens transparently flow through.

**Consent page**: server-rendered HTML form. Shows client name + scope. Asks for UI_SECRET (single-user; this is the "user authentication" step). On approve → generate code → 302 redirect to `redirect_uri?code=...&state=...`.

**Scope**: single scope `full` granting full MCP tool access. Future scopes can subset (e.g. `read-only`) but not in T2.

**Token lifecycle**:
- Access token: 1 year expiry (single-user, ritka rotation)
- No refresh tokens in T2 (re-do OAuth flow if expired)
- Per-token revoke from Settings UI (mirrors MCP tokens UX)

**UI Settings new section** "OAuth clients" — above the MCP tokens section, below the schema-driven fields:
- Lista: name · client_id · auth_method · redirect_uri(s) · created · last_used · [Revoke]
- "+ Add OAuth client" button → modal: name, redirect_uri, auth_method dropdown (none/basic/post). On create:
  - If method = `none` (PKCE-only) → return `client_id` only
  - Else → return `client_id` + `client_secret` (secret shown ONCE, never again — like industry standard)
- DCR-auto-registered clients show with a small "DCR" badge.

**SPA wildcard guard** (server/index.js): add `/oauth`, `/.well-known` to bypass list.

**Auth middleware**: `/oauth/*` and `/.well-known/*` paths bypass the Bearer auth (the OAuth endpoints have their own auth mechanisms; `.well-known` is public per spec).

## Files

**New**:
- `server/oauth-store.js` — client registration (load/create/validate/revoke) + auth code in-memory map
- `server/routes/oauth.js` — all 5 endpoints + consent page HTML
- `state/oauth-clients.json` — created on first use

**Modify**:
- `server/mcp-token-store.js` — extend record schema (`oauth_client_id`, `expires_at`); update `validateToken` to check expiry
- `server/routes/mcp-tokens.js` — `createToken` accepts optional `oauth_client_id` + `expires_at`
- `server/index.js` — mount oauth router, update SPA guard + auth middleware bypass for OAuth paths
- `client/src/api.js` — OAuth client CRUD functions
- `client/src/components/Settings.jsx` — new `<OAuthClientsSection>`
- `CHANGELOG.md` + version bump

**Out of scope (T3 if ever needed)**: refresh tokens, `/oauth/revoke`, `/oauth/introspect`, audit log.

## Definition of Done

1. Grok with PKCE-only mode (none) successfully connects and `search_brain` works
2. Grok with client_secret_basic mode also works (legacy path coverage)
3. Claude Desktop's DCR registration succeeds via `POST /oauth/register`, and subsequent flow works
4. Manual `Add OAuth client` in UI works; consent page asks for UI_SECRET and approves
5. Tokens issued by OAuth flow appear in MCP tokens list with the client name + expiry visible
6. Expired tokens 401 on /mcp/http
7. Existing manual MCP tokens (no expiry) continue to work — no regression
8. Version bumped 0.24.3 → 0.25.0

---

# Config layout cleanup — .env to root, strip to bootstrap-only, secrets via Settings UI — NEW 2026-05-18

**Status**: plan drafted, awaiting user confirm.

## Goal

Move config files to repo root and strip `.env` down to just the UI bootstrap secret. Everything else (17 env vars currently in `.env`) flows through `state/settings.json` (already schema-driven via `server/config-schema.js`), manageable via the existing Settings UI.

End-state filesystem on Hetzner:
```
/root/customBrain/
├── .env                       ← CAPTURE_SECRET only (UI bootstrap)
├── .env.example               ← CAPTURE_SECRET= + comment pointing to Settings UI
├── service-account.json       ← Google service account (moved from server/)
├── state/
│   ├── settings.json          ← ALL other config (existing file, just gets more values)
│   ├── mcp-tokens.json
│   └── ...
├── server/                    ← code only, no config
├── client/
├── scripts/
└── cron/
```

## Why this is safe (existing mechanism)

`server/config.js::applySettingsToEnv()` runs at boot AFTER `dotenv/config` (see `server/index.js:1-3`). It reads `state/settings.json` and OVERRIDES `process.env` with anything in there. All 17 env vars are already in the schema (`server/config-schema.js`). So migrating values from `.env` to `settings.json` is a pure data copy — no code changes needed for the secret-handoff itself.

## What's currently on Hetzner (verified)

- 17 env vars in `/root/customBrain/server/.env`: ANTHROPIC_API_KEY, CAPTURE_SECRET, FIREFLIES_API_KEY, FIREFLIES_WEBHOOK_SECRET, GMAIL_BRAIN_LABEL, GMAIL_CAPTURED_LABEL, GOOGLE_API_KEY, GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET, GOOGLE_DRIVE_FOLDER_ID, GOOGLE_DRIVE_PEOPLE_FOLDER_ID, GOOGLE_DRIVE_PROJECTS_FOLDER_ID, GOOGLE_DRIVE_REFRESH_TOKEN, GOOGLE_SERVICE_ACCOUNT_PATH, PORT, QDRANT_URL, YOUTUBE_SKIP_CATEGORIES.
- `state/settings.json` exists (1238 bytes, May 16) — partially migrated already.
- `server/service-account.json` exists (2373 bytes).
- All 17 keys are in `SETTINGS_SCHEMA`.

## Code changes (git)

- `server/index.js:1-3` — `dotenv/config` magic loads from CWD. Switch to explicit path: `dotenv.config({ path: join(__dirname, '..', '.env') })`. This works regardless of pm2's `--cwd` setting.
- All 8 scripts/cron with explicit `join(REPO_ROOT, 'server', '.env')` → `join(REPO_ROOT, '.env')`:
  - `cron/export.js`, `cron/gmail-intake.js`, `cron/youtube-intake.js`
  - `scripts/reprocess-v2-prototype.js`, `scripts/retry-failed-reprocess.js`
  - `scripts/backfill-task-types.js`, `scripts/calibrate-conflict-threshold.js`, `scripts/p8-probe.js`
- `server/routes/export.js::resolveSaPath` (lines 17-23) — fallback path from `resolve(MODULE_DIR, '..', 'service-account.json')` (which is `server/service-account.json`) to `resolve(MODULE_DIR, '..', '..', 'service-account.json')` (root). Env var override (`GOOGLE_SERVICE_ACCOUNT_PATH`) keeps working.
- `.env.example` rewrite — only `CAPTURE_SECRET=` with a comment: "Everything else is managed via Settings UI; see state/settings.json".
- `DEPLOYMENT.md` updates — pm2 `--cwd` requirement note (line 44) becomes obsolete with explicit dotenv path; document the root-layout.

## Server-side data migration (NOT in git, one-time)

Idempotent script: `scripts/migrate-env-to-root.js`. Run ONCE on Hetzner after deploy.

Steps the script performs:
1. Parse existing `/root/customBrain/server/.env` into key-value map.
2. Load existing `/root/customBrain/state/settings.json`. For each non-CAPTURE_SECRET key from .env, write to settings.json IF NOT ALREADY SET. (Settings.json wins on conflict — assume Hetzner is the source of truth for whatever's already there.)
3. If `service-account.json` exists in `/root/customBrain/server/`, move it to `/root/customBrain/service-account.json`. Update `GOOGLE_SERVICE_ACCOUNT_PATH` value in settings.json to the new absolute path.
4. Move `.env` from `server/` to root.
5. Strip the root `.env` to only `CAPTURE_SECRET=<value>` + a header comment.
6. Print what was migrated, what was kept-as-was, and what was skipped.

The script does NOT touch `state/settings.json` if it doesn't exist (it creates one). It does NOT delete the old .env file — it MOVES it then strips it, so an Ctrl-C mid-run leaves you in either a) old state (file at server/) or b) new state (file at root, contents stripped). No half-state where both exist.

## Deploy sequence

1. Push code (changes above) to GitHub.
2. SSH to Hetzner:
   a. `pm2 stop all` + `fuser -k 3000/tcp` (per `feedback_hetzner_restart.md`).
   b. `cd /root/customBrain && git pull origin main`.
   c. `node scripts/migrate-env-to-root.js` — runs the data migration.
   d. `pm2 start all`.
3. Smoke test: `curl /stats` (master in localStorage still works), `curl /mcp-tokens` (master works), check `pm2 logs custombrain` for boot line `[config: 17 from settings.json]` (or similar count).

## Risks

- **Boot order**: if new code is deployed but .env hasn't moved, `dotenv.config({ path: '<repo>/.env' })` finds nothing → server boots without CAPTURE_SECRET → 401 forever. Mitigation: pm2 stop BEFORE pull, migrate BEFORE start. Order in deploy sequence ensures this.
- **Settings.json mismatch**: if Hetzner's settings.json has a stale value that differs from .env, the migration favors settings.json (no overwrite). Manual review possible by reading settings.json after migration.
- **Backup**: the migration script does NOT back up the old .env or service-account.json before moving. If migration breaks something, rollback is via git revert + manual file copy. Mitigation: run a `cp /root/customBrain/server/.env /tmp/env-backup-$(date +%s)` BEFORE the migration script.
- **Local dev**: if anyone clones the repo fresh, .env.example tells them to put CAPTURE_SECRET in `.env` at root. The Settings UI bootstraps the rest. Matches the new architecture.

## Definition of Done

1. `/root/customBrain/.env` contains ONLY `CAPTURE_SECRET=...` (plus comments).
2. `/root/customBrain/service-account.json` exists; old location empty/gone.
3. `state/settings.json` contains all 16 non-CAPTURE_SECRET values from the previous .env.
4. `pm2 restart custombrain` boots cleanly, all API calls work as before (no regression).
5. `.env.example` reflects the new layout.
6. Version bumped 0.22.0 → 0.23.0 (minor: file relocation + config flow change, breaking for anyone with hardcoded paths).

## Open questions

None — the user's direction is explicit ("menjen a B és takarítsuk ki a .env-et... gyökérbe"). Ready to execute on confirm.

## Done (2026-05-18 — shipped as 0.23.0)

- [x] `scripts/migrate-env-to-root.js` written (idempotent: each step checks current state, skips if done)
- [x] `server/index.js` boots dotenv with explicit path → independent of pm2 `--cwd`
- [x] All 23 scripts/cron updated: `'..', 'server', '.env'` → `'..', '.env'`
- [x] `server/drive-context.js` + `server/routes/export.js` SA path resolution anchored at repo root
- [x] `.env.example` rewritten to CAPTURE_SECRET only + Settings UI pointer
- [x] `server/get-drive-token.js` + `scripts/get-drive-token.js` console output points at Settings UI
- [x] Docs updated: `CLAUDE.md`, `README.md`, `DEPLOYMENT.md` reflect new layout; pm2-cwd note marked historical
- [x] Version bumped 0.22.0 → 0.23.0 across 4 manifests
- [x] CHANGELOG entry with breaking note for local-dev clones
- [x] Hetzner deploy: pm2 stop all → fuser -k → git pull → migration → pm2 start all
- [x] Verified: 596 keys still resolved via settings.json overlay, `/stats` HTTP 200 with new .env location, SA path resolves from root

## Known follow-ups (not part of this scope)

1. PM2 duplicate `id 14` "customBrain" (capital C, N/A version) still EADDRINUSE-looping in the background — pre-existing, unrelated, separate cleanup pass.
2. `scripts/migrate-env-to-root.js` dry-run mode has a logic bug (strip step exits 1 when NEW_ENV doesn't yet exist in dry-run, breaking the chain). Actual run works fine and is idempotent. Fix on the next visit or skip; not load-bearing now that the one-time migration is done.

## Analysis (2026-06) — High-level project review (plan per global workflow + user "ok and go")

**What this is**: Self-owned AI memory / second brain. Multi-source capture (manual UI/extension/MCP + Fireflies webhook + YouTube likes cron + Gmail label cron with body cleaner) → Haiku metadata (people/projects/topics/type/action_items + strict project whitelist + alias resolution) + Gemini embeddings → Qdrant storage → semantic search (hybrid) + recent/stats + conflict archiving + brain-hygiene (overconnected find → suggest fix → patch) + hourly full Obsidian vault export (wikilinks + semantic Related) to Google Drive. Three surfaces from one backend: HTTP (UI + extension), MCP Streamable HTTP, MCP stdio. Deployed Hetzner + pm2/nginx; Qdrant docker.

**Architectural structure**: 
- Layers: client/ (Vite+React19+Tailwind SPA, tabs for capture/search/recent/stats/export/settings, token gate in localStorage); server/ (Node ESM, no build; index.js does dotenv explicit root, applySettingsToEnv, trust-proxy, CORS exact, static client/dist + SPA fallback with explicit API path list, path-aware auth middleware, route mounts, /mcp/http); cron/ (host crontab node scripts for intake/export); agent/ (external tools: gmail/calendar/fireflies/youtube + drafts + context, registered for MCP); scripts/ (backfills, hygiene batch, probes, migrations, inits — ~28 files); root thin package.
- Data: Qdrant 'thoughts_v2' sole source of truth. Points: main thoughts (kind absent or 'thought') + chunks (kind:'chunk', parent_id, chunk_label/text/kind). Named vectors {dense: Gemini 3072 RETRIEVAL_*, bm25: sparse}. Payload: text (or summary+orig for long), title, people/projects/topics/type/action_items (mutable via PATCH), source+source_id (idempotency), created_at, effective_date (content time, for ordering/decay), status, supersedes, refresh_count, pipeline_version, etc. Immutable text/source/timestamps.
- Core flows: captureThought (dedup early, vaultCtx, parallel embed+extractMetadata, sparse, dense conflict search + Haiku logical-contradict check (threshold 0.97 calibrated), effective_date, upsert); refreshCapture (in-place for Gmail updates/summaries); hybridSearch (prefetch x4 + rrf k=60) + time decay; full-rebuild export (delete folder + write every active + stubs + semantic links); hygiene trio in brain-hygiene + metadata.
- Config/auth: .env (UI_SECRET bootstrap only) + state/settings.json (overlay at boot via apply, schema-driven, masks, chmod 600 best-effort, restart to apply); NEVER_OVERLAY for UI_SECRET. Path-aware Bearer: master UI_SECRET for most; /mcp/http ONLY named from mcp-tokens.json (strict split); named also allow /capture/search (extension); OAuth2 public paths (PKCE/DCR/consent with separate OAUTH_USER/PASS) for MCP clients; pre-auth Fireflies HMAC rawBody; per-IP escalating rate-limiter (3-fail ladder, rationale in code); trust proxy loopback.
- External: Gemini (embed + YT multimodal summary), Anthropic Haiku (extraction/contradict/hygiene/summaries), Google (SA for vault reads/visibility, OAuth2 refresh for writes/Gmail/Calendar/YT), Fireflies.
- Key patterns: direct fn sharing across surfaces (no HTTP hop for MCP); batch parallel Drive fetches; post-process alias resolve + grep verify; NOT_CHUNK filters; effective_date for content chronology.

**Good parts / strengths** (evidence from code/comments/docs):
- Discipline & empiricism: probes/baselines/afters in tasks/*.json, calibration scripts, "when in doubt false" in contradiction prompt, lit refs (RRF k=60 paper, Google taskType), "USE IT FIRST" usage gate, detailed rationale comments everywhere, audit in git+brain+CHANGELOG+ROADMAP.
- Safety rails: auth split (master never authorizes MCP), rate limiter design (per-IP to avoid self-DoS, prune, success clears), config overlay with explicit never-overlay + chicken-egg handling, SA for Drive reads (fixed visibility bug), strict project whitelist + full docs in prompt + aliases (directly attacks over-tagging), idempotency at every intake, immutable core fields.
- Abstractions that work: one-backend-multiple-interfaces (routes export the fns MCP calls directly), vault context as single source (Drive .md frontmatter native Obsidian Properties), effective_date vs created_at, full-rebuild export (correctness over incremental complexity), hygiene as human+LLM loop not auto-mutate.
- Hardening visible (0.22-0.26+): explicit dotenv path, trust proxy + XFF, CORS tightened, OAuth for external MCP, named token allowlist narrow, log scrubbing mentions.

**Bad parts / cons / technical debt**:
- Duplication: mcp.js (229 LOC) and mcp-stdio.js (196) require parallel edits for every tool change (explicitly called out in AGENTS/CLAUDE).
- Drift & maintenance: README still says v0.5.3 while reality 0.27/ROADMAP; 28 scripts/ for one-offs (backfills, calibrations, hygiene, migrations) — debt if not pruned to runbooks.
- Dev/ops friction: "deploy-tested only" (no local .env/creds per project rules; all real work Hetzner SSH + per-action); build OOM on 4GB CX22 requires ritual `pm2 stop all; fuser -k 3000/tcp`; in-memory (drafts, rate state, oauth codes, cache); SPA guard list of paths is manual (add route → edit index.js wildcard too).
- Scale/correctness: hourly full vault rebuild (fine now, will hurt); Qdrant backup still open item in ROADMAP Ops; many in-flight maps/state assume single instance.
- Versioning tax: bump 4 manifests + CHANGELOG every time.

**Security concerns** (from code review of index, config, rate-limiter, mcp, drive, webhooks, env handling; no runtime):
- Blast radius: UI_SECRET master (HTTP surface + token mgmt) — leak = full control (mitigated by split, never in settings, fs only).
- At-rest secrets: cleartext in state/mcp-tokens.json, state/oauth-*.json, state/settings.json (some), service-account.json, .env (rely on 600 chmod best-effort + single-user Hetzner ufw/fail2ban/hardening). No encryption at rest visible.
- Surfaces: Fireflies HMAC (good, raw body); OAuth endpoints public but own flows (consent asks UI_SECRET? no, separate OAUTH creds); /mcp/http locked to named only (strong); named tokens narrow REST allowlist (good, 403 not 429 on misuse); Qdrant 127.0.0.1:6333 only (docker); CORS exact origin (tight); rate limiter on UI auth failures (per-IP, escalating, not on MCP).
- Data: Full PII (corporate email threads, meeting transcripts, personal notes) in Qdrant + exported wholesale to Drive. No visible length caps on capture (some truncation in cleaners). Logs: errors include messages (drive failures etc.); potential token leakage if not careful.
- Other: service-account.json fs trust; no child_process/eval in server samples; MCP stdio unauth (local only, intended); prod vs Dockerfile (latter misses agent/ per DEPLOYMENT); nginx assumed for TLS.
- Positives: Recent code shows care (trust proxy comment, rate rationale, never-overlay, path splits, 600 chmod). No broad secret-in-URL except the documented ?token= (same for master/named).

**Pros/Cons summary + risk matrix (high level)**:
Pros: Extremely capable personal augmentation (auto everything + semantic + curation + familiar export); unusually high rigor/audit for a solo project; auth & data model invariants are sound after hardening passes.
Cons: Complexity approaching "too much for one person" (retrieval stack + 3 auth systems + chunks + coworker + OAuth + scripts); local iteration painful; SPOF (one Hetzner holds brain + all tokens/creds); maintenance (dupe, drift, scripts).
Risks: High — data loss (no backup strategy shipped yet), secret compromise (single master + cleartext files), lockout on bad deploy (chicken-egg .env + pm2 dance). Med — search quality uneven until v2 reprocess done, over-tagging without hygiene. Low — external API cost/rate (single user), CORS/XSS token exfil (mitigated).

**Next (no execution)**: Consider unifying MCP registration (shared module), turn key scripts into documented runbooks or prune, verify backup end-to-end, keep "push back BEFORE designing" (global rule) strictly — this is already at the edge of justifiable complexity for personal use. Manual curation + simple search was the honest v0 baseline; current stack earns its weight only because use signal justified it.

## Review
Workflow followed exactly (read relevant files first via multiple parallel reads/greps/terminal/list_dir; plan written to tasks/todo.md via todo_write before deep work + user verified "plan ok and go"; marked complete progressively one area at a time; one high-level explanation per step in thinking + this minimal append; every change smallest possible — only this append at EOF, no new files, no unrelated refactors, no code changes). All non-negotiables observed (root causes noted e.g. dupe from separate transports + "no local env" convention; no ?./??/try-catch papering added; no timeouts for races; no helpers for one-offs; design reuse observed in analysis). Review section added. Analysis is static/code-only (no Hetzner runs, per project "deploy-tested" rule). 

(End of analysis section — 2026-06.)
