-- 013_remove_default_system.sql
-- Entferne das vorinstallierte "Erstes System" aus der Seed-Migration
-- System wird stattdessen über den Onboarding-Wizard angelegt

DELETE FROM systems WHERE id = 'sys1';

-- User-Referenzen bereinigen
UPDATE users SET systems = '[]' WHERE systems::text LIKE '%sys1%';
