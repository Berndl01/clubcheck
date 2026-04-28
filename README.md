# Humatrix ClubCheck

Wissenschaftlich fundierte Vereinsanalyse.

## Stack

- **Frontend:** Vanilla HTML/JS (Barlow Condensed, Dark Theme)
- **Backend:** Supabase (PostgreSQL + Auth + RLS)
- **Payments:** Stripe Checkout
- **Hosting:** Vercel
- **Repo:** GitHub

## Projekt-Struktur

```
clubcheck/
├── public/
│   ├── index.html        # Landing Page + Pricing
│   ├── register.html     # 5-Schritt Registrierung + Stripe
│   ├── survey.html       # ClubCheck Umfrage (PULSE + CORE)
│   └── dashboard.html    # Premium Vorstand-Dashboard
├── api/
│   ├── create-checkout.js  # Stripe Checkout Session erstellen
│   └── stripe-webhook.js   # Stripe Webhook → Supabase Update
├── sql/
│   └── schema.sql        # Supabase Tabellen + Funktionen
├── vercel.json           # Vercel Routing
├── package.json
└── .env.example
```

## Setup

### 1. Supabase
- SQL Editor → `sql/schema.sql` ausführen
- Settings → API → URL + anon key notieren

### 2. Stripe
- Produkte müssen NICHT manuell erstellt werden (Checkout Session erstellt sie)
- Webhook URL in Stripe: `https://clubcheck.humatrix.cc/api/stripe-webhook`
- Events: `checkout.session.completed`

### 3. Vercel
- Repository importieren
- Environment Variables setzen:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_KEY`
  - `STRIPE_SECRET_KEY`
  - `STRIPE_PUBLISHABLE_KEY`
  - `STRIPE_WEBHOOK_SECRET`

### 4. DNS
- CNAME `clubcheck` → Vercel Domain

## Pakete

| Paket | Preis | Mitglieder | Features |
|-------|-------|------------|----------|
| Basic | 199€ | bis 100 | Report, Rollen, NPS, CSV, 3 Fragen |
| Plus | 299€ | bis 250 | + Kommentar-Analyse, Gaps |
| Premium | 499€ | bis 500 | + Tiefenanalyse, Cross-Korrelation, Risiken |

## URLs

- `/` → Landing Page
- `/register` → Registrierung
- `/survey?c=CODE` → Umfrage
- `/dashboard?c=CODE` → Dashboard
