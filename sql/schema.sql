-- ═══════════════════════════════════════════════════════════
-- HUMATRIX CLUBCHECK — SUPABASE SCHEMA
-- Run this in Supabase SQL Editor (supabase.com → SQL Editor)
-- ═══════════════════════════════════════════════════════════

-- 1. CLUBS (registered by Vorstand)
CREATE TABLE IF NOT EXISTS clubs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code VARCHAR(12) UNIQUE NOT NULL,
  name VARCHAR(200) NOT NULL,
  contact_name VARCHAR(200),
  contact_email VARCHAR(200),
  contact_phone VARCHAR(50),
  password_hash TEXT,
  
  -- Package
  package VARCHAR(20) DEFAULT 'basic' CHECK (package IN ('basic', 'plus', 'premium')),
  max_members INT DEFAULT 100,
  expires_at TIMESTAMPTZ,
  stripe_customer_id VARCHAR(200),
  stripe_session_id VARCHAR(200),
  payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'expired')),
  
  -- Custom questions (3 per plan)
  q1_text TEXT, q1_type VARCHAR(10) DEFAULT 'scale', q1_opts TEXT,
  q2_text TEXT, q2_type VARCHAR(10) DEFAULT 'scale', q2_opts TEXT,
  q3_text TEXT, q3_type VARCHAR(10) DEFAULT 'scale', q3_opts TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. RESPONSES (survey answers)
CREATE TABLE IF NOT EXISTS responses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  club_id UUID REFERENCES clubs(id) ON DELETE CASCADE,
  code VARCHAR(12) NOT NULL,
  
  -- Person
  name VARCHAR(200),
  is_anonymous BOOLEAN DEFAULT false,
  role VARCHAR(50),
  tenure VARCHAR(30),
  mode VARCHAR(10) CHECK (mode IN ('pulse', 'core')),
  
  -- Scores (calculated)
  score_total INT,
  score_intern INT,
  score_sport INT,
  score_extern INT,
  score_zukunft INT,
  score_custom INT,
  nps INT,
  
  -- Calibration
  cal_life INT,
  cal_active INT,
  cal_bias VARCHAR(10),
  
  -- Raw answers (JSONB for flexibility)
  answers JSONB DEFAULT '{}',
  freitext TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. INDEXES
CREATE INDEX IF NOT EXISTS idx_responses_code ON responses(code);
CREATE INDEX IF NOT EXISTS idx_responses_club ON responses(club_id);
CREATE INDEX IF NOT EXISTS idx_clubs_code ON clubs(code);

-- 4. ROW LEVEL SECURITY
ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE responses ENABLE ROW LEVEL SECURITY;

-- Clubs: anyone can read by code (for survey), insert (registration)
CREATE POLICY "clubs_read" ON clubs FOR SELECT USING (true);
CREATE POLICY "clubs_insert" ON clubs FOR INSERT WITH CHECK (true);
CREATE POLICY "clubs_update" ON clubs FOR UPDATE USING (true);

-- Responses: anyone can insert (anonymous survey), read by code
CREATE POLICY "responses_insert" ON responses FOR INSERT WITH CHECK (true);
CREATE POLICY "responses_read" ON responses FOR SELECT USING (true);

-- 5. FUNCTIONS

-- Get club config (for survey app)
CREATE OR REPLACE FUNCTION get_club_config(p_code VARCHAR)
RETURNS JSON AS $$
  SELECT json_build_object(
    'code', code,
    'name', name,
    'package', package,
    'max_members', max_members,
    'payment_status', payment_status,
    'expires_at', expires_at,
    'questions', json_build_array(
      CASE WHEN q1_text IS NOT NULL THEN json_build_object('t', q1_text, 'type', COALESCE(q1_type, 'scale'), 'opts', q1_opts) END,
      CASE WHEN q2_text IS NOT NULL THEN json_build_object('t', q2_text, 'type', COALESCE(q2_type, 'scale'), 'opts', q2_opts) END,
      CASE WHEN q3_text IS NOT NULL THEN json_build_object('t', q3_text, 'type', COALESCE(q3_type, 'scale'), 'opts', q3_opts) END
    )
  )
  FROM clubs WHERE UPPER(code) = UPPER(p_code) AND payment_status = 'paid';
$$ LANGUAGE sql;

-- Get dashboard data (aggregated)
CREATE OR REPLACE FUNCTION get_dashboard(p_code VARCHAR)
RETURNS JSON AS $$
DECLARE
  v_club RECORD;
  v_result JSON;
  v_count INT;
  v_scores JSON;
  v_roles JSON;
  v_nps JSON;
  v_freitexts JSON;
  v_questions JSON;
BEGIN
  -- Get club
  SELECT * INTO v_club FROM clubs WHERE UPPER(code) = UPPER(p_code);
  IF NOT FOUND THEN RETURN json_build_object('error', 'Club not found'); END IF;
  
  -- Count
  SELECT COUNT(*) INTO v_count FROM responses WHERE UPPER(code) = UPPER(p_code);
  
  -- Average scores
  SELECT json_build_object(
    'total', COALESCE(ROUND(AVG(score_total)), 0),
    'intern', COALESCE(ROUND(AVG(score_intern)), 0),
    'sport', COALESCE(ROUND(AVG(score_sport)), 0),
    'extern', COALESCE(ROUND(AVG(score_extern)), 0),
    'zukunft', COALESCE(ROUND(AVG(score_zukunft)), 0)
  ) INTO v_scores FROM responses WHERE UPPER(code) = UPPER(p_code);
  
  -- Roles
  SELECT json_object_agg(role, cnt) INTO v_roles
  FROM (SELECT role, COUNT(*) as cnt FROM responses WHERE UPPER(code) = UPPER(p_code) AND role IS NOT NULL GROUP BY role) t;
  
  -- NPS
  SELECT json_build_object(
    'avg', COALESCE(ROUND(AVG(nps)::numeric, 1), 0),
    'promoter', COUNT(*) FILTER (WHERE nps >= 9),
    'passiv', COUNT(*) FILTER (WHERE nps >= 7 AND nps < 9),
    'kritiker', COUNT(*) FILTER (WHERE nps < 7)
  ) INTO v_nps FROM responses WHERE UPPER(code) = UPPER(p_code) AND nps IS NOT NULL;
  
  -- Freitexts
  SELECT json_agg(json_build_object('text', freitext, 'role', role))
  INTO v_freitexts
  FROM responses WHERE UPPER(code) = UPPER(p_code) AND freitext IS NOT NULL AND freitext != '';
  
  -- Question scores (aggregate each answer key)
  SELECT json_agg(json_build_object('key', key, 'avg', ROUND(avg_val::numeric, 1), 'pct', ROUND(((avg_val - 1) / 6) * 100)))
  INTO v_questions
  FROM (
    SELECT key, AVG(value::text::numeric) as avg_val
    FROM responses, jsonb_each(answers)
    WHERE UPPER(code) = UPPER(p_code) AND value::text ~ '^\d+$'
    GROUP BY key
  ) t;
  
  -- Role scores
  -- Build manually for each role
  
  RETURN json_build_object(
    'name', v_club.name,
    'code', v_club.code,
    'package', v_club.package,
    'count', v_count,
    'avgScores', v_scores,
    'npsDistribution', v_nps,
    'npsAvg', (v_nps->>'avg')::numeric,
    'roles', COALESCE(v_roles, '{}'::json),
    'questionScores', COALESCE(v_questions, '[]'::json),
    'freitexts', COALESCE(v_freitexts, '[]'::json)
  );
END;
$$ LANGUAGE plpgsql;

-- Check response count against plan limit
CREATE OR REPLACE FUNCTION check_response_limit(p_code VARCHAR)
RETURNS BOOLEAN AS $$
DECLARE
  v_max INT;
  v_count INT;
BEGIN
  SELECT max_members INTO v_max FROM clubs WHERE UPPER(code) = UPPER(p_code) AND payment_status = 'paid';
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT COUNT(*) INTO v_count FROM responses WHERE UPPER(code) = UPPER(p_code);
  RETURN v_count < v_max;
END;
$$ LANGUAGE plpgsql;
