'use strict';
/**
 * db.js — PostgreSQL Datenbankschicht v4.0
 * Ersetzt better-sqlite3 durch pg (node-postgres).
 * Alle Operationen sind async/await.
 */
const { Pool } = require('pg');

// ── Connection Pool ───────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL ||
    `postgresql://${process.env.PGUSER||'reassistant'}:${process.env.PGPASSWORD||'repassword'}@${process.env.PGHOST||'localhost'}:${process.env.PGPORT||5432}/${process.env.PGDATABASE||'reassistant'}`,
  ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : false,
  max:                     20,
  idleTimeoutMillis:       30000,
  connectionTimeoutMillis: 10000,
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
    isoIssues:     row.iso_issues    || [],
    reviewStatus:  row.review_status,
    reviewComment: row.review_comment,
    reviewedBy:    row.reviewed_by,
    reviewedByName:row.reviewed_by_name,
    reviewedAt:    ts(row.reviewed_at),
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

module.exports = { pool, query, queryOne, queryAll, withRetry, withTransaction, mapUser, mapSystem, mapReq, mapGeneric, healthCheck };
