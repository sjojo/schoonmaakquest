# 🧹 Schoonmaak Huis Sjors

Een gamified schoonmaak-tracker voor een appartement (standaard indeling ca. 60 m²).
Volledig in het Nederlands, werkt offline, geen installatie nodig.

## Starten

Open `index.html` in je browser (dubbelklikken werkt). Alles draait lokaal;
je voortgang wordt bewaard in `localStorage` van je browser.

## Functies (overzicht)
- Klik op de **level-badge** rechtsboven voor je progressie (XP, streaks, badges, kamers); klik op de **"vandaag"-chip** om direct naar de openstaande taken te gaan
- **Kamers-tab** is klikbaar: klik een kamer om meteen haar taken te zien
- Taken hebben een optionele **deadline** (alleen bij wekelijks of langer) — de planner zet de taak daarop in de agenda (wordt op de 1ste van de maand automatisch herpland)
- Taken zijn achteraf **aanpasbaar** via de ✏️-knop (titel, kamer, frequentie, XP, bundel, deadline)
- Agenda-**bundels**: combineerbare taken (sanitair / stofzuigen / planten) worden per dag als één event ingepland

## Wat kun je ermee?

- **Kamers** met een schoonmaak-score (0–100%) — standaard al ingevuld voor een
  appartement van ca. 60 m²: woonkamer, keuken (apart), werkplek/bureau,
  slaapkamer, badkamer, wc, gang, balkon (incl. planten) en binnenplanten.
  Alles is in de app toe te voegen/wijzigen/verwijderen.
- **Taken** per kamer met een frequentie (dagelijks t/m jaarlijks) en een
 zwaarte in XP (5/10/15/25). Een taak is "te doen" zodra het interval verstreken is.
- **Gamification**: XP per klus, levels (elke level kost 100·level XP extra),
  streaks per taak (🔥), en 9 badges (eerste klus, streak-beest, spik en span, …).
- **Dashboard** met overzicht: wat er nu te doen is, score per kamer, gedaan vandaag.
- **Statistieken**: klussen per dag (14-dagen grafiek) en recente activiteit.
- **Ongedaan maken** van de laatste afgevinkte klus (via de toast-melding).
- **Backup**: exporteer/importeer je data als JSON (tabblad ⚙️ Instellingen).
  Daarnaast: **automatische backup naar Google Drive** (`schoonmaakquest-backup.json`) na elke wijziging zodra je met Google verbonden bent — je progress blijft zo bewaard bij elke deploy/push, op elk apparaat en elk domein (bij lege lokale data wordt de Drive-backup automatisch hersteld). Zet de automatische backup uit via de checkbox in ⚙️.

## 📱 Meerdere apparaten

De app draait op één gedeelde URL (GitHub Pages / je subdomein), dus overal hetzelfde adres. Zo blijft alles gesynchroniseerd:
- **Progress/data**: automatische backup naar Google Drive na elke wijziging + auto-herstel bij lege lokale data → je klussen, XP, streaks en planning volgen je mee naar elk apparaat
- **Google-koppeling**: per apparaat één keer "Verbind met Google" (OAuth-consent); daarna verbindt de app zichzelf stil (`prompt: ''`) bij elke start en bij een verlopen token (401 → stille re-auth). Let op: elk domein moet in Cloud Console als Authorized JavaScript origin staan (`https://sjojo.github.io`, `https://schoonmaak.spstuur.nl`, `http://localhost`)
- **PIN-lock** staat los per apparaat (localStorage)

## 📱 iPhone-web-app (PWA)

De app is al een zogenoemde **PWA**: op je iPhone open je de site in Safari en kiest **Deel-knop → "Zet op beginscherm"**. Dan krijg je een eigen app-icoon, start de app zonder Safari-balken (standalone) en werkt hij offline dankzij de serviceworker (`sw.js`). Nodig: `manifest.webmanifest` + icons in `icons/` — die staan al in de repo. Na een deploy via GitHub Pages even de pagina verversen op je iPhone, anders houdt Safari de oude cache vast.

## 🔒 PIN-lock

Tabblad ⚙️ Instellingen → **PIN-lock**: stel een PIN in (min. 4 tekens; hash wordt met SHA-256 in localStorage bewaard, nooit plaintext). Bij het openen van de app moet je de PIN invoeren; "Nu vergrendelen" vergrendelt meteen. **Let op:** dit is client-side en dus een afschrikmiddel, geen echte beveiliging. Voor echte toegangscontrole zet je gratis **Cloudflare Access** vóór je GitHub Pages-site (of een wachtwoord op de Pages-site via je DNS/CDN) — dan is er pas echt een login.

## 📅 Google Calendar-koppeling

Op het tabblad **📅 Agenda** verbind je de app met je Google Agenda (client-side OAuth; er draait geen server — de app vraagt alleen toegang tot agenda-events):

1. Maak een project aan in [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services → Enable APIs** → "Google Calendar API" → Enable
2. **Credentials → Create Credentials → OAuth client ID** → type *Web application* → bij **Authorized JavaScript origins** voeg toe: `http://localhost`, `https://sjojo.github.io` en `https://schoonmaak.spstuur.nl` → Create → kopieer de **Client ID**
3. Plak de Client ID in de app (tabblad 📅 Agenda) en klik **Verbind met Google** → log in en geef toestemming

Daarna:
- **Wekelijkse/2-wekelijkse taken** die te doen zijn komen als all-day event op hun vervaldatum in je agenda
- **Terugkerende taken automatisch**: bij het afvinken van een wekelijkse/maandelijkse/kwartaal-taak wordt meteen de **volgende occurrence** als event ingepland
- **Iedere 1ste van de maand wordt opnieuw ingepland**: als je de app in de eerste 3 dagen van de maand opent (en verbonden bent), worden maandelijkse taken gespreid over de minst drukke dagen van die maand en kwartaal-taken (in jan/apr/jul/okt) over het hele kwartaal. Handmatig kan altijd via "Sync naar Google Agenda". Dagelijkse taken zet ik niet in je agenda
- Zonder verbinding: **"Plan deze maand (demo)"** toont de spreiding met een fictieve agenda
- Geplande items staan in `state.planned` (dus ook in je JSON-backup); dubbelen worden voorkomen

### 🧺 Bundels in de agenda
Sommige taken horen bij elkaar — die blijven **aparte taken** in de app (los afvinken, eigen streak/XP), maar worden in de agenda **gebundeld tot één event per dag**. Seed-bundels: `🚿 Sanitair (badkamer + wc)`, `🧹 Stofzuigen (alle kamers)`, `🪴 Plantenzorgen`. Bij het toevoegen van een taak kies je optioneel een bundel; bij afvinken van een gebundelde taak wordt deze toegevoegd aan het bestaande agenda-event van die dag (of er wordt een nieuw event gemaakt). De bundelregels staan in `GROUP_RULES` in `app.js`.

## 🌐 Hosting op je eigen subdomein (bijv. schoonmaak.spstuur.nl)

De app is een static site; automatische updates gaan via GitHub Actions (`.github/workflows/pages.yml` deployt elke push naar `main` naar GitHub Pages). Stappen:

1. Merge de PR naar `main`
2. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions** (de workflow regelt de rest)
3. Bij je DNS-provider van `spstuur.nl`: CNAME-record `schoonmaak` → `sjojo.github.io`
4. Repo **Settings → Pages → Custom domain**: `schoonmaak.spstuur.nl` → Save (wacht op DNS-verificatie; vink evt. "Enforce HTTPS" aan)

Daarna live op `https://schoonmaak.spstuur.nl/` — elke push naar `main` rolt automatisch uit. Let op: `https://schoonmaak.spstuur.nl` moet ook als Authorized JavaScript origin in Google Cloud Console staan, anders werkt de Agenda-koppeling niet vanaf dat domein.

## Bestanden

- `index.html` — pagina
- `styles.css` — styling
- `app.js` — alle logica + UI (de pure logica is exporteerbaar voor tests)
- `test/logic.test.js` — unittests voor due/streak/XP/score/badges + agenda-planner (`node test/logic.test.js`)
- `test/smoke.test.js` — smoke-test van de UI met een DOM-stub (`node test/smoke.test.js`)
- `.github/workflows/pages.yml` — automatische deploy naar GitHub Pages bij push naar `main`

## Aanpassen

Kamers en taken pas je aan in de app zelf (tabbladen 🚪 Kamers en ✅ Taken).
Wil je de standaardlijst wijzigen, kijk dan bij `seedState()` in `app.js`.
