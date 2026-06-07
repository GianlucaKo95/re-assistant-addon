'use strict';\nconst $ = window.$ || (id => document.getElementById(id));
/**
 * features/id-schema.js
 * 4: Konfigurierbares ID-Schema pro System.
 * Statt REQ-1748976543210-123 → PRJ-001, AUTH-042 etc.
 */

// ── Nächste ID für ein System holen ──────────────────────────
async function getNextReqId(systemId) {
  if (!systemId) return 'REQ-' + Date.now();
  try {
    const res  = await fetch(`/api/systems/${systemId}/next-id`, { credentials:'include' });
    const data = await res.json();
    if (data.id) {
      // Lokalen Counter in S.systems synchronisieren
      const sys = S.systems.find(s => s.id === systemId);
      if (sys) sys.idCounter = data.counter;
      return data.id;
    }
  } catch(e) {}
  return 'REQ-' + Date.now();
}

// ── ID-Schema in System-Modal konfigurieren ───────────────────
function addIDSchemaToSystemModal(systemId, currentPrefix) {
  const existing = document.getElementById('id-schema-section');
  if (existing) return; // Schon vorhanden

  const modalBody = document.getElementById('modal-body');
  if (!modalBody) return;

  const section = document.createElement('div');
  section.id = 'id-schema-section';
  section.className = 'frow';
  section.innerHTML = `
    <label>Anforderungs-ID Präfix</label>
    <div style="display:flex;gap:8px;align-items:center">
      <input type="text" id="sm-id-prefix"
        value="${esc(currentPrefix || 'REQ')}"
        placeholder="z.B. PRJ, AUTH, API"
        maxlength="10"
        style="width:100px;text-transform:uppercase"
        oninput="this.value=this.value.toUpperCase().replace(/[^A-Z0-9_-]/g,'')"/>
      <span style="font-size:12px;color:var(--t3)">-001, -002, …</span>
      <span id="id-preview" style="font-size:11px;color:var(--aa);font-family:var(--mono)">
        ${esc(currentPrefix || 'REQ')}-001
      </span>
    </div>
    <div class="fhint">1-10 Zeichen, nur Großbuchstaben, Zahlen, - und _</div>`;

  // Live-Preview
  section.querySelector('#sm-id-prefix').addEventListener('input', (e) => {
    const preview = document.getElementById('id-preview');
    if (preview) preview.textContent = `${e.target.value || 'REQ'}-001`;
  });

  // Vor den Aktions-Buttons einfügen
  const actionDiv = modalBody.querySelector('div[style*="flex"]');
  if (actionDiv) modalBody.insertBefore(section, actionDiv);
  else modalBody.appendChild(section);
}

// ── Systems.js patchen: ID-Präfix beim Speichern mitgeben ────
const _origSaveSys = window.saveSys;
window.saveSys = async function(id) {
  const prefix = document.getElementById('sm-id-prefix')?.value?.trim();
  if (prefix) {
    // Präfix in Request aufnehmen
    const origSaveSystem = window.api.saveSystem.bind(window.api);
    window.api.saveSystem = async function(s) {
      s.idPrefix = prefix;
      const result = await origSaveSystem(s);
      window.api.saveSystem = origSaveSystem; // Einmalig
      return result;
    };
  }
  return _origSaveSys ? _origSaveSys(id) : null;
};

// System-Modal öffnen mit ID-Schema-Section
const _origOpenSysModal = window.openSysModal;
window.openSysModal = function(id) {
  _origOpenSysModal(id);
  // Nach kurzem Delay (Modal-Rendering) ID-Schema-Section hinzufügen
  setTimeout(() => {
    const sys = id ? S.systems.find(s => s.id === id) : null;
    addIDSchemaToSystemModal(id, sys?.idPrefix || 'REQ');
  }, 50);
};

// ── Req-Erstellung patchen: ID aus Schema verwenden ──────────
const _origSaveInlineAdd = window.saveInlineAdd;
window.saveInlineAdd = async function() {
  const sysId = document.getElementById('ip-s')?.value || S.activeSystemId;
  if (sysId) {
    const nextId = await getNextReqId(sysId);
    // ID in das versteckte Feld schreiben falls vorhanden,
    // sonst über globalem Speicher merken
    window._nextReqId = nextId;
  }
  return _origSaveInlineAdd ? _origSaveInlineAdd() : null;
};

// Patch api.saveRequirement um auto-ID zu verwenden
const _origSaveReqAPI = window.api.saveRequirement.bind(window.api);
window.api.saveRequirement = async function(req) {
  if (!req.id || req.id.includes('REQ-') && req.id.length > 20) {
    // Auto-generierte ID ersetzen durch Schema-ID
    const sysId = req.systemId;
    if (sysId && window._useSchemaIds !== false) {
      const nextId = await getNextReqId(sysId);
      req = { ...req, id: nextId };
    }
    window._nextReqId = null;
  }
  return _origSaveReqAPI(req);
};

// ── ID-Schema-Badge in Systemliste ────────────────────────────
function getSystemIDBadge(sys) {
  const prefix = sys?.idPrefix || 'REQ';
  const counter = sys?.idCounter || 0;
  return `<span style="font-size:9px;font-family:var(--mono);background:var(--s3);padding:1px 6px;border-radius:4px;color:var(--t3)">${esc(prefix)}-${String(counter+1).padStart(3,'0')}</span>`;
}

window.getNextReqId      = getNextReqId;
window.addIDSchemaToSystemModal = addIDSchemaToSystemModal;
window.getSystemIDBadge  = getSystemIDBadge;
