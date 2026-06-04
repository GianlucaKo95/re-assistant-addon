-- RE-Assistent v4.1 — Anforderungs-DNA Schema
-- Migration 003: Semantic DNA + Genealogy Graph

-- ── Requirement DNA ───────────────────────────────────────────
-- Jede Anforderung bekommt einen semantischen Fingerabdruck
CREATE TABLE IF NOT EXISTS requirement_dna (
  req_id          TEXT        PRIMARY KEY REFERENCES requirements(id) ON DELETE CASCADE,
  -- 128-dim semantischer Vektor (TF-IDF + strukturelle Features)
  vector          JSONB       NOT NULL DEFAULT '[]',
  -- Kompakte Signatur für schnellen Vergleich
  signature       TEXT        NOT NULL DEFAULT '',
  -- Strukturelle Merkmale
  features        JSONB       NOT NULL DEFAULT '{}',
  -- Drift-Tracking: Vergleich mit vorheriger Version
  prev_vector     JSONB,
  drift_score     NUMERIC(5,4) DEFAULT 0,   -- 0=kein Drift, 1=komplett anders
  drift_type      TEXT,                      -- 'refinement'|'scope_change'|'rewrite'|'none'
  drift_detected_at TIMESTAMPTZ,
  -- Qualitäts-Fingerabdruck
  quality_dna     JSONB       NOT NULL DEFAULT '{}',
  -- Wann zuletzt berechnet
  computed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dna_drift ON requirement_dna(drift_score DESC) WHERE drift_score > 0.3;
CREATE INDEX IF NOT EXISTS idx_dna_computed ON requirement_dna(computed_at DESC);

-- ── Genealogy Graph ───────────────────────────────────────────
-- Gerichteter Graph: source_req → target_req mit Beziehungstyp
CREATE TABLE IF NOT EXISTS genealogy (
  id              SERIAL      PRIMARY KEY,
  source_req_id   TEXT        NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
  target_req_id   TEXT        NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
  relation_type   TEXT        NOT NULL
                              CHECK (relation_type IN (
                                'decomposes_to',    -- Epic → User Story
                                'derives_from',     -- User Story ← Business Req
                                'implements',       -- Code ← Requirement
                                'tests',            -- Test Case ← Requirement
                                'conflicts_with',   -- Widerspruch
                                'duplicates',       -- Semantisches Duplikat
                                'refines',          -- Verbesserte Version
                                'relates_to'        -- Allgemeine Verwandtschaft
                              )),
  confidence      NUMERIC(4,3) NOT NULL DEFAULT 1.0,  -- 0-1 Konfidenz der KI
  auto_detected   BOOLEAN      NOT NULL DEFAULT FALSE, -- KI vs. manuell
  metadata        JSONB        NOT NULL DEFAULT '{}',
  created_by      TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (source_req_id, target_req_id, relation_type)
);

CREATE INDEX IF NOT EXISTS idx_gen_source ON genealogy(source_req_id);
CREATE INDEX IF NOT EXISTS idx_gen_target ON genealogy(target_req_id);
CREATE INDEX IF NOT EXISTS idx_gen_type   ON genealogy(relation_type);

-- ── Similarity Cache ──────────────────────────────────────────
-- Vorberechnete Ähnlichkeiten für das Netzwerk-View
CREATE TABLE IF NOT EXISTS req_similarities (
  req_id_a        TEXT        NOT NULL,
  req_id_b        TEXT        NOT NULL,
  similarity      NUMERIC(5,4) NOT NULL,
  cross_system    BOOLEAN      NOT NULL DEFAULT FALSE,
  computed_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (req_id_a, req_id_b),
  CHECK (req_id_a < req_id_b)  -- Nur eine Richtung speichern
);

CREATE INDEX IF NOT EXISTS idx_sim_a    ON req_similarities(req_id_a);
CREATE INDEX IF NOT EXISTS idx_sim_b    ON req_similarities(req_id_b);
CREATE INDEX IF NOT EXISTS idx_sim_val  ON req_similarities(similarity DESC);
CREATE INDEX IF NOT EXISTS idx_sim_cross ON req_similarities(cross_system) WHERE cross_system=TRUE;

-- ── DNA Job Queue ─────────────────────────────────────────────
-- Anforderungen die auf DNA-Berechnung warten
CREATE TABLE IF NOT EXISTS dna_queue (
  req_id      TEXT        PRIMARY KEY,
  priority    INTEGER     NOT NULL DEFAULT 5,  -- 1=hoch, 10=niedrig
  queued_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at  TIMESTAMPTZ,
  error       TEXT
);
