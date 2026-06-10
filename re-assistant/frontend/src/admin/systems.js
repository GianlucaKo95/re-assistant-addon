'use strict';
const $ = window.$ || (id => document.getElementById(id));
/**
 * admin/systems.js
 * Systemverwaltung mit Subdomain-Unterstützung.
 * Systeme können hierarchisch in Subdomains unterteilt werden.
 */

async function loadAdminSystems() {
  S.systems = await window.api.getSystems();
  renderSystems();
  document.getElementById('btn-new-system').onclick = () => openSysModal(null, null);
}

// ── Hierarchische Darstellung ─────────────────────────────────
function buildTree(systems) {
  const map  = {};
  const roots = [];
  systems.forEach(s => { map[s.id] = { ...s, children: [] }; });
  systems.forEach(s => {
    if (s.parentId && map[s.parentId]) {
      map[s.parentId].children.push(map[s.id]);
    } else {
      roots.push(map[s.id]);
    }
  });
  return roots;
}

function renderSystems() {
  const w = $('systems-list');
  if (!S.systems.length) {
    w.innerHTML = '<div class="empty-state"><h3>Keine Systeme</h3><p>Legen Sie das erste System an.</p></div>';
    return;
  }
  const tree = buildTree(S.systems);
  w.innerHTML = tree.map(node => renderSystemNode(node, 0)).join('');
}

function renderSystemNode(node, depth) {
  const indent = depth * 20;
  const hasChildren = node.children?.length > 0;
  const prefix = node.idPrefix || 'REQ';
  const counter = node.idCounter || 0;

  return `
    <div class="system-card" style="margin-left:${indent}px;${depth>0?'border-left:3px solid var(--b2);margin-bottom:6px':''}">
      <div class="system-card-head">
        <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0">
          ${depth > 0 ? `<span style="color:var(--t3);font-size:16px;flex-shrink:0">└</span>` : ''}
          <div style="min-width:0">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <div class="req-title">${esc(node.name)}</div>
              <span style="font-size:10px;font-family:var(--mono);background:var(--s3);
                padding:1px 7px;border-radius:4px;color:var(--t3);flex-shrink:0">
                ${esc(prefix)}-${String(counter+1).padStart(3,'0')}
              </span>
              ${depth > 0 ? `<span style="font-size:10px;color:var(--t3);background:var(--s2);
                padding:1px 7px;border-radius:99px">Subdomain</span>` : ''}
            </div>
            ${node.description ? `<div class="view-sub" style="margin-top:2px">${esc(node.description)}</div>` : ''}
          </div>
        </div>
        <div style="display:flex;gap:5px;flex-shrink:0;flex-wrap:wrap">
          <button class="btn-secondary" style="font-size:11px;padding:4px 9px"
            onclick="openSysModal('${node.id}', null)">✎ Bearbeiten</button>
          <button class="btn-secondary" style="font-size:11px;padding:4px 9px"
            onclick="openSysModal(null, '${node.id}')" title="Subdomain hinzufügen">
            + Sub</button>
          <button class="btn-danger" style="font-size:11px;padding:4px 9px"
            onclick="delSys('${node.id}')">✕</button>
        </div>
      </div>

      <div class="system-card-body">
        <div style="font-size:11px;font-weight:600;color:var(--t3);text-transform:uppercase;
          letter-spacing:.06em;margin-bottom:8px">${(node.docs||[]).length} Dokumente</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px">
          ${(node.docs||[]).map(d =>
            `<span class="doc-chip">${esc(d.name)}
              <span class="rm" onclick="remDoc('${node.id}','${d.id}')">✕</span>
            </span>`
          ).join('')}
        </div>
        <div style="display:flex;gap:7px;flex-wrap:wrap">
          <button class="btn-secondary" style="font-size:11px;padding:5px 10px"
            onclick="addFiles('${node.id}')">+ Dateien</button>
          <button class="btn-secondary" style="font-size:11px;padding:5px 10px"
            onclick="addFolder('${node.id}')" title="Ordner hochladen">📁 Ordner</button>
          <button class="btn-secondary" style="font-size:11px;padding:5px 10px"
            onclick="showDocStats('${node.id}')">📊 Stats</button>
          <button class="btn-secondary" style="font-size:11px;padding:5px 10px"
            onclick="showRAGStatus('${node.id}')">🧠 Index</button>
        </div>
      </div>
    </div>
    ${(node.children||[]).map(child => renderSystemNode(child, depth + 1)).join('')}`;
}

// ── Modal: System anlegen / bearbeiten ───────────────────────
function openSysModal(id, parentId) {
  const s = id
    ? S.systems.find(x => x.id === id)
    : { id: null, name: '', description: '', idPrefix: 'REQ', parentId };

  const parent = parentId
    ? S.systems.find(x => x.id === parentId)
    : (s?.parentId ? S.systems.find(x => x.id === s.parentId) : null);

  const title = id
    ? (parent ? `Subdomain bearbeiten` : 'System bearbeiten')
    : (parentId ? `Neue Subdomain von „${parent?.name}"` : 'Neues System');

  // Root-Systeme für Parent-Auswahl
  const rootSystems = S.systems.filter(x => !x.parentId && x.id !== id);

  openModal(title, `
    ${parent || s?.parentId ? `
      <div style="padding:7px 10px;background:var(--s2);border-radius:var(--r);
        font-size:12px;color:var(--t2);margin-bottom:14px">
        📂 Übergeordnetes System:
        <strong>${esc(parent?.name || S.systems.find(x=>x.id===s?.parentId)?.name || '')}</strong>
      </div>` : ''}

    <div class="frow">
      <label>Name</label>
      <input type="text" id="sm-name" value="${esc(s?.name||'')}"
        placeholder="${parentId ? 'z.B. Backend, Frontend, Datenbank …' : 'z.B. Kundenverwaltung, Mobile App …'}"
        autofocus/>
    </div>

    <div class="frow">
      <label>Beschreibung</label>
      <textarea id="sm-desc" rows="2">${esc(s?.description||'')}</textarea>
    </div>

    <div class="frow">
      <label>Anforderungs-ID Präfix</label>
      <div style="display:flex;gap:8px;align-items:center">
        <input type="text" id="sm-id-prefix"
          value="${esc(s?.idPrefix || (parentId ? (parent?.idPrefix||'REQ') + '_' + 'SUB' : 'REQ'))}"
          placeholder="z.B. REQ, ANF, API"
          maxlength="15" style="width:120px;text-transform:uppercase"
          oninput="this.value=this.value.toUpperCase().replace(/[^A-Z0-9_-]/g,'');
            document.getElementById('sm-id-preview').textContent=this.value+'-001'"/>
        <span style="font-size:12px;color:var(--t3)">-001, -002, …</span>
        <code id="sm-id-preview" style="font-size:11px;color:var(--aa)">${esc(s?.idPrefix||'REQ')}-001</code>
      </div>
    </div>

    ${!parentId && !s?.parentId && rootSystems.length ? `
    <div class="frow">
      <label>Unter System einhängen (optional)</label>
      <select id="sm-parent">
        <option value="">— Kein übergeordnetes System (Root)</option>
        ${rootSystems.map(x =>
          `<option value="${x.id}" ${s?.parentId===x.id?'selected':''}>${esc(x.name)}</option>`
        ).join('')}
      </select>
      <span class="fhint">Macht dieses System zu einer Subdomain</span>
    </div>` : `<input type="hidden" id="sm-parent" value="${esc(parentId || s?.parentId || '')}"/>`}

    <div style="display:flex;gap:8px;margin-top:14px">
      <button class="btn-primary" onclick="saveSys('${id||''}')">💾 Speichern</button>
      <button class="btn-secondary" onclick="closeModal()">Abbrechen</button>
    </div>`);
}

async function saveSys(id) {
  const name     = document.getElementById('sm-name')?.value.trim();
  const desc     = document.getElementById('sm-desc')?.value.trim();
  const prefix   = document.getElementById('sm-id-prefix')?.value.trim().toUpperCase() || 'REQ';
  const parentId = document.getElementById('sm-parent')?.value || null;

  if (!name) { toast('⚠ Name erforderlich'); return; }

  const existing = id ? S.systems.find(s => s.id === id) : null;

  await window.api.saveSystem({
    id:          id || null,
    name,
    description: desc,
    idPrefix:    prefix,
    idCounter:   existing?.idCounter || 0,
    parentId:    parentId || null,
    docs:        existing?.docs || [],
  });

  S.systems = await window.api.getSystems();
  renderSystems();
  closeModal();
  toast('✅ System gespeichert');
}

async function delSys(id) {
  const sys = S.systems.find(s => s.id === id);
  const children = S.systems.filter(s => s.parentId === id);
  const msg = children.length
    ? `System „${sys?.name}" und ${children.length} Subdomain(s) sowie alle Anforderungen löschen?`
    : `System „${sys?.name}" und alle zugehörigen Anforderungen löschen?`;

  if (!confirm(msg)) return;
  await window.api.deleteSystem(id);
  S.systems = await window.api.getSystems();
  renderSystems();
  toast('✅ System gelöscht');
}

async function addFolder(systemId) {
  const files = await window.api.pickFolder();
  if (!files.length) { toast('⚠ Keine unterstützten Dateien im Ordner gefunden'); return; }
  toast(`📁 ${files.length} Datei(en) gefunden — lade hoch …`);
  const btn = document.querySelector(`[onclick="addFolder('${systemId}')"]`);
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span>'; }
  const res = await window.api.uploadDocs(systemId, files);
  S.systems = await window.api.getSystems();
  renderSystems();
  toast(`✅ ${res.added?.length || 0} Datei(en) aus Ordner hochgeladen`);
  if (typeof indexSystemDocs === 'function') {
    indexSystemDocs(systemId).then(r => {
      if (r.indexed > 0) toast(`🧠 ${r.indexed} Dokument(e) indexiert`);
    });
  }
}

async function addFiles(systemId) {
  const files = await window.api.pickFiles('.txt,.md,.pdf,.js,.ts,.tsx,.jsx,.py,.java,.cs,.cpp,.c,.h,.go,.rb,.php,.swift,.kt,.rs,.json,.csv,.yaml,.yml,.html,.css,.scss,.sql,.sh,.bash,.vue,.dart');
  if (!files.length) return;
  const btn = document.querySelector(`[onclick="addFiles('${systemId}')"]`);
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span>'; }
  const res = await window.api.uploadDocs(systemId, files);
  S.systems = await window.api.getSystems();
  renderSystems();
  toast(`✅ ${res.added?.length || 0} Datei(en) hochgeladen`);
  if (typeof indexSystemDocs === 'function') {
    indexSystemDocs(systemId).then(r => {
      if (r.indexed > 0) toast(`🧠 ${r.indexed} Dokument(e) indexiert`);
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
  const totalKB = (docs.reduce((sum, d) => sum + (d.size||0), 0) / 1024).toFixed(1);
  const byExt = {};
  docs.forEach(d => { const ext = d.name.split('.').pop()?.toLowerCase()||'sonstig'; byExt[ext]=(byExt[ext]||0)+1; });
  openModal(`📊 ${sys.name} — Dokument-Stats`, `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
      <div class="stat-card"><span class="stat-n">${docs.length}</span><span class="stat-l">Dokumente</span></div>
      <div class="stat-card"><span class="stat-n">${totalKB}</span><span class="stat-l">KB gesamt</span></div>
    </div>
    <div style="font-size:12px;font-weight:600;color:var(--t2);margin-bottom:8px">Nach Dateityp:</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">
      ${Object.entries(byExt).sort((a,b)=>b[1]-a[1]).map(([ext,cnt]) =>
        `<span class="sbadge s-assigned">.${esc(ext)}: ${cnt}</span>`
      ).join('')}
    </div>
    <div style="max-height:200px;overflow-y:auto">
      ${docs.map(d => `<div style="display:flex;justify-content:space-between;padding:5px 0;
        border-bottom:1px solid var(--b1);font-size:12px">
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
window.addFolder        = addFolder;
window.remDoc           = remDoc;
window.showDocStats     = showDocStats;
