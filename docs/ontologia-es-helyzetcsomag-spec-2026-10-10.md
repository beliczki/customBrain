# Ontológia és helyzetcsomag

**Dátum:** 2026-10-10
**Állapot:** spec, implementáció előtt. Kód nem készült.
**Kapcsolódik:** [MCP interview és gráfbejárás spec](mcp-interview-es-grafbejaras-spec-2026-10-09.md) (hogyan jár be az agent), ROADMAP AUTORESEARCH (hogyan hangoljuk a csomagot). Ez a dokumentum azt rögzíti, **mit** kap az agent.

## 1. A mérce

> Egy keresés válaszából az agent (vagy Robi) értse meg: **mi a helyzet, mi történt előtte, és minek kellene következnie** — lehetőségek fontosság és sürgősség szerint.

A válasz **strukturált csomag**, nem összekevert találati lista. Minden szekciót az a forrás tölt, amelyik abban egyedülállóan jó; a szekciók egymás mellett állnak, nem versenyeznek egy közös rangsorban.

## 2. Ontológia

A felső szint a tétel **szerepe**, nem a forrása. A forrás (gmail, fireflies, drive, github, claude-code, …) minden tételen tulajdonság.

| Réteg | Mi ez | Példák | A csomagban |
|---|---|---|---|
| **0. Horgony** | Amihez minden más kötődik | Projekt, Ember, Téma | HORGONYOK |
| **1. Történés** | Időbélyeges, emberekkel | email-szál, meeting, Teams, agent-session | ELŐZMÉNYEK |
| **2. Tárgy** | Tartós, van állapota | fájl (Drive), repó (kód, deploy, verzió) | HELYZET |
| **3. Vállalás** | Aminek még meg kell történnie | action item, `TODO-*`, ROADMAP-tétel, task, közelgő esemény, megválaszolatlan levél, félbehagyott session | KÖVETKEZŐ |
| **4. Tudás** | Háttér | külső: YouTube, cikk, X, tanulmány · belső: `Synthesis:`, döntések | HÁTTÉR |

Szabályok:
- **A naptárbejegyzés és a meeting-átirat ugyanaz a történés** két időpontban (terv → megtörtént). Egy tételként kezeljük, két forrással.
- **A "Thoughts" tároló, nem kategória.** Az 1. és 4. réteg nagy része Qdrantban él; a szerepet a payload mondja meg.
- **A Repo két rétegben él:** kód és deploy = Tárgy; roadmap és taskok = Vállalás.
- **Az agent-session Történés**, ami Vállalásokat szülhet (nyitott TODO, félbehagyott munka).

## 3. Rétegenként: mi van ma, mi hiányzik

Felmérés 2026-10-10, helyi kód + helyi Drive-szinkron alapján.

### 0. Horgony
- **Van:** dossziék a Drive-on: People 299, Projects 28, Topics 8. Aliasok a capture-nél bekötve. A `quick_lookup` horgony szerint szűr.
- **Hiányzik:** a keresés nem fordítja le a kérdést horgonyokra első lépésként; ma a dense/BM25 találatok metaadatából derül ki utólag.

### 1. Történés
- **Van:** `gmail` (cron, 10 perc), `fireflies` (webhook), naptár élőben (`get_calendar_events`, `get_agenda` cache), `get_event_context` (thoughts + Gmail + Fireflies egy eseményhez).
- **Hiányzik:** Teams; agent-session history (Claude, Claude Code, Codex, Grok, Hermes); a naptáresemény ↔ Fireflies-átirat összekötése egy tétellé.

### 2. Tárgy
- **Van:** Files katalógus (`state/files-catalog.json`, 3355 rekord, 0.51.0) + `find_files`. `Repos/` dosszié-mappa (0.41.0), indexelve.
- **Hiányzik:** `Repos/` mappában **1 dosszié** (customBrain); `Files/` dosszié-mappa üres. Repó-állapot (verzió, deploy, utolsó commit) nincs gépileg olvasva. Kódsor-keresés nincs.

### 3. Vállalás
- **Van:** `action_items` minden thought payloadjában (Haiku kinyeri capture-nél); `TODO-*` markeres thoughtok; ROADMAP.md repónként; közelgő események a naptárban.
- **Hiányzik:** **egy helyen összegyűjtött vállaláslista.** Az action itemeknek nincs státusza (nyitott/kész), nincs határidejük, nincs gazdájuk; a repó-taskok és a félbehagyott sessionök nem látszanak a brainből. Ez a legnagyobb rés: enélkül a KÖVETKEZŐ szekció üres.

### 4. Tudás
- **Van:** `youtube` (cron), kézi capture (Chrome extension cikkekhez), `type=synthesis`.
- **Hiányzik:** X, tanulmányok külön forrásként; a kézi cikk-capture ma `source=manual`, nem különböztethető meg egy jegyzettől.

## 4. A csomag formátuma

```
HORGONYOK   projekt(ek) · emberek · téma
HELYZET     tárgyak jelenlegi állapota (repó verzió/deploy, legutóbbi fájlok)
ELŐZMÉNYEK  idővonal: dátum · típus · forrás · egy sor · ref
KÖVETKEZŐ   vállalások: mi · miért · sürgősség · fontosság · ref
HÁTTÉR      szintézisek, döntések, külső tudás
HIÁNYOK     forrásokon átnyúló rések (meeting átirat nélkül, csatolmány Files-rekord nélkül, session-döntés ROADMAP nélkül)
TOVÁBB      szekciónként a mélyebb tool + paraméterek
```

- Minden tétel hivatkozással (thought id, Drive link, thread id, repó+path) — az agent innen ás tovább, a csomag nem tölt be teljes szövegeket.
- Szekciónkénti méretkeret; a keretet az AUTORESEARCH profil hangolja (`state/retrieval-profile.json`).
- A **HIÁNYOK** blokk csak azért lehetséges, mert a szekciók külön állnak: egy összevont index nem tudja megmondani, mi *nincs* meg.

## 5. Sürgősség és fontosság

- **Sürgősség — adatból számolható ma:** határidő, közelgő esemény távolsága, mióta vár egy levél válaszra, mióta nyitott egy action item.
- **Fontosság — kevés adat van rá:** ROADMAP P-szintek, projekt-dossziék. Hogy ez elég-e, a használat mondja meg. v1-ben **nincs rangsoroló modell**; a csomag kiírja a jeleket (dátum, P-szint), és az agent mérlegel.

## 6. Sorrend

1. **Repo-elemzés → `Repos/` dossziék.** Kód nélkül, sessionökkel. Ettől lesz tartalma a HELYZET kódrészének.
2. **Vállalás-réteg v1:** a meglévő források (thought `action_items`, `TODO-*`, ROADMAP-ok, közelgő naptár, megválaszolatlan levelek) összegyűjtése egy olvasási nézetbe. Döntendő előtte: hol él a státusz (lásd 7.).
3. **`brain_map` tool v1** a meglévő forrásokkal (naptár, email, thoughts, fájlok, Repos-dossziék) + vállalások + HIÁNYOK. A `get_event_context` mintáját bővíti; mindkét MCP-regisztrációban (`mcp.js` + `mcp-stdio.js`) és scope-térképben.
4. **Új források, ha a térkép mutatja a hiányt:** agent-session history, kódsor-keresés (először GitHub code search), Teams, X/tanulmányok.
5. **AUTORESEARCH** a kész csomagon: szekciónkénti k, keretek.

## 7. Nyitott kérdések

- **Melyik repók** kapjanak dossziét elsőként? (mind a `~` alatt, vagy az aktívak)
- **Vállalás-státusz helye:** thought payload mező (`action_items[].status`), külön Qdrant collection, vagy fájl a `state/` alatt? Ez új tárolási döntés — külön jóváhagyás kell.
- **Agent-history:** szerveroldalon kell (minden agent látja), vagy elég a Macen futó sessionöknek? A szerveroldali változat új intake + tárolás.
- **Kézi cikk-capture** kapjon-e saját `source` értéket (pl. `article`), hogy a Tudás-réteg szűrhető legyen.
