-- 009_system_subdomains.sql
-- Subdomains für Systeme — hierarchische Unterteilung

ALTER TABLE systems ADD COLUMN IF NOT EXISTS parent_id TEXT REFERENCES systems(id) ON DELETE CASCADE;
ALTER TABLE systems ADD COLUMN IF NOT EXISTS level INTEGER NOT NULL DEFAULT 0;
ALTER TABLE systems ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_systems_parent_id ON systems(parent_id);

-- Bestehende Systeme sind Root-Systeme (level=0, parent_id=NULL)
