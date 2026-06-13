'use strict';
const $ = window.$ || (id => document.getElementById(id));
/**
 * features/audit-log.js
 * Rollenbasierter Audit-Log — Backend-gestützt (PostgreSQL)
 * Admin: alle Systeme + Login-Log
 * PM / BA: nur Requirement-Events ihrer zugewiesenen Systeme
 */

// ── Lokales Logging (für eigene Aktionen, sofort sichtbar) ────
const _sessionId = 'sess-' + Date.now().toString(36);

function logAuditEvent(action, entityType, entityId, entityTitle, details = {}) {
  if (!S.user) return;
  // Ans Backend senden — fire & forget
  fetch('api/audit-log/write', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      eventType: entityType === 'session' ? 'login' : 'requirement_change',
      action, entityType, entityId, entityName: entityTitle,
      details, sessionId: _sessionId,
    }),
  }).catch(() => {});
  updateAuditBadge();
}

// ── Audit-Log View ────────────────────────────────────────────
let _auditPage = 0;
const AUDIT_PAGE_SIZE = 50;

async function loadAuditLogView() {
  const wrap = $('audit-log-wrap');
  if (!wrap) return;

  const role = S.user?.role;

  // System-Filter befüllen (erste Initialisierung)
  if (!$('audit-sys-filter')?.dataset.loaded) {
    await buildAuditSystemFilter();
  }

  _auditPage = 0;
  await renderAuditPage(wrap);
}

async function buildAuditSystemFilter() {
  const sel = $('audit-sys-filter');
  if (!sel) return;

  try {
    const systems = await fetch('api/audit-log/systems', { credentials:'include' }).then(r=>r.json());
    sel.innerHTML = '<option value="">Alle Systeme</option>' +
      systems.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
    sel.dataset.loaded = '1';
    sel.addEventListener('change', loadAuditLogView);
  } catch(e) {}
}

async function renderAuditPage(wrap) {
  wrap.innerHTML = '<div class="empty-state"><div class="spin"></div><p>Lade Audit-Log …</p></div>';

  const params = new URLSearchParams({
    limit:  AUDIT_PAGE_SIZE,
    offset: _auditPage * AUDIT_PAGE_SIZE,
  });

  const action   = $('audit-filter-action')?.value;
  const entity   = $('audit-filter-entity')?.value;
  const sysId    = $('audit-sys-filter')?.value;
  const dateFrom = $('audit-filter-date')?.value;
  const search   = $('audit-filter-user')?.value?.toLowerCase();

  if (action)   params.set('action', action);
  if (entity)   params.set('entity', entity);
  if (sysId)    params.set('systemId', sysId);
  if (dateFrom) params.set('dateFrom', dateFrom);

  try {
    const data = await fetch(`api/audit-log?${params}`, { credentials:'include' }).then(r=>r.json());
    const entries = data.entries || [];
    const total   = data.total   || 0;

    // Client-seitiger Benutzerfilter
    const filtered = search
      ? entries.filter(e => e.user_name?.toLowerCase().includes(search))
      : entries;

    if (!filtered.length) {
      wrap.innerHTML = `<div class="empty-state">
        <div class="es-icon">📋</div>
        <h3>Keine Einträge</h3>
        <p>${S.user?.role === 'admin' ? 'Noch keine Aktivitäten protokolliert.' : 'Keine Änderungen an deinen Systemen gefunden.'}</p>
      </div>`;
      renderAuditPagination(total);
      return;
    }

    const actionIcons = {
      create:        '➕', update:        '✏️',
      delete:        '🗑️', status_change: '🔄',
      review:        '🔍', login:         '🔑',
      export:        '📤', comment:       '💬',
      assign:        '👤',
    };
    const entityColors = {
      requirement: 'var(--aa)', system: 'var(--blue)',
      workshop: 'var(--ba)', backlog: 'var(--pm)',
      user: 'var(--admin)',
    };

    // Gruppierung nach Datum
    const groups = {};
    for (const e of filtered) {
      const day = new Date(e.created_at).toLocaleDateString('de-DE', {
        weekday:'long', year:'numeric', month:'long', day:'numeric'
      });
      if (!groups[day]) groups[day] = [];
      groups[day].push(e);
    }

    const role = S.user?.role;

    wrap.innerHTML = Object.entries(groups).map(([day, dayEntries]) => `
      <div style="padding:10px 0 4px">
        <div style="font-size:11px;font-weight:700;color:var(--t3);text-transform:uppercase;
          letter-spacing:.06em;padding:0 20px">${day}</div>
      </div>
      ${dayEntries.map(e => {
        const isLogin  = e.event_type === 'login';
        const details  = typeof e.details === 'string' ? JSON.parse(e.details||'{}') : (e.details||{});
        const sysName  = S.systems?.find(s=>s.id===e.system_id)?.name || '';

        return `
        <div style="display:flex;gap:12px;padding:10px 20px;border-bottom:1px solid var(--b1);
          transition:background .12s" onmouseover="this.style.background='var(--s1)'"
          onmouseout="this.style.background=''">

          <!-- Icon -->
          <div style="width:32px;height:32px;border-radius:8px;background:var(--s2);
            display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0">
            ${actionIcons[e.action] || '📌'}
          </div>

          <!-- Content -->
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">
              <span style="font-size:13px;font-weight:600">${esc(e.user_name || '—')}</span>
              ${e.user_role ? `<span style="font-size:10px;padding:1px 6px;border-radius:99px;
                background:var(--s2);color:var(--t3)">${roleLabel(e.user_role)}</span>` : ''}
              <span style="font-size:12px;color:var(--t2)">${getActionLabel(e.action)}</span>
              ${e.entity_name ? `<span style="font-size:12px;font-weight:500;
                color:${entityColors[e.entity_type]||'var(--t2)'}">
                ${esc(e.entity_name)}</span>` : ''}
            </div>

            <!-- System-Tag + Details -->
            <div style="display:flex;gap:8px;margin-top:3px;flex-wrap:wrap;align-items:center">
              ${sysName ? `<span style="font-size:10px;color:var(--t3);background:var(--s2);
                padding:1px 7px;border-radius:99px;border:1px solid var(--b1)">
                ${esc(sysName)}</span>` : ''}
              ${details.from && details.to ? `
                <span style="font-size:11px;color:var(--t3)">
                  ${esc(details.field||'')}: <span style="color:var(--red)">${esc(details.from)}</span>
                  → <span style="color:var(--grn)">${esc(details.to)}</span>
                </span>` : ''}
              ${details.comment ? `
                <span style="font-size:11px;color:var(--t3);font-style:italic">
                  „${esc((details.comment||'').substring(0,80))}"</span>` : ''}
              ${isLogin && details.role ? `
                <span style="font-size:10px;color:var(--t3)">Rolle: ${roleLabel(details.role)}</span>` : ''}
            </div>
          </div>

          <!-- Zeit -->
          <div style="font-size:11px;color:var(--t3);flex-shrink:0;text-align:right;min-width:44px">
            <div>${new Date(e.created_at).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})}</div>
            <div style="font-size:9px;margin-top:2px;color:var(--t3)">${esc(e.entity_type||'')}</div>
          </div>
        </div>`;
      }).join('')}
    `).join('');

    renderAuditPagination(total);

  } catch(err) {
    wrap.innerHTML = `<div class="empty-state">
      <div class="es-icon" style="color:var(--red)">⚠</div>
      <h3>Fehler beim Laden</h3>
      <p style="font-size:12px;color:var(--red)">${esc(err.message)}</p>
    </div>`;
  }
}

function renderAuditPagination(total) {
  const footer = $('audit-pagination');
  if (!footer) return;

  const pages   = Math.ceil(total / AUDIT_PAGE_SIZE);
  const current = _auditPage + 1;

  if (pages <= 1) { footer.innerHTML = ''; return; }

  footer.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;padding:10px 20px;
      border-top:1px solid var(--b1);justify-content:center;font-size:12px">
      <button class="btn-secondary" style="font-size:11px;padding:4px 10px"
        id="audit-prev" ${current===1?'disabled':''}>← Zurück</button>
      <span style="color:var(--t2)">Seite ${current} / ${pages} (${total} Einträge)</span>
      <button class="btn-secondary" style="font-size:11px;padding:4px 10px"
        id="audit-next" ${current===pages?'disabled':''}>Weiter →</button>
    </div>`;

  $('audit-prev')?.addEventListener('click', () => { _auditPage--; renderAuditPage($('audit-log-wrap')); });
  $('audit-next')?.addEventListener('click', () => { _auditPage++; renderAuditPage($('audit-log-wrap')); });
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
  // Badge zählt Einträge von heute — über Backend-Call
  fetch('api/audit-log?limit=1&dateFrom=' + new Date().toISOString().split('T')[0], { credentials:'include' })
    .then(r=>r.json())
    .then(data => {
      const badge = $('audit-today-count');
      if (badge) badge.textContent = data.total || 0;
    }).catch(() => {});
}

async function exportAuditLog() {
  try {
    const data = await fetch('api/audit-log?limit=500', { credentials:'include' }).then(r=>r.json());
    const entries = data.entries || [];
    const esc2 = v => `"${String(v||'').replace(/"/g,'""')}"`;
    let csv = 'Zeitstempel,Benutzer,Rolle,Aktion,Entitätstyp,Entitäts-ID,Titel,System,Details\n';
    for (const e of entries) {
      csv += [
        new Date(e.created_at).toLocaleString('de-DE'),
        e.user_name, e.user_role, e.action,
        e.entity_type, e.entity_id, e.entity_name, e.system_id,
        JSON.stringify(e.details||{})
      ].map(esc2).join(',') + '\n';
    }
    const blob = new Blob(['\uFEFF'+csv], { type:'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `audit-log-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('✅ Audit-Log exportiert');
  } catch(e) {
    toast('❌ Export fehlgeschlagen');
  }
}

// Wird nach Login aufgerufen
function initAuditHooks() {
  updateAuditBadge();
  // Filter-Events registrieren
  setTimeout(() => {
    ['audit-filter-action','audit-filter-entity','audit-filter-date'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', loadAuditLogView);
    });
    document.getElementById('audit-filter-user')?.addEventListener('input', () => {
      renderAuditPage($('audit-log-wrap'));
    });
  }, 500);
}

window.logAuditEvent    = logAuditEvent;
window.loadAuditLogView = loadAuditLogView;
window.exportAuditLog   = exportAuditLog;
window.initAuditHooks   = initAuditHooks;
window.updateAuditBadge = updateAuditBadge;
