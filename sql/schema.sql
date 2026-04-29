-- HUMATRIX CLUBCHECK 2.0 — SUPABASE SCHEMA
-- In Supabase SQL Editor ausführen.
-- Öffentliche Browser-Seiten greifen NICHT direkt auf Supabase zu.
-- Alle Datenzugriffe laufen serverseitig über Vercel API + SUPABASE_SERVICE_KEY.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS clubs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code VARCHAR(12) UNIQUE NOT NULL,
  name VARCHAR(200) NOT NULL,
  contact_name VARCHAR(200),
  contact_email VARCHAR(200),
  contact_phone VARCHAR(50),
  password_hash TEXT,

  package VARCHAR(20) DEFAULT 'basic' CHECK (package IN ('basic', 'plus', 'premium')),
  max_members INT DEFAULT 100,
  max_custom_questions INT DEFAULT 1,
  expires_at TIMESTAMPTZ,

  stripe_customer_id VARCHAR(200),
  stripe_session_id VARCHAR(200),
  payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'expired')),

  q1_text TEXT, q1_type VARCHAR(10) DEFAULT 'scale', q1_opts TEXT,
  q2_text TEXT, q2_type VARCHAR(10) DEFAULT 'scale', q2_opts TEXT,
  q3_text TEXT, q3_type VARCHAR(10) DEFAULT 'scale', q3_opts TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE clubs ADD COLUMN IF NOT EXISTS max_custom_questions INT DEFAULT 1;

CREATE TABLE IF NOT EXISTS responses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  club_id UUID REFERENCES clubs(id) ON DELETE CASCADE,
  code VARCHAR(12) NOT NULL,

  name VARCHAR(200),
  is_anonymous BOOLEAN DEFAULT false,
  role VARCHAR(50),
  tenure VARCHAR(30),
  mode VARCHAR(10) CHECK (mode IN ('pulse', 'core')),

  score_total INT,
  score_intern INT,
  score_sport INT,
  score_extern INT,
  score_zukunft INT,
  score_custom INT,
  nps INT,

  cal_life INT,
  cal_active INT,
  cal_bias VARCHAR(10),

  answers JSONB DEFAULT '{}',
  freitext TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS password_resets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  club_id UUID REFERENCES clubs(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clubs_code ON clubs(UPPER(code));
CREATE INDEX IF NOT EXISTS idx_clubs_email ON clubs(LOWER(contact_email));
CREATE INDEX IF NOT EXISTS idx_responses_code ON responses(UPPER(code));
CREATE INDEX IF NOT EXISTS idx_responses_club ON responses(club_id);
CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token_hash);

ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_resets ENABLE ROW LEVEL SECURITY;

-- Alte, zu offene Policies entfernen.
DROP POLICY IF EXISTS "clubs_read" ON clubs;
DROP POLICY IF EXISTS "clubs_insert" ON clubs;
DROP POLICY IF EXISTS "clubs_update" ON clubs;
DROP POLICY IF EXISTS "responses_insert" ON responses;
DROP POLICY IF EXISTS "responses_read" ON responses;

-- Keine Public Policies anlegen.
-- Zugriff erfolgt ausschließlich über die Vercel API mit Service Role Key.

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS clubs_set_updated_at ON clubs;
CREATE TRIGGER clubs_set_updated_at
BEFORE UPDATE ON clubs
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS email_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  club_id UUID REFERENCES clubs(id) ON DELETE CASCADE,
  event_type VARCHAR(60) NOT NULL,
  recipient VARCHAR(200),
  subject TEXT,
  status VARCHAR(20) DEFAULT 'sending' CHECK (status IN ('sending', 'sent', 'failed')),
  provider_id TEXT,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  UNIQUE (club_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_email_logs_club ON email_logs(club_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_event ON email_logs(event_type);

ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

-- Keine Public Policy: E-Mail-Protokolle bleiben ausschließlich serverseitig zugänglich.
