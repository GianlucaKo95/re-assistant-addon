-- 026_implementation_check.sql
-- Persistiert das Ergebnis der KI-gestützten Umsetzungsprüfung (vergleicht
-- eine Anforderung mit dem indexierten Quellcode/der Dokumentation und
-- schätzt ein, ob sie bereits implementiert ist) zusammen mit einem
-- Inhalts-Hash — gleiches Muster wie smart_detail/smart_content_hash
-- (Migration 024).

ALTER TABLE requirements ADD COLUMN IF NOT EXISTS implementation_check      JSONB;
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS implementation_check_hash TEXT;
