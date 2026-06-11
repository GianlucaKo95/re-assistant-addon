-- RE-Assistent v4.0 — Seed Data
-- Migration 002: Demo-Benutzer und erstes System
-- Passwörter sind bcrypt-Hashes (admin123 / test123)

INSERT INTO users (id, name, email, role, password, systems, subcategories)
VALUES
  ('u1', 'Admin',         'admin@re.local',   'admin',           '$2a$10$BaLGPyzVCt46.BgJH3HDUOYEfVgI4ap3nvkMDOyyV16GxoEtL//E.', '[]', '[]'),
  ('u2', 'Anna Müller',   'anna@re.local',    'business',        '$2a$10$j4yX3EraAux.LxDMEQpEOO7XGUHSs30.oal3HHUQtLveqSxT9TQ/.', '[]', '[]'),
  ('u3', 'Marcus Weber',  'marcus@re.local',  'businessanalyst', '$2a$10$j4yX3EraAux.LxDMEQpEOO7XGUHSs30.oal3HHUQtLveqSxT9TQ/.', '[]', '[]'),
  ('u4', 'Tobias Kern',   'tobias@re.local',  'projectmanager',  '$2a$10$j4yX3EraAux.LxDMEQpEOO7XGUHSs30.oal3HHUQtLveqSxT9TQ/.', '[]', '[]'),
  ('u5', 'Laura Schmidt', 'laura@re.local',   'developer',       '$2a$10$j4yX3EraAux.LxDMEQpEOO7XGUHSs30.oal3HHUQtLveqSxT9TQ/.', '[]', '["Backend","API"]')
ON CONFLICT (id) DO NOTHING;

-- System wird über Onboarding-Wizard angelegt
