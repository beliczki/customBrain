# App shell a HINT-map mintájára — terv

**Dátum:** 2026-10-10 · **Állapot:** jóváhagyva, 0.62.0 · **Kérés (Robi):** bal oldali menü a menüpontokkal, alul fix rész (kijelentkezés, téma, beállítások). Jobbra a tartalom címmel, a teljes magasságot kitöltve. A jobb szélen összecsukható eszköztár, ami ma csak a Graph-nak van.

## Minta: confAi2 HINT-map (csak olvasva)

- **Bal sáv** (`ThreadSidebar.tsx`): 280 px nyitva, 60 px összecsukva (ikoncsík, hamburger felül). lucide-react ikon + felirat. Aktív sor: a tartalom háttérszínét kapja és balra kerekített, így összefolyik a tartalompanellel. A lábléc `mt-auto`-val alul ül.
- **Eltérés a kéréstől:** a HINT-map bal sávjának láblécében csak téma és verzió van. Kijelentkezés az admin shellben van (`admin/layout.tsx`). Itt a kérés szerint alul lesz a kijelentkezés, a téma és a beállítások.
- **Eltérés a kéréstől:** a HINT-map vezérlőpanelje a térkép **bal** oldalán csukható (`PanelLeftClose` → 48 px csík), és jobbra a részletpanel áll. Itt a kérés szerint a **jobb** oldalon lesz az összecsukható eszköztár.

## Szerkezet

```
┌──────────┬──────────────────────────────────────┬─────────┐
│ ☰ brain  │ Search                     [akciók]  │ Eszköz- │
│ ⌕ Search │──────────────────────────────────────│ tár   ⟩ │
│ ✎ Capture│                                      │         │
│ …        │   tartalom (teljes magasság,         │ (csak   │
│          │    belül görget)                     │ ha az   │
│──────────│                                      │ oldalnak│
│ ◐ téma   │                                      │ van)    │
│ ⚙ Settings                                      │         │
│ ⎋ kilépés│                                      │         │
│ v0.62.0  │                                      │         │
└──────────┴──────────────────────────────────────┴─────────┘
```

- **Bal sáv** (`app-sidebar`): a menüpontok a mai tabok, Settings nélkül. A sorrend marad: Capture, Search, Recent, Agenda, Graph, Stats, MCP log, Export. Összecsukható 60 px-es ikoncsíkra; az állapot a `localStorage`-ben marad (`cb_shell_sidebar`).
- **Lábléc** (`app-sidebar__footer`): téma, Settings, Kijelentkezés, verzió.
  - A téma a mai `ThemeToggle` (most a jobb felső sarokban lebeg).
  - A **Kijelentkezés új**: törli a `ui_secret`-et, és visszavisz az Unlock képernyőre. Ma ehhez a localStorage-ot kell kézzel üríteni.
- **Tartalom** (`app-content`): fejléc (`app-content__header`) az oldal címével és az oldal saját akcióival. Alatta a tartalom kitölti a maradék magasságot. A mai `container` szélességkorlát a szöveges oldalakon (Search, Recent…) a tartalmon belül marad, hogy a sorok ne legyenek 2000 px szélesek.
- **Jobb eszköztár** (`app-toolbar`): a shell adja a keretet, az oldal adja a tartalmat egy portálon (`<ShellToolbar>…</ShellToolbar>`). Ha egy oldal nem ad semmit, nincs eszköztár. Összecsukva keskeny csík marad nyitó gombbal; az állapot a `localStorage`-ben marad.
  - **Graph:** a mai lebegő Controls panel költözik ide.
  - **Search:** a módszerváltó és a „Bejárás a gráfon” ide is mehet, de v1-ben a helyén marad.
  - **A többi oldalnak** v1-ben nincs eszköztára.
- **Graph:** ma `fixed inset-0`, az ablak méretére rajzol, a fejléc áttetszően lebeg felette. Ezután a tartalomterületet tölti ki: a méretét a konténerről méri (`ResizeObserver`), nem az ablakról. A bejárás-panel a vászon bal szélén marad.
- **Színek:** a customBrain saját tokenjei maradnak (`bg-surface`, `border-subtle`, `text-txt…`); a HINT-map szerkezetét vesszük át, a színeit nem.

## Döntések (javaslattal)

1. **Ikonok:** `lucide-react` (új függőség), ugyanaz, amit a HINT-map használ. A másik út a kézzel írt inline SVG; ezt nem javaslom.
2. **Navigáció:** marad állapot alapú (`active`), mint ma. Az URL-útvonalak (`/search`, `/graph`) visszagombot és megosztható linket adnának, de minden útvonalat fel kellene venni a szerver SPA-wildcard guardjába. Ez külön tétel, ha kell.
3. **Sorrend:** előbb a shell (0.62.0), utána a `spider` (0.63.0). Ha a `spider` sürgősebb, fordítva.

## Érintett fájlok

**új:** `client/src/components/AppShell.jsx` (bal sáv + fejléc + eszköztár-keret + portál-cél), `ShellToolbar.jsx` (portál).
**módosul:**
- `App.jsx`: a fejléc- és nav-blokk helyett `AppShell`.
- `Graph.jsx`: a méretezés a konténerről jön, a Controls panel `ShellToolbar`-ba kerül, a `fixed` rétegek a tartalomterületen belülre.
- `ThemeToggle.jsx`: elhelyezés.
- `client/package.json`: `lucide-react`.
- Doksik.

## Ellenőrzés

Helyben build. Élesben böngészőben:
- minden menüpont megnyílik;
- összecsukott sávval is működik;
- a téma vált;
- a Kijelentkezés az Unlockra visz, és újra be lehet lépni;
- a Graph kitölti a tartalomterületet, és ablakátméretezéskor követi;
- az eszköztár nyílik és csukódik;
- a bejárás-lejátszás változatlanul működik;
- világos és sötét téma, keskeny ablak (< 1080 px: a sáv alapból csukva).

Verzió: minor, mert a felhasználó által látható viselkedés változik.
