'use strict';
/**
 * db.js — PostgreSQL Datenbankschicht v4.0
 * Ersetzt better-sqlite3 durch pg (node-postgres).
 * Alle Operationen sind async/await.
 */
const { Pool } = require('pg');

// ── Connection Pool ───────────────────────────────────────────
// SSL automatisch für externe DBs
const dbUrl = process.env.DATABASE_URL ||
  `postgresql://${process.env.PGUSER||'reassistant'}:${process.env.PGPASSWORD||'repassword'}@${process.env.PGHOST||'localhost'}:${process.env.PGPORT||5432}/${process.env.PGDATABASE||'reassistant'}`;

const isExternal = !!(process.env.DATABASE_URL);
const needsSSL   = isExternal && (
  process.env.PGSSLMODE === 'require' ||
  /supabase|render\.com|railway\.app|neon\.tech|heroku/.test(dbUrl)
);

const maskedDbUrl = dbUrl.replace(/:[^:@]*@/, ':***@');

if (isExternal) {
  console.log('[DB] Externer Modus:', maskedDbUrl);
} else {
  console.log('[DB] Interner Modus: lokale PostgreSQL');
}

const pool = new Pool({
  connectionString: dbUrl,
  ssl: needsSSL ? { rejectUnauthorized: false } : false,
  max:                     20,
  idleTimeoutMillis:       30000,
  connectionTimeoutMillis: 15000,
  statement_timeout:       30000,
});

pool.on('error', (err) => {
  console.error('[DB] Pool-Fehler:', err.message);
});

// ── Retry-Wrapper ─────────────────────────────────────────────
async function withRetry(fn, maxRetries = 3, baseDelayMs = 100) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch(err) {
      lastError = err;
      const retryable = ['40001','40P01','53300','08006','08001'].includes(err.code);
      if (!retryable || attempt === maxRetries) throw err;
      const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 50;
      console.warn(`[DB] Retry ${attempt+1}/${maxRetries} nach ${err.code} (${Math.round(delay)}ms)`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastError;
}

// ── Transaktion ───────────────────────────────────────────────
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch(e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ── Query-Helfer ──────────────────────────────────────────────
async function query(sql, params = []) {
  return withRetry(() => pool.query(sql, params));
}
async function queryOne(sql, params = []) {
  const { rows } = await query(sql, params);
  return rows[0] || null;
}
async function queryAll(sql, params = []) {
  const { rows } = await query(sql, params);
  return rows;
}

// ── Row-Mapper ────────────────────────────────────────────────
function ts(v) { return v instanceof Date ? v.getTime() : (v ? Number(v) : null); }

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id, name: row.name, email: row.email, role: row.role,
    password:      row.password,
    systems:       row.systems       || [],
    subcategories: row.subcategories || [],
    apiKey:        row.api_key || null,
    createdAt: ts(row.created_at), updatedAt: ts(row.updated_at),
  };
}

function mapSystem(row) {
  if (!row) return null;
  return {
    id: row.id, name: row.name, description: row.description,
    docs:      row.docs      || [],
    idPrefix:  row.id_prefix  || 'REQ',
    idCounter: row.id_counter || 0,
    createdAt: ts(row.created_at), updatedAt: ts(row.updated_at),
  };
}

function mapReq(row) {
  if (!row) return null;
  return {
    id: row.id, systemId: row.system_id, title: row.title,
    description: row.description, category: row.category,
    priority: row.priority, status: row.status, rationale: row.rationale,
    tags:               row.tags               || [],
    comments:           row.comments           || [],
    history:            row.history            || [],
    acceptanceCriteria: row.acceptance_criteria|| [],
    qualityScore:  row.quality_score != null ? parseFloat(row.quality_score) : null,
    quality_score: row.quality_score != null ? parseFloat(row.quality_score) : null, // Alias: viele bestehende Aufrufer lesen den snake_case-Namen
    isoIssues:     row.iso_issues    || [],
    isoCategory:        row.iso_category        || '',
    iso_category:       row.iso_category        || '',
    riskLevel:          row.risk_level           || '',
    risk_level:         row.risk_level           || '',
    businessValue:      row.business_value       || 0,
    business_value:     row.business_value       || 0,
    verificationMethod: row.verification_method  || '',
    verification_method:row.verification_method  || '',
    complexity:          row.complexity           || '',
    reviewStatus:  row.review_status,
    reviewComment: row.review_comment,
    reviewedBy:    row.reviewed_by,
    reviewedByName:row.reviewed_by_name,
    reviewedAt:    ts(row.reviewed_at),
    frozen:        row.frozen        || false,
    frozenAt:      ts(row.frozen_at),
    frozenBy:      row.frozen_by,
    frozenByName:  row.frozen_by_name,
    acceptanceCriteriaText: row.acceptance_criteria_text || '',
    acceptance_criteria_text: row.acceptance_criteria_text || '', // Alias: viele bestehende Aufrufer lesen den snake_case-Namen
    assignedTo:    row.assigned_to,
    subcategory:   row.subcategory,
    sourceAnalysis:  row.source_analysis || null,
    sourceSuggestion:row.source_suggestion,
    lastChangedBy: row.last_changed_by,
    createdBy:     row.created_by,
    createdByName: row.created_by_name,
    importedAt:    ts(row.imported_at),
    archived:      row.archived   || false,
    archivedAt:    ts(row.archived_at),
    archivedBy:    row.archived_by,
    decomposed:    row.decomposed || false,
    decomposedInto:row.decomposed_into,
    createdAt: ts(row.created_at), updatedAt: ts(row.updated_at),
  };
}

function mapGeneric(row) {
  if (!row) return null;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    out[camel] = v instanceof Date ? v.getTime() : v;
  }
  return out;
}

async function healthCheck() {
  try {
    await query('SELECT 1');
    return { ok: true, pool: { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount } };
  } catch(e) { return { ok: false, error: e.message }; }
}

// ── pgvector-Verfügbarkeit ────────────────────────────────────
// Wird einmal geprüft und gecacht (Extension ändert sich nicht zur
// Laufzeit) — entscheidet, ob Embedding-Suche über einen echten
// HNSW-Index läuft oder auf den JS-seitigen Scan zurückfällt.
let _pgvectorCache = null;
async function pgvectorEnabled() {
  if (_pgvectorCache !== null) return _pgvectorCache;
  try {
    // Prüft Extension UND Spalte — falls die Migration nur teilweise
    // durchlief (z.B. Transaktion mit Fehler in der Backfill-UPDATE
    // zurückgerollt), darf "verfügbar" nicht fälschlich true sein, sonst
    // referenziert jedes INSERT eine nicht existierende Spalte.
    const row = await queryOne(
      `SELECT 1 FROM pg_extension e
       WHERE e.extname = 'vector'
         AND EXISTS (
           SELECT 1 FROM information_schema.columns c
           WHERE c.table_name = 'embeddings' AND c.column_name = 'embedding_vec'
         )`
    );
    _pgvectorCache = !!row;
  } catch(e) {
    _pgvectorCache = false;
  }
  return _pgvectorCache;
}

// Formt einen JS-Zahlen-Array in ein pgvector-Textliteral ("[0.1,0.2,...]")
// — der reine "pg"-Treiber kennt den vector-Typ nicht nativ, pgvector
// akzeptiert diese Textform aber direkt per ::vector-Cast.
function toVectorLiteral(vec) {
  if (!Array.isArray(vec) || !vec.length) return null;
  return '[' + vec.join(',') + ']';
}

module.exports = { pool, query, queryOne, queryAll, withRetry, withTransaction, mapUser, mapSystem, mapReq, mapGeneric, healthCheck, pgvectorEnabled, toVectorLiteral, isExternal, maskedDbUrl };
