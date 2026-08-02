# customBrain OAuth-migráció: `custombrain` projekt → `grafia-2026`

Átadó doksi a customBrain-agentnek (írta: parlamentAI-session Claude, 2026-08-02).
A feladat: a customBrain Google OAuth-kliensének (Gmail + Drive + Calendar hozzáférés)
átköltöztetése a régi `custombrain` GCP-projektből az új `grafia-2026` projektbe,
Robert vezetésével (a Console-lépések az ő kezében vannak, te navigálsz és ellenőrzöl).

## Kontextus — mi történt már, mihez NEM kell nyúlni

- 2026-08-01/02-én billing-átszervezés volt: a `custombrain` projekt **lekerült a
  billingről** (szándékosan), az új költséghely a `grafia-2026` (billing: 01FCAC-D33768-25EACC).
- A **Gemini API-kulcs cseréje MÁR MEGTÖRTÉNT**: a customBrain a grafia-projektbeli
  "custombrain" nevű kulcson fut (Robert a Settings UI-ban állította be). Ehhez ne nyúlj.
- A `grafia-2026`-on **már engedélyezve vannak**: `gmail.googleapis.com`,
  `drive.googleapis.com`, `calendar-json.googleapis.com`, `chat.googleapis.com`,
  `documentai.googleapis.com`, `generativelanguage.googleapis.com`.
  ⚠️ **A `youtube.googleapis.com` NINCS engedélyezve** — pedig kell (lásd 2/b lépés).
- A Gmail/Drive/Calendar API-k ingyenesek — a régi projekt OAuth-klense billing nélkül is
  MŰKÖDIK, tehát NINCS sürgősség és NINCS kiesés-kényszer: a váltás tisztasági lépés.
- Deploy-környezet: Hetzner CX22, pm2, env a Settings UI-ban (0.23.0 óta), részletek a
  repo `DEPLOYMENT.md`-jében.

## 🔥 DÖNTÉS (2026-08-02, felmérés után): a service account MEGSZŰNIK

A felmérés három dolgot derített ki, ami felülírja az eredeti tervet:

1. **A vault-olvasás JELENLEG NEM MŰKÖDIK.** Az SA a `messagingmatrix` projekthez
   tartozott (`messagingmatrix@messagingmatrix.iam.gserviceaccount.com`) — **nem** a
   `custombrain`-hez —, és az a projekt (#495467475194) **törölve lett**. Minden Drive-hívás
   `Project #495467475194 has been deleted` hibára fut.
   ⚠️ **A hiba sikerként logolódik**: `getVaultContext()` elkapja (`server/drive-context.js:388`)
   és üres kontextust ad vissza, amit a következő sor
   `Vault context loaded: 0 people, 0 projects, 0 topics`-ként ír ki. Emiatt minden mostantól
   induló capture People/Projects/Topics kontextus és alias-feloldás NÉLKÜL fut, némán.
2. **Új SA a grafián nem hozható létre**: a `beliczki.hu` org (535591923234) policyje
   (`constraints/iam.managed.disableServiceAccountKeyCreation`, beállítva 2026-08-02 10:12)
   tiltja az SA-kulcs létrehozását. A `custombrain` projektnek nincs szülője (org-on kívüli),
   ezért ott nem ütköztünk ebbe.
3. **Az SA-ra nincs is szükség.** A CLAUDE.md-ben rögzített „OAuth2 nem lát minden
   vault-fájlt" **nem tulajdonosi probléma volt, hanem scope-probléma**: a token
   `drive.file` scope-pal fut (`server/get-drive-token.js:35`), ami definíció szerint csak
   az app által létrehozott fájlokat látja. Mért állapot: OAuth2 a Projects mappában 6 fájlt
   lát a 28-ból, a Topics mappában 0-t a 8-ból, és a Me.md-t nem látja.

**Ezért:** az új OAuth-kliens scope-listájába felvesszük a **`drive.readonly`**-t, és a
service accountot teljesen kivezetjük. Az SA-t ma **kizárólag olvasásra** használjuk
(`getVaultContext`, `fetchDossiers` — `server/drive-context.js:333,355` —, és a `writeStubs`
létezés-ellenőrzése `server/routes/export.js:350`); az írást már ma is az OAuth2 végzi
`drive.file`-lal, és az működik. Teljes `drive` scope tehát NEM kell.

Eredmény: nincs kulcsfájl a szerveren, nincs org-policy kivétel, nincs harmadik projekttől
való függés. A `custombrain-vault@grafia-2026.iam.gserviceaccount.com` SA létrejött a
felmérés közben — **kulcs nélkül, használaton kívül; törölhető.**

## ⚠️ Eredeti terv: KÉT Google-identitás költözik, nem egy (történeti, lásd fenti döntést)

A customBrain **két külön Google-identitást** használ, mindkettő a régi projektben él.
A migráció csak akkor teljes, ha mindkettő átkerül:

| Identitás | Mire kell | Hol olvassa a kód |
|---|---|---|
| **OAuth2 kliens** (client_id/secret + refresh token) | Gmail, Calendar, YouTube, Drive-**írás** | `agent/google-auth.js:5`, `server/google-auth.js:4`, `server/drive-context.js:27`, `server/routes/export.js:35`, `cron/qdrant-backup.js:29` |
| **Service account** (`service-account.json`, repo root a Hetzneren) | Drive vault-**olvasás** (People/Projects) | `server/drive-context.js:39`, `server/routes/export.js:49` — scope: `auth/drive` |

A service account azért kell külön, mert **az OAuth2 nem lát minden vault-fájlt**
(Me.md, Pityesz.md, Agaurg.md + 6 projektfájl hiányzott neki) — az SA mindent lát,
tulajdonostól függetlenül. Ha a régi projektet kivezetjük az SA migrálása nélkül,
a vault-olvasás és a teljes Obsidian-export elhal.

## OAuth scope-ok (a régi kliens ezeket kéri)

`server/get-drive-token.js:34-39` szerint **négy** scope:

- `https://www.googleapis.com/auth/drive.file`
- `https://www.googleapis.com/auth/gmail.modify`
- `https://www.googleapis.com/auth/calendar.readonly`
- `https://www.googleapis.com/auth/youtube.readonly` ← **ezt könnyű kifelejteni**

A `youtube.readonly` a `cron/youtube-intake.js`-hez kell (30 percenként poll-oz a
liked playlisten). Ha kimarad, a YouTube-intake csendben elhal.

## A feladat lépései

1. **Régi kliens felmérése** (Console → régi `custombrain` projekt → APIs & Services →
   Credentials): jegyezd fel a meglévő OAuth 2.0 Client típusát (várhatóan Web application),
   az **Authorized redirect URI-kat** és a JavaScript origin-eket — az újat ezekkel
   tükrözve kell létrehozni. Nézd meg az OAuth consent screen állapotát is
   (External? **Testing vagy In production?** — lásd Buktatók).
2. **Hiányzó API engedélyezése** a grafia-2026-on:
   ```bash
   gcloud services enable youtube.googleapis.com --project=grafia-2026
   ```
3. **Consent screen a grafia-2026-on** (APIs & Services → OAuth consent screen):
   - User type: External (gmail.com fiók alatt nincs Internal).
   - App name/support email: mint a régin.
   - Scope-ok: a fenti négy + **`drive.readonly`** (ez váltja ki a service accountot):
     `drive.file`, **`drive.readonly`**, `gmail.modify`, `calendar.readonly`, `youtube.readonly`.
   - Publishing status: **tükrözd a régit** (lásd Buktatók — a Testing 7 napos tokent jelent).
4. **Új OAuth Client ID a grafia-2026-on** (Credentials → Create credentials →
   OAuth client ID): ugyanaz a típus + redirect URI-k, mint az 1. pontban felírtak.
5. **Csere a customBrainben**: az új client_id + client_secret a Settings UI →
   **Google Drive** szekciójába (`GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET` —
   `server/config-schema.js:70-81`).
6. **Re-auth** — ez adja az új `GOOGLE_DRIVE_REFRESH_TOKEN`-t:
   ```bash
   node server/get-drive-token.js     # ← EZT, ne a scripts/ alattit
   ```
   ⚠️ A `scripts/get-drive-token.js` **csak `drive.file`-t kér** (`scripts/get-drive-token.js:15`),
   így a belőle született token gmail/calendar/youtube nélkül jönne létre. A CLAUDE.md
   ezt a szkriptet nevezi meg — az a hivatkozás ehhez a művelethez félrevezető.
   A kapott refresh tokent a Settings UI-ba, majd újraindítás (lásd lent).
7. **Service account kivezetése** (kód-változás, nem Console-lépés):
   - `server/drive-context.js`: `getSaDrive()` hívások (333., 355. sor) → OAuth2-kliensre.
   - `server/routes/export.js`: `getSaDriveClient()` hívás (350. sor) → OAuth2-kliensre.
   - A `resolveSaPath()` / `GOOGLE_SERVICE_ACCOUNT_PATH` és a `service-account.json`
     ezzel feleslegessé válik.
   - ⚠️ A `getVaultContext()` néma catch-e (`server/drive-context.js:388`) maradjon-e?
     Jelenleg üres kontextusra fallbackol és sikeres logsort ír — ez rejtette el ezt a hibát.
     Külön döntés kell róla; a global CLAUDE.md szerint ez pont a tiltott „papering over".
8. **Újraindítás** (kötelező sorrend — `pm2 restart` NEM elég, a régi kód tovább szolgál ki):
   ```bash
   pm2 stop all && fuser -k 3000/tcp; pm2 start ...
   ```
9. **Verifikáció** — mind a négy útvonal, mielőtt bármit törölnénk:
   - Gmail: `get_gmail_threads` MCP-tool
   - Calendar: `get_calendar_events`
   - YouTube: `get_youtube_likes`
   - Drive vault (SA-út!): `rebuild_obsidian_vault` — és nézd meg, hogy a People/Projects
     fájlok tényleg benne vannak-e, ne csak azt, hogy hibátlanul lefutott
10. **Utótakarítás** (csak zöld verifikáció után): a régi `custombrain` projekt OAuth-kliense
    és service accountja törölhető; maga a projekt is kivezethető, de ez Robert döntése.

## 🚩 Buktatók

- **Testing-módú External app = 7 naponta lejáró refresh token.** Ha a régi consent
  screen "In production" státuszú volt, az újat is publikálni kell (a gmail/drive
  érzékeny scope-ok miatt a "publish" figyelmeztetést személyes használatra el lehet
  fogadni verifikáció nélkül is, de a limitekre figyelj). Ha Testing marad, Robert
  gmail-címét vedd fel **Test user**-nek, és tudd: hetente újra kell auth-olni —
  ezt Robert nem akarja, tehát tükrözd a régi státuszt.
- A redirect URI-nak **karakterre** egyeznie kell (http/https, port, trailing slash).
- A client_secret-et ne írd ki chatbe/logba; közvetlenül a Settings UI-ba kerüljön.
- A Gemini-kulcshoz (grafia "custombrain" key) NE nyúlj — az már éles és jó.
- **A service account nem ugyanaz, mint az OAuth kliens.** A refresh token cseréje
  önmagában NEM migrálja a vault-olvasást. Lásd a "Két Google-identitás" szakaszt.
- **Az SA-kulcs cseréje önmagában sem elég** — a Drive-mappa-megosztás az új SA
  e-mail-címére a tényleges kapcsoló. Enélkül a vault-olvasás nem hibázik, hanem
  *üres eredményt* ad, ami sokkal nehezebben vehető észre.
- **`pm2 restart` nem elég** deploy után — `pm2 stop all` + `fuser -k 3000/tcp`, csak
  utána `pm2 start`. Enélkül a régi kód szolgál ki tovább (háromszor égetett már meg).

## Referenciák

- Billing/projekt-rend teljes képe: `~/gcp-project-order.md`
- gcloud CLI telepítve és bejelentkezve Robert gépén (`gcloud auth list`)
- Gyors ellenőrzés: `gcloud services list --enabled --project=grafia-2026`
