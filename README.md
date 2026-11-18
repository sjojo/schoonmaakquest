# 🧹 SchoonmaakQuest

Een gamified schoonmaak-tracker voor een appartement (standaard indeling ca. 60 m²).
Volledig in het Nederlands, werkt offline, geen installatie nodig.

## Starten

Open `index.html` in je browser (dubbelklikken werkt). Alles draait lokaal;
je voortgang wordt bewaard in `localStorage` van je browser.

## Wat kun je ermee?

- **Kamers** met een schoonmaak-score (0–100%) — woonkamer, keuken, slaapkamer,
  badkamer, wc, hal en balkon zijn al ingevuld, maar je kunt alles
  toevoegen/wijzigen/verwijderen.
- **Taken** per kamer met een frequentie (dagelijks t/m jaarlijks) en een
 zwaarte in XP (5/10/15/25). Een taak is "te doen" zodra het interval verstreken is.
- **Gamification**: XP per klus, levels (elke level kost 100·level XP extra),
  streaks per taak (🔥), en 9 badges (eerste klus, streak-beest, spik en span, …).
- **Dashboard** met overzicht: wat er nu te doen is, score per kamer, gedaan vandaag.
- **Statistieken**: klussen per dag (14-dagen grafiek) en recente activiteit.
- **Ongedaan maken** van de laatste afgevinkte klus (via de toast-melding).
- **Backup**: exporteer/importeer je data als JSON (tabblad ⚙️ Instellingen),
  handig om mee te nemen naar een andere browser of telefoon.

## Bestanden

- `index.html` — pagina
- `styles.css` — styling
- `app.js` — alle logica + UI (de pure logica is exporteerbaar voor tests)
- `test/logic.test.js` — unittests voor due/streak/XP/score/badges (`node test/logic.test.js`)
- `test/smoke.test.js` — smoke-test van de UI met een DOM-stub (`node test/smoke.test.js`)

## Aanpassen

Kamers en taken pas je aan in de app zelf (tabbladen 🚪 Kamers en ✅ Taken).
Wil je de standaardlijst wijzigen, kijk dan bij `seedState()` in `app.js`.
