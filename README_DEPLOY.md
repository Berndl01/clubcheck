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

Das legt die Tabellen für Clubs, Antworten, Passwort-Reset und E-Mail-Protokolle an. Öffentliche Browser-Seiten greifen nicht direkt auf Supabase zu. Der Zugriff läuft serverseitig über die Vercel API.

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
```

Wichtig: Secret-Werte nie in HTML, JavaScript im Browser oder GitHub veröffentlichen.

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
checkout.session.expired
checkout.session.async_payment_failed
```

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
3. Testzahlung durchführen.
4. Prüfen, ob die Kaufbestätigungs-E-Mail ankommt.
5. Mitglieder-Link öffnen.
6. Drei Testantworten absenden.
7. Dashboard mit Club-Code und Passwort öffnen.
8. PDF-Bericht herunterladen.
9. Passwort-Reset testen.

Wenn alle neun Punkte funktionieren, ist der technische Hauptfluss sauber.
