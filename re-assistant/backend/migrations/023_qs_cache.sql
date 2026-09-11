-- 023_qs_cache.sql
-- Persistiert das QS-Ergebnis (Issues, Verbesserungsvorschläge etc.) pro
-- Anforderung, zusammen mit einem Inhalts-Hash zum Zeitpunkt der Analyse.
-- Weicht der aktuelle Inhalt (Titel/Beschreibung/Kategorie/Priorität) vom
-- Hash ab, gilt das gespeicherte Ergebnis als veraltet — die Anforderung
-- wird wieder als "offen" (nicht analysiert) behandelt, ohne dass die QS
-- bei unveränderten Anforderungen erneut über die KI laufen muss.

ALTER TABLE requirements ADD COLUMN IF NOT EXISTS qs_detail       JSONB;
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS qs_content_hash TEXT;
