# Graph = teljes ontológia, buborékokban — terv

**Dátum:** 2026-10-10 · **Állapot:** jóváhagyva (döntések: fájlcsomag projektenként · közös réteg-szabály · task = Történés), 0.59.0 · **ROADMAP:** „UI-teendők az ontológiához”, 4. tétel · **Spec:** [ontológia](ontologia-es-helyzetcsomag-spec-2026-10-10.md) 2. pont

## Cél

A Graph ne csak thoughtokat mutasson. Mind az öt réteg látsszon, mindegyik a saját buborékjában: Horgony, Történés, Tárgy, Vállalás, Tudás. Az élek a buborékok között fussanak: thought → projekt/ember, vállalás → forrás-thought, repó → projekt, fájlcsomag → projekt.

## Mi van ma (és mit használunk újra)

A Graph már most horgony-modellen fut: középen a BRAIN, körülötte csoport-horgonyok, rajtuk a thoughtok. Az aktív csoportosítást a `GROUP_MODES` választja ki: Clusters / Project / Person / Type / Source. **Az ontológia egy új mód lesz ugyanebben a gépezetben**, „Ontológia” néven: öt réteg-horgony a BRAIN körül, és mindegyik elem a saját rétegéhez kötődik. A fizika, a 2D/3D, az idővonal, a kiemelés és az izolálás változatlan marad. A Louvain-közösségek továbbra is csak thoughtokon számolódnak, így a Clusters mód nem változik.

Számok a szerverről (2026-10-10): 626 aktív thought · 343 dosszié (People 299, Projects 29, Topics 8, Repos 7) · 44 vállalás · 1090 projekthez kötött fájl.

## Rétegek és csomópontok

| Réteg | Csomópontok | Darab (kb.) |
|---|---|---|
| Horgony | Projects + Topics dossziék, és azok a People-dossziék, amelyekhez legalább 3 thought tartozik (`MIN_ANCHOR_SIZE`, ugyanaz, mint a Person módnál) | 29 + 8 + ~60 |
| Történés | thoughtok, amelyek nem Tudás-réteghez tartoznak (meeting, email, note, task, …) | ~400 |
| Tárgy | Repos-dossziék (drift-jelzéssel a `repos-status.json`-ból) + **projektenként egy fájlcsomag-csomópont** („Fájlok · RMT Országtuning · 201”, a mérete a darabszámmal nő) | 7 + ≤29 |
| Vállalás | `commitments`, státusz szerint színezve; a done/dropped halvány | 44 |
| Tudás | thoughtok: `source=youtube`, vagy `type ∈ {reference, synthesis, decision}` | ~230 |

**A réteg egyetlen definíciója:** új `server/ontology.js`, `layerOf(thought)`. Ezt használja a Graph **és** a `brain_map` is: a HÁTTÉR szekció ugyanezt a szabályt követi. Ma a `brain_map` saját listát tart (`synthesis`, `decision`, youtube), amiből a `reference` kimarad. Ha két hely két szabályt tart, előbb-utóbb ellentmondanak egymásnak. Ezért a `brain_map` HÁTTÉR-e is bővül a `reference` típussal.

## Élek a buborékok között (új élfajta: `ontology`, alfajjal)

- `tag`: thought → projekt/ember/téma dosszié, a payload `projects`/`people`/`topics` mezői alapján, `nameKey`-jel illesztve. Az ember-él csak az anchorolt (≥3) emberekre jön létre.
- `source`: vállalás → forrás-thought. A gmail/fireflies `ref` a thought `source_id`-ja, a `candidate_refs` a `thought_id`.
- `owner`: vállalás → ember- és projekt-dosszié.
- `repo`: repó → projekt-dosszié (a `repos-status.json` `project` mezője).
- `files`: fájlcsomag → projekt-dosszié.

A meglévő thought–thought élek (metadata, semantic, supersedes) maradnak. Az Edges panelen az `ontology` élfajta külön kapcsolható.

## Szerver

- `GET /graph?layers=1`: a mai válasz mellett egy `ontology: { nodes, edges }` blokk is jön. A rétegmód első választásakor tölti be, így az alapnézet payloadja nem nő. Minden node kap `layer` mezőt.
- Források: a meglévő olvasók. Dossziék: `scrollFilteredRaw({kind: dossier})`. Vállalások: `listCommitments`. Repók: `repos-status.json`. Fájlok: a katalógus, projektenként összeszámolva. Új keresés nincs.

## Kliens (`Graph.jsx`)

- `GROUP_MODES` + `{ key: 'layer', label: 'Ontológia' }`. A `deriveGroups` erre az öt fix réteget adja, fix sorrendben és fix színekkel, orbit nélkül.
- A nem-thought csomópontok `kind`-ja: `dossier` | `commitment` | `filebundle` | `repo`.
  - A **dossziéra** kattintva a `ThoughtModal` nyílik meg, mert a dossziék Qdrant-pontok.
  - A **vállalásra**, a **repóra** és a **fájlcsomagra** kattintva a meglévő oldalpanel jelenik meg: a vállalás címe, státusza, határideje és forrása; a repó verziója és driftje; a fájlcsomag darabszáma és a projekt.
- Az idővonal-szűrő: dosszié = Drive-módosítás, vállalás = `created_at`, fájlcsomag = a legfrissebb fájl.

## Kimarad v1-ből

- Fájlok egyenként: 1090 csomópont, ami több, mint a thoughtok száma. Erről külön döntés kell (lásd lent).
- Naptáresemények mint Történés: élőben, a cache-ből, időbélyeggel. Ez v2.
- A Runs-tab és a Graph összekötése: egy futás elemeinek kiemelése a gráfon. Jó v2.

## Ellenőrzés

Helyben build. Élesben a böngészőben: Ontológia mód, öt buborék, a darabszámok egyeznek a fenti táblával, a dosszié-kattintás `ThoughtModal`-t nyit, a vállalás-kattintás a panelt, és a többi mód változatlan. Végül a `brain_map` HÁTTÉR-ében megjelenik a `reference` típus.

Verzió: minor, `0.58.0` → `0.59.0`.
