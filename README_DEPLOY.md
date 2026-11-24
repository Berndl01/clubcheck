# Humatrix ClubCheck — finaler Upload

Diese Version ist als saubere Vercel/Supabase/Stripe/Resend-Version aufgebaut. Bitte keine alten Google-Apps-Script-Dateien mehr dazumischen.

## 1. Upload auf Vercel

Den gesamten Projektordner hochladen oder per GitHub deployen.

Wichtige Dateien:

```txt
public/index.html
public/register.html
public/survey.html
public/dashboard.html
api/*.js
sql/schema.sql
package.json
vercel.json
```

## 2. Supabase SQL ausführen

In Supabase → SQL Editor die Datei ausführen:

```txt
sql/schema.sql
```

Das legt die Tabellen für Clubs, Antworten, Passwort-Reset, E-Mail-Protokolle sowie Missbrauchsschutz (rate_limits, login_attempts) an. Öffentliche Browser-Seiten greifen nicht direkt auf Supabase zu. Der Zugriff läuft serverseitig über die Vercel API.

Die Datei kann gefahrlos mehrfach ausgeführt werden (getestet mit PostgreSQL 17, wie bei Supabase). Wer eine ältere Version schon eingespielt hat, führt sie einfach noch einmal aus: bestehende Daten bleiben erhalten, neue Tabellen und Indizes kommen dazu.

## 3. Vercel Environment Variables

In Vercel → Project → Settings → Environment Variables setzen:

```txt
SUPABASE_URL
SUPABASE_SERVICE_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
APP_SESSION_SECRET
APP_BASE_URL
RESEND_API_KEY
EMAIL_FROM
EMAIL_REPLY_TO
```

Beispiel:

```txt
APP_BASE_URL=https://clubcheck.humatrix.cc
EMAIL_FROM=Humatrix ClubCheck <clubcheck@humatrix.cc>
EMAIL_REPLY_TO=office@humatrix.cc
APP_SESSION_SECRET=<openssl rand -hex 32>
```

Wichtig: Secret-Werte nie in HTML, JavaScript im Browser oder GitHub veröffentlichen.

**Supabase-Schlüssel:** Supabase stellt die alten `anon`/`service_role`-Schlüssel bis Ende 2026 ein. Für `SUPABASE_SERVICE_KEY` daher den neuen **Secret Key** verwenden (beginnt mit `sb_secret_`, zu finden unter Project Settings → API Keys). Der Code funktioniert damit ohne Änderung. Wer noch den alten `service_role`-Schlüssel (beginnt mit `eyJ`) eingetragen hat, sollte ihn jetzt tauschen.

**Hinweis Supabase-Region:** Die Datenschutzerklärung gibt Frankfurt am Main (eu-central-1, Deutschland) als Datenspeicherort an. Stelle vor dem Go-Live sicher, dass das Supabase-Projekt tatsächlich in dieser Region läuft (Supabase Dashboard → Project Settings → General → "Region"). Wenn ja, ist alles korrekt; wenn nein, das Projekt in eine EU-Region migrieren oder die Datenschutzerklärung anpassen.

## 4. Resend einrichten

1. In Resend die Domain verifizieren, von der gesendet werden soll, z. B. `humatrix.cc`.
2. API Key erstellen. Für diese App reicht ein Key mit Sendeberechtigung.
3. Den Key in Vercel als `RESEND_API_KEY` eintragen.
4. Als Absender eine verifizierte Adresse verwenden, z. B. `Humatrix ClubCheck <clubcheck@humatrix.cc>`.

## 5. Stripe Webhook

Stripe Webhook URL:

```txt
https://clubcheck.humatrix.cc/api/stripe-webhook
```

Mindestens dieses Event aktivieren:

```txt
checkout.session.completed
```

Zusätzlich sinnvoll:

```txt
checkout.session.async_payment_succeeded
checkout.session.expired
checkout.session.async_payment_failed
```

Freigeschaltet wird nur bei bestätigter Zahlung. Die 12 Wochen Laufzeit starten mit der ersten Freischaltung und verlängern sich nicht, wenn Stripe den Webhook wiederholt oder jemand die Erfolgsseite neu lädt. 100-%-Gutscheine (Stripe-Promotion-Codes) werden ebenfalls korrekt freigeschaltet, praktisch für Pilotvereine.

Das Webhook-Signing-Secret beginnt mit `whsec_` und kommt in Vercel als `STRIPE_WEBHOOK_SECRET`.

## 6. E-Mails, die diese Version sendet

### Registrierung gestartet

Zeitpunkt: Wenn ein Verein den Checkout startet.

Inhalt: Registrierung ist vorbereitet, Paketübersicht, Button „Zahlung fortsetzen“.

### Kaufbestätigung / Dankesmail

Zeitpunkt: Nach erfolgreicher Zahlung.

Inhalt: Danke für den Kauf, Club-Code, Mitglieder-Link, Dashboard-Link, nächste Schritte.

Diese Mail wird über ein E-Mail-Protokoll nur einmal pro Club versendet, auch wenn Stripe-Webhook und Rückleitungsbestätigung beide laufen.

### Passwort zurücksetzen

Zeitpunkt: Wenn im Dashboard „Passwort vergessen“ angefordert wird.

Inhalt: sicherer Reset-Link, 30 Minuten gültig.

## 7. Finaler Live-Test

Nach Deployment genau diese Reihenfolge testen:

1. `/register.html` öffnen.
2. Basic auswählen → nur 1 Vereinsfrage sichtbar.
3. Passwort muss mindestens 10 Zeichen verlangen.
4. Testzahlung durchführen.
5. Prüfen, ob die Kaufbestätigungs-E-Mail ankommt.
6. Mitglieder-Link öffnen → KEINE Auswahl zwischen Pulse/Core, sondern automatisch der zum Paket passende Modus (Basic = Pulse / Plus + Premium = Core).
7. Eine einzelne Testantwort absenden → Dashboard öffnen → Banner „Auswertung erfolgt ab 5 Rückmeldungen" muss sichtbar sein, PDF-Button deaktiviert.
8. Weitere 4 Testantworten absenden (insgesamt 5) → Dashboard neu laden → Scores, Rollen, NPS erscheinen, Freitext-Banner zeigt „ab 7 Rückmeldungen".
9. Weitere 2 Testantworten absenden (insgesamt 7) → Freitexte erscheinen, PDF-Button aktiv.
10. Dashboard mit Club-Code und Passwort öffnen → in der rechten Sidebar muss „Test-Modus: Einstiegstest (Pulse)" oder „Premium-Test (Core)" stehen, passend zum Paket.
11. PDF-Bericht herunterladen → Sprache des PDF entspricht dem aktuellen UI-Sprachschalter (DE oder EN).
12. Sprachschalter rechts oben: einmal auf EN umschalten und prüfen, dass alle Texte (Hero, Pakete, Mitglieder-Befragung, Dashboard, PDF) in Englisch erscheinen.
13. **Login-Lockout-Test:** 11 mal mit falschem Passwort versuchen → ab dem 11. Versuch HTTP 423 / Sperr-Meldung erhalten.
14. Passwort-Reset testen.
15. Impressum, Datenschutz und AGB aufrufen, in beiden Sprachen prüfen.
16. **Löschtest** (am Schluss): im Dashboard ganz unten den Lösch-Button klicken → Vereinscode zur Bestätigung eingeben → Verein wird gelöscht → erneutes Login mit altem Code muss scheitern.

Wenn alle Punkte funktionieren, ist der technische Hauptfluss sauber.
