'use strict';\nconst $ = window.$ || (id => document.getElementById(id));
/**
 * admin/systems.js
 * Systemverwaltung — Erstellen, Bearbeiten, Löschen, Dokumenten-Upload.
 */

async function loadAdminSystems() {
  S.systems = await window.api.getSystems();
  renderSystems();
  $('btn-new-system').onclick = () => openSysModal(null);
}

function renderSystems() {
  const w = $('systems-list');
  if (!S.systems.length) {
    w.innerHTML = '<div class="empty-state"><h3>Keine Systeme</h3><p>Legen Sie das erste System an.</p></div>';
    return;
  }
  w.innerHTML = S.systems.map(sys => `
    <div class="system-card">
      <div class="system-card-head">
        <div>
          <div class="req-title">${esc(sys.name)}</div>
          <div class="view-sub">${esc(sys.description || '')}</div>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn-secondary" style="font-size:11px;padding:4px 10px"
            onclick="openSysModal('${sys.id}')">Bearbeiten</button>
          <button class="btn-danger" style="font-size:11px;padding:4px 10px"
            onclick="delSys('${sys.id}')">Löschen</button>
        </div>
      </div>
      <div class="system-card-body">
        <div style="font-size:11px;font-weight:600;color:var(--t3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">
          ${(sys.docs||[]).length} Dokumente
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px">
          ${(sys.docs||[]).map(d =>
            `<span class="doc-chip">${esc(d.name)}
              <span class="rm" onclick="remDoc('${sys.id}','${d.id}')">✕</span>
            </span>`
          ).join('')}
        </div>
        <div style="display:flex;gap:7px;flex-wrap:wrap">
          <button class="btn-secondary" style="font-size:11px;padding:5px 10px"
            onclick="addFiles('${sys.id}')">+ Dateien</button>
          <button class="btn-secondary" style="font-size:11px;padding:5px 10px"
            onclick="showDocStats('${sys.id}')">📊 Stats</button>
          <button class="btn-secondary" style="font-size:11px;padding:5px 10px"
            onclick="showRAGStatus('${sys.id}')">🧠 Index</button>
        </div>
      </div>
    </div>`).join('');
}

function openSysModal(id) {
  const s = id ? S.systems.find(x => x.id === id) : { id:null, name:'', description:'' };
  openModal(id ? 'System bearbeiten' : 'Neues System', `
    <div class="frow"><label>Name</label>
      <input type="text" id="sm-name" value="${esc(s.name)}" placeholder="z.B. Kundenverwaltung"/></div>
    <div class="frow"><label>Beschreibung</label>
      <textarea id="sm-desc" rows="3">${esc(s.description || '')}</textarea></div>
    <div style="display:flex;gap:8px;margin-top:6px">
      <button class="btn-primary" onclick="saveSys('${id||''}')">Speichern</button>
      <button class="btn-secondary" onclick="closeModal()">Abbrechen</button>
    </div>`);
}

async function saveSys(id) {
  const name = $('sm-name').value.trim();
  if (!name) { toast('⚠ Name erforderlich'); return; }
  await window.api.saveSystem({ id: id || null, name, description: $('sm-desc').value.trim() });
  S.systems = await window.api.getSystems();
  renderSystems();
  closeModal();
  toast('✅ System gespeichert');
}

async function delSys(id) {
  if (!confirm('System und alle zugehörigen Anforderungen löschen?')) return;
  await window.api.deleteSystem(id);
  S.systems = await window.api.getSystems();
  renderSystems();
  toast('✅ System gelöscht');
}

async function addFiles(systemId) {
  // Browser-Dateiauswahl
  const files = await window.api.pickFiles('.txt,.md,.js,.ts,.py,.java,.cs,.go,.json,.csv,.yaml,.yml,.html,.css,.xml');
  if (!files.length) return;
  const btn = document.querySelector(`[onclick="addFiles('${systemId}')"]`);
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span>'; }
  const res = await window.api.uploadDocs(systemId, files);
  S.systems = await window.api.getSystems();
  renderSystems();
  toast(`✅ ${res.added?.length || 0} Datei(en) hochgeladen`);
  // Neue Dokumente automatisch indexieren
  if (typeof indexSystemDocs === 'function') {
    indexSystemDocs(systemId).then(r => {
      if (r.indexed > 0) toast(`🧠 ${r.indexed} Dokument(e) für semantische Suche indexiert`);
    });
  }
}

async function remDoc(sysId, docId) {
  await window.api.removeDoc({ systemId: sysId, docId });
  S.systems = await window.api.getSystems();
  renderSystems();
  toast('✅ Dokument entfernt');
}

function showDocStats(sysId) {
  const sys = S.systems.find(s => s.id === sysId);
  if (!sys) return;
  const docs = sys.docs || [];
  const totalKB = (docs.reduce((sum, d) => sum + (d.size || 0), 0) / 1024).toFixed(1);
  const byExt = {};
  docs.forEach(d => { const ext = d.name.split('.').pop()?.toLowerCase() || 'sonstig'; byExt[ext] = (byExt[ext] || 0) + 1; });
  openModal(`📊 ${sys.name} — Dokument-Stats`, `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
      <div class="stat-card"><span class="stat-n">${docs.length}</span><span class="stat-l">Dokumente</span></div>
      <div class="stat-card"><span class="stat-n">${totalKB}</span><span class="stat-l">KB gesamt</span></div>
    </div>
    <div style="font-size:12px;font-weight:600;color:var(--t2);margin-bottom:8px">Nach Dateityp:</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px">
      ${Object.entries(byExt).sort((a,b)=>b[1]-a[1]).map(([ext,cnt]) =>
        `<span class="sbadge s-assigned">.${esc(ext)}: ${cnt}</span>`
      ).join('')}
    </div>
    <div style="margin-top:14px;max-height:200px;overflow-y:auto">
      ${docs.map(d => `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--b1);font-size:12px">
        <span style="color:var(--t2)">${esc(d.name)}</span>
        <span style="color:var(--t3)">${((d.size||0)/1024).toFixed(1)} KB</span>
      </div>`).join('')}
    </div>
    <button class="btn-secondary" style="margin-top:14px" onclick="closeModal()">Schließen</button>`);
}

window.loadAdminSystems = loadAdminSystems;
window.openSysModal     = openSysModal;
window.saveSys          = saveSys;
window.delSys           = delSys;
window.addFiles         = addFiles;
window.remDoc           = remDoc;
window.showDocStats     = showDocStats;
