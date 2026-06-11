'use strict';
/**
 * notifications.js — F: E-Mail + HA-Webhook Benachrichtigungen
 * Wird von server.js importiert und beim Start initialisiert.
 */
const fetch = require('node-fetch');

let _settings = null;
let _db       = null;

function init(pool) {
  _db = pool;
  loadSettings().then(s => { _settings = s; }).catch(() => {});
}

async function loadSettings() {
  if (!_db) return {};
  try {
    const res = await _db.query("SELECT key, value FROM app_settings WHERE key LIKE 'notif_%'");
    const s = {};
    for (const r of res.rows) s[r.key.replace('notif_','')] = r.value;
    return s;
  } catch(e) { return {}; }
}

async function saveSettings(settings) {
  if (!_db) return;
  for (const [k, v] of Object.entries(settings)) {
    await _db.query(
      "INSERT INTO app_settings (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2",
      ['notif_' + k, String(v)]
    ).catch(() => {});
  }
  _settings = await loadSettings();
}

// ── Event-Typen ───────────────────────────────────────────────
const EVENT_TYPES = {
  review_requested: { label: 'Review angefordert',    icon: '🔍' },
  review_approved:  { label: 'Anforderung freigegeben', icon: '✅' },
  review_rejected:  { label: 'Anforderung abgelehnt',  icon: '❌' },
  req_assigned:     { label: 'Anforderung zugewiesen', icon: '👤' },
  mention:          { label: 'Erwähnung in Kommentar', icon: '💬' },
  req_created:      { label: 'Neue Anforderung',       icon: '➕' },
  sprint_ready:     { label: 'Sprint-Plan bereit',     icon: '🚀' },
};

// ── Haupt-Dispatch ────────────────────────────────────────────
async function dispatch(eventType, payload, targetUserIds = []) {
  if (!_settings) _settings = loadSettings();
  const event = EVENT_TYPES[eventType] || { label: eventType, icon: '📌' };
  const msg   = buildMessage(event, payload);

  const promises = [];

  // E-Mail
  if (_settings.email_enabled === '1' && _settings.email_to) {
    promises.push(sendEmail(msg, payload).catch(e =>
      console.error('[NOTIF] E-Mail fehlgeschlagen:', e.message)));
  }

  // HA-Webhook
  if (_settings.ha_webhook_url) {
    promises.push(sendHAWebhook(eventType, payload, msg).catch(e =>
      console.error('[NOTIF] HA-Webhook fehlgeschlagen:', e.message)));
  }

  // Generischer Webhook
  if (_settings.webhook_url) {
    promises.push(sendWebhook(eventType, payload, msg).catch(e =>
      console.error('[NOTIF] Webhook fehlgeschlagen:', e.message)));
  }

  await Promise.allSettled(promises);

  // Benachrichtigung in DB speichern für In-App-Anzeige
  if (_db) {
    try {
      _db.prepare(`INSERT OR IGNORE INTO app_settings VALUES (?, ?)`)
        .run('last_notif_' + Date.now(), JSON.stringify({ eventType, msg, payload: { title: payload.title, reqId: payload.reqId }, ts: Date.now() }));
    } catch(e) {}
  }
}

function buildMessage(event, payload) {
  const parts = [`${event.icon} ${event.label}`];
  if (payload.reqTitle || payload.title)
    parts.push(`Anforderung: "${payload.reqTitle || payload.title}"`);
  if (payload.systemName)   parts.push(`System: ${payload.systemName}`);
  if (payload.userName)     parts.push(`Von: ${payload.userName}`);
  if (payload.comment)      parts.push(`Kommentar: "${payload.comment.substring(0,100)}"`);
  if (payload.reviewComment) parts.push(`Grund: "${payload.reviewComment.substring(0,100)}"`);
  return parts.join('\n');
}

// ── E-Mail via SMTP ───────────────────────────────────────────
async function sendEmail(text, payload) {
  // Nodemailer lazy-require
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host:   _settings.smtp_host   || 'smtp.gmail.com',
    port:   parseInt(_settings.smtp_port || '587'),
    secure: _settings.smtp_secure === '1',
    auth:   _settings.smtp_user ? {
      user: _settings.smtp_user,
      pass: _settings.smtp_pass,
    } : undefined,
  });

  await transporter.sendMail({
    from:    _settings.smtp_from || _settings.smtp_user || 'RE-Assistent <noreply@re-assistant.local>',
    to:      _settings.email_to,
    subject: `RE-Assistent: ${text.split('\n')[0]}`,
    text,
    html: `<pre style="font-family:sans-serif;font-size:14px;line-height:1.6">${text.replace(/</g,'&lt;')}</pre>
           <hr><p style="color:#666;font-size:12px">RE-Assistent — ${new Date().toLocaleString('de-DE')}</p>`,
  });
  console.log('[NOTIF] E-Mail gesendet an', _settings.email_to);
}

// ── Home Assistant Webhook ────────────────────────────────────
async function sendHAWebhook(eventType, payload, message) {
  const url = _settings.ha_webhook_url;
  await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event_type:  eventType,
      message,
      req_id:      payload.reqId   || null,
      req_title:   payload.reqTitle|| payload.title || null,
      system_name: payload.systemName || null,
      user_name:   payload.userName || null,
      timestamp:   new Date().toISOString(),
    }),
  });
  console.log('[NOTIF] HA-Webhook gesendet:', url.substring(0,60));
}

// ── Generischer Webhook ───────────────────────────────────────
async function sendWebhook(eventType, payload, message) {
  const url = _settings.webhook_url;
  await fetch(url, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      ..._settings.webhook_secret ? { 'X-RE-Secret': _settings.webhook_secret } : {},
    },
    body: JSON.stringify({ eventType, message, payload, timestamp: new Date().toISOString() }),
  });
  console.log('[NOTIF] Webhook gesendet:', url.substring(0,60));
}

// ── Test-Nachricht ────────────────────────────────────────────
async function sendTest() {
  await dispatch('req_created', {
    title: 'Test-Anforderung',
    systemName: 'Test-System',
    userName: 'RE-Assistent',
    reqId: 'TEST-001',
  });
}

module.exports = { init, dispatch, saveSettings, loadSettings, sendTest };
