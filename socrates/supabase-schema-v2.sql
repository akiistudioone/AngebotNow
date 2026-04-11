-- ============================================================
-- SOCRATES — SCHEMA UPDATE v2
-- Neue Tabellen und Felder für Features 2, 3, 7, 8
-- Ausführen NACH dem initialen Schema (supabase-schema.sql)
-- ============================================================

-- ---- PROFILES: Neue Felder ----
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_premium      BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reflection_time TEXT    DEFAULT 'abend',
  ADD COLUMN IF NOT EXISTS motivation      TEXT;

-- ---- WEEKLY DIGESTS ----
CREATE TABLE IF NOT EXISTS weekly_digests (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID REFERENCES profiles(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  week_start    DATE NOT NULL,
  week_end      DATE NOT NULL,
  session_count INTEGER DEFAULT 0,
  summary       TEXT,
  key_themes    TEXT[],
  growth_noted  TEXT,
  UNIQUE (user_id, week_start)
);

ALTER TABLE weekly_digests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own digests"
  ON weekly_digests FOR SELECT
  USING (auth.uid() = user_id);

-- Service role schreibt Digests
CREATE POLICY "Service can insert digests"
  ON weekly_digests FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service can update digests"
  ON weekly_digests FOR UPDATE
  USING (true);

CREATE INDEX IF NOT EXISTS weekly_digests_user_date_idx
  ON weekly_digests(user_id, week_start DESC);

-- ---- PUSH SUBSCRIPTIONS ----
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  endpoint   TEXT NOT NULL,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  is_active  BOOLEAN DEFAULT TRUE,
  UNIQUE (user_id, endpoint)
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- User kann eigene Subscriptions lesen
CREATE POLICY "Users can read own push subscriptions"
  ON push_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Service role verwaltet Subscriptions
CREATE POLICY "Service can manage push subscriptions"
  ON push_subscriptions FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_active_idx
  ON push_subscriptions(user_id, is_active);

-- ---- INDEX für Daily Reminder Query ----
CREATE INDEX IF NOT EXISTS profiles_reflection_time_idx
  ON profiles(reflection_time)
  WHERE onboarding_done = TRUE;
