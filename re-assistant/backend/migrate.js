'use strict';
/**
 * migrate.js — PostgreSQL Migrations-Runner
 * Führt alle SQL-Dateien in /migrations/ in sortierter Reihenfolge aus.
 * Merkt sich ausgeführte Migrationen in der Tabelle _migrations.
 * Idempotent: bereits ausgeführte Migrationen werden übersprungen.
 */
const { Pool } = require('pg');
const fs       = require('fs');
const path     = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ||
    `postgresql://${process.env.PGUSER||'reassistant'}:${process.env.PGPASSWORD||'repassword'}@${process.env.PGHOST||'localhost'}:${process.env.PGPORT||5432}/${process.env.PGDATABASE||'reassistant'}`,
  ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 30000,
});

async function migrate() {
  const client = await pool.connect();
  try {
    // Migrations-Tracking-Tabelle erstellen
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id         SERIAL      PRIMARY KEY,
        filename   TEXT        NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Bereits ausgeführte Migrationen
    const { rows: done } = await client.query('SELECT filename FROM _migrations ORDER BY filename');
    const applied = new Set(done.map(r => r.filename));

    // Migrations-Dateien einlesen und sortieren
    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    let count = 0;
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`[MIGRATE] ✓ bereits angewendet: ${file}`);
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      console.log(`[MIGRATE] ⚡ Führe aus: ${file}`);

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        count++;
        console.log(`[MIGRATE] ✅ Erfolgreich: ${file}`);
      } catch(e) {
        await client.query('ROLLBACK');
        console.error(`[MIGRATE] ❌ Fehler in ${file}:`, e.message);
        throw e;
      }
    }

    if (count === 0) console.log('[MIGRATE] Keine neuen Migrationen.');
    else console.log(`[MIGRATE] ${count} Migration(en) angewendet.`);

  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(e => {
  console.error('[MIGRATE] Fatal:', e.message);
  process.exit(1);
});
