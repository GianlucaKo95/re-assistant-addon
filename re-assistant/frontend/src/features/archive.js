'use strict';
const $ = window.$ || (id => document.getElementById(id));
/**
 * features/archive.js
 * 8: Soft-Delete mit Archiv-View.
 * Gelöschte Anforderungen werden archiviert statt dauerhaft gelöscht.
 * Wichtig für regulierte Umgebungen (DSGVO, MDR, ISO).
 */

// ── Archiv-View laden ─────────────────────────────────────────
async function loadArchive() {
  S.systems = await window.api.getSystems();
  const sel = $('archive-sys-sel');
  if (sel) {
    sel.innerHTML = '<option value="">Alle Systeme</option>' +
      S.systems.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');
    sel.onchange = loadArchiveItems;
  }
  await loadArchiveItems();
}

async function loadArchiveItems() {
  const sysId = $('archive-sys-sel')?.value || '';
  const wrap  = $('archive-list');
  if (!wrap) return;

  try {
    const url  = '/api/requirements/archived' + (sysId ? `?systemId=${sysId}` : '');
    const res  = await fetch(url, { credentials:'include' });
    const data = await res.json();

    if (!data.length) {
      wrap.innerHTML = `
        <div class="empty-state">
          <div class="es-icon">📦</div>
          <h3>Archiv ist leer</h3>
          <p>Archivierte Anforderungen werden hier angezeigt.<br>
          Sie können jederzeit wiederhergestellt werden.</p>
        </div>`;
      return;
    }

    wrap.innerHTML = `
      <div style="font-size:12px;color:var(--t3);padding:0 0 10px;border-bottom:1px solid var(--b1);margin-bottom:12px">
        ${data.length} archivierte Anforderung(en)
      </div>
      ${data.map(r => {
        const sys = S.systems.find(s=>s.id===r.systemId);
        const archivedAt = r.archivedAt ? new Date(r.archivedAt).toLocaleString('de-DE') : '—';
        return `<div style="background:var(--s1);border:1px solid var(--b1);border-radius:var(--rl);padding:12px 16px;margin-bottom:8px;opacity:.85">
          <div style="display:flex;align-items:flex-start;gap:10px">
            <div style="flex:1;min-width:0">
              <div style="display:flex;align-items:center;gap:7px;margin-bottom:4px;flex-wrap:wrap">
                <span class="req-id" style="text-decoration:line-through;opacity:.6">${esc(r.id)}</span>
                <span class="sbadge p-${r.priority}" style="font-size:9px;opacity:.7">${priLabel(r.priority)}</span>
                ${sys ? `<span class="rtag" style="font-size:9px">${esc(sys.name)}</span>` : ''}
              </div>
              <div style="font-size:13px;font-weight:500;color:var(--t2)">${esc(r.title)}</div>
              <div style="font-size:11px;color:var(--t3);margin-top:4px">
                Archiviert: ${archivedAt}
              </div>
            </div>
            <div style="display:flex;gap:6px;flex-shrink:0">
              <button class="btn-primary" style="font-size:11px;padding:4px 10px"
                onclick="restoreRequirement('${r.id}')">
                ↩ Wiederherstellen
              </button>
              <button class="btn-danger" style="font-size:11px;padding:4px 10px"
                onclick="permanentlyDelete('${r.id}')">
                🗑 Endgültig löschen
              </button>
            </div>
          </div>
          ${r.description ? `<div style="font-size:11px;color:var(--t3);margin-top:8px;padding-top:8px;border-top:1px solid var(--b1)">${esc(r.description.substring(0,150))}${r.description.length>150?'…':''}</div>` : ''}
        </div>`;
      }).join('')}`;
  } catch(e) {
    wrap.innerHTML = `<div style="color:var(--red);font-size:13px">Fehler: ${esc(e.message)}</div>`;
  }
}

async function restoreRequirement(id) {
  try {
    const res = await fetch(`/api/requirements/${id}/restore`, {
      method: 'POST', credentials: 'include',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    toast('✅ Anforderung wiederhergestellt');
    if (typeof addNotif === 'function')
      addNotif('↩', 'Anforderung wiederhergestellt', id, () => switchView('business-reqs'));
    await loadArchiveItems();
  } catch(e) {
    toast('❌ Fehler: ' + e.message);
  }
}

async function permanentlyDelete(id) {
  if (!confirm('Anforderung dauerhaft und unwiderruflich löschen?\n\nDiese Aktion kann nicht rückgängig gemacht werden.')) return;
  try {
    const res = await fetch(`/api/requirements/${id}`, {
      method: 'DELETE', credentials: 'include',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    toast('✅ Dauerhaft gelöscht');
    await loadArchiveItems();
  } catch(e) {
    toast('❌ Fehler: ' + e.message);
  }
}

// ── Archivieren statt Löschen (als Standard setzen) ──────────
// Patch api.deleteRequirement für Soft-Delete
const _origDeleteReq = window.api.deleteRequirement?.bind(window.api);
if (_origDeleteReq) {
  window.api.deleteRequirement = async function(id, hardDelete = false) {
    if (hardDelete) return _origDeleteReq(id);
    // Soft-Delete: archivieren
    const res = await fetch(`/api/requirements/${id}?archive=true`, {
      method: 'DELETE', credentials: 'include',
    });
    return res.json();
  };
}

// ── deleteReqModal patchen für Bestätigungs-Dialog ───────────
const _origDeleteReqModal = window.deleteReqModal;
window.deleteReqModal = async function(id) {
  const result = await new Promise(resolve => {
    openModal('Anforderung entfernen', `
      <p style="font-size:14px;margin-bottom:16px">
        Was soll mit dieser Anforderung geschehen?
      </p>
      <div style="display:flex;flex-direction:column;gap:8px">
        <button class="btn-secondary" onclick="closeModal();resolveDeleteChoice('archive')"
          style="text-align:left;padding:12px 14px">
          <div style="font-size:13px;font-weight:600">📦 Archivieren (empfohlen)</div>
          <div style="font-size:11px;color:var(--t3);margin-top:2px">Kann jederzeit wiederhergestellt werden</div>
        </button>
        <button class="btn-danger" onclick="closeModal();resolveDeleteChoice('delete')"
          style="text-align:left;padding:12px 14px">
          <div style="font-size:13px;font-weight:600">🗑 Dauerhaft löschen</div>
          <div style="font-size:11px;color:var(--t3);margin-top:2px">Unwiderruflich — kann nicht rückgängig gemacht werden</div>
        </button>
        <button class="btn-secondary" onclick="closeModal();resolveDeleteChoice('cancel')">Abbrechen</button>
      </div>`);
    window._resolveDeleteChoice = resolve;
  });
  return result;
};

window.resolveDeleteChoice = function(choice) {
  if (window._resolveDeleteChoice) {
    window._resolveDeleteChoice(choice);
    window._resolveDeleteChoice = null;
  }
};

// ── Patche delPaneReq für Archivierung ───────────────────────
const _origDelPaneReq = window.delPaneReq;
window.delPaneReq = async function(id) {
  const choice = await window.deleteReqModal(id);
  if (choice === 'cancel') return;
  const hardDelete = choice === 'delete';
  await window.api.deleteRequirement(id, hardDelete);
  toast(hardDelete ? '✅ Dauerhaft gelöscht' : '📦 Archiviert');
  if (typeof addNotif === 'function' && !hardDelete)
    addNotif('📦', 'Archiviert', `REQ ${id}`, () => switchView('archive'));
  if (typeof refreshReqPane === 'function') await refreshReqPane();
};

// ── Archiv-Statistiken für Admin-Dashboard ────────────────────
async function getArchiveStats() {
  try {
    const res = await fetch('api/requirements/archived', { credentials:'include' });
    const data = await res.json();
    return { count: data.length, oldest: data[data.length-1]?.archivedAt };
  } catch(e) { return { count: 0 }; }
}

window.loadArchive           = loadArchive;
window.loadArchiveItems      = loadArchiveItems;
window.restoreRequirement    = restoreRequirement;
window.permanentlyDelete     = permanentlyDelete;
window.getArchiveStats       = getArchiveStats;
