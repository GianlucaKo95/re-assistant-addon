-- 027_dedupe_backlogs.sql
-- Vor dem zugehörigen Code-Fix (crudTable() in server.js) legte jeder Klick
-- auf "Backlog generieren" eine NEUE Zeile in backlogs an, statt die
-- bestehende für dasselbe System zu aktualisieren — der Client kennt beim
-- Neu-Generieren die id des vorhandenen Backlogs bewusst nicht. Zusätzlich
-- griff die Anzeige beim erneuten Öffnen ungefiltert über alle Systeme
-- hinweg auf saved[saved.length-1] zu, was auf der nach created_at
-- ABSTEIGEND sortierten Liste sogar den ÄLTESTEN statt den neuesten
-- Backlog auswählte. Ergebnis: pro System konnten sich über die Zeit
-- beliebig viele verwaiste, nie wieder erreichbare Backlog-Zeilen ansammeln.
--
-- Diese Migration räumt bereits angesammelten Datenmüll aus einmalig auf:
-- pro system_id bleibt nur der zuletzt erstellte Backlog erhalten, ältere
-- werden gelöscht. Zeilen ohne system_id (sollten nicht vorkommen, aber
-- zur Sicherheit) bleiben unangetastet, da sie sich keinem System eindeutig
-- zuordnen lassen.
DELETE FROM backlogs a USING backlogs b
WHERE a.system_id = b.system_id
  AND a.system_id IS NOT NULL AND a.system_id <> ''
  AND (a.created_at, a.id) < (b.created_at, b.id);
