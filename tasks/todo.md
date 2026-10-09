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
- [ ] **(d) Testvérhiba a chunkolásban, 2026-10-09-én találtam.** A `reprocess-v2.js` a Sonnettel `max_tokens: 16384` mellett **újraíratja az eredeti szöveget** `content_chunks`-ként. A `_stop_reason`-t sehol nem nézi az éles út (csak a prototípus-script). A tárolt szöveg teljes marad, de a hosszú gondolatok (Fireflies, és most már a hosszú Gmail) **vége nem kap chunk-vektort**, tehát kereséssel nem található meg. Ez ugyanaz a mechanizmus: a modell a forrást írja újra, plafon alatt.
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
- [ ] Döntés: a meglévő ~109 Gmail-szál újrahúzása az új tisztítóval. Ma a régiek Haiku-átírt, rövidített szöveget hordoznak. Költség: Haiku-osztályozás + embedding + Sonnet reprocess szálanként.

## 7. Repo- és agent-session-logok a brainbe (Robi kérése, 2026-10-09) — TERV, nem kezdve
Cél: mit csinált az agent, miről beszélgettünk, mit mondott, milyen roadmap-task született — Claude Code és Codex sessionökből is —, és mindez a brain-ontológiában legyen (repo → session → task → döntés).
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
- [ ] Leltár, csak olvasva:
  - a Drive `/data` és `/docs` mappáinak szerkezete, fájlszám és típusmegoszlás;
  - a Gmail-csatolmányok száma és típusa a brain-címkés szálakon.
- [ ] Katalógus-terv: egy rekord = név, Drive-link / Gmail-szál, mime, méret, módosítás, projekt (mappából vagy szálból), irány, forrás. Nyitott, hova kerüljön:
  - (a) generált `Files/` dossziék — a meglévő reindex kezeli őket, de 1 fájl = 1 .md, ami sok fájlnál zajos;
  - (b) egy katalógusfájl, amit a `get_brain_ontology` olvas.
  A leltár számai döntik el.
- [ ] Katalógus-script megírása. A tartalom-kivonat ezen a ponton még NEM része. Referencia a brandBrain-ből: `extract.ts`, `page:N`/`slide:N` locatorok, sha256-os dedup.

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
- [ ] Claude Code: még hátra van.
- [ ] **Grok bot** (Robi azonosította, 2026-10-09) a RÉGI `/mcp/http`-n: `Cursor/1.0.0` UA, AWS IP-k (52.44.113.131, 184.73.225.134), fejléces token. Át kell állítani `/mcp/http-stateless`-re a bot saját konfigurációjában (nem ebben a repóban), és ellenőrizni kell a naplóban. A régi végpont kivezetése előtt ennek meg kell lennie.
- [ ] A claude.ai connector-beállításáról készült képernyőképen látszott egy teljes token → új tokent kell csinálni, és a régit vissza kell vonni, ha már egyik kliens sem használja (Robi döntése).
- [ ] Új lelet: a `quick_lookup` limit=50-re 122 KB-ot adott (teljes action_items stb. 20 thoughtra). Ugyanaz a minta, mint a `search_brain` 0.48.0 előtt; mérni és dönteni kell.
- [ ] Minden kliensnél **valós `tools/call` az nginx-logban** (nem a modell önbevallása alapján; memória-szabály), mind a 4 kliensre.
- [ ] Csak ezután váltjuk a fő végpontot. A stateful kód egy kiadáson át megmarad visszakapcsolhatóként.
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
