-- ============================================================
-- SOCRATES — SCHEMA UPDATE v3
-- daily_quote, API Rate-Limiting, Leads
-- Ausführen NACH v2 (supabase-schema-v2.sql)
-- ============================================================

-- ---- SESSIONS: daily_quote ----
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS daily_quote TEXT;

-- ---- API REQUEST RATE LIMITING ----
CREATE TABLE IF NOT EXISTS api_request_counts (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date       DATE NOT NULL DEFAULT CURRENT_DATE,
  count      INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, date)
);

ALTER TABLE api_request_counts ENABLE ROW LEVEL SECURITY;

-- Nur Service Role darf schreiben/lesen (kein direkter Client-Zugriff)
CREATE POLICY "Service manages rate limits"
  ON api_request_counts FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS api_request_counts_user_date_idx
  ON api_request_counts(user_id, date DESC);

-- Automatische Bereinigung alter Einträge (>30 Tage)
CREATE OR REPLACE FUNCTION cleanup_old_rate_limits()
RETURNS void AS $$
BEGIN
  DELETE FROM api_request_counts WHERE date < CURRENT_DATE - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- ---- LEADS (Lead-Funnel) ----
CREATE TABLE IF NOT EXISTS leads (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email      TEXT NOT NULL,
  name       TEXT,
  source     TEXT DEFAULT 'website',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (email)
);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Nur Service Role (lead-capture function) kann schreiben
CREATE POLICY "Service can insert leads"
  ON leads FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service can read leads"
  ON leads FOR SELECT
  USING (true);

CREATE INDEX IF NOT EXISTS leads_email_idx ON leads(email);
CREATE INDEX IF NOT EXISTS leads_created_at_idx ON leads(created_at DESC);
