-- 025_system_analysis_cache.sql
-- Persistiert System-weite KI-Analyseergebnisse (aktuell: Konsistenzprüfung),
-- die sich nicht einer einzelnen Anforderung zuordnen lassen. Analog zu
-- qs_detail/smart_detail auf requirements, nur pro System und generisch
-- nach "kind" (z.B. "consistency") indiziert, damit künftige system-weite
-- Analysen keine weitere Migration brauchen:
-- { "<kind>": { "result": {...}, "contentHash": "...", "at": <ms> } }

ALTER TABLE systems ADD COLUMN IF NOT EXISTS analysis_cache JSONB NOT NULL DEFAULT '{}';
