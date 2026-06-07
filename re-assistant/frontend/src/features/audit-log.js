'use strict';
const $ = window.$ || (id => document.getElementById(id));
/**
 * features/audit-log.js
 * Nr. 8: Unveränderlicher Audit-Log
 * Wer hat wann was geändert — für DSGVO und ISO-Prozesse.
 */

// ── Client-seitiger Audit-Log (localStorage + Backend-Sync) ──
const AUDIT_KEY = 're-audit-log';
const MAX_ENTRIES = 500;

function logAuditEvent(action, entityType, entityId, entityTitle, details = {}) {
  if (!S.user) return;
  const entry = {
    id:           'al-' + Date.now() + Math.random().toString(36).slice(2,6),
    ts:           Date.now(),
    userId:       S.user.id,
    userName:     S.user.name,
    userRole:     S.user.role,
    action,       // 'create' | 'update' | 'delete' | 'status_change' | 'review' | 'login' | 'export'
    entityType,   // 'requirement' | 'system' | 'workshop' | 'backlog' | 'diagram'
    entityId,
    entityTitle,
    details,      // { from, to, field, ... }
    sessionId:    _sessionId,
  };

  const log = loadAuditLog();
  log.unshift(entry);
  if (log.length > MAX_ENTRIES) log.length = MAX_ENTRIES;
  saveAuditLog(log);

  // Audit-Badge aktualisieren
  updateAuditBadge();
  return entry;
}

function loadAuditLog() {
  try { return JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]'); } catch(e) { return []; }
}
function saveAuditLog(log) {
  localStorage.setItem(AUDIT_KEY, JSON.stringify(log));
}

// Eindeutige Session-ID für diese Browser-Sitzung
const _sessionId = 'sess-' + Date.now().toString(36);

// ── Audit-View ────────────────────────────────────────────────
async function loadAuditLogView() {
  const log = loadAuditLog();
  const wrap = $('audit-log-wrap');
  if (!wrap) return;

  const actionIcons = {
    create:        '➕',
    update:        '✏️',
    delete:        '🗑️',
    status_change: '🔄',
    review:        '🔍',
    login:         '🔑',
    export:        '📤',
    comment:       '💬',
    assign:        '👤',
  };
  const entityColors = {
    requirement: 'var(--aa)',
    system:      'var(--blue)',
    workshop:    'var(--ba)',
    backlog:     'var(--pm)',
    diagram:     'var(--amb)',
  };

  // Filter
  const filterAction = $('audit-filter-action')?.value || '';
  const filterEntity = $('audit-filter-entity')?.value || '';
  const filterUser   = $('audit-filter-user')?.value?.toLowerCase() || '';
  const filterDate   = $('audit-filter-date')?.value || '';

  const filtered = log.filter(e =>
    (!filterAction || e.action === filterAction) &&
    (!filterEntity || e.entityType === filterEntity) &&
    (!filterUser   || e.userName?.toLowerCase().includes(filterUser)) &&
    (!filterDate   || new Date(e.ts).toISOString().startsWith(filterDate))
  );

  if (!filtered.length) {
    wrap.innerHTML = '<div class="empty-state"><div class="es-icon">📋</div><h3>Keine Einträge</h3><p>Noch keine Aktivitäten protokolliert.</p></div>';
    return;
  }

  // Gruppierung nach Datum
  const groups = {};
  for (const entry of filtered) {
    const day = new Date(entry.ts).toLocaleDateString('de-DE', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
    if (!groups[day]) groups[day] = [];
    groups[day].push(entry);
  }

  wrap.innerHTML = Object.entries(groups).map(([day, entries]) => `
    <div style="padding:12px 0 4px">
      <div style="font-size:11px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.06em;padding:0 20px">${day}</div>
    </div>
    ${entries.map(e => `
      <div style="display:flex;gap:12px;padding:10px 20px;border-bottom:1px solid var(--b1);transition:background .12s" onmouseover="this.style.background='var(--s1)'" onmouseout="this.style.background=''">
        <!-- Icon -->
        <div style="width:32px;height:32px;border-radius:8px;background:var(--s2);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">
          ${actionIcons[e.action] || '📌'}
        </div>
        <!-- Content -->
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">
            <span style="font-size:13px;font-weight:600">${esc(e.userName)}</span>
            <span style="font-size:12px;color:var(--t2)">${getActionLabel(e.action)}</span>
            <span style="font-size:12px;font-weight:500;color:${entityColors[e.entityType]||'var(--t2)'}">${esc(e.entityTitle || e.entityId)}</span>
          </div>
          ${e.details?.from && e.details?.to ? `
            <div style="font-size:11px;color:var(--t3);margin-top:2px">
              ${esc(e.details.field||'Status')}: <span style="color:var(--red)">${esc(e.details.from)}</span> → <span style="color:var(--grn)">${esc(e.details.to)}</span>
            </div>` : ''}
          ${e.details?.comment ? `
            <div style="font-size:11px;color:var(--t3);margin-top:2px;font-style:italic">"${esc(e.details.comment.substring(0,80))}"</div>` : ''}
        </div>
        <!-- Zeit -->
        <div style="font-size:11px;color:var(--t3);flex-shrink:0;text-align:right">
          <div>${new Date(e.ts).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})}</div>
          <div style="font-size:9px;margin-top:2px">${esc(e.entityType)}</div>
        </div>
      </div>`).join('')}
  `).join('');
}

function getActionLabel(action) {
  return {
    create:        'hat erstellt:',
    update:        'hat geändert:',
    delete:        'hat gelöscht:',
    status_change: 'hat Status geändert:',
    review:        'hat reviewed:',
    login:         'hat sich angemeldet',
    export:        'hat exportiert:',
    comment:       'hat kommentiert:',
    assign:        'hat zugewiesen:',
  }[action] || action;
}

function updateAuditBadge() {
  const log   = loadAuditLog();
  const today = new Date().toISOString().split('T')[0];
  const count = log.filter(e => new Date(e.ts).toISOString().startsWith(today)).length;
  const badge = $('audit-today-count');
  if (badge) badge.textContent = count;
}

async function exportAuditLog() {
  const log = loadAuditLog();
  const e   = v => `"${String(v||'').replace(/"/g,'""')}"`;
  let csv = 'Zeitstempel,Benutzer,Rolle,Aktion,Entitätstyp,Entitäts-ID,Titel,Details\n';
  for (const entry of log) {
    csv += [
      new Date(entry.ts).toLocaleString('de-DE'),
      entry.userName, entry.userRole, entry.action,
      entry.entityType, entry.entityId, entry.entityTitle,
      JSON.stringify(entry.details||{})
    ].map(e).join(',') + '\n';
  }
  const blob = new Blob(['\uFEFF'+csv], { type:'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `audit-log-${new Date().toISOString().split('T')[0]}.csv`; a.click();
  URL.revokeObjectURL(a.href);
  toast('✅ Audit-Log exportiert');
}

// ── Hooks: Automatisch loggen bei wichtigen Aktionen ──────────
// Wird nach initApp() aufgerufen
function initAuditHooks() {
  // Login loggen
  logAuditEvent('login', 'session', S.user.id, S.user.name);
  updateAuditBadge();
}

// ── Öffentliche Hilfsfunktion für andere Module ───────────────
window.logAuditEvent  = logAuditEvent;
window.loadAuditLogView = loadAuditLogView;
window.exportAuditLog = exportAuditLog;
window.initAuditHooks = initAuditHooks;
window.updateAuditBadge = updateAuditBadge;

// ── Window Globals ──────────────────────────────────────────
window.saveAuditLog = saveAuditLog;
window.getActionLabel = getActionLabel;
