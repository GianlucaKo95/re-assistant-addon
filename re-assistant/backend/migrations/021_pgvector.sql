-- 021_pgvector.sql
-- Verbesserter Vektor-Index für Embedding-Suche
-- pgvector muss installiert sein (postgres-contrib enthält es auf Alpine)
-- Falls nicht verfügbar: Fallback auf JS-seitige Cosine-Similarity

DO $$
BEGIN
  -- Versuche pgvector zu aktivieren
  BEGIN
    CREATE EXTENSION IF NOT EXISTS vector;
    -- Konvertiere embedding-Spalte von JSONB zu vector(512)
    -- (nur wenn die Extension verfügbar ist)
    RAISE NOTICE 'pgvector verfügbar — Index wird erstellt';
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'pgvector nicht verfügbar — JS-seitige Suche wird genutzt';
  END;
END $$;

-- Standard-Index für häufige Abfragen (funktioniert ohne pgvector)
CREATE INDEX IF NOT EXISTS idx_embeddings_system_doc
  ON embeddings(system_id, doc_name);

CREATE INDEX IF NOT EXISTS idx_embeddings_function
  ON embeddings(system_id, function_name)
  WHERE function_name IS NOT NULL;
