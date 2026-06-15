-- 019_chat_conversations.sql
-- Gespeicherte Chat-Unterhaltungen pro Nutzer und System

CREATE TABLE IF NOT EXISTS chat_conversations (
  id          TEXT        PRIMARY KEY,
  user_id     TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  system_id   TEXT        REFERENCES systems(id) ON DELETE SET NULL,
  chat_type   TEXT        NOT NULL DEFAULT 'bc',  -- bc | pmc | ws
  title       TEXT        NOT NULL DEFAULT '',
  messages    JSONB       NOT NULL DEFAULT '[]',
  message_count INTEGER   NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_conv_user    ON chat_conversations(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_conv_system  ON chat_conversations(system_id, chat_type);
