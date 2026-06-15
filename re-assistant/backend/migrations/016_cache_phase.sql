-- 016_cache_phase.sql
-- Phasen-Tracking für Cache-Aufbau (für Fortschrittsanzeige bei Gruppierung/Finalisierung)

ALTER TABLE system_context_cache ADD COLUMN IF NOT EXISTS build_phase   TEXT    NOT NULL DEFAULT '';
ALTER TABLE system_context_cache ADD COLUMN IF NOT EXISTS groups_total  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE system_context_cache ADD COLUMN IF NOT EXISTS groups_done   INTEGER NOT NULL DEFAULT 0;
