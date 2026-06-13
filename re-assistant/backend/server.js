'use strict';
const express  = require('express');
const session  = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const cors     = require('cors');
const fs       = require('fs-extra');
const path     = require('path');
const fetch    = require('node-fetch');
const multer   = require('multer');
const bcrypt   = require('bcryptjs');
const crypto   = require('crypto');
const http     = require('http');

const { pool, query, queryOne, queryAll, withTransaction, mapUser, mapSystem, mapReq, mapGeneric, healthCheck } = require('./db');
const dna     = require('./dna');
const tracker = require('./token-tracker');
const notif = require('./notifications');
const ws    = require('./websocket');

const app      = express();
const PORT     = parseInt(process.env.NODE_PORT || process.env.PORT || '3001');
const DATA_DIR = process.env.DATA_DIR || '/data/re-assistant';
fs.ensureDirSync(DATA_DIR);

// ── Logging ───────────────────────────────────────────────────
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const LEVELS    = { trace:0, debug:1, info:2, notice:3, warning:4, error:5, fatal:6 };
function log(level, msg) {
  if ((LEVELS[level]||2) >= (LEVELS[LOG_LEVEL]||2))
    console.log(`[${new Date().toISOString()}] [${level.toUpperCase()}] ${msg}`);
}

// ── Middleware ────────────────────────────────────────────────
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const sessionMiddleware = session({
  store:  new PgSession({ pool, tableName: 'session', createTableIfMissing: false }),
  secret: process.env.SESSION_SECRET || 're-assistant-secret-changeme-in-production',
  resave: false, saveUninitialized: false,
  cookie: { secure: false, httpOnly: true, sameSite: 'lax', maxAge: 8*60*60*1000 },
});
app.use(sessionMiddleware);
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// ── Auth-Middleware ───────────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.session?.userId) return next();
  res.status(401).json({ error: 'Nicht authentifiziert' });
}
async function requireAdmin(req, res, next) {
  const u = mapUser(await queryOne('SELECT * FROM users WHERE id=$1', [req.session?.userId]));
  if (u?.role === 'admin') return next();
  res.status(403).json({ error: 'Nur für Administratoren' });
}

// ── API-Key Resolver ──────────────────────────────────────────
async function resolveApiConfig(userId) {
  const mode = (await queryOne("SELECT value FROM app_settings WHERE key='api_key_mode'"))?.value || 'global';

  // Per-User Modus
  if (mode === 'per_user' && userId) {
    const user = await queryOne('SELECT api_key, ai_provider FROM users WHERE id=$1', [userId]);
    if (user?.api_key) {
      return { key: user.api_key, provider: user.ai_provider || 'anthropic' };
    }
  }

  // Globaler Modus
  const globalProv   = (await queryOne("SELECT value FROM app_settings WHERE key='global_ai_provider'"))?.value || 'anthropic';
  const globalGrok   = (await queryOne("SELECT value FROM app_settings WHERE key='global_grok_api_key'"))?.value;
  const globalAnth   = process.env.ANTHROPIC_API_KEY || (await queryOne("SELECT value FROM app_settings WHERE key='global_api_key'"))?.value;

  const globalGroq = (await queryOne("SELECT value FROM app_settings WHERE key='global_groq_api_key'"))?.value;

  if (globalProv === 'grok'  && globalGrok) return { key: globalGrok, provider: 'grok' };
  if (globalProv === 'groq'  && globalGroq) return { key: globalGroq, provider: 'groq' };
  if (globalAnth) return { key: globalAnth, provider: 'anthropic' };
  return { key: null, provider: 'anthropic' };
}

// Rückwärtskompatibel
async function resolveApiKey(userId) {
  const cfg = await resolveApiConfig(userId);
  return cfg.key;
}


// ── writeAuditLog Hilfsfunktion ───────────────────────────────
async function writeAuditLog({ eventType, action, entityType, entityId, entityName,
  systemId, userId, userName, details, ipAddress }) {
  try {
    await query(
      `INSERT INTO audit_log (event_type,entity_type,entity_id,entity_name,system_id,
        action,user_id,user_name,details,ip_address)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [eventType||'action', entityType||null, entityId||null, entityName||null,
       systemId||null, action||'update', userId||null, userName||null,
       JSON.stringify(details||{}), ipAddress||null]
    );
  } catch(e) {
    // Audit-Log-Fehler nie crashen lassen
    console.warn('[AUDIT] Fehler:', e.message);
  }
}


// ── trackReqChanges ───────────────────────────────────────────
async function trackReqChanges(oldReq, newReq, userId, userName) {
  if (!oldReq || !newReq) return;
  const tracked = ['title','description','priority','status','category',
    'rationale','due_date','story_points'];
  for (const field of tracked) {
    const oldVal = String(oldReq[field] ?? '');
    const newVal = String(newReq[field] ?? '');
    if (oldVal !== newVal) {
      await query(
        'INSERT INTO req_history (req_id,user_id,user_name,field,old_value,new_value) VALUES ($1,$2,$3,$4,$5,$6)',
        [newReq.id, userId, userName, field, oldVal||null, newVal||null]
      ).catch(() => {});
    }
  }
}

// ── AUTH ──────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const row  = await queryOne('SELECT * FROM users WHERE email=$1', [email]);
    const user = mapUser(row);
    if (!user || !bcrypt.compareSync(password, user.password)) {
      log('warning', `Login fehlgeschlagen: ${email}`);
      return res.status(401).json({ error: 'E-Mail oder Passwort falsch.' });
    }
    req.session.userId = user.id;
    log('info', `Login: ${user.name} (${user.role})`);
    const { password: _p, ...safe } = user;
    res.json({ ok: true, user: safe });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/logout', (req, res) => { req.session.destroy(); res.json({ ok: true }); });

app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const user = mapUser(await queryOne('SELECT * FROM users WHERE id=$1', [req.session.userId]));
    if (!user) return res.status(401).json({ error: 'Session ungültig' });
    const { password: _p, ...safe } = user;
    res.json(safe);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/change-password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) return res.status(400).json({ error: 'Min. 8 Zeichen' });
    const user = mapUser(await queryOne('SELECT * FROM users WHERE id=$1', [req.session.userId]));
    if (!user || !bcrypt.compareSync(currentPassword, user.password))
      return res.status(401).json({ error: 'Aktuelles Passwort falsch' });
    await query('UPDATE users SET password=$1 WHERE id=$2', [bcrypt.hashSync(newPassword, 10), user.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── PASSWORT-RESET ────────────────────────────────────────────
const _resetTokens = new Map();

app.post('/api/auth/request-reset', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await queryOne('SELECT id,name,email FROM users WHERE email=$1', [email]);
    if (!user) return res.json({ ok: true });
    const token    = crypto.randomBytes(32).toString('hex');
    const expires  = Date.now() + 60 * 60 * 1000;
    _resetTokens.set(token, { userId: user.id, email: user.email, expires });
    for (const [t, d] of _resetTokens.entries()) if (d.expires < Date.now()) _resetTokens.delete(t);
    const resetUrl = `${req.headers.origin || 'http://localhost:3000'}/#reset-password?token=${token}`;
    log('info', `Reset-Token für: ${user.email}`);
    res.json({ ok: true, token, resetUrl, emailSent: false });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/auth/reset-token/:token', (req, res) => {
  const data = _resetTokens.get(req.params.token);
  if (!data || data.expires < Date.now()) { _resetTokens.delete(req.params.token); return res.status(400).json({ error: 'Token ungültig' }); }
  res.json({ ok: true, email: data.email });
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword || newPassword.length < 8) return res.status(400).json({ error: 'Ungültige Eingabe' });
    const data = _resetTokens.get(token);
    if (!data || data.expires < Date.now()) { _resetTokens.delete(token); return res.status(400).json({ error: 'Token ungültig' }); }
    await query('UPDATE users SET password=$1 WHERE id=$2', [bcrypt.hashSync(newPassword, 10), data.userId]);
    _resetTokens.delete(token);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/admin-reset/:userId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const user = await queryOne('SELECT id,name,email FROM users WHERE id=$1', [req.params.userId]);
    if (!user) return res.status(404).json({ error: 'User nicht gefunden' });
    const token   = crypto.randomBytes(32).toString('hex');
    _resetTokens.set(token, { userId: user.id, email: user.email, expires: Date.now() + 60*60*1000 });
    const resetUrl = `${req.headers.origin || 'http://localhost:3000'}/#reset-password?token=${token}`;
    res.json({ ok: true, token, resetUrl, expiresIn: '1 Stunde' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── USERS ─────────────────────────────────────────────────────
app.get('/api/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const users = (await queryAll('SELECT * FROM users ORDER BY created_at')).map(mapUser).map(({password:_p,...u})=>u);
    res.json(users);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const u = req.body;
    if (u.clearApiKey) {
      await query('UPDATE users SET api_key=NULL WHERE id=$1', [u.id]);
      return res.json({ ok: true });
    }
    const existing = await queryOne('SELECT id FROM users WHERE id=$1', [u.id]);
    if (existing) {
      const fields = ['name=$2','email=$3','role=$4','systems=$5','subcategories=$6'];
      const vals   = [u.id, u.name, u.email, u.role||'business', JSON.stringify(u.systems||[]), JSON.stringify(u.subcategories||[])];
      if (u.password) { fields.push(`password=$${vals.length+1}`); vals.push(bcrypt.hashSync(u.password,10)); }
      await query(`UPDATE users SET ${fields.join(',')} WHERE id=$1`, vals);
    } else {
      const pw = bcrypt.hashSync(u.password || 'changeme', 10);
      await query('INSERT INTO users (id,name,email,role,password,systems,subcategories) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [u.id||crypto.randomUUID(), u.name, u.email, u.role||'business', pw, JSON.stringify(u.systems||[]), JSON.stringify(u.subcategories||[])]);
    }
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/users/:id', requireAuth, requireAdmin, async (req, res) => {
  try { await query('DELETE FROM users WHERE id=$1', [req.params.id]); res.json({ ok: true }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

// ── SYSTEMS ───────────────────────────────────────────────────
app.get('/api/systems', requireAuth, async (req, res) => {
  try { res.json((await queryAll('SELECT * FROM systems ORDER BY created_at')).map(mapSystem)); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/systems', requireAuth, async (req, res) => {
  try {
    const s = req.body;
    const existing = s.id ? await queryOne('SELECT id FROM systems WHERE id=$1', [s.id]) : null;
    if (existing) {
      await query('UPDATE systems SET name=$1,description=$2,docs=$3,id_prefix=$4 WHERE id=$5',
        [s.name, s.description||'', JSON.stringify(s.docs||[]), s.idPrefix||'REQ', s.id]);
    } else {
      await query('INSERT INTO systems (id,name,description,docs,id_prefix) VALUES ($1,$2,$3,$4,$5)',
        [s.id||crypto.randomUUID(), s.name, s.description||'', JSON.stringify(s.docs||[]), s.idPrefix||'REQ']);
    }
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/systems/:id', requireAuth, async (req, res) => {
  try {
    await withTransaction(async (client) => {
      await client.query('DELETE FROM requirements WHERE system_id=$1', [req.params.id]);
      await client.query('DELETE FROM systems WHERE id=$1', [req.params.id]);
    });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ID-Schema
app.get('/api/systems/:id/next-id', requireAuth, async (req, res) => {
  try {
    const row = await queryOne('UPDATE systems SET id_counter=id_counter+1 WHERE id=$1 RETURNING id_prefix,id_counter', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'System nicht gefunden' });
    res.json({ id: `${row.id_prefix}-${String(row.id_counter).padStart(3,'0')}`, prefix: row.id_prefix, counter: row.id_counter });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/systems/:id/id-schema', requireAuth, async (req, res) => {
  try {
    const { prefix } = req.body;
    if (!prefix || !/^[A-Z0-9_-]{1,10}$/.test(prefix)) return res.status(400).json({ error: 'Ungültiger Präfix' });
    await query('UPDATE systems SET id_prefix=$1 WHERE id=$2', [prefix, req.params.id]);
    res.json({ ok: true, prefix });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Dokument-Upload
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10*1024*1024 } });
app.post('/api/systems/:id/docs', requireAuth, upload.array('files'), async (req, res) => {
  try {
    const sys = mapSystem(await queryOne('SELECT * FROM systems WHERE id=$1', [req.params.id]));
    if (!sys) return res.status(404).json({ error: 'System nicht gefunden' });
    const docs  = sys.docs || [];
    const added = [];
    const indexed = [];

    for (const file of (req.files||[])) {
      if (docs.find(d => d.name === file.originalname)) continue;

      // Text extrahieren
      let text = '';
      try {
        text = file.buffer.toString('utf-8');
        // Binäre Dateien filtern (PDFs etc.)
        text = text.replace(/[\x00-\x08\x0E-\x1F\x7F]/g, ' ');  // Steuerzeichen entfernen
      } catch(e) { text = ''; }

      const docId = 'd' + Date.now() + Math.floor(Math.random()*10000);
      const doc   = { id: docId, name: file.originalname, size: file.size, addedAt: Date.now() };
      // content NICHT in docs speichern (zu groß) — nur Metadaten
      docs.push(doc);
      added.push(doc);

      // Sofort Embeddings erstellen (RAG-Index aufbauen)
      if (text.length >= 50) {
        setImmediate(async () => {
          try {
            const chunks = chunkTextBackend(text, file.originalname);
            if (chunks.length) {
              await query('DELETE FROM embeddings WHERE doc_id=$1', [docId]);
              for (let i = 0; i < chunks.length; i++) {
                const vec = simpleTextVector(chunks[i].text);
                await query(
                  'INSERT INTO embeddings (system_id,doc_id,doc_name,chunk_index,chunk_text,embedding) VALUES ($1,$2,$3,$4,$5,$6)',
                  [req.params.id, docId, file.originalname, i, chunks[i].text, JSON.stringify(vec)]
                );
              }
              log('info', `RAG: ${file.originalname} → ${chunks.length} Chunks indexiert`);
            }
          } catch(e) { log('warning', 'RAG-Indexierung: ' + e.message); }
        });
        indexed.push(file.originalname);
      }
    }

    await query('UPDATE systems SET docs=$1 WHERE id=$2', [JSON.stringify(docs), req.params.id]);

    // Kontext-Cache asynchron aufbauen
    if (added.length > 0) {
      setImmediate(() => buildSystemContextCache(req.params.id));
    }

    res.json({ ok: true, added, indexed });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Text-Chunking im Backend
function chunkTextBackend(text, docName, chunkSize = 800, overlap = 100) {
  const sentences = text.split(/(?<=[.!?\n])\s+/);
  const chunks = [];
  let current = '';
  for (const sentence of sentences) {
    if (current.length + sentence.length > chunkSize && current.length > 0) {
      chunks.push({ text: current.trim(), docName });
      current = current.slice(-overlap) + ' ' + sentence;
    } else {
      current += (current ? ' ' : '') + sentence;
    }
  }
  if (current.trim().length > 20) chunks.push({ text: current.trim(), docName });
  return chunks;
}

app.delete('/api/systems/:sysId/docs/:docId', requireAuth, async (req, res) => {
  try {
    const sys  = mapSystem(await queryOne('SELECT * FROM systems WHERE id=$1', [req.params.sysId]));
    if (!sys) return res.status(404).json({ error: 'System nicht gefunden' });
    const docs = (sys.docs||[]).filter(d => d.id !== req.params.docId);
    await query('UPDATE systems SET docs=$1 WHERE id=$2', [JSON.stringify(docs), req.params.sysId]);
    await query('DELETE FROM embeddings WHERE doc_id=$1', [req.params.docId]);
    // Cache neu aufbauen nach Löschung
    await query("INSERT INTO system_context_cache (system_id, build_status) VALUES ($1,'outdated') ON CONFLICT (system_id) DO UPDATE SET build_status='outdated'", [req.params.sysId]).catch(() => {});
    setImmediate(() => buildSystemContextCache(req.params.sysId));
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── REQUIREMENTS ──────────────────────────────────────────────
app.get('/api/requirements', requireAuth, async (req, res) => {
  try {
    const conditions = ['1=1'];
    const params     = [];
    const addParam   = (val) => { params.push(val); return `$${params.length}`; };

    if (req.query.systemId) conditions.push(`system_id=${addParam(req.query.systemId)}`);
    if (req.query.role === 'developer' && req.query.userId)
      conditions.push(`assigned_to=${addParam(req.query.userId)}`);
    if (req.query.status)   conditions.push(`status=${addParam(req.query.status)}`);
    if (req.query.priority) conditions.push(`priority=${addParam(req.query.priority)}`);
    if (req.query.category) conditions.push(`category=${addParam(req.query.category)}`);
    if (req.query.q) {
      // PostgreSQL trigram search
      const like = `%${req.query.q}%`;
      conditions.push(`(title ILIKE ${addParam(like)} OR description ILIKE ${addParam(like)} OR id ILIKE ${addParam(like)})`);
    }
    if (req.query.archived === 'true') conditions.push('archived=TRUE');
    else conditions.push('(archived IS FALSE OR archived IS NULL)');

    const where = conditions.join(' AND ');

    // Total count
    const { rows: countRows } = await query(`SELECT COUNT(*) FROM requirements WHERE ${where}`, params);
    const total = parseInt(countRows[0].count);

    const limit  = Math.min(parseInt(req.query.limit) || 50, 200);
    const page   = parseInt(req.query.page)   || 0;
    const offset = parseInt(req.query.offset) || page * limit;

    const sortCol = ['created_at','updated_at','title','priority','quality_score'].includes(req.query.sort)
      ? req.query.sort : 'created_at';
    const sortDir = req.query.dir === 'desc' ? 'DESC' : 'ASC';

    // Abwärtskompatibilität: kein Paging → alle (bis 500)
    if (!req.query.limit && !req.query.page && !req.query.q && !req.query.priority && !req.query.category) {
      const { rows } = await query(`SELECT * FROM requirements WHERE ${where} ORDER BY created_at ASC LIMIT 500`, params);
      return res.json(rows.map(mapReq));
    }

    const { rows } = await query(
      `SELECT * FROM requirements WHERE ${where} ORDER BY ${sortCol} ${sortDir} LIMIT $${params.length+1} OFFSET $${params.length+2}`,
      [...params, limit, offset]
    );
    res.json({ data: rows.map(mapReq), total, limit, offset, page, pages: Math.ceil(total/limit) });
  } catch(e) { log('error', e.message); res.status(500).json({ error: e.message }); }
});

app.post('/api/requirements', requireAuth, async (req, res) => {
  try {
    const r   = req.body;
    const { _expectedUpdatedAt, ...clean } = r;
    const existing = clean.id ? await queryOne('SELECT * FROM requirements WHERE id=$1', [clean.id]) : null;

    if (existing) {
      // Optimistic Locking
      if (_expectedUpdatedAt && existing.updated_at) {
        const serverTs = new Date(existing.updated_at).getTime();
        if (Number(_expectedUpdatedAt) !== serverTs) {
          const changedByUser = await queryOne('SELECT name FROM users WHERE id=$1', [existing.last_changed_by]);
          return res.status(409).json({
            conflict: true, error: 'Konflikt erkannt',
            serverVersion: mapReq(existing), clientVersion: r,
            changedBy: changedByUser?.name || 'Unbekannt',
            changedAt: serverTs,
          });
        }
      }
      // History anhängen
      const hist = (existing.history || []);
      hist.push({ version: hist.length+1, title: existing.title, description: existing.description,
        priority: existing.priority, category: existing.category, changedAt: Date.now(), changedBy: req.session.userId });
      if (hist.length > 20) hist.shift();

      await query(`UPDATE requirements SET
        title=$2,description=$3,category=$4,priority=$5,status=$6,rationale=$7,
        tags=$8,comments=$9,history=$10,acceptance_criteria=$11,quality_score=$12,iso_issues=$13,
        review_status=$14,review_comment=$15,reviewed_by=$16,reviewed_by_name=$17,reviewed_at=$18,
        assigned_to=$19,subcategory=$20,source_analysis=$21,source_suggestion=$22,
        last_changed_by=$23,archived=$24,archived_at=$25,archived_by=$26,
        decomposed=$27,decomposed_into=$28
        WHERE id=$1`, [
        clean.id,
        clean.title ?? existing.title,
        clean.description ?? existing.description,
        clean.category || existing.category,
        clean.priority || existing.priority,
        clean.status   || existing.status,
        clean.rationale ?? existing.rationale,
        JSON.stringify(clean.tags    || existing.tags    || []),
        JSON.stringify(clean.comments|| existing.comments|| []),
        JSON.stringify(hist),
        JSON.stringify(clean.acceptanceCriteria || existing.acceptance_criteria || []),
        clean.qualityScore ?? existing.quality_score,
        JSON.stringify(clean.isoIssues || existing.iso_issues || []),
        clean.reviewStatus  || existing.review_status,
        clean.reviewComment ?? existing.review_comment,
        clean.reviewedBy    || existing.reviewed_by,
        clean.reviewedByName|| existing.reviewed_by_name,
        clean.reviewedAt    ? new Date(clean.reviewedAt) : existing.reviewed_at,
        clean.assignedTo    ?? existing.assigned_to,
        clean.subcategory   ?? existing.subcategory,
        clean.sourceAnalysis ? JSON.stringify(clean.sourceAnalysis) : existing.source_analysis,
        clean.sourceSuggestion ?? existing.source_suggestion,
        req.session.userId,
        clean.archived ?? existing.archived ?? false,
        clean.archivedAt ? new Date(clean.archivedAt) : existing.archived_at,
        clean.archivedBy ?? existing.archived_by,
        clean.decomposed ?? existing.decomposed ?? false,
        clean.decomposedInto ?? existing.decomposed_into,
      ]);
    } else {
      const id = clean.id || `${clean.systemId?.substring(0,4)||'REQ'}-${Date.now()}`;
      await query(`INSERT INTO requirements
        (id,system_id,title,description,category,priority,status,rationale,tags,
         comments,history,acceptance_criteria,quality_score,iso_issues,
         review_status,assigned_to,subcategory,source_analysis,source_suggestion,
         last_changed_by,created_by,created_by_name,imported_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)`, [
        id, clean.systemId||clean.system_id,
        clean.title, clean.description||'', clean.category||'Funktional',
        clean.priority||'medium', clean.status||'open', clean.rationale||'',
        JSON.stringify(clean.tags||[]), JSON.stringify(clean.comments||[]),
        '[]', JSON.stringify(clean.acceptanceCriteria||[]),
        clean.qualityScore||null, '[]',
        clean.reviewStatus||'draft', clean.assignedTo||null, clean.subcategory||null,
        clean.sourceAnalysis ? JSON.stringify(clean.sourceAnalysis) : null,
        clean.sourceSuggestion||null,
        req.session.userId, clean.createdBy||req.session.userId,
        clean.createdByName||null, clean.importedAt ? new Date(clean.importedAt) : null,
      ]);
    }

    const saved = await queryOne('SELECT updated_at FROM requirements WHERE id=$1', [clean.id||'']);
    const mapped = clean.id ? mapReq(await queryOne('SELECT * FROM requirements WHERE id=$1',[clean.id])) : null;
    if (mapped) {
      if (existing) ws.broadcastReqUpdate(mapped, req.session.userId);
      else ws.broadcastReqCreated(mapped, req.session.userId);
      // DNA in Queue einreihen (hoch-priorisiert bei neuen, normal bei Updates)
      dna.enqueueDNA(clean.id, existing ? 5 : 3).catch(() => {});
    }
    // Konflikt-Check asynchron im Hintergrund
    if (clean.id) {
      setImmediate(async () => {
        try {
          const savedReq = await queryOne('SELECT * FROM requirements WHERE id=$1', [clean.id]);
          if (!savedReq || !savedReq.system_id) return;
          const sys = await queryOne('SELECT parent_id FROM systems WHERE id=$1', [savedReq.system_id]);
          const crossSystem = !!sys?.parent_id;
          const apiCfg = await resolveApiConfig(req.session.userId);
          if (!apiCfg.key) return;

          // Vergleichs-Anforderungen
          const relIds = [savedReq.system_id];
          if (crossSystem && sys?.parent_id) {
            relIds.push(sys.parent_id);
            const siblings = (await query('SELECT id FROM systems WHERE parent_id=$1 AND id!=$2', [sys.parent_id, savedReq.system_id])).rows;
            relIds.push(...siblings.map(s => s.id));
          }
          const rows = (await query('SELECT id,title,description,system_id FROM requirements WHERE system_id = ANY($1::text[]) AND id!=$2 LIMIT 25', [relIds, savedReq.id])).rows;
          if (!rows.length) return;

          const prompt = `Analysiere Konflikte. Antworte NUR mit JSON:
{"conflicts":[{"reqId":"ID","type":"contradiction|overlap|ambiguity","severity":"high|medium|low","description":"kurz","suggestion":"Vorschlag"}]}
Falls keine: {"conflicts":[]}

Neue: [${savedReq.id}] ${savedReq.title}: ${(savedReq.description||'').substring(0,120)}
Bestehende:\n${rows.slice(0,15).map(r=>`- [${r.id}] ${r.title}: ${(r.description||'').substring(0,70)}`).join('\n')}`;

          let apiUrl, apiHeaders, apiBody;
          if (apiCfg.provider === 'grok' || apiCfg.provider === 'groq') {
            const model = apiCfg.provider === 'groq' ? 'llama-3.3-70b-versatile' : 'grok-3-mini';
            apiUrl = apiCfg.provider === 'groq' ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://api.x.ai/v1/chat/completions';
            apiHeaders = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiCfg.key };
            apiBody = { model, messages: [{ role: 'user', content: prompt }], max_tokens: 600 };
          } else {
            apiUrl = 'https://api.anthropic.com/v1/messages';
            apiHeaders = { 'Content-Type': 'application/json', 'x-api-key': apiCfg.key, 'anthropic-version': '2023-06-01' };
            apiBody = { model: 'claude-haiku-4-5-20251001', max_tokens: 600, messages: [{ role: 'user', content: prompt }] };
          }

          const response = await fetch(apiUrl, { method: 'POST', headers: apiHeaders, body: JSON.stringify(apiBody) });
          const data = await response.json();
          const text = apiCfg.provider === 'anthropic'
            ? data.content?.[0]?.text || '{}'
            : data.choices?.[0]?.message?.content || '{}';

          const result = JSON.parse(text.replace(/```json|```/g,'').trim());
          for (const c of (result.conflicts||[])) {
            const ex = await queryOne("SELECT id FROM req_conflicts WHERE req_id_a=$1 AND req_id_b=$2 AND status!='resolved'", [savedReq.id, c.reqId]);
            if (!ex) {
              const cr = rows.find(r=>r.id===c.reqId);
              await query('INSERT INTO req_conflicts (req_id_a,req_id_b,system_id_a,system_id_b,conflict_type,description,severity,ai_suggestion) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
                [savedReq.id, c.reqId, savedReq.system_id, cr?.system_id||savedReq.system_id, c.type, c.description, c.severity||'medium', c.suggestion||'']);
              log('info', 'Konflikt: ' + savedReq.id + ' <-> ' + c.reqId);
            }
          }
        } catch(e) { log('warning', 'Konflikt-Check: ' + e.message); }
      });
    }

    // Änderungshistorie tracken
    if (existing) {
      const user = await queryOne('SELECT name FROM users WHERE id=$1', [req.session.userId]);
      await trackReqChanges(existing, r, req.session.userId, user?.name || '');
      
      // Watcher benachrichtigen
      const updatedReq = await queryOne('SELECT watchers,title FROM requirements WHERE id=$1', [r.id]);
      const watchers = JSON.parse(updatedReq?.watchers || '[]');
      for (const wId of watchers) {
        if (wId !== req.session.userId) {
          await query('INSERT INTO notifications (user_id,type,title,message,req_id) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',
            [wId, 'update', 'Anforderung geändert', `${user?.name} hat "${updatedReq?.title}" geändert`, r.id]).catch(() => {});
        }
      }
    }

    res.json({ ok: true, updatedAt: saved?.updated_at?.getTime?.() });
  } catch(e) { log('error', 'Req-Save: ' + e.message); res.status(500).json({ error: e.message }); }
});

app.get('/api/requirements/archived', requireAuth, async (req, res) => {
  try {
    const q2 = req.query.systemId ? 'AND system_id=$1' : '';
    const p2 = req.query.systemId ? [req.query.systemId] : [];
    const rows = await queryAll(`SELECT * FROM requirements WHERE archived=TRUE ${q2} ORDER BY archived_at DESC`, p2);
    res.json(rows.map(mapReq));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/requirements/:id/history', requireAuth, async (req, res) => {
  try {
    const row = await queryOne('SELECT history,title FROM requirements WHERE id=$1', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Nicht gefunden' });
    const hist = (row.history || []).map(async (h) => ({
      ...h,
      changedByName: (await queryOne('SELECT name FROM users WHERE id=$1', [h.changedBy]))?.name || 'Unbekannt',
    }));
    res.json((await Promise.all(hist)).reverse());
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/requirements/:id', requireAuth, async (req, res) => {
  try {
    const r = await queryOne('SELECT system_id FROM requirements WHERE id=$1', [req.params.id]);
    if (req.query.archive === 'true' || req.body?.archive === true) {
      await query('UPDATE requirements SET archived=TRUE,archived_at=NOW(),archived_by=$1 WHERE id=$2',
        [req.session.userId, req.params.id]);
      if (r) ws.broadcastReqDeleted(req.params.id, r.system_id);
    } else {
      await query('DELETE FROM requirements WHERE id=$1', [req.params.id]);
      if (r) ws.broadcastReqDeleted(req.params.id, r.system_id);
    }
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/requirements/:id/restore', requireAuth, async (req, res) => {
  try {
    await query('UPDATE requirements SET archived=FALSE,archived_at=NULL,archived_by=NULL WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/requirements/:id/comments', requireAuth, async (req, res) => {
  try {
    const row = await queryOne('SELECT comments FROM requirements WHERE id=$1', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Nicht gefunden' });
    const comments = [...(row.comments||[]), { ...req.body, id:'c'+Date.now(), createdAt:Date.now() }];
    await query('UPDATE requirements SET comments=$1 WHERE id=$2', [JSON.stringify(comments), req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/requirements/:id/assign', requireAuth, async (req, res) => {
  try {
    const { userId, subcategory } = req.body;
    const row = await queryOne('SELECT title,system_id FROM requirements WHERE id=$1', [req.params.id]);
    await query('UPDATE requirements SET assigned_to=$1,subcategory=$2,status=$3,last_changed_by=$4 WHERE id=$5',
      [userId, subcategory||null, 'assigned', req.session.userId, req.params.id]);
    const actor = mapUser(await queryOne('SELECT * FROM users WHERE id=$1', [req.session.userId]));
    const sys   = mapSystem(await queryOne('SELECT * FROM systems WHERE id=$1', [row?.system_id]));
    notif.dispatch('req_assigned', { reqId:req.params.id, reqTitle:row?.title, systemName:sys?.name, userName:actor?.name||'' }, [userId]);
    ws.broadcastNotification(userId, { icon:'👤', title:'Anforderung zugewiesen', sub: row?.title });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── REQUIREMENTS IMPORT ───────────────────────────────────────
app.post('/api/requirements/import', requireAuth, async (req, res) => {
  try {
    const { systemId, requirements, mode='merge' } = req.body;
    if (!systemId || !Array.isArray(requirements)) return res.status(400).json({ error: 'Ungültige Eingabe' });
    let added=0, skipped=0, updated=0;
    await withTransaction(async (client) => {
      for (const r of requirements) {
        const existing = await client.query(
          'SELECT id FROM requirements WHERE (id=$1 OR lower(title)=lower($2)) AND system_id=$3',
          [r.id||'', r.title||'', systemId]
        );
        if (existing.rows.length) {
          if (mode === 'replace') {
            await client.query('UPDATE requirements SET title=$1,description=$2,priority=$3,category=$4,status=$5,last_changed_by=$6 WHERE id=$7',
              [r.title,r.description||'',r.priority||'medium',r.category||'Funktional',r.status||'open',req.session.userId,existing.rows[0].id]);
            updated++;
          } else if (mode === 'duplicate') {
            await client.query('INSERT INTO requirements (id,system_id,title,description,category,priority,status,rationale,last_changed_by,created_by,imported_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())',
              [`REQ-IMP-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,systemId,r.title,r.description||'',r.category||'Funktional',r.priority||'medium',r.status||'open',r.rationale||'',req.session.userId,req.session.userId]);
            added++;
          } else skipped++;
        } else {
          await client.query('INSERT INTO requirements (id,system_id,title,description,category,priority,status,rationale,last_changed_by,created_by,imported_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())',
            [r.id||`REQ-IMP-${Date.now()}`,systemId,r.title,r.description||'',r.category||'Funktional',r.priority||'medium',r.status||'open',r.rationale||'',req.session.userId,req.session.userId]);
          added++;
        }
      }
    });
    log('info', `Import: ${added} hinzugefügt, ${updated} aktualisiert, ${skipped} übersprungen`);
    res.json({ ok:true, added, updated, skipped });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── GENERIC CRUD ─────────────────────────────────────────────
function crudTable(table, idPrefix) {
  app.get(`/api/${table}`, requireAuth, async (req, res) => {
    try {
      const q2 = req.query.systemId ? `AND system_id=$1` : '';
      const p2 = req.query.systemId ? [req.query.systemId] : [];
      const rows = await queryAll(`SELECT * FROM ${table} WHERE 1=1 ${q2} ORDER BY created_at DESC`, p2);
      res.json(rows.map(mapGeneric));
    } catch(e) { res.status(500).json({ error: e.message }); }
  });
  app.post(`/api/${table}`, requireAuth, async (req, res) => {
    try {
      const item = req.body;
      const existing = item.id ? await queryOne(`SELECT id FROM ${table} WHERE id=$1`, [item.id]) : null;
      const sysId = item.systemId || item.system_id || '';
      if (existing) {
        if (table === 'backlogs')
          await query('UPDATE backlogs SET system_name=$1,epics=$2 WHERE id=$3', [item.systemName||'', JSON.stringify(item.epics||[]), item.id]);
        else if (table === 'workshops')
          await query('UPDATE workshops SET name=$1,goal=$2,entries=$3,structured=$4 WHERE id=$5', [item.name||'',item.goal||'',JSON.stringify(item.entries||[]),item.structured?JSON.stringify(item.structured):null,item.id]);
        else if (table === 'diagrams')
          await query('UPDATE diagrams SET name=$1,type=$2,svg=$3,mermaid=$4 WHERE id=$5', [item.name||'',item.type||'bpmn',item.svg||null,item.mermaid||null,item.id]);
      } else {
        const id = item.id || idPrefix + Date.now();
        if (table === 'backlogs')
          await query('INSERT INTO backlogs (id,system_id,system_name,epics) VALUES ($1,$2,$3,$4)', [id,sysId,item.systemName||'',JSON.stringify(item.epics||[])]);
        else if (table === 'workshops')
          await query('INSERT INTO workshops (id,system_id,name,goal,entries,structured) VALUES ($1,$2,$3,$4,$5,$6)', [id,sysId,item.name||'',item.goal||'',JSON.stringify(item.entries||[]),item.structured?JSON.stringify(item.structured):null]);
        else if (table === 'diagrams')
          await query('INSERT INTO diagrams (id,system_id,name,type,svg,mermaid) VALUES ($1,$2,$3,$4,$5,$6)', [id,sysId,item.name||'',item.type||'bpmn',item.svg||null,item.mermaid||null]);
      }
      res.json({ ok: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
  });
  app.delete(`/api/${table}/:id`, requireAuth, async (req, res) => {
    try { await query(`DELETE FROM ${table} WHERE id=$1`, [req.params.id]); res.json({ ok:true }); }
    catch(e) { res.status(500).json({ error: e.message }); }
  });
}
crudTable('backlogs','bl');
crudTable('workshops','ws');
crudTable('diagrams','dg');

// ── ONBOARDING ────────────────────────────────────────────────
app.get('/api/onboarding/status', requireAuth, async (req, res) => {
  try {
    const [complete, sysCount, reqCount, userCount] = await Promise.all([
      queryOne("SELECT value FROM app_settings WHERE key='onboarding_complete'"),
      queryOne('SELECT COUNT(*) as c FROM systems'),
      queryOne('SELECT COUNT(*) as c FROM requirements'),
      queryOne('SELECT COUNT(*) as c FROM users'),
    ]);
    const systemCount = parseInt(sysCount?.c||0);
    const reqCount_   = parseInt(reqCount?.c||0);
    // Wizard zeigen wenn: keine Systeme vorhanden — egal was onboarding_complete sagt
    const complete_   = complete?.value === '1' && systemCount > 0;
    res.json({
      complete:    complete_,
      systemCount,
      reqCount:    reqCount_,
      steps: { hasSystem: systemCount > 0, hasRequirements: reqCount_ > 0, hasUsers: parseInt(userCount?.c||0) > 1 },
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/onboarding/complete', requireAuth, requireAdmin, async (req, res) => {
  try { await query("UPDATE app_settings SET value='0' WHERE key='onboarding_complete'"); res.json({ ok:true }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/onboarding/complete', requireAuth, async (req, res) => {
  try { await query("INSERT INTO app_settings (key,value) VALUES ('onboarding_complete','1') ON CONFLICT (key) DO UPDATE SET value='1'"); res.json({ ok:true }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

// ── SEARCH ────────────────────────────────────────────────────
app.get('/api/search', requireAuth, async (req, res) => {
  try {
    const q2 = (req.query.q||'').trim();
    if (!q2 || q2.length < 2) return res.json({ requirements:[], workshops:[], backlogs:[] });
    const like = `%${q2}%`;
    const [reqs, wsList, bList] = await Promise.all([
      queryAll('SELECT * FROM requirements WHERE (title ILIKE $1 OR description ILIKE $1 OR id ILIKE $1) AND (archived IS FALSE OR archived IS NULL) ORDER BY updated_at DESC LIMIT 50', [like]),
      queryAll('SELECT * FROM workshops WHERE name ILIKE $1 OR goal ILIKE $1 LIMIT 20', [like]),
      queryAll('SELECT * FROM backlogs LIMIT 10', []),
    ]);
    res.json({ requirements: reqs.map(mapReq), workshops: wsList.map(mapGeneric), backlogs: bList.map(mapGeneric) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// RAG: Alle Dokumente eines Systems neu indexieren
app.post('/api/systems/:id/reindex', requireAuth, async (req, res) => {
  try {
    const sys = mapSystem(await queryOne('SELECT * FROM systems WHERE id=$1', [req.params.id]));
    if (!sys) return res.status(404).json({ error: 'System nicht gefunden' });

    // Dokumente aus docs-Feld haben keinen Content mehr — hole aus Upload-Storage
    // Stattdessen: vorhandene Embeddings zählen
    const existing = await queryAll('SELECT DISTINCT doc_id FROM embeddings WHERE system_id=$1', [req.params.id]);
    const docIds   = existing.map(r => r.doc_id);

    res.json({
      ok: true,
      indexed: docIds.length,
      total:   (sys.docs||[]).length,
      message: docIds.length === (sys.docs||[]).length
        ? 'Alle Dokumente sind indexiert'
        : `${docIds.length} von ${(sys.docs||[]).length} Dokumenten indexiert. Neue Uploads werden automatisch indexiert.`
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// RAG: Status eines Systems
app.get('/api/systems/:id/rag-status', requireAuth, async (req, res) => {
  try {
    const sys      = mapSystem(await queryOne('SELECT * FROM systems WHERE id=$1', [req.params.id]));
    if (!sys) return res.status(404).json({ error: 'System nicht gefunden' });
    const chunks   = await queryOne('SELECT COUNT(*) as c FROM embeddings WHERE system_id=$1', [req.params.id]);
    const docCount = await queryOne('SELECT COUNT(DISTINCT doc_id) as c FROM embeddings WHERE system_id=$1', [req.params.id]);
    res.json({
      systemId:    req.params.id,
      totalChunks: parseInt(chunks?.c || 0),
      indexedDocs: parseInt(docCount?.c || 0),
      totalDocs:   (sys.docs||[]).length,
      ready:       parseInt(chunks?.c || 0) > 0,
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── RAG: EMBEDDINGS ───────────────────────────────────────────
app.post('/api/embeddings/store', requireAuth, async (req, res) => {
  try {
    const { systemId, docId, docName, chunks } = req.body;
    if (!systemId||!docId||!Array.isArray(chunks)) return res.status(400).json({ error:'Ungültige Eingabe' });
    await query('DELETE FROM embeddings WHERE doc_id=$1', [docId]);
    for (let i=0; i<chunks.length; i++) {
      const vec = simpleTextVector(chunks[i].text);
      await query('INSERT INTO embeddings (system_id,doc_id,doc_name,chunk_index,chunk_text,embedding) VALUES ($1,$2,$3,$4,$5,$6)',
        [systemId, docId, docName, i, chunks[i].text, JSON.stringify(vec)]);
    }
    res.json({ ok:true, chunks:chunks.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/embeddings/search', requireAuth, async (req, res) => {
  try {
    const { systemId, query: q2, topK = 12 } = req.body;
    if (!systemId || !q2) return res.status(400).json({ error: 'Ungültige Eingabe' });

    const chunkCountRow = await queryOne('SELECT COUNT(*) as c FROM embeddings WHERE system_id=$1', [systemId]);
    const totalChunks = parseInt(chunkCountRow?.c || 0);
    if (totalChunks === 0) return res.json({ results: [], fallback: true });

    // Bei sehr großen Systemen: Hard-Limit um Hänger zu vermeiden
    const MAX_CHUNKS = 2000;
    const chunks = await queryAll(
      `SELECT * FROM embeddings WHERE system_id=$1 ORDER BY chunk_index ASC LIMIT $2`,
      [systemId, MAX_CHUNKS]
    );
    if (!chunks.length) return res.json({ results: [], fallback: true });
    if (totalChunks > MAX_CHUNKS) {
      log('warning', `embeddings/search: System ${systemId} hat ${totalChunks} Chunks — limitiert auf ${MAX_CHUNKS}`);
    }

    const queryVec = simpleTextVector(q2);

    // Alle Chunks bewerten
    const scored = chunks.map(c => {
      const emb = typeof c.embedding === 'string' ? JSON.parse(c.embedding) : (c.embedding || []);
      return {
        text:    c.chunk_text,
        docName: c.doc_name,
        docId:   c.doc_id,
        score:   cosineSimilarity(queryVec, emb),
      };
    });

    // Pro Dokument: besten Chunk behalten + top-Chunks insgesamt
    const byDoc = {};
    for (const c of scored) {
      if (!byDoc[c.docId] || c.score > byDoc[c.docId].score) {
        byDoc[c.docId] = c;
      }
    }

    // Alle Dokumente mindestens einmal vertreten + beste Chunks oben
    const perDocBest  = Object.values(byDoc).sort((a, b) => b.score - a.score);
    const topOverall  = scored.sort((a, b) => b.score - a.score).slice(0, topK);

    // Merge: erst per-Doc, dann fill mit top-Overall
    const seen = new Set();
    const results = [];
    for (const c of [...perDocBest, ...topOverall]) {
      const key = c.docId + '_' + c.text.substring(0, 30);
      if (!seen.has(key) && results.length < topK) {
        seen.add(key);
        results.push(c);
      }
    }

    res.json({ results, fallback: false });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

function simpleTextVector(text) {
  const vec = new Array(128).fill(0);
  const words = text.toLowerCase().split(/\W+/).filter(w=>w.length>2);
  for (const word of words) {
    let h = 5381;
    for (let i=0; i<word.length; i++) h = ((h<<5)+h)+word.charCodeAt(i);
    vec[Math.abs(h)%128] += 1;
  }
  const mag = Math.sqrt(vec.reduce((s,v)=>s+v*v,0)) || 1;
  return vec.map(v=>v/mag);
}
function cosineSimilarity(a, b) {
  if (!a?.length || !b?.length || a.length!==b.length) return 0;
  let dot=0, ma=0, mb=0;
  for (let i=0; i<a.length; i++) { dot+=a[i]*b[i]; ma+=a[i]*a[i]; mb+=b[i]*b[i]; }
  return dot / (Math.sqrt(ma)*Math.sqrt(mb) || 1);
}

// ── QS-TRENDS ─────────────────────────────────────────────────
app.get('/api/qs/trends', requireAuth, async (req, res) => {
  try {
    const { systemId, days=30 } = req.query;
    const since = new Date(Date.now() - parseInt(days) * 86400000);
    const cond  = systemId ? `AND system_id=$2` : '';
    const params2 = systemId ? [since, systemId] : [since];

    const [scores, catStats] = await Promise.all([
      queryAll(`SELECT id,title,quality_score,category,priority,updated_at FROM requirements WHERE quality_score IS NOT NULL AND (archived IS FALSE OR archived IS NULL) ${cond} ORDER BY quality_score ASC LIMIT 20`, params2),
      queryAll(`SELECT category, COUNT(*) as count, AVG(quality_score) as avg, SUM(CASE WHEN quality_score < 5 THEN 1 ELSE 0 END) as low FROM requirements WHERE quality_score IS NOT NULL ${cond} GROUP BY category`, params2),
    ]);

    const allScores = scores.map(r => parseFloat(r.quality_score));
    const avg = allScores.length ? allScores.reduce((a,b)=>a+b,0)/allScores.length : 0;
    res.json({
      total: scores.length, avg,
      min: allScores.length ? Math.min(...allScores) : 0,
      max: allScores.length ? Math.max(...allScores) : 0,
      low: scores.filter(s=>parseFloat(s.quality_score)<5).length,
      high: scores.filter(s=>parseFloat(s.quality_score)>=8).length,
      trend: [], // Erfordert Zeitreihen-Daten aus History — in Phase 2 erweitern
      categoryStats: catStats.map(c => ({ category: c.category, count: parseInt(c.count), avg: parseFloat(c.avg||0), low: parseInt(c.low||0) })),
      scores: scores.map(r => ({ id:r.id, title:r.title, score:parseFloat(r.quality_score), category:r.category, priority:r.priority, updatedAt:r.updated_at?.getTime?.() })),
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── SPRINT PLANS ──────────────────────────────────────────────
app.get('/api/sprint/plans', requireAuth, async (req, res) => {
  try {
    const { systemId } = req.query;
    const rows = await queryAll("SELECT key,value FROM app_settings WHERE key LIKE 'sprint_plan_%'");
    let plans = rows.map(r => { try { return JSON.parse(r.value); } catch(e) { return null; } }).filter(Boolean);
    if (systemId) plans = plans.filter(p => p.systemId === systemId);
    res.json(plans);
  } catch(e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/sprint/plans', requireAuth, async (req, res) => {
  try {
    const plan = { ...req.body, id: req.body.id || 'sprint-'+Date.now(), savedAt: Date.now() };
    await query("INSERT INTO app_settings (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2",
      ['sprint_plan_'+plan.id, JSON.stringify(plan)]);
    res.json({ ok:true, id:plan.id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/sprint/plans/:id', requireAuth, async (req, res) => {
  try { await query("DELETE FROM app_settings WHERE key=$1", ['sprint_plan_'+req.params.id]); res.json({ ok:true }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

// ── NOTIFICATION SETTINGS ─────────────────────────────────────
app.get('/api/notifications/settings', requireAuth, requireAdmin, async (req, res) => {
  try { res.json(await notif.loadSettings()); } catch(e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/notifications/settings', requireAuth, requireAdmin, async (req, res) => {
  try { await notif.saveSettings(req.body); res.json({ ok:true }); } catch(e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/notifications/test', requireAuth, requireAdmin, async (req, res) => {
  try { await notif.sendTest(); res.json({ ok:true }); } catch(e) { res.status(500).json({ error:e.message }); }
});

// ── API-KEY MANAGEMENT ────────────────────────────────────────
app.get('/api/apikey/mode', requireAuth, requireAdmin, async (req, res) => {
  const mode = (await queryOne("SELECT value FROM app_settings WHERE key='api_key_mode'"))?.value || 'global';
  res.json({ mode });
});
app.post('/api/apikey/mode', requireAuth, requireAdmin, async (req, res) => {
  const { mode } = req.body;
  if (!['global','per_user'].includes(mode)) return res.status(400).json({ error: 'Ungültiger Modus' });
  await query("INSERT INTO app_settings (key,value) VALUES ('api_key_mode',$1) ON CONFLICT (key) DO UPDATE SET value=$1", [mode]);
  res.json({ ok:true, mode });
});

// Globaler Key — Anthropic oder Grok
app.get('/api/apikey/global', requireAuth, requireAdmin, async (req, res) => {
  const provider   = (await queryOne("SELECT value FROM app_settings WHERE key='global_ai_provider'"))?.value || 'anthropic';
  const hasAnthKey = !!(process.env.ANTHROPIC_API_KEY || (await queryOne("SELECT value FROM app_settings WHERE key='global_api_key'"))?.value);
  const hasGrokKey = !!(await queryOne("SELECT value FROM app_settings WHERE key='global_grok_api_key'"))?.value;
  const hasGroqKey = !!(await queryOne("SELECT value FROM app_settings WHERE key='global_groq_api_key'"))?.value;
  res.json({ provider, hasAnthKey, hasGrokKey, hasGroqKey });
});
app.post('/api/apikey/global', requireAuth, requireAdmin, async (req, res) => {
  const { apiKey, provider, grokApiKey } = req.body;
  const prov = provider || 'anthropic';
  // Validierung
  if (prov === 'anthropic' && apiKey && !apiKey.startsWith('sk-ant')) {
    return res.status(400).json({ error: 'Ungültiger Anthropic Key — muss mit sk-ant beginnen' });
  }
  if (prov === 'grok' && grokApiKey && !grokApiKey.startsWith('xai-')) {
    return res.status(400).json({ error: 'Ungültiger Grok Key — muss mit xai- beginnen' });
  }
  const groqApiKey = req.body.groqApiKey;
  if (prov === 'groq' && groqApiKey && !groqApiKey.startsWith('gsk_')) {
    return res.status(400).json({ error: 'Ungültiger Groq Key — muss mit gsk_ beginnen' });
  }
  await query("INSERT INTO app_settings (key,value) VALUES ('global_ai_provider',$1) ON CONFLICT (key) DO UPDATE SET value=$1", [prov]);
  if (apiKey)     await query("INSERT INTO app_settings (key,value) VALUES ('global_api_key',$1) ON CONFLICT (key) DO UPDATE SET value=$1", [apiKey]);
  if (grokApiKey) await query("INSERT INTO app_settings (key,value) VALUES ('global_grok_api_key',$1) ON CONFLICT (key) DO UPDATE SET value=$1", [grokApiKey]);
  if (groqApiKey) await query("INSERT INTO app_settings (key,value) VALUES ('global_groq_api_key',$1) ON CONFLICT (key) DO UPDATE SET value=$1", [groqApiKey]);

  // Falls jetzt erstmals ein Key vorhanden ist: alle "ready_no_ai"-Caches neu aufbauen
  if (apiKey || grokApiKey || groqApiKey) {
    const staleSystems = await query(
      "SELECT system_id FROM system_context_cache WHERE build_status='ready_no_ai'", []
    );
    if (staleSystems.rows.length) {
      log('info', `API-Key gespeichert — baue ${staleSystems.rows.length} Cache(s) ohne KI-Inhalt neu auf`);
      for (const row of staleSystems.rows) {
        setImmediate(() => buildSystemContextCache(row.system_id));
      }
    }
  }

  res.json({ ok:true, rebuilding: (apiKey||grokApiKey||groqApiKey) ? true : false });
});

// Per-User Key — Anthropic oder Grok
app.post('/api/apikey/user', requireAuth, async (req, res) => {
  const mode = (await queryOne("SELECT value FROM app_settings WHERE key='api_key_mode'"))?.value||'global';
  if (mode !== 'per_user') return res.status(403).json({ error: 'Per-User Keys nicht aktiv' });
  const { apiKey, provider } = req.body;
  const prov = provider || 'anthropic';
  if (prov === 'anthropic' && apiKey && !apiKey.startsWith('sk-ant')) {
    return res.status(400).json({ error: 'Ungültiger Anthropic Key' });
  }
  if (prov === 'grok' && apiKey && !apiKey.startsWith('xai-')) {
    return res.status(400).json({ error: 'Ungültiger Grok Key — muss mit xai- beginnen' });
  }
  await query('UPDATE users SET api_key=$1, ai_provider=$2 WHERE id=$3', [apiKey, prov, req.session.userId]);
  res.json({ ok:true });
});
app.delete('/api/apikey/user', requireAuth, async (req, res) => {
  await query('UPDATE users SET api_key=NULL WHERE id=$1', [req.session.userId]);
  res.json({ ok:true });
});
app.post('/api/apikey/user/:userId', requireAuth, requireAdmin, async (req, res) => {
  const { apiKey, provider } = req.body;
  const prov = provider || 'anthropic';
  if (prov === 'anthropic' && apiKey && !apiKey.startsWith('sk-ant')) {
    return res.status(400).json({ error: 'Ungültiger Anthropic Key' });
  }
  if (prov === 'grok' && apiKey && !apiKey.startsWith('xai-')) {
    return res.status(400).json({ error: 'Ungültiger Grok Key' });
  }
  await query('UPDATE users SET api_key=$1, ai_provider=$2 WHERE id=$3', [apiKey, prov, req.params.userId]);
  res.json({ ok:true });
});
app.delete('/api/apikey/user/:userId', requireAuth, requireAdmin, async (req, res) => {
  await query('UPDATE users SET api_key=NULL WHERE id=$1', [req.params.userId]);
  res.json({ ok:true });
});
app.get('/api/apikey/user/status', requireAuth, async (req, res) => {
  const mode         = (await queryOne("SELECT value FROM app_settings WHERE key='api_key_mode'"))?.value||'global';
  const user         = await queryOne('SELECT api_key, ai_provider FROM users WHERE id=$1', [req.session.userId]);
  const globalKey    = process.env.ANTHROPIC_API_KEY || (await queryOne("SELECT value FROM app_settings WHERE key='global_api_key'"))?.value;
  const globalGrok   = (await queryOne("SELECT value FROM app_settings WHERE key='global_grok_api_key'"))?.value;
  const globalGroq   = (await queryOne("SELECT value FROM app_settings WHERE key='global_groq_api_key'"))?.value;
  const globalProv   = (await queryOne("SELECT value FROM app_settings WHERE key='global_ai_provider'"))?.value || 'anthropic';
  res.json({
    mode,
    hasUserKey:     !!user?.api_key,
    userProvider:   user?.ai_provider || 'anthropic',
    hasGlobalKey:   !!globalKey,
    hasGrokKey:     !!globalGrok,
    hasGroqKey:     !!globalGroq,
    globalProvider: globalProv,
  });
});
app.get('/api/apikey/users/status', requireAuth, requireAdmin, async (req, res) => {
  const users = await queryAll('SELECT id,name,email,role,api_key,ai_provider FROM users');
  res.json(users.map(u => ({ id:u.id, name:u.name, email:u.email, role:u.role, hasKey: !!u.api_key, provider: u.ai_provider||'anthropic' })));
});

// ── PRESENCE ─────────────────────────────────────────────────
app.get('/api/presence', requireAuth, (req, res) => { res.json(ws.getOnlineUsers()); });

// ── ANFORDERUNGS-DNA ─────────────────────────────────────────

// DNA einer Anforderung abrufen
app.get('/api/requirements/:id/dna', requireAuth, async (req, res) => {
  try {
    const row = await queryOne('SELECT * FROM requirement_dna WHERE req_id=$1', [req.params.id]);
    if (!row) {
      // Noch nicht berechnet → in Queue
      await dna.enqueueDNA(req.params.id, 2);
      return res.json({ computed: false, queued: true });
    }
    res.json({
      computed:   true,
      vector:     row.vector,
      signature:  row.signature,
      features:   row.features,
      qualityDNA: row.quality_dna,
      drift: {
        score:       parseFloat(row.drift_score || 0),
        type:        row.drift_type || 'none',
        detectedAt:  row.drift_detected_at?.getTime?.() || null,
      },
      computedAt: row.computed_at?.getTime?.() || null,
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DNA-Netzwerk: Ähnlichkeiten für ein System
app.get('/api/dna/network/:systemId', requireAuth, async (req, res) => {
  try {
    const { systemId } = req.params;
    const minSim = parseFloat(req.query.minSim || dna.SIMILARITY_MIN);
    const crossSystem = req.query.crossSystem === 'true';

    // Nodes: alle Anforderungen mit DNA im System
    const nodes = await queryAll(`
      SELECT r.id, r.title, r.category, r.priority, r.status, r.quality_score,
             d.drift_score, d.drift_type, d.features, d.quality_dna
      FROM requirements r
      JOIN requirement_dna d ON d.req_id = r.id
      WHERE r.system_id=$1 AND (r.archived IS FALSE OR r.archived IS NULL)
      ORDER BY r.created_at`, [systemId]);

    // Edges: Ähnlichkeitsbeziehungen
    const nodeIds = nodes.map(n => n.id);
    if (!nodeIds.length) return res.json({ nodes: [], edges: [], genealogy: [] });

    const edges = await queryAll(`
      SELECT s.req_id_a, s.req_id_b, s.similarity, s.cross_system
      FROM req_similarities s
      WHERE (s.req_id_a=ANY($1) OR s.req_id_b=ANY($1))
        AND s.similarity >= $2
        AND ($3 OR s.cross_system=FALSE)
      ORDER BY s.similarity DESC
      LIMIT 500`, [nodeIds, minSim, crossSystem]);

    // Genealogie-Kanten
    const genealogyEdges = await queryAll(`
      SELECT g.source_req_id, g.target_req_id, g.relation_type, g.confidence, g.auto_detected
      FROM genealogy g
      WHERE g.source_req_id=ANY($1) OR g.target_req_id=ANY($1)
      ORDER BY g.confidence DESC`, [nodeIds]);

    // Cross-System Nodes hinzufügen wenn gewünscht
    let crossNodes = [];
    if (crossSystem) {
      const crossIds = new Set();
      for (const e of edges) {
        if (!nodeIds.includes(e.req_id_a)) crossIds.add(e.req_id_a);
        if (!nodeIds.includes(e.req_id_b)) crossIds.add(e.req_id_b);
      }
      if (crossIds.size) {
        crossNodes = await queryAll(
          'SELECT r.id, r.title, r.category, r.priority, r.system_id, s.name as system_name FROM requirements r JOIN systems s ON s.id=r.system_id WHERE r.id=ANY($1)',
          [[...crossIds]]
        );
      }
    }

    res.json({
      nodes:     nodes.map(n => ({
        id: n.id, title: n.title, category: n.category, priority: n.priority,
        status: n.status, qualityScore: n.quality_score ? parseFloat(n.quality_score) : null,
        driftScore: parseFloat(n.drift_score || 0), driftType: n.drift_type,
        features: n.features, qualityDNA: n.quality_dna,
        systemId, isCross: false,
      })),
      crossNodes: crossNodes.map(n => ({
        id: n.id, title: n.title, category: n.category, priority: n.priority,
        systemId: n.system_id, systemName: n.system_name, isCross: true,
      })),
      edges:     edges.map(e => ({
        a: e.req_id_a, b: e.req_id_b,
        similarity: parseFloat(e.similarity), crossSystem: e.cross_system,
      })),
      genealogy: genealogyEdges.map(e => ({
        source: e.source_req_id, target: e.target_req_id,
        type: e.relation_type, confidence: parseFloat(e.confidence),
        auto: e.auto_detected,
      })),
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Drift-Report: alle Anforderungen mit signifikantem Drift
app.get('/api/dna/drift', requireAuth, async (req, res) => {
  try {
    const { systemId, threshold = dna.DRIFT_THRESHOLD } = req.query;
    const cond = systemId ? 'AND r.system_id=$2' : '';
    const params = systemId ? [threshold, systemId] : [threshold];
    const rows = await queryAll(`
      SELECT r.id, r.title, r.category, r.priority, r.updated_at,
             d.drift_score, d.drift_type, d.drift_detected_at, d.quality_dna,
             s.name as system_name
      FROM requirement_dna d
      JOIN requirements r ON r.id = d.req_id
      JOIN systems s ON s.id = r.system_id
      WHERE d.drift_score >= $1 ${cond}
        AND (r.archived IS FALSE OR r.archived IS NULL)
      ORDER BY d.drift_score DESC
      LIMIT 100`, params);
    res.json(rows.map(r => ({
      id: r.id, title: r.title, category: r.category, priority: r.priority,
      systemName: r.system_name, updatedAt: r.updated_at?.getTime?.(),
      drift: { score: parseFloat(r.drift_score), type: r.drift_type, detectedAt: r.drift_detected_at?.getTime?.() },
      qualityDNA: r.quality_dna,
    })));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Genealogie einer Anforderung (Vorfahren + Nachkommen)
app.get('/api/dna/genealogy/:reqId', requireAuth, async (req, res) => {
  try {
    const { reqId } = req.params;
    const [ancestors, descendants, siblings] = await Promise.all([
      queryAll(`SELECT g.*, r.title, r.category, r.priority, r.system_id, s.name as system_name
        FROM genealogy g JOIN requirements r ON r.id=g.source_req_id JOIN systems s ON s.id=r.system_id
        WHERE g.target_req_id=$1 ORDER BY g.confidence DESC`, [reqId]),
      queryAll(`SELECT g.*, r.title, r.category, r.priority, r.system_id, s.name as system_name
        FROM genealogy g JOIN requirements r ON r.id=g.target_req_id JOIN systems s ON s.id=r.system_id
        WHERE g.source_req_id=$1 ORDER BY g.confidence DESC`, [reqId]),
      queryAll(`SELECT s2.req_id_a, s2.req_id_b, s2.similarity, s2.cross_system,
          r.title, r.category, r.priority, sys.name as system_name
        FROM req_similarities s2
        JOIN requirements r ON r.id = CASE WHEN s2.req_id_a=$1 THEN s2.req_id_b ELSE s2.req_id_a END
        JOIN systems sys ON sys.id=r.system_id
        WHERE (s2.req_id_a=$1 OR s2.req_id_b=$1) AND s2.similarity >= $2
        ORDER BY s2.similarity DESC LIMIT 10`, [reqId, dna.SIMILARITY_MIN]),
    ]);
    res.json({
      ancestors:   ancestors.map(r => ({ id: r.source_req_id, title: r.title, category: r.category, relationType: r.relation_type, confidence: parseFloat(r.confidence), systemName: r.system_name })),
      descendants: descendants.map(r => ({ id: r.target_req_id, title: r.title, category: r.category, relationType: r.relation_type, confidence: parseFloat(r.confidence), systemName: r.system_name })),
      similar:     siblings.map(r => ({ id: r.req_id_a === reqId ? r.req_id_b : r.req_id_a, title: r.title, category: r.category, similarity: parseFloat(r.similarity), crossSystem: r.cross_system, systemName: r.system_name })),
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Genealogie-Beziehung manuell anlegen
app.post('/api/dna/genealogy', requireAuth, async (req, res) => {
  try {
    const { sourceReqId, targetReqId, relationType, confidence=1.0 } = req.body;
    await query(`INSERT INTO genealogy (source_req_id, target_req_id, relation_type, confidence, auto_detected, created_by)
      VALUES ($1,$2,$3,$4,FALSE,$5) ON CONFLICT DO NOTHING`,
      [sourceReqId, targetReqId, relationType, confidence, req.session.userId]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DNA für ein System neu berechnen
app.post('/api/dna/recompute/:systemId', requireAuth, async (req, res) => {
  try {
    const count = await dna.recomputeSystemDNA(req.params.systemId);
    res.json({ ok: true, queued: count });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DNA-Queue Status
app.get('/api/dna/queue', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [pending, processing, errors] = await Promise.all([
      queryOne('SELECT COUNT(*) as c FROM dna_queue WHERE started_at IS NULL'),
      queryOne('SELECT COUNT(*) as c FROM dna_queue WHERE started_at IS NOT NULL'),
      queryOne('SELECT COUNT(*) as c FROM dna_queue WHERE error IS NOT NULL'),
    ]);
    res.json({
      pending:    parseInt(pending?.c   || 0),
      processing: parseInt(processing?.c || 0),
      errors:     parseInt(errors?.c    || 0),
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── ANTHROPIC PROXY ───────────────────────────────────────────
app.post('/api/ai/chat', requireAuth, async (req, res) => {
  try {
    const feature = req.headers['x-re-feature'] || req.body._feature || 'other';
    const systemId = req.headers['x-re-system'] || req.body._systemId || null;

    // Budget-Check
    const budget = await tracker.checkBudget(feature);
    if (!budget.allowed) {
      return res.status(402).json({
        error:   budget.reason,
        blocked: true,
        spent:   budget.spent,
        limit:   budget.limit,
      });
    }

    const { _feature, _systemId, _apiKey, _provider, _grokApiKey, _groqApiKey, ...cleanBody } = req.body;

    // Provider + Key ausschließlich serverseitig auflösen (app_settings / per-user DB)
    const apiCfg = await resolveApiConfig(req.session.userId);

    if (!apiCfg.key) {
      log('warning', `AI-Chat: Kein API-Key — Provider=${apiCfg.provider}, Mode=${(await queryOne("SELECT value FROM app_settings WHERE key='api_key_mode'"))?.value||'global'}`);
      return res.status(500).json({ error: 'Kein API-Key konfiguriert. Bitte in den Einstellungen hinterlegen.', debugProvider: apiCfg.provider });
    }
    log('info', `AI-Chat: Provider=${apiCfg.provider}, KeyPrefix=${apiCfg.key.substring(0,7)}…, Feature=${feature}`);

    let apiUrl, apiHeaders, apiBody;

    if (apiCfg.provider === 'grok' || apiCfg.provider === 'groq') {
      // Grok (xAI) + Groq — beide OpenAI-kompatibel
      const defaultModel = apiCfg.provider === 'groq' ? 'llama-3.3-70b-versatile' : 'grok-3-mini';
      const model = cleanBody.model?.startsWith('claude') ? defaultModel : (cleanBody.model || defaultModel);
      const msgs = [];
      if (cleanBody.system) msgs.push({ role: 'system', content: cleanBody.system });
      for (const m of (cleanBody.messages || [])) {
        const text = Array.isArray(m.content) ? m.content.map(c => c.text || '').join('') : m.content;
        msgs.push({ role: m.role, content: text });
      }
      const baseUrl = apiCfg.provider === 'groq' ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://api.x.ai/v1/chat/completions';
      apiUrl     = baseUrl;
      apiHeaders = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiCfg.key };
      apiBody    = { model, messages: msgs, max_tokens: cleanBody.max_tokens || 1000 };
    } else {
      apiUrl     = 'https://api.anthropic.com/v1/messages';
      apiHeaders = { 'Content-Type': 'application/json', 'x-api-key': apiCfg.key, 'anthropic-version': '2023-06-01' };
      // Default-Modell falls Client keines vorgibt oder ein xAI/Groq-Modell hinterlegt war
      const model = (cleanBody.model && cleanBody.model.startsWith('claude'))
        ? cleanBody.model
        : 'claude-sonnet-4-6';
      apiBody    = { ...cleanBody, model };
    }

    log('info', `AI-Chat: Sende an ${apiUrl} (Model: ${apiBody.model})`);
    const response = await fetch(apiUrl, { method:'POST', headers: apiHeaders, body: JSON.stringify(apiBody) });
    let data = await response.json();
    if (!response.ok) {
      log('error', `AI-Chat: ${apiCfg.provider} antwortete mit ${response.status}: ${JSON.stringify(data).substring(0,300)}`);
    }

    // Grok/Groq Response → Anthropic Format
    if ((apiCfg.provider === 'grok' || apiCfg.provider === 'groq') && response.ok) {
      const choice = data.choices?.[0];
      data = {
        id: data.id, type: 'message', role: 'assistant',
        content: [{ type: 'text', text: choice?.message?.content || '' }],
        model: data.model,
        usage: { input_tokens: data.usage?.prompt_tokens || 0, output_tokens: data.usage?.completion_tokens || 0 }
      };
    }

    if (!response.ok) log('error', 'AI API (' + apiCfg.provider + '): ' + response.status);

    // Token-Verbrauch tracken (async, blockiert nicht)
    if (response.ok && data.usage) {
      tracker.trackUsage({
        userId:       req.session.userId,
        systemId,
        feature,
        model:        cleanBody.model || 'default',
        inputTokens:  data.usage.input_tokens  || 0,
        outputTokens: data.usage.output_tokens || 0,
      }).catch(() => {});
    }

    // Budget-Warnung in Response-Header
    if (budget.warning) res.setHeader('X-Budget-Warning', budget.warning);

    res.status(response.status).json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── TOKEN TRACKING ───────────────────────────────────────────
// Usage-Statistiken abrufen (Admin: alle, User: eigene)
app.get('/api/tokens/usage', requireAuth, async (req, res) => {
  try {
    const isAdmin = (await queryOne('SELECT role FROM users WHERE id=$1', [req.session.userId]))?.role === 'admin';
    const opts = {
      months:   parseInt(req.query.months || 3),
      systemId: req.query.systemId || null,
      feature:  req.query.feature  || null,
      userId:   isAdmin ? (req.query.userId || null) : req.session.userId,
    };
    const stats = await tracker.getUsageStats(opts);
    res.json({ ...stats, isAdmin });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Feature-Budgets abrufen
app.get('/api/tokens/budgets', requireAuth, requireAdmin, async (req, res) => {
  try {
    const stats = await tracker.getUsageStats({ months: 1 });
    res.json(stats.budgets);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Feature-Budget speichern
app.post('/api/tokens/budgets/:feature', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { enabled, monthlyLimitUsd, alertThreshold } = req.body;
    await tracker.saveBudget({
      feature:        req.params.feature,
      enabled:        enabled !== false,
      monthlyLimitUsd: monthlyLimitUsd || null,
      alertThreshold:  alertThreshold || 0.80,
    });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Feature-Status für Frontend (welche Features sind aktiv?)
app.get('/api/tokens/features', requireAuth, async (req, res) => {
  try {
    const { rows } = await query('SELECT feature, enabled, monthly_limit_usd, description FROM feature_budgets ORDER BY feature');
    const status = {};
    for (const r of rows) {
      status[r.feature] = { enabled: r.enabled, hasLimit: !!r.monthly_limit_usd, description: r.description };
    }
    res.json(status);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── LICENSE (Stub — wird in späterer Version implementiert) ───
app.get('/api/license/status', requireAuth, requireAdmin, (req, res) => {
  res.json({ status: 'unlicensed', seats: 999, customer: 'Self-Hosted', expires_at: null });
});
app.post('/api/license/activate', requireAuth, requireAdmin, (req, res) => {
  res.json({ ok: true, message: 'License-System wird in v5.0 implementiert' });
});
app.delete('/api/license', requireAuth, requireAdmin, (req, res) => {
  res.json({ ok: true });
});

// ── JIRA PROXY ────────────────────────────────────────────────
app.post('/api/jira/:action', requireAuth, async (req, res) => {
  try {
    const { url, email, token, path:jiraPath, method='GET', body } = req.body;
    if (!url||!email||!token) return res.status(400).json({ error: 'Zugangsdaten unvollständig' });
    const auth = Buffer.from(`${email}:${token}`).toString('base64');
    const response = await fetch(`${url}${jiraPath}`, {
      method, headers:{'Authorization':`Basic ${auth}`,'Accept':'application/json','Content-Type':'application/json'},
      body: body ? JSON.stringify(body) : undefined,
    });
    res.status(response.status).json(await response.json());
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── VERSION & HEALTH ──────────────────────────────────────────
app.get('/api/version', async (req, res) => {
  const db     = await healthCheck();
  const apiMode = (await queryOne("SELECT value FROM app_settings WHERE key='api_key_mode'"))?.value || 'global';
  const [reqs, sys, usr] = await Promise.all([
    queryOne('SELECT COUNT(*) as c FROM requirements'),
    queryOne('SELECT COUNT(*) as c FROM systems'),
    queryOne('SELECT COUNT(*) as c FROM users'),
  ]);
  res.json({
    version: '4.0.0', mode: 'homeassistant-addon',
    db: { ...db, engine: 'postgresql' }, apiKeyMode: apiMode,
    counts: { requirements: parseInt(reqs?.c||0), systems: parseInt(sys?.c||0), users: parseInt(usr?.c||0) },
  });
});

app.get('/api/health', async (req, res) => {
  const db = await healthCheck();
  res.status(db.ok ? 200 : 503).json({ status: db.ok ? 'ok' : 'degraded', ...db });
});

// ── BACKUP ────────────────────────────────────────────────────
app.get('/api/backup', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [users, systems, requirements, backlogs, workshops, diagrams] = await Promise.all([
      queryAll('SELECT * FROM users'),
      queryAll('SELECT * FROM systems'),
      queryAll('SELECT * FROM requirements'),
      queryAll('SELECT * FROM backlogs'),
      queryAll('SELECT * FROM workshops'),
      queryAll('SELECT * FROM diagrams'),
    ]);
    res.setHeader('Content-Disposition', `attachment; filename="re-backup-${Date.now()}.json"`);
    res.json({
      version: '4.0.0', exportedAt: new Date().toISOString(),
      users:    users.map(mapUser).map(({password:_p,...u})=>u),
      systems:  systems.map(mapSystem),
      requirements: requirements.map(mapReq),
      backlogs:  backlogs.map(mapGeneric),
      workshops: workshops.map(mapGeneric),
      diagrams:  diagrams.map(mapGeneric),
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// ══════════════════════════════════════════════════════════════
// AUDIT LOG
// ══════════════════════════════════════════════════════════════

app.get('/api/audit-log', requireAuth, async (req, res) => {
  try {
    const user = await queryOne('SELECT * FROM users WHERE id=$1', [req.session.userId]);
    if (!user) return res.status(401).json({ error: 'Nicht authentifiziert' });
    const limit = Math.min(parseInt(req.query.limit)||100, 500);
    const offset = parseInt(req.query.offset)||0;
    const where = []; const params = []; let p = 1;
    if (user.role !== 'admin') {
      const userSystems = JSON.parse(user.systems||'[]');
      if (!userSystems.length) return res.json({ entries:[], total:0 });
      where.push(`(system_id = ANY($${p}::text[]) AND event_type != 'login')`);
      params.push(userSystems); p++;
    }
    if (req.query.action)   { where.push(`action=$${p}`);      params.push(req.query.action);   p++; }
    if (req.query.entity)   { where.push(`entity_type=$${p}`); params.push(req.query.entity);   p++; }
    if (req.query.systemId) { where.push(`system_id=$${p}`);   params.push(req.query.systemId); p++; }
    if (req.query.dateFrom) { where.push(`created_at>=$${p}`); params.push(req.query.dateFrom); p++; }
    const wc = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const total = parseInt((await queryOne(`SELECT COUNT(*) as c FROM audit_log ${wc}`, params))?.c||0);
    const rows = (await query(`SELECT * FROM audit_log ${wc} ORDER BY created_at DESC LIMIT $${p} OFFSET $${p+1}`, [...params, limit, offset])).rows;
    res.json({ entries: rows, total });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/audit-log/systems', requireAuth, async (req, res) => {
  try {
    const user = await queryOne('SELECT * FROM users WHERE id=$1', [req.session.userId]);
    const rows = user.role === 'admin'
      ? (await query('SELECT id, name FROM systems ORDER BY name', [])).rows
      : (await query('SELECT id, name FROM systems WHERE id = ANY($1::text[]) ORDER BY name', [JSON.parse(user.systems||'[]')])).rows;
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/audit-log/write', requireAuth, async (req, res) => {
  try {
    const user = await queryOne('SELECT name FROM users WHERE id=$1', [req.session.userId]);
    await writeAuditLog({ ...req.body, userId: req.session.userId, userName: user?.name||'', ipAddress: req.ip });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════
// CONFLICTS
// ══════════════════════════════════════════════════════════════

app.get('/api/conflicts', requireAuth, async (req, res) => {
  try {
    const where = ["status!='resolved'"]; const params = []; let p = 1;
    if (req.query.systemId) { where.push(`(system_id_a=$${p} OR system_id_b=$${p})`); params.push(req.query.systemId); p++; }
    if (req.query.status)   { where[0] = `status=$${p}`; params.push(req.query.status); p++; }
    const rows = (await query(`SELECT * FROM req_conflicts WHERE ${where.join(' AND ')} ORDER BY created_at DESC`, params)).rows;
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/conflicts/:id/resolve', requireAuth, async (req, res) => {
  try {
    await query("UPDATE req_conflicts SET status='resolved' WHERE id=$1", [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/conflicts/analyze', requireAuth, async (req, res) => {
  try {
    const { reqId, systemId, crossSystem } = req.body;
    const req_ = await queryOne('SELECT * FROM requirements WHERE id=$1', [reqId]);
    if (!req_) return res.status(404).json({ error: 'Nicht gefunden' });
    const relIds = [systemId];
    if (crossSystem) {
      const sys = await queryOne('SELECT parent_id FROM systems WHERE id=$1', [systemId]);
      if (sys?.parent_id) {
        relIds.push(sys.parent_id);
        const siblings = (await query('SELECT id FROM systems WHERE parent_id=$1 AND id!=$2',[sys.parent_id,systemId])).rows;
        relIds.push(...siblings.map(s=>s.id));
      }
    }
    const rows = (await query('SELECT id,title,description,system_id FROM requirements WHERE system_id = ANY($1::text[]) AND id!=$2 LIMIT 25',[relIds,reqId])).rows;
    if (!rows.length) return res.json({ conflicts:[] });
    const apiCfg = await resolveApiConfig(req.session.userId);
    if (!apiCfg.key) return res.json({ conflicts:[] });
    const prompt = `Analysiere Konflikte. JSON: {"conflicts":[{"reqId":"ID","type":"contradiction|overlap|ambiguity","severity":"high|medium|low","description":"kurz","suggestion":"Lösung"}]}
Falls keine: {"conflicts":[]}
Neu: [${req_.id}] ${req_.title}
Bestehende:
${rows.slice(0,15).map(r=>`- [${r.id}] ${r.title}`).join('\n')}`;
    let apiUrl, apiHeaders, apiBody;
    if (apiCfg.provider!=='anthropic') {
      const model = apiCfg.provider==='groq'?'llama-3.3-70b-versatile':'grok-3-mini';
      apiUrl = apiCfg.provider==='groq'?'https://api.groq.com/openai/v1/chat/completions':'https://api.x.ai/v1/chat/completions';
      apiHeaders={'Content-Type':'application/json','Authorization':'Bearer '+apiCfg.key};
      apiBody={model,messages:[{role:'user',content:prompt}],max_tokens:600};
    } else {
      apiUrl='https://api.anthropic.com/v1/messages';
      apiHeaders={'Content-Type':'application/json','x-api-key':apiCfg.key,'anthropic-version':'2023-06-01'};
      apiBody={model:'claude-haiku-4-5-20251001',max_tokens:600,messages:[{role:'user',content:prompt}]};
    }
    const response = await fetch(apiUrl,{method:'POST',headers:apiHeaders,body:JSON.stringify(apiBody)});
    const data = await response.json();
    const text = apiCfg.provider==='anthropic'?data.content?.[0]?.text||'{}':data.choices?.[0]?.message?.content||'{}';
    const result = JSON.parse(text.replace(/```json|```/g,'').trim());
    for (const c of (result.conflicts||[])) {
      const ex = await queryOne("SELECT id FROM req_conflicts WHERE req_id_a=$1 AND req_id_b=$2 AND status!='resolved'",[reqId,c.reqId]);
      if (!ex) {
        const cr=rows.find(r=>r.id===c.reqId);
        await query('INSERT INTO req_conflicts (req_id_a,req_id_b,system_id_a,system_id_b,conflict_type,description,severity,ai_suggestion) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
          [reqId,c.reqId,systemId,cr?.system_id||systemId,c.type,c.description,c.severity||'medium',c.suggestion||'']);
      }
    }
    res.json({conflicts:result.conflicts||[],count:(result.conflicts||[]).length});
  } catch(e) { log('warning','Konflikt: '+e.message); res.json({conflicts:[]}); }
});

// ══════════════════════════════════════════════════════════════
// USER STORIES + TEST CASES
// ══════════════════════════════════════════════════════════════

app.get('/api/user-stories', requireAuth, async (req,res) => {
  try {
    const {reqId,systemId}=req.query;
    const rows = reqId ? (await query('SELECT * FROM user_stories WHERE req_id=$1 ORDER BY created_at',[reqId])).rows
      : systemId ? (await query('SELECT * FROM user_stories WHERE system_id=$1 ORDER BY created_at',[systemId])).rows
      : (await query('SELECT * FROM user_stories ORDER BY created_at DESC LIMIT 200',[])).rows;
    res.json(rows.map(r=>({id:r.id,reqId:r.req_id,systemId:r.system_id,title:r.title,description:r.description,
      acceptanceCriteria:JSON.parse(r.acceptance_criteria||'[]'),priority:r.priority,status:r.status,
      storyPoints:r.story_points,createdAt:r.created_at})));
  } catch(e){res.status(500).json({error:e.message});}
});

app.post('/api/user-stories', requireAuth, async (req,res) => {
  try {
    const {id,reqId,systemId,title,description,acceptanceCriteria,priority,status,storyPoints}=req.body;
    const now=new Date().toISOString();
    if(id){
      await query('UPDATE user_stories SET title=$1,description=$2,acceptance_criteria=$3,priority=$4,status=$5,story_points=$6,updated_at=$7 WHERE id=$8',
        [title,description||'',JSON.stringify(acceptanceCriteria||[]),priority||'medium',status||'open',storyPoints||null,now,id]);
    } else {
      await query('INSERT INTO user_stories (id,req_id,system_id,title,description,acceptance_criteria,priority,status,story_points,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)',
        ['us-'+Date.now()+'-'+Math.floor(Math.random()*1000),reqId,systemId,title,description||'',JSON.stringify(acceptanceCriteria||[]),priority||'medium',status||'open',storyPoints||null,now]);
    }
    res.json({ok:true});
  } catch(e){res.status(500).json({error:e.message});}
});

app.delete('/api/user-stories/:id', requireAuth, async (req,res) => {
  try{await query('DELETE FROM user_stories WHERE id=$1',[req.params.id]);res.json({ok:true});}
  catch(e){res.status(500).json({error:e.message});}
});

app.post('/api/user-stories/generate', requireAuth, async (req,res) => {
  try {
    const {reqId,systemId}=req.body;
    const req_=await queryOne('SELECT * FROM requirements WHERE id=$1',[reqId]);
    if(!req_) return res.status(404).json({error:'Nicht gefunden'});
    const apiCfg=await resolveApiConfig(req.session.userId);
    if(!apiCfg.key) return res.status(500).json({error:'Kein API-Key'});
    const prompt=`Generiere 2-4 User Stories. NUR JSON-Array ohne weiteren Text:
[{"title":"Als [Rolle] möchte ich...","description":"Damit...","acceptanceCriteria":["AC1"],"priority":"medium","storyPoints":3}]
Anforderung: ${req_.title}
${req_.description||''}`;
    let apiUrl,apiHeaders,apiBody;
    if(apiCfg.provider!=='anthropic'){
      const model=apiCfg.provider==='groq'?'llama-3.3-70b-versatile':'grok-3-mini';
      apiUrl=apiCfg.provider==='groq'?'https://api.groq.com/openai/v1/chat/completions':'https://api.x.ai/v1/chat/completions';
      apiHeaders={'Content-Type':'application/json','Authorization':'Bearer '+apiCfg.key};
      apiBody={model,messages:[{role:'user',content:prompt}],max_tokens:1000};
    } else {
      apiUrl='https://api.anthropic.com/v1/messages';
      apiHeaders={'Content-Type':'application/json','x-api-key':apiCfg.key,'anthropic-version':'2023-06-01'};
      apiBody={model:'claude-haiku-4-5-20251001',max_tokens:1000,messages:[{role:'user',content:prompt}]};
    }
    const response=await fetch(apiUrl,{method:'POST',headers:apiHeaders,body:JSON.stringify(apiBody)});
    const data=await response.json();
    const text=apiCfg.provider==='anthropic'?data.content?.[0]?.text||'[]':data.choices?.[0]?.message?.content||'[]';
    const stories=JSON.parse(text.replace(/```json|```/g,'').trim());
    res.json({stories:Array.isArray(stories)?stories:[]});
  } catch(e){res.status(500).json({error:e.message});}
});

app.get('/api/test-cases', requireAuth, async (req,res) => {
  try {
    const {storyId,reqId,systemId}=req.query;
    const rows=storyId?(await query('SELECT * FROM test_cases WHERE story_id=$1 ORDER BY created_at',[storyId])).rows
      :reqId?(await query('SELECT * FROM test_cases WHERE req_id=$1 ORDER BY created_at',[reqId])).rows
      :systemId?(await query('SELECT * FROM test_cases WHERE system_id=$1 ORDER BY created_at',[systemId])).rows:[];
    res.json(rows.map(r=>({id:r.id,storyId:r.story_id,reqId:r.req_id,systemId:r.system_id,
      title:r.title,steps:JSON.parse(r.steps||'[]'),expected:r.expected,status:r.status,createdAt:r.created_at})));
  } catch(e){res.status(500).json({error:e.message});}
});

app.post('/api/test-cases', requireAuth, async (req,res) => {
  try {
    const {id,storyId,reqId,systemId,title,steps,expected,status}=req.body;
    const now=new Date().toISOString();
    if(id){
      await query('UPDATE test_cases SET title=$1,steps=$2,expected=$3,status=$4,updated_at=$5 WHERE id=$6',
        [title,JSON.stringify(steps||[]),expected||'',status||'not_run',now,id]);
    } else {
      await query('INSERT INTO test_cases (id,story_id,req_id,system_id,title,steps,expected,status,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)',
        ['tc-'+Date.now()+'-'+Math.floor(Math.random()*1000),storyId||null,reqId||null,systemId||null,title,JSON.stringify(steps||[]),expected||'',status||'not_run',now]);
    }
    res.json({ok:true});
  } catch(e){res.status(500).json({error:e.message});}
});

app.delete('/api/test-cases/:id', requireAuth, async (req,res) => {
  try{await query('DELETE FROM test_cases WHERE id=$1',[req.params.id]);res.json({ok:true});}
  catch(e){res.status(500).json({error:e.message});}
});

// ══════════════════════════════════════════════════════════════
// REQUIREMENT FEATURES
// ══════════════════════════════════════════════════════════════

app.get('/api/requirements/:id/comments', requireAuth, async (req,res) => {
  try {
    const rows=(await query('SELECT * FROM req_comments WHERE req_id=$1 ORDER BY created_at ASC',[req.params.id])).rows;
    res.json(rows.map(r=>({id:r.id,reqId:r.req_id,userId:r.user_id,userName:r.user_name,
      content:r.content,mentions:JSON.parse(r.mentions||'[]'),edited:r.edited,editedAt:r.edited_at,createdAt:r.created_at})));
  } catch(e){res.status(500).json({error:e.message});}
});

app.put('/api/requirements/:reqId/comments/:commentId', requireAuth, async (req,res) => {
  try {
    await query('UPDATE req_comments SET content=$1,edited=true,edited_at=$2 WHERE id=$3 AND user_id=$4',
      [req.body.content,new Date().toISOString(),req.params.commentId,req.session.userId]);
    res.json({ok:true});
  } catch(e){res.status(500).json({error:e.message});}
});

app.delete('/api/requirements/:reqId/comments/:commentId', requireAuth, async (req,res) => {
  try {
    const user=await queryOne('SELECT role FROM users WHERE id=$1',[req.session.userId]);
    const cmt=await queryOne('SELECT user_id FROM req_comments WHERE id=$1',[req.params.commentId]);
    if(cmt?.user_id!==req.session.userId&&user?.role!=='admin')
      return res.status(403).json({error:'Nur eigene Kommentare löschen'});
    await query('DELETE FROM req_comments WHERE id=$1',[req.params.commentId]);
    res.json({ok:true});
  } catch(e){res.status(500).json({error:e.message});}
});

app.post('/api/requirements/:id/watch', requireAuth, async (req,res) => {
  try {
    const req_=await queryOne('SELECT watchers FROM requirements WHERE id=$1',[req.params.id]);
    if(!req_) return res.status(404).json({error:'Nicht gefunden'});
    let watchers=JSON.parse(req_.watchers||'[]');
    const idx=watchers.indexOf(req.session.userId);
    if(idx===-1) watchers.push(req.session.userId);
    else watchers.splice(idx,1);
    await query('UPDATE requirements SET watchers=$1 WHERE id=$2',[JSON.stringify(watchers),req.params.id]);
    res.json({ok:true,watching:watchers.includes(req.session.userId),count:watchers.length});
  } catch(e){res.status(500).json({error:e.message});}
});

app.post('/api/requirements/:id/links', requireAuth, async (req,res) => {
  try {
    const req_=await queryOne('SELECT linked_reqs FROM requirements WHERE id=$1',[req.params.id]);
    if(!req_) return res.status(404).json({error:'Nicht gefunden'});
    let links=JSON.parse(req_.linked_reqs||'[]');
    if(!links.find(l=>l.id===req.body.targetId)) links.push({id:req.body.targetId,type:req.body.linkType||'relates'});
    await query('UPDATE requirements SET linked_reqs=$1 WHERE id=$2',[JSON.stringify(links),req.params.id]);
    res.json({ok:true});
  } catch(e){res.status(500).json({error:e.message});}
});

app.delete('/api/requirements/:id/links/:targetId', requireAuth, async (req,res) => {
  try {
    const req_=await queryOne('SELECT linked_reqs FROM requirements WHERE id=$1',[req.params.id]);
    const links=JSON.parse(req_?.linked_reqs||'[]').filter(l=>l.id!==req.params.targetId);
    await query('UPDATE requirements SET linked_reqs=$1 WHERE id=$2',[JSON.stringify(links),req.params.id]);
    res.json({ok:true});
  } catch(e){res.status(500).json({error:e.message});}
});

// ══════════════════════════════════════════════════════════════
// WORKSHOPS
// ══════════════════════════════════════════════════════════════

app.get('/api/workshops', requireAuth, async (req,res) => {
  try {
    const user=await queryOne('SELECT * FROM users WHERE id=$1',[req.session.userId]);
    const {systemId}=req.query;
    let rows;
    if(user.role==='admin'){
      rows=systemId?(await query('SELECT * FROM workshops WHERE system_id=$1 ORDER BY created_at DESC',[systemId])).rows
        :(await query('SELECT * FROM workshops ORDER BY created_at DESC',[])).rows;
    } else {
      const ids=JSON.parse(user.systems||'[]');
      if(!ids.length) return res.json([]);
      rows=systemId&&ids.includes(systemId)
        ?(await query('SELECT * FROM workshops WHERE system_id=$1 ORDER BY created_at DESC',[systemId])).rows
        :(await query('SELECT * FROM workshops WHERE system_id = ANY($1::text[]) ORDER BY created_at DESC',[ids])).rows;
    }
    res.json(rows.map(w=>({id:w.id,name:w.name,goal:w.goal||'',systemId:w.system_id,
      entries:JSON.parse(w.entries||'[]'),structured:JSON.parse(w.structured||'{}'),createdAt:w.created_at})));
  } catch(e){res.status(500).json({error:e.message});}
});

app.post('/api/workshops', requireAuth, async (req,res) => {
  try {
    const {id,name,goal,systemId,entries,structured}=req.body;
    const now=new Date().toISOString();
    if(id){
      await query('UPDATE workshops SET name=$1,goal=$2,entries=$3,structured=$4,updated_at=$5 WHERE id=$6',
        [name,goal||'',JSON.stringify(entries||[]),JSON.stringify(structured||{}),now,id]);
    } else {
      await query('INSERT INTO workshops (id,name,goal,system_id,entries,structured,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$7)',
        ['ws-'+Date.now(),name,goal||'',systemId||null,JSON.stringify(entries||[]),JSON.stringify(structured||{}),now]);
    }
    res.json({ok:true});
  } catch(e){res.status(500).json({error:e.message});}
});

app.delete('/api/workshops/:id', requireAuth, async (req,res) => {
  try{await query('DELETE FROM workshops WHERE id=$1',[req.params.id]);res.json({ok:true});}
  catch(e){res.status(500).json({error:e.message});}
});


// ── BACKUP & EXPORT ───────────────────────────────────────────

app.get('/api/backup/export', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [systems, reqs, workshops, users] = await Promise.all([
      query('SELECT * FROM systems', []),
      query('SELECT * FROM requirements WHERE archived=false', []),
      query('SELECT * FROM workshops', []).catch(() => ({ rows: [] })),
      query('SELECT id,name,email,role,systems,subcategories,ai_provider FROM users', []),
    ]);

    const backup = {
      version: '4.2',
      exportedAt: new Date().toISOString(),
      systems: systems.rows,
      requirements: reqs.rows,
      workshops: workshops.rows,
      users: users.rows,
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="re-assistant-backup-${new Date().toISOString().split('T')[0]}.json"`);
    res.json(backup);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/backup/import', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { systems, requirements, workshops } = req.body;
    let imported = { systems: 0, requirements: 0, workshops: 0 };

    for (const s of (systems || [])) {
      await query(
        'INSERT INTO systems (id,name,description,docs,id_prefix,id_counter,parent_id,level,sort_order,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (id) DO UPDATE SET name=$2,description=$3',
        [s.id,s.name,s.description||'',s.docs||'[]',s.id_prefix||'REQ',s.id_counter||0,s.parent_id||null,s.level||0,s.sort_order||0,s.created_at||new Date(),s.updated_at||new Date()]
      ).catch(() => {});
      imported.systems++;
    }

    for (const r of (requirements || [])) {
      await query(
        'INSERT INTO requirements (id,system_id,title,description,category,priority,status,rationale,tags,acceptance_criteria,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (id) DO UPDATE SET title=$3,description=$4',
        [r.id,r.system_id,r.title,r.description||'',r.category||'Funktional',r.priority||'medium',r.status||'open',r.rationale||'',r.tags||'[]',r.acceptance_criteria||'[]',r.created_at||new Date(),r.updated_at||new Date()]
      ).catch(() => {});
      imported.requirements++;
    }

    for (const w of (workshops || [])) {
      await query(
        'INSERT INTO workshops (id,name,goal,system_id,entries,structured,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO UPDATE SET name=$2',
        [w.id,w.name,w.goal||'',w.system_id||null,w.entries||'[]',w.structured||'{}',w.created_at||new Date(),w.updated_at||new Date()]
      ).catch(() => {});
      imported.workshops++;
    }

    res.json({ ok: true, imported });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// ── System-Kontext-Cache ──────────────────────────────────────
// Helper: fetch mit Timeout (verhindert ewiges Hängen)
async function fetchWithTimeout(url, opts, timeoutMs = 25000) {
  return fetch(url, { ...opts, signal: AbortSignal.timeout(timeoutMs) });
}

// Kleinen Prompt an die KI senden — gibt Text zurück oder null bei Fehler
async function aiCall(apiCfg, prompt, maxTokens = 400, timeoutMs = 30000, retries = 1) {
  let apiUrl, apiHeaders, apiBody;
  if (apiCfg.provider === 'grok' || apiCfg.provider === 'groq') {
    const model = apiCfg.provider === 'groq' ? 'llama-3.3-70b-versatile' : 'grok-3-mini';
    apiUrl = apiCfg.provider === 'groq'
      ? 'https://api.groq.com/openai/v1/chat/completions'
      : 'https://api.x.ai/v1/chat/completions';
    apiHeaders = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiCfg.key };
    apiBody = { model, messages: [{ role: 'user', content: prompt }], max_tokens: maxTokens };
  } else {
    apiUrl = 'https://api.anthropic.com/v1/messages';
    apiHeaders = { 'Content-Type': 'application/json', 'x-api-key': apiCfg.key, 'anthropic-version': '2023-06-01' };
    apiBody = { model: 'claude-haiku-4-5-20251001', max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] };
  }

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetchWithTimeout(apiUrl, {
        method: 'POST', headers: apiHeaders, body: JSON.stringify(apiBody),
      }, timeoutMs);

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        // Bei 429 (Rate Limit) oder 5xx: Retry lohnt sich
        if ((response.status === 429 || response.status >= 500) && attempt < retries) {
          await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
          continue;
        }
        throw new Error(`${apiCfg.provider} ${response.status}: ${errText.substring(0, 200)}`);
      }

      const data = await response.json();
      return apiCfg.provider === 'anthropic'
        ? data.content?.[0]?.text || ''
        : data.choices?.[0]?.message?.content || '';
    } catch(e) {
      lastErr = e;
      // Bei Timeout/AbortError: einmal retry mit etwas mehr Zeit
      if ((e.name === 'TimeoutError' || e.name === 'AbortError') && attempt < retries) {
        timeoutMs = Math.round(timeoutMs * 1.5);
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

// ── System-Kontext-Cache — inkrementell, mit Timeouts und Progress ───
async function buildSystemContextCache(systemId) {
  const updateStatus = async (status, extra = {}) => {
    const fields = ['build_status=$2'];
    const params = [systemId, status];
    let p = 3;
    for (const [k, v] of Object.entries(extra)) {
      fields.push(`${k}=$${p}`);
      params.push(v);
      p++;
    }
    await query(
      `INSERT INTO system_context_cache (system_id, build_status)
       VALUES ($1, $2)
       ON CONFLICT (system_id) DO UPDATE SET ${fields.join(', ')}`,
      params
    ).catch(e => log('warning', `Cache-Status-Update fehlgeschlagen: ${e.message}`));
  };

  try {
    log('info', `Cache: Baue Kontext für System ${systemId} …`);
    await updateStatus('building', { docs_processed: 0, docs_total: 0 });

    // Dokumente ermitteln (gruppiert)
    const chunkRows = await queryAll(
      'SELECT chunk_text, doc_name, doc_id FROM embeddings WHERE system_id=$1 ORDER BY doc_name, chunk_index LIMIT 3000',
      [systemId]
    );

    if (!chunkRows.length) {
      await updateStatus('empty', { summary: '', docs_total: 0 });
      return;
    }

    const byDoc = {};
    for (const c of chunkRows) {
      if (!byDoc[c.doc_id]) byDoc[c.doc_id] = { name: c.doc_name, texts: [] };
      byDoc[c.doc_id].texts.push(c.chunk_text);
    }
    const docIds = Object.keys(byDoc);
    await updateStatus('building', { docs_total: docIds.length });

    const apiCfg = await resolveApiConfig(null);

    // ── Ohne API-Key: einfacher Kontext ohne KI ─────────────────
    if (!apiCfg.key) {
      const simpleContext = Object.values(byDoc)
        .map(d => `=== ${d.name} ===\n${d.texts.slice(0,3).join('\n')}`)
        .join('\n\n')
        .substring(0, 50000);
      // 'ready_no_ai' statt 'ready' — wird automatisch neu gebaut sobald ein Key vorhanden ist
      await updateStatus('ready_no_ai', {
        summary: simpleContext, doc_names: JSON.stringify(Object.values(byDoc).map(d=>d.name)),
        token_count: simpleContext.length, docs_processed: docIds.length,
      });
      log('info', `Cache: Einfacher Kontext gespeichert (kein API-Key) — Status 'ready_no_ai'`);
      return;
    }

    // ── Schritt 1: Pro Dokument eine kurze Zusammenfassung ──────
    // Bereits vorhandene Zusammenfassungen wiederverwenden (resumable)
    const existing = await queryAll(
      'SELECT doc_id, summary FROM doc_summaries WHERE system_id=$1', [systemId]
    );
    const existingMap = {};
    for (const e of existing) existingMap[e.doc_id] = e.summary;

    const BATCH_SIZE = 5; // parallel
    let processed = Object.keys(existingMap).length;

    const toProcess = docIds.filter(id => !existingMap[id]);

    for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
      const batch = toProcess.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(async (docId) => {
        const doc = byDoc[docId];
        const content = doc.texts.join(' ').substring(0, 4000);
        const prompt = `Fasse den Inhalt dieser Datei in 2-3 Sätzen auf Deutsch zusammen. Konzentriere dich auf: Was macht dieser Code/diese Datei? Welche Funktionen, Komponenten oder Konfigurationen enthält sie?\n\nDatei: ${doc.name}\n\nInhalt:\n${content}`;

        try {
          const summary = await aiCall(apiCfg, prompt, 200, 30000, 1);
          await query(
            'INSERT INTO doc_summaries (doc_id,system_id,doc_name,summary) VALUES ($1,$2,$3,$4) ON CONFLICT (doc_id) DO UPDATE SET summary=$4',
            [docId, systemId, doc.name, summary.trim()]
          );
        } catch(e) {
          log('warning', `Cache: Dok-Zusammenfassung fehlgeschlagen für ${doc.name}: ${e.message}`);
          // Fallback: erster Chunk als "Zusammenfassung"
          await query(
            'INSERT INTO doc_summaries (doc_id,system_id,doc_name,summary) VALUES ($1,$2,$3,$4) ON CONFLICT (doc_id) DO UPDATE SET summary=$4',
            [docId, systemId, doc.name, content.substring(0, 300)]
          ).catch(() => {});
        }
        processed++;
      }));

      // Fortschritt aktualisieren
      await updateStatus('building', { docs_processed: processed });
      log('info', `Cache: ${processed}/${docIds.length} Dokumente zusammengefasst`);
    }

    // ── Schritt 2: Dateien nach Ordnerstruktur gruppieren ───────
    const allSummaries = await queryAll(
      'SELECT doc_name, summary FROM doc_summaries WHERE system_id=$1 ORDER BY doc_name', [systemId]
    );

    // Gruppierung anhand des Pfads — z.B. "frontend/src/business/chat.js" -> Gruppe "frontend/src/business"
    const groupOf = (path) => {
      const parts = path.split('/');
      if (parts.length <= 1) return '(root)';
      // Bis zu 3 Ebenen tief gruppieren (verhindert zu viele Mini-Gruppen)
      return parts.slice(0, Math.min(parts.length - 1, 3)).join('/');
    };

    const groups = {};
    for (const s of allSummaries) {
      const g = groupOf(s.doc_name);
      if (!groups[g]) groups[g] = [];
      groups[g].push(s);
    }
    const groupNames = Object.keys(groups).sort();
    log('info', `Cache: ${allSummaries.length} Dateien in ${groupNames.length} Gruppen`);

    // ── Schritt 3: Pro Gruppe eine Zwischenzusammenfassung ──────
    const groupSummaries = {};
    const GROUP_BATCH = 4;
    const groupEntries = Object.entries(groups);

    for (let i = 0; i < groupEntries.length; i += GROUP_BATCH) {
      const batch = groupEntries.slice(i, i + GROUP_BATCH);
      await Promise.all(batch.map(async ([groupName, files]) => {
        // Kleine Gruppen (1-2 Dateien) nicht extra zusammenfassen — direkt übernehmen
        if (files.length <= 2) {
          groupSummaries[groupName] = files.map(f => `${f.doc_name}: ${f.summary}`).join(' ');
          return;
        }
        const fileList = files.map(f => `- ${f.doc_name}: ${f.summary}`).join('\n');
        const prompt = `Diese Dateien gehören zum Modul "${groupName}" eines Softwaresystems. Fasse in 2-4 Sätzen auf Deutsch zusammen, welchen Zweck dieses Modul erfüllt und welche Hauptfunktionen es bereitstellt.\n\nDateien:\n${fileList.substring(0, 6000)}`;
        try {
          groupSummaries[groupName] = await aiCall(apiCfg, prompt, 250, 30000, 1);
        } catch(e) {
          log('warning', `Cache: Gruppe ${groupName} fehlgeschlagen: ${e.message}`);
          groupSummaries[groupName] = fileList.substring(0, 500);
        }
      }));
      await updateStatus('building', { docs_processed: docIds.length }); // Phase 2 läuft, Doks bereits fertig
    }

    // ── Schritt 4: Finale Gesamtzusammenfassung aus Gruppen ─────
    const groupsCombined = groupNames
      .map(g => `### ${g}\n${groupSummaries[g]}`)
      .join('\n\n');

    const finalPrompt = `Hier sind Zusammenfassungen aller Module/Ordner eines Softwaresystems (${allSummaries.length} Dateien in ${groupNames.length} Modulen). Erstelle daraus eine strukturierte Gesamtübersicht auf Deutsch mit:
1. Überblick: Was ist das System? (3-5 Sätze)
2. Hauptfunktionen — möglichst vollständig, gruppiert nach Bereich
3. Technische Details: Architektur, Technologien, Module/Ordnerstruktur
4. Wichtige Prozesse und Abläufe

Modul-Zusammenfassungen:
${groupsCombined.substring(0, 30000)}`;

    let finalSummary;
    try {
      finalSummary = await aiCall(apiCfg, finalPrompt, 4000, 60000, 1);
    } catch(e) {
      log('warning', `Cache: Finale Zusammenfassung fehlgeschlagen, nutze Modul-Zusammenfassungen: ${e.message}`);
      finalSummary = `Systemübersicht (automatisch zusammengestellt aus ${allSummaries.length} Dateien in ${groupNames.length} Modulen):\n\n${groupsCombined.substring(0, 35000)}`;
    }

    const topicMatches = finalSummary.match(/\*\*([^*]+)\*\*/g) || [];
    const keyTopics = topicMatches.map(t => t.replace(/\*/g, '')).slice(0, 20);

    await updateStatus('ready', {
      summary: finalSummary,
      key_topics: JSON.stringify(keyTopics),
      doc_names: JSON.stringify(Object.values(byDoc).map(d => d.name)),
      token_count: finalSummary.length,
      docs_processed: docIds.length,
      built_at: new Date().toISOString(),
    });

    log('info', `Cache: ✅ Kontext für ${systemId} fertig (${docIds.length} Dokumente, ${finalSummary.length} Zeichen)`);
  } catch(e) {
    log('error', `Cache: Fehler für ${systemId}: ${e.message}`);
    await query(
      `INSERT INTO system_context_cache (system_id, build_status)
       VALUES ($1, 'error')
       ON CONFLICT (system_id) DO UPDATE SET build_status='error'`,
      [systemId]
    ).catch(() => {});
  }
}

// Cache-Status abrufen
app.get('/api/systems/:id/context-cache', requireAuth, async (req, res) => {
  try {
    const cache = await queryOne('SELECT * FROM system_context_cache WHERE system_id=$1', [req.params.id]);
    res.json({
      systemId:      req.params.id,
      status:        cache?.build_status || 'not_built',
      builtAt:       cache?.built_at || null,
      docCount:      JSON.parse(cache?.doc_names || '[]').length,
      tokenCount:    cache?.token_count || 0,
      docsProcessed: cache?.docs_processed || 0,
      docsTotal:     cache?.docs_total || 0,
      hasCache:      !!cache && (cache.build_status === 'ready' || cache.build_status === 'ready_no_ai'),
      isAiGenerated: cache?.build_status === 'ready',
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Cache manuell neu aufbauen
app.post('/api/systems/:id/rebuild-cache', requireAuth, async (req, res) => {
  try {
    // Bei vollständigem Neuaufbau: alte Dok-Zusammenfassungen löschen
    if (req.body?.force) {
      await query('DELETE FROM doc_summaries WHERE system_id=$1', [req.params.id]);
    }
    res.json({ ok: true, message: 'Cache wird im Hintergrund aufgebaut …' });
    setImmediate(() => buildSystemContextCache(req.params.id));
  } catch(e) { res.status(500).json({ error: e.message }); }
});



app.get('/api/embeddings/summary', requireAuth, async (req, res) => {
  try {
    const { systemId } = req.query;
    if (!systemId) return res.status(400).json({ error: 'systemId fehlt' });
    const cache = await queryOne('SELECT * FROM system_context_cache WHERE system_id=$1', [systemId]);
    res.json({
      systemId,
      summary:   cache?.summary   || '',
      keyTopics: JSON.parse(cache?.key_topics || '[]'),
      docNames:  JSON.parse(cache?.doc_names  || '[]'),
      builtAt:   cache?.built_at  || null,
      status:    cache?.build_status || 'not_built',
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// Verbindungstest — sendet eine minimale echte Anfrage an den konfigurierten Provider
app.post('/api/apikey/test', requireAuth, requireAdmin, async (req, res) => {
  const startTime = Date.now();
  try {
    const apiCfg = await resolveApiConfig(req.session.userId);

    if (!apiCfg.key) {
      return res.json({ ok: false, provider: apiCfg.provider, error: 'Kein API-Key konfiguriert' });
    }

    let apiUrl, apiHeaders, apiBody, model;

    if (apiCfg.provider === 'grok' || apiCfg.provider === 'groq') {
      model  = apiCfg.provider === 'groq' ? 'llama-3.3-70b-versatile' : 'grok-3-mini';
      apiUrl = apiCfg.provider === 'groq'
        ? 'https://api.groq.com/openai/v1/chat/completions'
        : 'https://api.x.ai/v1/chat/completions';
      apiHeaders = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiCfg.key };
      apiBody    = { model, messages: [{ role: 'user', content: 'Antworte nur mit OK' }], max_tokens: 5 };
    } else {
      model      = 'claude-haiku-4-5-20251001';
      apiUrl     = 'https://api.anthropic.com/v1/messages';
      apiHeaders = { 'Content-Type': 'application/json', 'x-api-key': apiCfg.key, 'anthropic-version': '2023-06-01' };
      apiBody    = { model, max_tokens: 5, messages: [{ role: 'user', content: 'Antworte nur mit OK' }] };
    }

    log('info', `API-Test: ${apiCfg.provider} (${model}) → ${apiUrl}`);

    const response = await fetch(apiUrl, {
      method: 'POST', headers: apiHeaders, body: JSON.stringify(apiBody),
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json();
    const latency = Date.now() - startTime;

    if (!response.ok) {
      log('warning', `API-Test: ${apiCfg.provider} antwortete ${response.status}: ${JSON.stringify(data).substring(0,300)}`);
      return res.json({
        ok: false,
        provider: apiCfg.provider,
        model,
        status: response.status,
        error: data.error?.message || data.error?.type || JSON.stringify(data).substring(0,200),
        latency,
      });
    }

    const replyText = apiCfg.provider === 'anthropic'
      ? data.content?.[0]?.text || ''
      : data.choices?.[0]?.message?.content || '';

    log('info', `API-Test: ✅ ${apiCfg.provider} OK (${latency}ms)`);
    res.json({
      ok: true,
      provider: apiCfg.provider,
      model,
      reply: replyText.trim(),
      latency,
      keyPrefix: apiCfg.key.substring(0, 8) + '…',
    });
  } catch(e) {
    const latency = Date.now() - startTime;
    log('error', `API-Test: Fehler: ${e.message}`);
    let error = e.message;
    if (e.name === 'TimeoutError' || e.name === 'AbortError') {
      error = 'Zeitüberschreitung (15s) — Provider nicht erreichbar oder Netzwerk blockiert';
    }
    res.json({ ok: false, error, latency });
  }
});

// ── SPA Fallback ──────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

// ── Start ─────────────────────────────────────────────────────
const server = http.createServer(app);
ws.init(server, sessionMiddleware);
notif.initAsync = async () => {
  // Notifications brauchen DB-Zugang — async init
  notif._querySettings = async () => {
    const rows = await queryAll("SELECT key,value FROM app_settings WHERE key LIKE 'notif_%'");
    const s = {};
    for (const r of rows) s[r.key.replace('notif_','')] = r.value;
    return s;
  };
};

server.listen(PORT, '127.0.0.1', async () => {
  log('info', `RE-Assistent v4.0 läuft auf Port ${PORT}`);
  dna.startDNAWorker(30000); // DNA-Worker alle 30s
  const db = await healthCheck();
  log('info', `PostgreSQL: ${db.ok ? 'OK' : 'FEHLER — ' + db.error}`);
  log('info', `Pool: ${db.pool?.total||0} Verbindungen`);
  await notif.initAsync?.();

  // Hängende Cache-Builds zurücksetzen (z.B. nach Container-Neustart während Build)
  try {
    const stuck = await query(
      "UPDATE system_context_cache SET build_status='outdated' WHERE build_status='building' RETURNING system_id"
    );
    if (stuck.rows.length) {
      log('info', `Cache: ${stuck.rows.length} hängende Builds zurückgesetzt (status=outdated)`);
    }
  } catch(e) {}
});

process.on('SIGTERM', async () => {
  log('info', 'Beende RE-Assistent …');
  await pool.end();
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  log('error', `Unbehandelter Fehler: ${err.message}`);
  if (err.code?.startsWith('5')) return; // PostgreSQL-Fehler nicht crashen
  process.exit(1);
});
