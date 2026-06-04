-- RE-Assistent v4.2 — Token-Tracking + Feature-Budgets
-- Migration 004

-- ── Token-Verbrauch ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS token_usage (
  id              SERIAL      PRIMARY KEY,
  user_id         TEXT        REFERENCES users(id) ON DELETE SET NULL,
  system_id       TEXT        REFERENCES systems(id) ON DELETE SET NULL,
  feature         TEXT        NOT NULL,  -- 'chat','qs','ac','source','backlog','sprint','dna',...
  model           TEXT        NOT NULL DEFAULT 'claude-sonnet-4',
  input_tokens    INTEGER     NOT NULL DEFAULT 0,
  output_tokens   INTEGER     NOT NULL DEFAULT 0,
  cost_usd        NUMERIC(10,6) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tu_user    ON token_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_tu_system  ON token_usage(system_id);
CREATE INDEX IF NOT EXISTS idx_tu_feature ON token_usage(feature);
CREATE INDEX IF NOT EXISTS idx_tu_time    ON token_usage(created_at DESC);
-- Monatliche Aggregation via created_at (DATE_TRUNC is STABLE, not allowed in index expressions)
CREATE INDEX IF NOT EXISTS idx_tu_month   ON token_usage(created_at);

-- ── Feature-Budgets ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feature_budgets (
  feature         TEXT        PRIMARY KEY,
  enabled         BOOLEAN     NOT NULL DEFAULT TRUE,
  monthly_limit_usd NUMERIC(8,2),     -- NULL = kein Limit
  alert_threshold   NUMERIC(3,2) NOT NULL DEFAULT 0.80,  -- Warnung bei 80%
  description     TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Standard-Features mit Beschreibungen
INSERT INTO feature_budgets (feature, enabled, monthly_limit_usd, description) VALUES
  ('chat',          TRUE,  NULL,  'Business Chat & Prozess-Analyse'),
  ('qs',            TRUE,  NULL,  'ISO 29148 Qualitätssicherung'),
  ('ac',            TRUE,  NULL,  'Akzeptanzkriterien-Generator'),
  ('source',        TRUE,  NULL,  'Source-Code-Analyse'),
  ('backlog',       TRUE,  NULL,  'Backlog-Generierung'),
  ('sprint',        TRUE,  NULL,  'Sprint-Planung'),
  ('dna',           TRUE,  NULL,  'Anforderungs-DNA Berechnung'),
  ('decomposition', TRUE,  NULL,  'Anforderungs-Dekomposition'),
  ('consistency',   TRUE,  NULL,  'Konsistenzprüfung'),
  ('completeness',  TRUE,  NULL,  'Vollständigkeitsprüfung'),
  ('diagrams',      TRUE,  NULL,  'BPMN-Diagramme'),
  ('workshop',      TRUE,  NULL,  'Workshop-Strukturierung'),
  ('changelog',     TRUE,  NULL,  'Changelog-Generierung'),
  ('nlquery',       TRUE,  NULL,  'Natürlichsprachliche Abfragen'),
  ('import',        TRUE,  NULL,  'KI-gestützter Import'),
  ('other',         TRUE,  NULL,  'Sonstige KI-Aufrufe')
ON CONFLICT (feature) DO NOTHING;

-- Monatliche Budget-Übersicht (View für schnelle Abfragen)
CREATE OR REPLACE VIEW token_usage_monthly AS
SELECT
  DATE_TRUNC('month', created_at)  AS month,
  feature,
  user_id,
  system_id,
  SUM(input_tokens)                AS total_input,
  SUM(output_tokens)               AS total_output,
  SUM(input_tokens + output_tokens) AS total_tokens,
  SUM(cost_usd)                    AS total_cost_usd,
  COUNT(*)                         AS request_count
FROM token_usage
GROUP BY DATE_TRUNC('month', created_at), feature, user_id, system_id;
