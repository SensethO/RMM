-- ============================================================
-- Migration: Session tracking tables
-- Created: 2026-05-15
-- ============================================================

-- ── user_sessions : one row per login session ────────────────────────────────
CREATE TABLE IF NOT EXISTS user_sessions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           TEXT        NOT NULL DEFAULT 'anonymous',
  user_name         TEXT,
  user_email        TEXT,
  ip_address        TEXT,
  user_agent        TEXT,
  browser           TEXT,
  screen_resolution TEXT,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at          TIMESTAMPTZ,
  duration_seconds  INTEGER,
  page_count        INTEGER     NOT NULL DEFAULT 0,
  is_active         BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── session_events : page views, actions, heartbeats, logout ────────────────
CREATE TABLE IF NOT EXISTS session_events (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id              UUID        NOT NULL REFERENCES user_sessions(id) ON DELETE CASCADE,
  event_type              TEXT        NOT NULL CHECK (event_type IN ('page_view','heartbeat','logout','action')),
  page                    TEXT,
  previous_page           TEXT,
  action_label            TEXT,
  metadata                JSONB       NOT NULL DEFAULT '{}',
  time_on_previous_page   INTEGER,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_user_sessions_started_at   ON user_sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id      ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_is_active    ON user_sessions(is_active);
CREATE INDEX IF NOT EXISTS idx_session_events_session_id  ON session_events(session_id);
CREATE INDEX IF NOT EXISTS idx_session_events_created_at  ON session_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_session_events_type        ON session_events(event_type);

-- ── Disable RLS (service role key used from backend) ────────────────────────
ALTER TABLE user_sessions  DISABLE ROW LEVEL SECURITY;
ALTER TABLE session_events DISABLE ROW LEVEL SECURITY;

-- ── Auto-mark inactive sessions (> 30 min without heartbeat) as ended ───────
-- Optional: run via a cron job or Supabase scheduled function
-- UPDATE user_sessions
-- SET is_active = FALSE, ended_at = NOW()
-- WHERE is_active = TRUE
--   AND last_active_at < NOW() - INTERVAL '30 minutes';
