# ClubCheck — Audit & Fixes (Go-Live-Vorbereitung)

## Version 2.1.0 — Verkaufsprüfung (24. November 2026)

Diesmal nicht nur Code gelesen, sondern den kompletten Ablauf lokal echt
durchgespielt: echte API-Funktionen, echte PostgreSQL-17-Datenbank mit
`schema.sql`, echte Stripe-Signaturprüfung, echter Chrome-Browser.
Ergebnis: 74 Server-Tests und 43 Browser-Tests grün, keine JS-Fehler.

### Nachtrag bei der Live-Schaltung
- **Startseite zeigte auf Deutsch einen Balken mit dem Text „deOnlyBanner“.**
  Der Hinweis „nur auf Deutsch verfügbar“ ist nur für Englisch gedacht. Auf
  Deutsch ist der Text leer und die Übersetzungsfunktion hat dann den
  internen Schlüssel angezeigt. Jetzt erscheint der Balken nur auf Englisch.
  Ein neuer Browser-Test prüft alle Seiten auf Deutsch und Englisch auf
  solche Rohschlüssel.

### Kritisch behoben
- **Umfrage blieb bei Frage 2 hängen.** Auswahlfragen (Zugehörigkeit,
  Rolle) ließen sich nicht anklicken, weil der Antworttext Anführungszeichen
  im Klick-Handler erzeugte. Mitglieder hätten die Befragung nicht
  abschließen können. Jetzt robust über Index gelöst.
- **Handy-Ansicht der Umfrage.** Die Skala 1–7 und vor allem 0–10 lief
  seitlich aus dem Bildschirm (9 und 10 waren unsichtbar, das verfälscht
  den Empfehlungswert). Jetzt passen alle Werte, 0–10 bricht in zwei
  Reihen um, die Frage steht immer oben.
- **Dashboard am Handy** war 540 px breit (Kacheln, lange Wörter/Links in
  Freitexten). Jetzt einspaltig ohne seitliches Scrollen. Gleiches für
  Startseite, Datenschutz und AGB.

### Zahlung
- Laufzeit ließ sich durch erneutes Laden der Erfolgsseite oder
  Stripe-Wiederholungen beliebig verlängern. Jetzt startet sie einmalig
  mit der ersten Freischaltung.
- 100-%-Gutscheine (`no_payment_required`) werden korrekt freigeschaltet.
- Freischaltung nur bei bestätigter Zahlung, verzögerte Zahlungsarten
  über `checkout.session.async_payment_succeeded` vorbereitet.
- Gemeinsame Logik in `api/_activate.js`.

### Auswertung
- Bereichswerte jetzt mit einer Nachkommastelle (z. B. 4,3 / 7) direkt aus
  den Einzelantworten berechnet. Vorher wurde doppelt gerundet, Werte
  knapp unter einer Schwelle landeten in der falschen Ampelfarbe.
- Englische Antworten landen in denselben Gruppen (Player = Spieler·in),
  Dashboard und PDF übersetzen die Rollen wieder.
- PDF: Sonderzeichen wie č, ć, ł werden lesbar übertragen, Emojis
  entfernt (vorher Zeichensalat). Premium-Kapitelnummern korrigiert,
  englische Anführungszeichen im EN-Bericht, Überschriften laufen nie
  über den Rand. Kontakt im PDF: bernhard@humatrix.cc.

### Sicherheit und Datenschutz
- Antworten werden serverseitig geprüft (nur Werte 1–7 bzw. 0–10,
  nur bekannte Felder). Manipulierte Anfragen verfälschen nichts mehr und
  erzeugen keinen Serverfehler.
- Dashboard-API liefert keine Einzelantworten und keine Zeitstempel bei
  Freitexten mehr. Kleine Zugehörigkeitsgruppen werden wie Rollen
  zusammengefasst.
- IP-Einträge für den Missbrauchsschutz werden nach 24 Stunden gelöscht
  (in der Datenschutzerklärung ergänzt).
- Abhängigkeiten aktualisiert (ws, qs): `npm audit` meldet 0 Lücken.
- Schema: drei zusätzliche Indizes, mehrfach ausführbar.

### Doku
- Supabase stellt die alten Schlüssel bis Ende 2026 ein: in Vercel den
  neuen Secret Key (`sb_secret_…`) verwenden.

Datum der ersten Prüfrunde: 2026-05-07

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

## Sicherheits- und Datenschutz-Härtung (auf Basis externer Code-Review)

### Rate-Limiting auf allen kritischen Endpoints
Neue Tabelle `rate_limits` plus Helper `enforceRateLimit()` in `api/_lib.js`.
Sliding-Window-Implementierung über Supabase (fail-open bei DB-Fehler).
Konkrete Limits pro IP / Minute:
- `submit-response`: 30
- `dashboard-login`: 10
- `request-password-reset`: 5
- `get-club-config`: 60
- `delete-club`: 5

Bei Überschreitung wird HTTP 429 + `Retry-After`-Header zurückgegeben.

### Login-Lockout
Neue Tabelle `login_attempts` protokolliert fehlgeschlagene Anmeldungen.
Nach 10 Fehlversuchen pro IP innerhalb von 15 Minuten antwortet
`dashboard-login` mit HTTP 423 (Locked). Erfolgreiche Logins werden
ebenfalls protokolliert. Aus Datenschutzgründen wird in der Fehlermeldung
nicht offengelegt, ob Code oder Passwort falsch war.

### Passwort-Mindestlänge auf 10 Zeichen (vorher 8)
Erzwungen in `create-checkout.js`, `reset-password.js` sowie clientseitig
in `register.html` und `dashboard.html` (Reset-Formular). i18n-Texte
beider Sprachen entsprechend aktualisiert.

### Privacy-Schwellen im Dashboard
Aggregierte Auswertungen erscheinen erst ab fünf Rückmeldungen, Freitexte
erst ab sieben. Bei Stichproben unter zehn werden Rollen-Labels aus
Freitexten entfernt (zur Re-Identifikationsvermeidung). Rollen-Gruppen
mit weniger als drei Einträgen werden zu „Sonstige" aggregiert. Im UI
erscheinen entsprechende Hinweis-Banner; der PDF-Download-Button ist
deaktiviert, solange noch keine belastbare Datenbasis vorliegt.

### Löschfunktion pro Verein
Neuer Endpoint `/api/delete-club` (POST, Bearer-Token, Code-Bestätigung
nötig). Löscht den Verein und alle abhängigen Daten (responses,
password_resets, email_logs) per ON DELETE CASCADE. UI-Button im
Dashboard mit Bestätigungs-Dialog.

### jsPDF lokal statt CDN
`jspdf.umd.min.js` (Version 2.5.1) wird aus dem CDN entfernt und lokal
unter `/public/vendor/` ausgeliefert. Damit funktioniert der
PDF-Download auch wenn cdnjs.cloudflare.com nicht erreichbar ist.

### AGB-Seite
Neue Seite `public/agb.html` (DE/EN) mit allen wesentlichen
Vertragsklauseln: Vertragspartner, Leistungsbeschreibung, Preise +
Laufzeit, Widerrufsrecht für Verbraucher inkl. FAGG-§18-Hinweis zur
sofortigen digitalen Leistungserbringung, Gewährleistung, Haftung
(mit ausdrücklichem Hinweis, dass ClubCheck KEIN psychologisches
oder medizinisches Diagnoseinstrument ist), Datenschutz-Verweis,
Vertragsdauer, Gerichtsstand. AGB-Link im Footer aller Seiten.
Checkbox-Text bei der Bestellung verlangt jetzt ausdrückliche
Zustimmung zur sofortigen digitalen Leistungserbringung.

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

- **E-Mail-Templates (Registrierung, Kaufbestätigung, Passwort-Reset)
  sind aktuell nur in Deutsch verfasst.** Für englischsprachige Vereine
  würde sich eine Spalte `language` in der `clubs`-Tabelle anbieten,
  die beim Sign-up gespeichert wird, plus zweisprachige Templates
  in `api/_email.js`. Das ist eine eigene, fokussierte Phase 2 — für den
  DACH-Markt heute nicht blockierend.
- **Stripe Payment Methods optimieren:** aktuell `payment_method_types: ["card"]`
  in `api/create-checkout.js`. Für österreichische Kunden könnte
  `automatic_payment_methods: { enabled: true }` (statt der card-Liste)
  zusätzliche Methoden wie EPS, SEPA und Apple Pay automatisch aktivieren —
  abhängig davon, was im Stripe-Dashboard freigeschaltet ist.
- Vollständige EN-Übersetzung der Detail-Sektionen auf der Landing-Page
  (Problem, Architektur, FAQ, Testimonials). Diese Sektionen sind bei
  englischer Sprachwahl deutsch und werden über einen Hinweis-Banner
  erklärt.
- Rate-Limiting auf `request-password-reset` (aktuell unbeschränkt —
  Spam-Risiko, in der Praxis aber niedrig).
