-- 008_audit_log.sql
-- Vollständiger Audit-Log für Anforderungsänderungen und Login-Events

CREATE TABLE IF NOT EXISTS audit_log (
  id          SERIAL PRIMARY KEY,
  event_type  TEXT NOT NULL,         -- 'requirement_change' | 'login' | 'login_failed' | 'status_change'
  entity_type TEXT,                  -- 'requirement' | 'user' | 'system'
  entity_id   TEXT,
  entity_name TEXT,                  -- z.B. Anforderungstitel
  system_id   TEXT,                  -- für Filterung auf Systemebene
  action      TEXT NOT NULL,         -- 'create' | 'update' | 'delete' | 'login' | 'status_change' etc.
  user_id     TEXT,
  user_name   TEXT,
  details     JSONB DEFAULT '{}',
  ip_address  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_event_type ON audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_system_id  ON audit_log(system_id);
CREATE INDEX IF NOT EXISTS idx_audit_user_id    ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action     ON audit_log(action);
