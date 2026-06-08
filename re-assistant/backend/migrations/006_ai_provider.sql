-- 006_ai_provider.sql
-- Fügt ai_provider Feld zu users hinzu für per-User Provider-Auswahl

ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_provider VARCHAR(20) DEFAULT 'anthropic';

-- App-Settings für globalen Provider
INSERT INTO app_settings (key, value) VALUES ('global_ai_provider', 'anthropic')
  ON CONFLICT (key) DO NOTHING;
