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
  cookie: { secure: false, httpOnly: true, sameSite: 'lax', maxAge: 24*60*60*1000 },
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
async function resolveApiKey(userId) {
  const mode = (await queryOne("SELECT value FROM app_settings WHERE key='api_key_mode'"))?.value || 'global';
  if (mode === 'per_user' && userId) {
    const user = await queryOne('SELECT api_key FROM users WHERE id=$1', [userId]);
    if (user?.api_key) return user.api_key;
  }
  return process.env.ANTHROPIC_API_KEY ||
    (await queryOne("SELECT value FROM app_settings WHERE key='global_api_key'"))?.value || null;
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
    const docs = sys.docs || [];
    const added = [];
    for (const file of (req.files||[])) {
      if (!docs.find(d => d.name === file.originalname)) {
        const doc = { id:'d'+Date.now()+Math.random(), name:file.originalname, content:file.buffer.toString('utf-8'), size:file.size, addedAt:Date.now() };
        docs.push(doc); added.push(doc);
      }
    }
    await query('UPDATE systems SET docs=$1 WHERE id=$2', [JSON.stringify(docs), req.params.id]);
    res.json({ ok: true, added });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/systems/:sysId/docs/:docId', requireAuth, async (req, res) => {
  try {
    const sys  = mapSystem(await queryOne('SELECT * FROM systems WHERE id=$1', [req.params.sysId]));
    if (!sys) return res.status(404).json({ error: 'System nicht gefunden' });
    const docs = (sys.docs||[]).filter(d => d.id !== req.params.docId);
    await query('UPDATE systems SET docs=$1 WHERE id=$2', [JSON.stringify(docs), req.params.sysId]);
    await query('DELETE FROM embeddings WHERE doc_id=$1', [req.params.docId]);
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
    res.json({
      complete:    complete?.value === '1',
      systemCount: parseInt(sysCount?.c||0),
      reqCount:    parseInt(reqCount?.c||0),
      steps: { hasSystem: parseInt(sysCount?.c||0) > 0, hasRequirements: parseInt(reqCount?.c||0) > 0, hasUsers: parseInt(userCount?.c||0) > 1 },
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
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
    const { systemId, query:q2, topK=5 } = req.body;
    if (!systemId||!q2) return res.status(400).json({ error:'Ungültige Eingabe' });
    const like = `%${q2}%`;
    const chunks = await queryAll('SELECT * FROM embeddings WHERE system_id=$1', [systemId]);
    if (!chunks.length) return res.json({ results:[], fallback:true });
    const queryVec = simpleTextVector(q2);
    const scored = chunks.map(c => {
      const emb = c.embedding || [];
      return { text: c.chunk_text, docName: c.doc_name, score: cosineSimilarity(queryVec, emb) };
    }).sort((a,b) => b.score-a.score).slice(0, topK);
    res.json({ results: scored, fallback: false });
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
  try { res.json(notif.loadSettings()); } catch(e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/notifications/settings', requireAuth, requireAdmin, async (req, res) => {
  try { notif.saveSettings(req.body); res.json({ ok:true }); } catch(e) { res.status(500).json({ error: e.message }); }
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
app.post('/api/apikey/global', requireAuth, requireAdmin, async (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey?.startsWith('sk-')) return res.status(400).json({ error: 'Ungültiger API-Key' });
  await query("INSERT INTO app_settings (key,value) VALUES ('global_api_key',$1) ON CONFLICT (key) DO UPDATE SET value=$1", [apiKey]);
  res.json({ ok:true });
});
app.post('/api/apikey/user', requireAuth, async (req, res) => {
  const mode = (await queryOne("SELECT value FROM app_settings WHERE key='api_key_mode'"))?.value||'global';
  if (mode !== 'per_user') return res.status(403).json({ error: 'Per-User Keys nicht aktiv' });
  const { apiKey } = req.body;
  if (!apiKey?.startsWith('sk-')) return res.status(400).json({ error: 'Ungültiger API-Key' });
  await query('UPDATE users SET api_key=$1 WHERE id=$2', [apiKey, req.session.userId]);
  res.json({ ok:true });
});
app.delete('/api/apikey/user', requireAuth, async (req, res) => {
  await query('UPDATE users SET api_key=NULL WHERE id=$1', [req.session.userId]);
  res.json({ ok:true });
});
app.post('/api/apikey/user/:userId', requireAuth, requireAdmin, async (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey?.startsWith('sk-')) return res.status(400).json({ error: 'Ungültiger API-Key' });
  await query('UPDATE users SET api_key=$1 WHERE id=$2', [apiKey, req.params.userId]);
  res.json({ ok:true });
});
app.delete('/api/apikey/user/:userId', requireAuth, requireAdmin, async (req, res) => {
  await query('UPDATE users SET api_key=NULL WHERE id=$1', [req.params.userId]);
  res.json({ ok:true });
});
app.get('/api/apikey/user/status', requireAuth, async (req, res) => {
  const mode = (await queryOne("SELECT value FROM app_settings WHERE key='api_key_mode'"))?.value||'global';
  const user = await queryOne('SELECT api_key FROM users WHERE id=$1', [req.session.userId]);
  const globalKey = process.env.ANTHROPIC_API_KEY || (await queryOne("SELECT value FROM app_settings WHERE key='global_api_key'"))?.value;
  res.json({ mode, hasUserKey: !!user?.api_key, hasGlobalKey: !!globalKey });
});
app.get('/api/apikey/users/status', requireAuth, requireAdmin, async (req, res) => {
  const users = await queryAll('SELECT id,name,email,role,api_key FROM users');
  res.json(users.map(u => ({ id:u.id, name:u.name, email:u.email, role:u.role, hasKey: !!u.api_key })));
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

    const apiKey = await resolveApiKey(req.session.userId);
    if (!apiKey) return res.status(500).json({ error: 'Kein API-Key konfiguriert.' });

    // _feature und _systemId aus Body entfernen
    const { _feature, _systemId, ...cleanBody } = req.body;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{ 'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01' },
      body: JSON.stringify(cleanBody)
    });
    const data = await response.json();
    if (!response.ok) log('error', `Anthropic: ${response.status}`);

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
  await lic.checkOnStartup(query, queryOne, log);
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
