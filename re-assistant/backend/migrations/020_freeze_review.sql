-- 020_freeze_review.sql
-- Freeze-Felder für Anforderungen + reviewed_at

ALTER TABLE requirements ADD COLUMN IF NOT EXISTS frozen          BOOLEAN     NOT NULL DEFAULT FALSE;
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS frozen_at       TIMESTAMPTZ;
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS frozen_by       TEXT;
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS frozen_by_name  TEXT;
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS reviewed_at     TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_req_frozen ON requirements(frozen) WHERE frozen = TRUE;
CREATE INDEX IF NOT EXISTS idx_req_review_status ON requirements(review_status, system_id);
