-- RE-Assistent v4.1 — Migration 005: License Key System

CREATE TABLE IF NOT EXISTS license_info (
  id            TEXT        PRIMARY KEY DEFAULT 'singleton',
  license_key   TEXT,
  customer      TEXT,
  fingerprint   TEXT,
  expires_at    TIMESTAMPTZ,
  seats         INTEGER     DEFAULT 1,
  status        TEXT        NOT NULL DEFAULT 'unlicensed',
  grace_until   TIMESTAMPTZ,
  last_checked  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO license_info (id, status) VALUES ('singleton', 'unlicensed')
  ON CONFLICT (id) DO NOTHING;
