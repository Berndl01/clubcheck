# ClubCheck — Audit & Fixes (Go-Live-Vorbereitung)

Datum: 2026-05-07

## Was geändert wurde

### Blocker 1 — Modus-Trennung Pulse / Core wird jetzt erzwungen
Mitglieder können den Test-Modus nicht mehr selbst auswählen. Der Modus
wird **server-seitig aus dem Paket abgeleitet**:
- `basic` → **Pulse** (Einstiegstest, ca. 6–8 Min)
- `plus`, `premium` → **Core** (Premium-Test, ca. 12–15 Min)

Geänderte Dateien:
- `api/get-club-config.js` — liefert jetzt `mode` als Teil der club-Antwort.
- `api/submit-response.js` — leitet `mode` strikt aus `club.package` ab
  und ignoriert manipulierten `body.mode` (Bug-fix gegen Client-Spoofing).
- `public/survey.html` — komplett neu: KEINE Modus-Auswahl-UI mehr,
  Hinweis-Banner zeigt Mitgliedern, welcher Test verwendet wird.
- `public/dashboard.html` — Sidebar zeigt dem Vorstand, welcher
  Modus gerade aktiv ist (Pulse oder Core).

### Blocker 2 — Mehrsprachigkeit Deutsch / Englisch
Sprachschalter (DE/EN) im Header aller Seiten. Auswahl wird in
`localStorage` als `clubcheck_lang` persistiert.

UI-Texte komplett zweisprachig:
- `public/index.html` — Marketing-Bereiche (Nav, Hero, Mitglieder-Block,
  Pakete, Auswertung, Ablauf, Final-CTA, Footer). **Detail-Sektionen
  Problem / Architektur / FAQ / Testimonials bleiben in DE** und werden
  bei EN über einen dezenten Hinweis-Banner angekündigt.
- `public/survey.html` — komplett DE/EN inkl. Frage-Bank
  (Organisation/Sport/Außenwirkung/Zukunft mit je 15 Items pro Sprache).
- `public/register.html` — komplett DE/EN inkl. 4-Schritt-Wizard,
  Plan-Beschreibungen, Erfolgs- und Bestätigungs-Views.
- `public/dashboard.html` — UI vollständig DE/EN. **Auch der PDF-Bericht
  ist jetzt komplett zweisprachig** (alle drei Paket-Varianten Basic /
  Plus / Premium): Die Sprachwahl im Dashboard steuert direkt, in
  welcher Sprache der heruntergeladene PDF-Bericht generiert wird.
  Cover, Executive Summary, Score-Bereiche, NPS-Erläuterung, Custom
  Questions, Rollen + Stimmen, Empfehlungen, Roadmap, Tipps und
  Kontaktblock — alles übersetzt. Zahlenformat passt sich an
  (`5.2` in EN, `5,2` in DE), Datumsformat ebenfalls
  (`May 7, 2026` vs. `7. Mai 2026`).
- `public/impressum.html` und `public/datenschutz.html` — komplett
  DE/EN.

### Blocker 3 — Impressum & Datenschutzerklärung
Beide Seiten erstellt und mit den echten Humatrix-Daten befüllt:
- `public/impressum.html` — DE/EN: Mag. Bernhard Lampl, PhD, BSc, MBA,
  LL.M., MBA · Ried 80, 6363 Westendorf, Tirol · GISA-Nummer 39461841 ·
  Aufsichtsbehörde BH Kitzbühel · WKO-Mitgliedschaft · komplette
  rechtliche Pflichtangaben nach §5 ECG / §63 GewO / §25 MedienG.
- `public/datenschutz.html` — DE/EN, deutlich erweitert gegenüber der
  ursprünglichen Vorlage. Enthält jetzt explizit:
   - **EU-Datenspeicherung-Banner** ganz oben sichtbar
   - **Supabase Frankfurt am Main (eu-central-1, Deutschland)** als
     Speicherort der gesamten Vereins- und Befragungsdaten
   - **Stripe Payments Europe Ltd. (Dublin, Irland)** als
     Zahlungsabwickler — mit explizitem Hinweis, dass Karten- und
     Kontodaten zu keinem Zeitpunkt auf den Humatrix-Systemen landen
   - **Vercel** (USA, EU-Edge) und **Resend** (USA) jeweils mit
     EU-Standardvertragsklauseln (SCC) als Rechtsgrundlage für den
     Datentransfer
   - DSGVO-Rechtsgrundlagen pro Datenkategorie (Art. 6 Abs. 1 lit. b
     bzw. lit. f DSGVO)
   - Speicherdauer inkl. BAO §132 (7 Jahre für rechnungsrelevante Daten)
   - Cookies-Hinweis (nur localStorage Session-Token + Sprachpräferenz,
     keine Marketing- oder Tracking-Cookies)
   - Server-Logfiles mit 30-Tage-Löschung
   - Verantwortlicher: Bernhard Lampl, Ried 80, 6363 Westendorf
   - Zuständige Aufsichtsbehörde: Österreichische Datenschutzbehörde
     mit Adresse Barichgasse 40–42, 1030 Wien

## Bonus-Aufräumarbeiten

- Doppelter JSDoc-Kommentar in `dashboard.html` über
  `generateClubCheckPdf` aufgeräumt.
- `loadDashboard()` nutzt jetzt konsistent den `Authorization`-Header
  (war bereits so, jetzt mit i18n-Fehlertexten).

## Was du vor dem Go-Live noch tun solltest

1. **Stripe von Test- auf Live-Modus umstellen** und neuen
   `STRIPE_WEBHOOK_SECRET` für die Live-Webhook-URL setzen.
2. **Resend-Domain `humatrix.cc` in Resend verifizieren** (DNS-Records
   für SPF/DKIM setzen) und `EMAIL_FROM` auf eine geprüfte
   Absender-Adresse setzen (z. B. `Humatrix ClubCheck <clubcheck@humatrix.cc>`).
3. **Supabase: prüfen, dass das Projekt in der EU-Region
   `eu-central-1` (Frankfurt) angelegt ist.** Falls das aktuelle Projekt
   in einer anderen Region läuft, ein neues EU-Projekt anlegen und die
   Daten migrieren — sonst stimmt die Aussage in der Datenschutzerklärung
   nicht.
4. **Erste Test-Bestellung** im Live-Modus durchspielen
   (Registrierung → Zahlung → Bestätigungs-Mail → Mitglieder-Link →
   Antwort speichern → Dashboard-Login → PDF-Download).
5. **Sprachen prüfen**: DE und EN auf jeder Seite einmal durchklicken
   inkl. PDF-Download in beiden Sprachen.
6. **Empfohlen: Datenschutzerklärung kurz von einem
   Datenschutzbeauftragten oder Anwalt gegenchecken lassen.** Die
   Vorlage deckt die Standardfälle ab, aber jeder Datenschutzbeauftragte
   hat eigene Präferenzen bei der Formulierung.

## Optionale Phase 2

- Vollständige EN-Übersetzung der Detail-Sektionen auf der Landing-Page
  (Problem, Architektur, FAQ, Testimonials).
- Rate-Limiting auf `request-password-reset` (aktuell unbeschränkt —
  Spam-Risiko).
