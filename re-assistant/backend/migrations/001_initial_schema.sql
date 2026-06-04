-- RE-Assistent v4.0 — PostgreSQL Schema
-- Migration 001: Initial Schema
-- Ausgeführt von migrate.js beim ersten Start

-- ── Extensions ────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";   -- trigram search

-- ── Users ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name          TEXT        NOT NULL,
  email         TEXT        NOT NULL UNIQUE,
  role          TEXT        NOT NULL DEFAULT 'business'
                            CHECK (role IN ('admin','business','businessanalyst','projectmanager','developer')),
  password      TEXT        NOT NULL,
  systems       JSONB       NOT NULL DEFAULT '[]',
  subcategories JSONB       NOT NULL DEFAULT '[]',
  api_key       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role  ON users(role);

-- ── Systems ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS systems (
  id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name        TEXT        NOT NULL,
  description TEXT        NOT NULL DEFAULT '',
  docs        JSONB       NOT NULL DEFAULT '[]',
  id_prefix   TEXT        NOT NULL DEFAULT 'REQ',
  id_counter  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Requirements ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS requirements (
  id                  TEXT        PRIMARY KEY,
  system_id           TEXT        NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
  title               TEXT        NOT NULL,
  description         TEXT        NOT NULL DEFAULT '',
  category            TEXT        NOT NULL DEFAULT 'Funktional',
  priority            TEXT        NOT NULL DEFAULT 'medium'
                                  CHECK (priority IN ('high','medium','low')),
  status              TEXT        NOT NULL DEFAULT 'open',
  rationale           TEXT        NOT NULL DEFAULT '',
  tags                JSONB       NOT NULL DEFAULT '[]',
  comments            JSONB       NOT NULL DEFAULT '[]',
  history             JSONB       NOT NULL DEFAULT '[]',
  acceptance_criteria JSONB       NOT NULL DEFAULT '[]',
  quality_score       NUMERIC(4,1),
  iso_issues          JSONB       NOT NULL DEFAULT '[]',
  review_status       TEXT        NOT NULL DEFAULT 'draft',
  review_comment      TEXT,
  reviewed_by         TEXT,
  reviewed_by_name    TEXT,
  reviewed_at         TIMESTAMPTZ,
  assigned_to         TEXT,
  subcategory         TEXT,
  source_analysis     JSONB,
  source_suggestion   TEXT,
  last_changed_by     TEXT,
  created_by          TEXT,
  created_by_name     TEXT,
  imported_at         TIMESTAMPTZ,
  archived            BOOLEAN     NOT NULL DEFAULT FALSE,
  archived_at         TIMESTAMPTZ,
  archived_by         TEXT,
  decomposed          BOOLEAN     NOT NULL DEFAULT FALSE,
  decomposed_into     INTEGER,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_req_system    ON requirements(system_id);
CREATE INDEX IF NOT EXISTS idx_req_status    ON requirements(status);
CREATE INDEX IF NOT EXISTS idx_req_priority  ON requirements(priority);
CREATE INDEX IF NOT EXISTS idx_req_assigned  ON requirements(assigned_to);
CREATE INDEX IF NOT EXISTS idx_req_archived  ON requirements(archived);
CREATE INDEX IF NOT EXISTS idx_req_review    ON requirements(review_status);
CREATE INDEX IF NOT EXISTS idx_req_updated   ON requirements(updated_at DESC);
-- Trigram-Index für Freitext-Suche
CREATE INDEX IF NOT EXISTS idx_req_title_trgm ON requirements USING GIN (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_req_desc_trgm  ON requirements USING GIN (description gin_trgm_ops);

-- ── Backlogs ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS backlogs (
  id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  system_id   TEXT        REFERENCES systems(id) ON DELETE CASCADE,
  system_name TEXT        NOT NULL DEFAULT '',
  epics       JSONB       NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_backlogs_system ON backlogs(system_id);

-- ── Workshops ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workshops (
  id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  system_id   TEXT        REFERENCES systems(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL DEFAULT '',
  goal        TEXT        NOT NULL DEFAULT '',
  entries     JSONB       NOT NULL DEFAULT '[]',
  structured  JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workshops_system ON workshops(system_id);

-- ── Diagrams ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS diagrams (
  id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  system_id   TEXT        REFERENCES systems(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL DEFAULT '',
  type        TEXT        NOT NULL DEFAULT 'bpmn',
  svg         TEXT,
  mermaid     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Embeddings ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS embeddings (
  id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  system_id   TEXT        NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
  doc_id      TEXT        NOT NULL,
  doc_name    TEXT        NOT NULL DEFAULT '',
  chunk_index INTEGER     NOT NULL DEFAULT 0,
  chunk_text  TEXT        NOT NULL,
  embedding   JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emb_system ON embeddings(system_id);
CREATE INDEX IF NOT EXISTS idx_emb_doc    ON embeddings(doc_id);
-- GIN-Index für JSONB-Embedding-Suche
CREATE INDEX IF NOT EXISTS idx_emb_embedding ON embeddings USING GIN (embedding);

-- ── App Settings ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- Defaults
INSERT INTO app_settings (key, value) VALUES
  ('api_key_mode',        'global'),
  ('onboarding_complete', '0')
ON CONFLICT (key) DO NOTHING;

-- ── Session Store (connect-pg-simple) ─────────────────────────
CREATE TABLE IF NOT EXISTS session (
  sid    VARCHAR   NOT NULL COLLATE "default",
  sess   JSON      NOT NULL,
  expire TIMESTAMP(6) NOT NULL,
  CONSTRAINT session_pkey PRIMARY KEY (sid) NOT DEFERRABLE INITIALLY IMMEDIATE
);

CREATE INDEX IF NOT EXISTS IDX_session_expire ON session(expire);

-- ── Updated-At Trigger ────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER trg_users_updated_at       BEFORE UPDATE ON users       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  CREATE TRIGGER trg_systems_updated_at     BEFORE UPDATE ON systems     FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  CREATE TRIGGER trg_requirements_updated_at BEFORE UPDATE ON requirements FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  CREATE TRIGGER trg_backlogs_updated_at    BEFORE UPDATE ON backlogs    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  CREATE TRIGGER trg_workshops_updated_at   BEFORE UPDATE ON workshops   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  CREATE TRIGGER trg_diagrams_updated_at    BEFORE UPDATE ON diagrams    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
