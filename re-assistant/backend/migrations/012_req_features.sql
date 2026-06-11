-- 012_req_features.sql
-- Anforderungs-Features: Watcher, Links, Anhänge, Due Date, Story Points

-- Due Date + Story Points direkt in requirements
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS due_date       TIMESTAMPTZ;
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS story_points   INTEGER;
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS watchers       JSONB NOT NULL DEFAULT '[]';
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS attachments    JSONB NOT NULL DEFAULT '[]';
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS linked_reqs    JSONB NOT NULL DEFAULT '[]';

-- Dedizierte Kommentar-Tabelle (skalierbar, mit @mentions)
CREATE TABLE IF NOT EXISTS req_comments (
  id          TEXT        PRIMARY KEY DEFAULT 'cmt-' || extract(epoch from now())::bigint::text || '-' || floor(random()*1000)::text,
  req_id      TEXT        NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
  system_id   TEXT        NOT NULL,
  user_id     TEXT        NOT NULL,
  user_name   TEXT        NOT NULL,
  content     TEXT        NOT NULL,
  mentions    JSONB       NOT NULL DEFAULT '[]',
  edited      BOOLEAN     NOT NULL DEFAULT FALSE,
  edited_at   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Dedizierte History-Tabelle
CREATE TABLE IF NOT EXISTS req_history (
  id          TEXT        PRIMARY KEY DEFAULT 'hist-' || extract(epoch from now())::bigint::text || '-' || floor(random()*1000)::text,
  req_id      TEXT        NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
  user_id     TEXT        NOT NULL,
  user_name   TEXT        NOT NULL,
  field       TEXT        NOT NULL,
  old_value   TEXT,
  new_value   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_req_comments_req_id  ON req_comments(req_id);
CREATE INDEX IF NOT EXISTS idx_req_history_req_id   ON req_history(req_id);
