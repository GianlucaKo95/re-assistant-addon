-- 010_workshops.sql
-- Workshops Tabelle

CREATE TABLE IF NOT EXISTS workshops (
  id          TEXT        PRIMARY KEY DEFAULT 'ws-' || extract(epoch from now())::bigint::text,
  name        TEXT        NOT NULL,
  goal        TEXT        NOT NULL DEFAULT '',
  system_id   TEXT        REFERENCES systems(id) ON DELETE SET NULL,
  entries     JSONB       NOT NULL DEFAULT '[]',
  structured  JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workshops_system_id ON workshops(system_id);
