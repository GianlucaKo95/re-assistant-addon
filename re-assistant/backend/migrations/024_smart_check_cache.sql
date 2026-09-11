-- 024_smart_check_cache.sql
-- Persistiert das volle SMART/IEEE-830/ISO-25010-Prüfungsergebnis pro
-- Anforderung (nicht nur die daraus abgeleiteten Einzelfelder wie
-- quality_score/iso_category), zusammen mit einem Inhalts-Hash — gleiches
-- Muster wie qs_detail/qs_content_hash (Migration 023).

ALTER TABLE requirements ADD COLUMN IF NOT EXISTS smart_detail       JSONB;
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS smart_content_hash TEXT;
