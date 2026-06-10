-- 007_workflow_status.sql
-- Erweitert Requirements um trackbaren Workflow-Status

-- Neues Feld workflow_status
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS workflow_status TEXT NOT NULL DEFAULT 'backlog';

-- Bestehende Status migrieren
UPDATE requirements SET workflow_status = CASE
  WHEN status = 'open'        THEN 'backlog'
  WHEN status = 'assigned'    THEN 'refinement'
  WHEN status = 'in-progress' THEN 'in_progress'
  WHEN status = 'done'        THEN 'done'
  ELSE 'backlog'
END;

-- Workflow-Status Änderungshistorie
CREATE TABLE IF NOT EXISTS workflow_history (
  id           SERIAL PRIMARY KEY,
  req_id       TEXT NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
  from_status  TEXT,
  to_status    TEXT NOT NULL,
  changed_by   TEXT NOT NULL,
  changed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  comment      TEXT
);

CREATE INDEX IF NOT EXISTS idx_wf_req ON workflow_history(req_id);
CREATE INDEX IF NOT EXISTS idx_wf_changed_at ON workflow_history(changed_at);

-- App-Settings für Workflow-Konfiguration
INSERT INTO app_settings (key, value) VALUES ('workflow_enabled', 'true')
  ON CONFLICT (key) DO NOTHING;
