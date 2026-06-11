-- 014_system_context_cache.sql
-- KI-Kontext-Cache pro System
-- Wird beim Datei-Upload automatisch aufgebaut

CREATE TABLE IF NOT EXISTS system_context_cache (
  system_id     TEXT        PRIMARY KEY REFERENCES systems(id) ON DELETE CASCADE,
  summary       TEXT        NOT NULL DEFAULT '',
  key_topics    JSONB       NOT NULL DEFAULT '[]',
  doc_names     JSONB       NOT NULL DEFAULT '[]',
  token_count   INTEGER     NOT NULL DEFAULT 0,
  built_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  build_status  TEXT        NOT NULL DEFAULT 'pending'
);
