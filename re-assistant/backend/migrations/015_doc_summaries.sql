-- 015_doc_summaries.sql
-- Pro-Dokument-Zusammenfassungen für inkrementellen Cache-Aufbau

ALTER TABLE system_context_cache ADD COLUMN IF NOT EXISTS docs_processed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE system_context_cache ADD COLUMN IF NOT EXISTS docs_total     INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS doc_summaries (
  doc_id      TEXT        PRIMARY KEY,
  system_id   TEXT        NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
  doc_name    TEXT        NOT NULL,
  summary     TEXT        NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doc_summaries_system_id ON doc_summaries(system_id);
