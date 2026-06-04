-- RE-Assistent v4.0 — Seed Data
-- Migration 002: Demo-Benutzer und erstes System
-- Passwörter sind bcrypt-Hashes (admin123 / test123)

INSERT INTO users (id, name, email, role, password, systems, subcategories)
VALUES
  ('u1', 'Admin',         'admin@re.local',   'admin',           '$2a$10$XM0i50xvfJ7EqC9QMpgdB.Yl0CwN5M1mhBblIVfWCQ9ggxVR5kZCS', '[]', '[]'),
  ('u2', 'Anna Müller',   'anna@re.local',    'business',        '$2a$10$E6SX4uXbNKBj1WNYEXleJeGpakIrQ9nDJrQJVE.VvG.D1tALBgSga', '[]', '[]'),
  ('u3', 'Marcus Weber',  'marcus@re.local',  'businessanalyst', '$2a$10$E6SX4uXbNKBj1WNYEXleJeGpakIrQ9nDJrQJVE.VvG.D1tALBgSga', '["sys1"]', '[]'),
  ('u4', 'Tobias Kern',   'tobias@re.local',  'projectmanager',  '$2a$10$E6SX4uXbNKBj1WNYEXleJeGpakIrQ9nDJrQJVE.VvG.D1tALBgSga', '["sys1"]', '[]'),
  ('u5', 'Laura Schmidt', 'laura@re.local',   'developer',       '$2a$10$E6SX4uXbNKBj1WNYEXleJeGpakIrQ9nDJrQJVE.VvG.D1tALBgSga', '["sys1"]', '["Backend","API"]')
ON CONFLICT (id) DO NOTHING;

INSERT INTO systems (id, name, description, id_prefix)
VALUES ('sys1', 'Erstes System', 'Dokumentation hochladen und loslegen.', 'REQ')
ON CONFLICT (id) DO NOTHING;
