-- 011_traceability.sql
-- User Stories, Testfälle und Konflikte für Traceability

CREATE TABLE IF NOT EXISTS user_stories (
  id            TEXT        PRIMARY KEY DEFAULT 'us-' || extract(epoch from now())::bigint::text || '-' || floor(random()*1000)::text,
  req_id        TEXT        REFERENCES requirements(id) ON DELETE CASCADE,
  system_id     TEXT        REFERENCES systems(id) ON DELETE CASCADE,
  title         TEXT        NOT NULL,
  description   TEXT        NOT NULL DEFAULT '',
  acceptance_criteria JSONB NOT NULL DEFAULT '[]',
  priority      TEXT        NOT NULL DEFAULT 'medium',
  status        TEXT        NOT NULL DEFAULT 'open',
  story_points  INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS test_cases (
  id            TEXT        PRIMARY KEY DEFAULT 'tc-' || extract(epoch from now())::bigint::text || '-' || floor(random()*1000)::text,
  story_id      TEXT        REFERENCES user_stories(id) ON DELETE CASCADE,
  req_id        TEXT        REFERENCES requirements(id) ON DELETE SET NULL,
  system_id     TEXT        REFERENCES systems(id) ON DELETE CASCADE,
  title         TEXT        NOT NULL,
  steps         JSONB       NOT NULL DEFAULT '[]',
  expected      TEXT        NOT NULL DEFAULT '',
  status        TEXT        NOT NULL DEFAULT 'not_run',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS req_conflicts (
  id            TEXT        PRIMARY KEY DEFAULT 'cf-' || extract(epoch from now())::bigint::text,
  req_id_a      TEXT        REFERENCES requirements(id) ON DELETE CASCADE,
  req_id_b      TEXT        REFERENCES requirements(id) ON DELETE CASCADE,
  system_id_a   TEXT,
  system_id_b   TEXT,
  conflict_type TEXT        NOT NULL DEFAULT 'semantic',
  description   TEXT        NOT NULL DEFAULT '',
  severity      TEXT        NOT NULL DEFAULT 'medium',
  status        TEXT        NOT NULL DEFAULT 'open',
  ai_suggestion TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_stories_req_id    ON user_stories(req_id);
CREATE INDEX IF NOT EXISTS idx_user_stories_system_id ON user_stories(system_id);
CREATE INDEX IF NOT EXISTS idx_test_cases_story_id    ON test_cases(story_id);
CREATE INDEX IF NOT EXISTS idx_test_cases_system_id   ON test_cases(system_id);
CREATE INDEX IF NOT EXISTS idx_req_conflicts_req_a    ON req_conflicts(req_id_a);
CREATE INDEX IF NOT EXISTS idx_req_conflicts_req_b    ON req_conflicts(req_id_b);
