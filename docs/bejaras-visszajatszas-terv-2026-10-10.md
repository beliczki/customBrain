# Bejárás-visszajátszás (a) — terv

**Dátum:** 2026-10-10 · **Állapot:** jóváhagyva, 0.58.0 · **ROADMAP:** „UI-teendők az ontológiához”, 3. tétel (a) szint
**Döntések (Robi, 2026-10-10):** szerveroldali napló · v1-ben idővonal-lista, nem a Graph animálása.

## Cél

Látszódjon, hogyan járja be egy valódi agent a brain-t: milyen sorrendben milyen toolokat hív, milyen argumentumokkal, mit kap vissza. A futást lépésenként vagy lassítva vissza lehet játszani. Extra LLM-költség nincs, mert valódi hívásokat játszunk vissza.

## 1. Napló: `state/mcp-calls.jsonl` (új tároló)

Ugyanaz a minta, mint az `anthropic-usage.jsonl`-nél: egy sor = egy `tools/call`, csak hozzáfűzés, és nincs DB.

**Egy helyen kötjük be:** az `applyScopeGate` (`server/mcp-scopes.js`) már most is becsomagolja a `server.tool`-t, mielőtt bármi regisztrálódna. Ott a handlert is becsomagoljuk. Így mind a három regisztrációs fájl (`mcp.js`, `mcp-stdio.js`, `agent/register.js`) eszközei naplózódnak, és a hívási helyekhez nem kell nyúlni.

**Ki hív:** a `createMcpServer(scopes)` helyett `createMcpServer(principal)` jön, hogy a token **neve** is a naplóba kerüljön. A stdio nem naplóz (`caller: null`): helyi, a Macen fut, és a szerver UI úgysem látná.

Egy sor tartalma:
```
{ ts, caller (token neve), tool, args, ms, ok, error?, result_chars, refs: [{id, title}] }
```
- `args`: a 300 karakternél hosszabb szövegeket levágjuk, a hosszt megtartjuk. A `capture_thought` teljes szövege így nem kerül a naplóba, csak az eleje.
- `refs`: a válasz JSON-jában minden `{id, title}` pár, legfeljebb 50 darab. Ebből lesz a „mit hozott” lista. Teljes válaszszöveg nincs a naplóban, a `get_thought` ezért a thoughtot magát viszi tovább.
- A napló írása nem akadhat a tool-hívás útjába: a válasz után fut le. Ha az írás hibát dob, az a pm2-logba kerül, a toolhívás pedig sikeres marad. Ez nem a hiba eltakarása: a napló mellékhatás, és nem az adat útja.

**Növekedés:** egy hívás nagyjából 0,5–3 KB. Napi néhány száz hívással ez évente néhány száz MB, ami még belefér. Rotálásra akkor lesz szükség, ha a méret ezt mutatja. A logrotate (0.39.2) erre nem jó, mert a fájl adat, nem log.

## 2. Futások: olvasáskor csoportosítva

A stateless MCP-nek nincs session id-ja, ezért a **futás** = ugyanaz a `caller`, a hívások között legfeljebb **10 perc** szünettel. Ez kézzel beállított kezdőérték; ha két kérdés egybefolyik, csökkentjük.

`GET /agent-runs?days=7` (új `server/routes/agent-runs.js`, csak master UI-tokennel) visszaadja a futásokat lépésekkel együtt, a legújabbal kezdve:
```
{ runs: [{ id, caller, start, end, steps: [{ ts, offset_ms, tool, args, ms, ok, error, result_chars, refs }] }] }
```
A route bekerül a SPA-wildcard guardba. A `/mcp` előtag nem jó, mert azt a named-token auth kezeli.

## 3. UI: új „Runs” tab a Graph előtt

`tabs`: `… Agenda, Runs, Graph …` · új komponens `AgentRuns.jsx`.

- **Futáslista** (felül): dátum mono · caller chip · lépésszám · időtartam · az első argumentum (jellemzően a kérdés). Kattintásra kinyílik.
- **Lépések idővonala:** `+mm:ss` mono · tool · `args` mono egy sorban · `ms` · találatszám. A `refs` lenyitva kattintható sorok (`ThoughtModal`). A nem-thought id-k (vállalás, fájl) a modalban „not found”-ot adnak. Ezt v1-ben elfogadjuk, a v2 a ref típusát is naplózza.
- **Lejátszás:** `▶ Lejátszás` / `❚❚` / `◀ ▶` léptetés, sebesség `1× | 4× | 16×` (a valódi időköz osztva). A még nem játszott lépések halványak, az aktuális kiemelt. Csak a kliens állapota, nincs új hívás.
- A stílus a meglévő mintákat követi: Agenda-fejlécek, `agenda-thought-link` sorok, a Search `search-mode-switch` mintájú sebességváltó. Osztálynevek: `agent-runs`, `agent-runs__run`, `agent-runs__step`, `agent-runs__step--current`, `agent-runs__player`.

## Kimarad v1-ből

- A Graph animálása, a repó-lenyomat a szimulátorban (ROADMAP 40. sor), a (b) LLM-szimuláció.
- Kliens-azonosítás a token neve fölött (User-Agent). Ha egy tokent két kliens használ, egybefolynak.
- Napló a stdio-ból.

## Érintett fájlok

**új:** `server/mcp-call-log.js` (írás + olvasás + csoportosítás), `server/routes/agent-runs.js`, `client/src/components/AgentRuns.jsx`
**módosul:** `server/mcp-scopes.js` (handler-csomagolás), `server/mcp.js` (principal átadása, két hívási hely), `server/mcp-stdio.js` (`applyScopeGate(server, null)` → caller nélkül), `server/index.js` (route + guard), `client/src/api.js`, `client/src/App.jsx` (tab), doksik.

## Ellenőrzés

Deploy után néhány valódi hívás claude.ai-ból vagy Claude Code-ból, mondjuk egy `brain_map` + `get_thought`. A naplóban megjelennek a helyes callerrel, a Runs tabon egy futásként, és a lejátszás lépésenként végigmegy rajtuk. A szűk scope-ú token tool-listája nem változik (az `applyScopeGate` viselkedése ugyanaz marad).

Verzió: minor, `0.57.0` → `0.58.0`, mert új tároló, új HTTP-route és új tab.
