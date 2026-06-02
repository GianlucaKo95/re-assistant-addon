'use strict';
const express  = require('express');
const session  = require('express-session');
const cors     = require('cors');
const fs       = require('fs-extra');
const path     = require('path');
const fetch    = require('node-fetch');
const multer   = require('multer');
const bcrypt   = require('bcryptjs');

const app     = express();
// Im HA Add-on läuft Node auf 3001 (nginx proxyt von 3000)
const PORT    = parseInt(process.env.NODE_PORT || process.env.PORT || '3001');
const DATA_DIR = process.env.DATA_DIR || '/data/re-assistant';

fs.ensureDirSync(DATA_DIR);
const DB_PATH = path.join(DATA_DIR, 'database.json');

// ── Logging ───────────────────────────────────────────────────
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
function log(level, msg) {
  const levels = { trace:0, debug:1, info:2, notice:3, warning:4, error:5, fatal:6 };
  if ((levels[level] || 2) >= (levels[LOG_LEVEL] || 2))
    console.log(`[${new Date().toISOString()}] [${level.toUpperCase()}] ${msg}`);
}

// ── Middleware ────────────────────────────────────────────────
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(session({
  secret: process.env.SESSION_SECRET || 're-assistant-secret-' + Date.now(),
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }
}));

// ── DB ────────────────────────────────────────────────────────
function loadDB() {
  try { if (fs.existsSync(DB_PATH)) return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8')); }
  catch(e) { log('error', 'DB laden fehlgeschlagen: ' + e.message); }
  return defaultDB();
}
function saveDB(db) {
  try { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); }
  catch(e) { log('error', 'DB speichern fehlgeschlagen: ' + e.message); }
}
function defaultDB() {
  const adminPw = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123', 10);
  const testPw  = bcrypt.hashSync('test123', 10);
  log('info', 'Erstelle Standard-Datenbank …');
  return {
    users: [
      { id:'u1', name:'Admin',         email:'admin@re.local',  role:'admin',           password:adminPw, systems:[], createdAt:Date.now() },
      { id:'u2', name:'Anna Müller',   email:'anna@re.local',   role:'business',        password:testPw,  systems:[], createdAt:Date.now() },
      { id:'u3', name:'Tobias Kern',   email:'tobias@re.local', role:'projectmanager',  password:testPw,  systems:['sys1'], createdAt:Date.now() },
      { id:'u4', name:'Laura Schmidt', email:'laura@re.local',  role:'developer',       password:testPw,  systems:['sys1'], subcategories:['Backend','API'], createdAt:Date.now() },
      { id:'u5', name:'Marcus Weber',  email:'marcus@re.local', role:'businessanalyst', password:testPw,  systems:['sys1'], createdAt:Date.now() },
    ],
    systems: [{ id:'sys1', name:'Erstes System', description:'Hier Dokumentation hochladen', createdAt:Date.now(), docs:[] }],
    requirements:[], stories:[], backlogs:[], workshops:[], diagrams:[]
  };
}

// ── Auth ──────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.session?.userId) return next();
  res.status(401).json({ error: 'Nicht authentifiziert' });
}
function requireAdmin(req, res, next) {
  const db = loadDB();
  const u  = db.users.find(u => u.id === req.session?.userId);
  if (u?.role === 'admin') return next();
  res.status(403).json({ error: 'Nur für Administratoren' });
}

// ── AUTH routes ───────────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const db   = loadDB();
  const user = db.users.find(u => u.email === email);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    log('warning', `Login fehlgeschlagen für: ${email}`);
    return res.status(401).json({ error: 'E-Mail oder Passwort falsch.' });
  }
  req.session.userId = user.id;
  log('info', `Login: ${user.name} (${user.role})`);
  const { password: _p, ...safe } = user;
  res.json({ ok: true, user: safe });
});
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(); res.json({ ok: true });
});
app.get('/api/auth/me', requireAuth, (req, res) => {
  const db   = loadDB();
  const user = db.users.find(u => u.id === req.session.userId);
  if (!user) return res.status(401).json({ error: 'Session ungültig' });
  const { password: _p, ...safe } = user;
  res.json(safe);
});

// ── USERS ─────────────────────────────────────────────────────
app.get('/api/users', requireAuth, requireAdmin, (req, res) => {
  res.json(loadDB().users.map(({ password: _p, ...u }) => u));
});
app.post('/api/users', requireAuth, requireAdmin, (req, res) => {
  const db   = loadDB();
  const user = { ...req.body };
  const idx  = db.users.findIndex(u => u.id === user.id);
  if (user.password) user.password = bcrypt.hashSync(user.password, 10);
  if (idx >= 0) {
    if (!user.password) user.password = db.users[idx].password;
    db.users[idx] = { ...db.users[idx], ...user };
  } else {
    if (!user.password) user.password = bcrypt.hashSync('changeme', 10);
    db.users.push({ ...user, id: 'u' + Date.now(), createdAt: Date.now() });
  }
  saveDB(db); res.json({ ok: true });
});
app.delete('/api/users/:id', requireAuth, requireAdmin, (req, res) => {
  const db = loadDB();
  db.users = db.users.filter(u => u.id !== req.params.id);
  saveDB(db); res.json({ ok: true });
});

// ── SYSTEMS ───────────────────────────────────────────────────
app.get('/api/systems', requireAuth, (req, res) => res.json(loadDB().systems));
app.post('/api/systems', requireAuth, (req, res) => {
  const db  = loadDB();
  const sys = req.body;
  const idx = db.systems.findIndex(s => s.id === sys.id);
  if (idx >= 0) db.systems[idx] = { ...db.systems[idx], ...sys };
  else db.systems.push({ ...sys, id: 'sys' + Date.now(), createdAt: Date.now(), docs: [] });
  saveDB(db); res.json({ ok: true });
});
app.delete('/api/systems/:id', requireAuth, (req, res) => {
  const db = loadDB();
  db.systems      = db.systems.filter(s => s.id !== req.params.id);
  db.requirements = (db.requirements || []).filter(r => r.systemId !== req.params.id);
  saveDB(db); res.json({ ok: true });
});

// Dokument-Upload
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
app.post('/api/systems/:id/docs', requireAuth, upload.array('files'), (req, res) => {
  const db  = loadDB();
  const sys = db.systems.find(s => s.id === req.params.id);
  if (!sys) return res.status(404).json({ error: 'System nicht gefunden' });
  if (!sys.docs) sys.docs = [];
  const added = [];
  for (const file of (req.files || [])) {
    try {
      const content = file.buffer.toString('utf-8');
      if (!sys.docs.find(d => d.name === file.originalname)) {
        const doc = { id: 'd' + Date.now() + Math.random(), name: file.originalname, content, size: file.size, addedAt: Date.now() };
        sys.docs.push(doc); added.push(doc);
        log('info', `Dokument hochgeladen: ${file.originalname} (${sys.name})`);
      }
    } catch(e) { log('warning', `Datei übersprungen (nicht UTF-8): ${file.originalname}`); }
  }
  saveDB(db); res.json({ ok: true, added });
});
app.delete('/api/systems/:sysId/docs/:docId', requireAuth, (req, res) => {
  const db  = loadDB();
  const sys = db.systems.find(s => s.id === req.params.sysId);
  if (sys) sys.docs = (sys.docs || []).filter(d => d.id !== req.params.docId);
  saveDB(db); res.json({ ok: true });
});

// ── REQUIREMENTS ──────────────────────────────────────────────
app.get('/api/requirements', requireAuth, (req, res) => {
  let reqs = loadDB().requirements || [];
  if (req.query.systemId) reqs = reqs.filter(r => r.systemId === req.query.systemId);
  if (req.query.role === 'developer') reqs = reqs.filter(r => r.assignedTo === req.query.userId);
  res.json(reqs);
});
app.post('/api/requirements', requireAuth, (req, res) => {
  const db   = loadDB();
  if (!db.requirements) db.requirements = [];
  const r    = req.body;
  const idx  = db.requirements.findIndex(x => x.id === r.id);
  if (idx >= 0) db.requirements[idx] = { ...db.requirements[idx], ...r, updatedAt: Date.now() };
  else db.requirements.push({ ...r, id: r.id || 'req' + Date.now(), createdAt: Date.now(), updatedAt: Date.now(), status: r.status || 'open', comments: [] });
  saveDB(db); res.json({ ok: true });
});
app.delete('/api/requirements/:id', requireAuth, (req, res) => {
  const db = loadDB();
  db.requirements = (db.requirements || []).filter(r => r.id !== req.params.id);
  saveDB(db); res.json({ ok: true });
});
app.post('/api/requirements/:id/comments', requireAuth, (req, res) => {
  const db  = loadDB();
  const req_ = (db.requirements || []).find(r => r.id === req.params.id);
  if (req_) { if (!req_.comments) req_.comments = []; req_.comments.push({ ...req.body, id: 'c' + Date.now(), createdAt: Date.now() }); }
  saveDB(db); res.json({ ok: true });
});
app.post('/api/requirements/:id/assign', requireAuth, (req, res) => {
  const db   = loadDB();
  const req_ = (db.requirements || []).find(r => r.id === req.params.id);
  if (req_) { req_.assignedTo = req.body.userId; req_.subcategory = req.body.subcategory; req_.status = 'assigned'; req_.updatedAt = Date.now(); }
  saveDB(db); res.json({ ok: true });
});

// ── BACKLOGS, WORKSHOPS, DIAGRAMS (generisches CRUD) ─────────
function crudResource(name) {
  app.get(`/api/${name}`, requireAuth, (req, res) => {
    const db   = loadDB();
    let items  = db[name] || [];
    if (req.query.systemId) items = items.filter(i => i.systemId === req.query.systemId);
    res.json(items);
  });
  app.post(`/api/${name}`, requireAuth, (req, res) => {
    const db  = loadDB();
    if (!db[name]) db[name] = [];
    const item = req.body;
    const idx  = db[name].findIndex(i => i.id === item.id);
    if (idx >= 0) db[name][idx] = { ...db[name][idx], ...item, updatedAt: Date.now() };
    else db[name].push({ ...item, id: name.slice(0,-1) + Date.now(), createdAt: Date.now() });
    saveDB(db); res.json({ ok: true });
  });
  app.delete(`/api/${name}/:id`, requireAuth, (req, res) => {
    const db  = loadDB();
    db[name]  = (db[name] || []).filter(i => i.id !== req.params.id);
    saveDB(db); res.json({ ok: true });
  });
}
crudResource('backlogs');
crudResource('workshops');
crudResource('diagrams');

// ── ANTHROPIC PROXY ───────────────────────────────────────────
app.post('/api/ai/chat', requireAuth, async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY nicht konfiguriert' });
  try {
    log('debug', `AI-Anfrage: ${req.body.messages?.length} Nachrichten, max_tokens: ${req.body.max_tokens}`);
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    if (!response.ok) log('error', `Anthropic API Fehler: ${response.status} — ${JSON.stringify(data.error)}`);
    res.status(response.status).json(data);
  } catch (err) {
    log('error', 'Anthropic Verbindungsfehler: ' + err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── JIRA PROXY ────────────────────────────────────────────────
app.post('/api/jira/:action', requireAuth, async (req, res) => {
  const { url, email, token, path: jiraPath, method = 'GET', body } = req.body;
  if (!url || !email || !token) return res.status(400).json({ error: 'Jira-Zugangsdaten unvollständig' });
  const auth = Buffer.from(`${email}:${token}`).toString('base64');
  try {
    const response = await fetch(`${url}${jiraPath}`, {
      method,
      headers: { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Jira nicht erreichbar: ' + err.message });
  }
});

// ── VERSION ───────────────────────────────────────────────────
app.get('/api/version', (req, res) => {
  res.json({ version: '2.0.0', mode: 'homeassistant-addon', language: process.env.LANGUAGE || 'de' });
});

// ── Start ─────────────────────────────────────────────────────
app.listen(PORT, '127.0.0.1', () => {
  log('info', `RE-Assistent Backend läuft intern auf Port ${PORT}`);
  log('info', `Datenpfad: ${DATA_DIR}`);
  log('info', `Sprache: ${process.env.LANGUAGE || 'de'}`);
});

process.on('SIGTERM', () => { log('info', 'Beende RE-Assistent …'); process.exit(0); });
