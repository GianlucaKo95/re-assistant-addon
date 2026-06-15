-- 017_req_quality.sql
-- Erweiterte Anforderungsqualität: SMART-Score, Akzeptanzkriterien,
-- Stakeholder, Systemgrenzen, ISO-25010, Verifikation

ALTER TABLE requirements ADD COLUMN IF NOT EXISTS acceptance_criteria_text TEXT    NOT NULL DEFAULT '';
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS stakeholders              JSONB   NOT NULL DEFAULT '[]';
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS verification_method       TEXT    NOT NULL DEFAULT '';
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS iso_category              TEXT    NOT NULL DEFAULT '';
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS smart_score               JSONB   NOT NULL DEFAULT '{}';
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS conflicts                 JSONB   NOT NULL DEFAULT '[]';
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS business_value            INTEGER NOT NULL DEFAULT 0;
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS complexity                TEXT    NOT NULL DEFAULT '';
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS risk_level                TEXT    NOT NULL DEFAULT '';
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS source                    TEXT    NOT NULL DEFAULT '';

-- Stakeholder-Tabelle
CREATE TABLE IF NOT EXISTS system_stakeholders (
  id          TEXT        PRIMARY KEY,
  system_id   TEXT        NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  role        TEXT        NOT NULL DEFAULT '',
  interests   TEXT        NOT NULL DEFAULT '',
  influence   TEXT        NOT NULL DEFAULT 'medium',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Use Cases
CREATE TABLE IF NOT EXISTS use_cases (
  id          TEXT        PRIMARY KEY,
  system_id   TEXT        NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  actor       TEXT        NOT NULL DEFAULT '',
  description TEXT        NOT NULL DEFAULT '',
  preconditions TEXT      NOT NULL DEFAULT '',
  main_flow   TEXT        NOT NULL DEFAULT '',
  alt_flows   TEXT        NOT NULL DEFAULT '',
  postconditions TEXT     NOT NULL DEFAULT '',
  req_ids     JSONB       NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Systemgrenzen
CREATE TABLE IF NOT EXISTS system_boundaries (
  id          TEXT        PRIMARY KEY,
  system_id   TEXT        NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
  type        TEXT        NOT NULL DEFAULT 'in_scope',
  description TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Qualitätsziele (ISO-25010)
CREATE TABLE IF NOT EXISTS quality_goals (
  id          TEXT        PRIMARY KEY,
  system_id   TEXT        NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
  iso_char    TEXT        NOT NULL,
  description TEXT        NOT NULL,
  measure     TEXT        NOT NULL DEFAULT '',
  target      TEXT        NOT NULL DEFAULT '',
  priority    TEXT        NOT NULL DEFAULT 'medium',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stakeholders_system ON system_stakeholders(system_id);
CREATE INDEX IF NOT EXISTS idx_use_cases_system    ON use_cases(system_id);
CREATE INDEX IF NOT EXISTS idx_boundaries_system   ON system_boundaries(system_id);
CREATE INDEX IF NOT EXISTS idx_quality_goals_system ON quality_goals(system_id);
