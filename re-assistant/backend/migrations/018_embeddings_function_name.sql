-- 018_embeddings_function_name.sql
-- Funktionsname pro Chunk für bessere Code-Navigation
ALTER TABLE embeddings ADD COLUMN IF NOT EXISTS function_name TEXT;
CREATE INDEX IF NOT EXISTS idx_embeddings_function_name ON embeddings(system_id, function_name) WHERE function_name IS NOT NULL;
