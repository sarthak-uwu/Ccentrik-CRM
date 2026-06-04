-- ============================================================
-- Meetings v2 + Chat enhancements + Notifications system
-- ============================================================

-- ── MEETINGS enhancements ──────────────────────────────────────

ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS meeting_purpose   VARCHAR(50),       -- discovery | demo | follow_up | negotiation | closing
  ADD COLUMN IF NOT EXISTS mode              VARCHAR(20) DEFAULT 'online', -- online | offline
  ADD COLUMN IF NOT EXISTS timezone          VARCHAR(100) DEFAULT 'Asia/Kolkata',
  ADD COLUMN IF NOT EXISTS agenda            TEXT,
  ADD COLUMN IF NOT EXISTS talking_points    TEXT,
  ADD COLUMN IF NOT EXISTS expected_outcome  TEXT,
  ADD COLUMN IF NOT EXISTS internal_notes    TEXT,
  ADD COLUMN IF NOT EXISTS outcome           VARCHAR(50),       -- won | positive | neutral | negative | no_show
  ADD COLUMN IF NOT EXISTS outcome_notes     TEXT,
  ADD COLUMN IF NOT EXISTS next_follow_up    DATE,
  ADD COLUMN IF NOT EXISTS lead_id           UUID REFERENCES leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deal_id           UUID REFERENCES deals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS company_name      TEXT,
  ADD COLUMN IF NOT EXISTS jitsi_room        TEXT,
  ADD COLUMN IF NOT EXISTS follow_up_task_created BOOLEAN DEFAULT FALSE;

-- ── CHAT enhancements ─────────────────────────────────────────

ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS pinned BOOLEAN DEFAULT FALSE;

ALTER TABLE channel_members
  ADD COLUMN IF NOT EXISTS starred BOOLEAN DEFAULT FALSE;

-- ── NOTIFICATIONS system ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type          VARCHAR(50) NOT NULL,   -- meeting_reminder | lead_assigned | task_due | chat_message | system
  title         TEXT NOT NULL,
  body          TEXT,
  link          TEXT,                   -- frontend route to navigate to
  entity_type   VARCHAR(50),            -- meeting | lead | deal | task | chat
  entity_id     UUID,                   -- FK to the related record
  priority      VARCHAR(20) DEFAULT 'normal', -- high | normal | low
  read          BOOLEAN DEFAULT FALSE,
  dismissed     BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  expires_at    TIMESTAMPTZ            -- null = never expires
);

-- Indexes for fast per-user queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_id, read, created_at DESC)
  WHERE dismissed = FALSE;

CREATE INDEX IF NOT EXISTS idx_notifications_entity
  ON notifications(entity_type, entity_id);

-- Auto-cleanup: remove dismissed or expired notifications older than 30 days
-- (Run via a Supabase pg_cron job or manually)

-- RLS: every user sees only their own notifications
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notifications_select" ON notifications;
DROP POLICY IF EXISTS "notifications_insert" ON notifications;
DROP POLICY IF EXISTS "notifications_update" ON notifications;
DROP POLICY IF EXISTS "notifications_delete" ON notifications;

CREATE POLICY "notifications_select" ON notifications FOR SELECT USING (true);
CREATE POLICY "notifications_insert" ON notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "notifications_update" ON notifications FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "notifications_delete" ON notifications FOR DELETE USING (true);
