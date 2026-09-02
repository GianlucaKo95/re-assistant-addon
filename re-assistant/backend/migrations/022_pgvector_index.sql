-- 022_pgvector_index.sql
-- Baut auf 021_pgvector.sql auf: legt jetzt tatsächlich eine echte
-- vector(512)-Spalte + HNSW-Index für Cosine-Similarity an, sofern die
-- pgvector-Extension verfügbar ist (der Alpine-Build installiert
-- postgresql-pgvector; externe/verwaltete Postgres-Instanzen ohne die
-- Extension bleiben unangetastet und laufen weiter über die
-- JS-seitige Suche).
--
-- Die bestehende JSONB-Spalte "embedding" bleibt als Fallback erhalten
-- und wird parallel weitergeschrieben — kein Breaking Change.

DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS vector;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'pgvector nicht verfügbar — JS-seitige Suche bleibt aktiv';
  END;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    ALTER TABLE embeddings ADD COLUMN IF NOT EXISTS embedding_vec vector(512);

    -- Bestehende Zeilen best-effort aus der JSONB-Spalte befüllen,
    -- damit ältere Dokumente nicht erst neu indexiert werden müssen,
    -- um an der ANN-Suche teilzunehmen.
    UPDATE embeddings
    SET embedding_vec = (
      SELECT ('[' || string_agg(value::text, ',') || ']')::vector
      FROM jsonb_array_elements_text(embedding) AS value
    )
    WHERE embedding_vec IS NULL
      AND jsonb_typeof(embedding) = 'array'
      AND jsonb_array_length(embedding) = 512;

    CREATE INDEX IF NOT EXISTS idx_embeddings_vec_cosine
      ON embeddings USING hnsw (embedding_vec vector_cosine_ops);
  END IF;
END $$;
