'use strict';
const $ = window.$ || (id => document.getElementById(id));
/**
 * features/dependencies.js
 * Abhängigkeiten zwischen Anforderungen — Liste, Matrix, KI-Analyse.
 */

/* ══════════════════════════════════════════════════════════════
   ABHÄNGIGKEITEN
══════════════════════════════════════════════════════════════ */
const DEP_TYPES = {
  blocks:  { label: 'Blockiert',  cls: 'dep-blocks', icon: '🚫' },
  needs:   { label: 'Benötigt',   cls: 'dep-needs',  icon: '⬆' },
  related: { label: 'Verwandt',   cls: 'dep-related', icon: '↔' },
};

async function loadDependencies() {
  S.systems = await window.api.getSystems();
  const sel = $('dep-sys-sel');
  sel.innerHTML = '<option value="">System wählen …</option>' +
    S.systems.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  sel.onchange = () => renderDepView();
  $('btn-analyze-deps').onclick = analyzeDependencies;
  $('btn-add-dep').onclick = openAddDepModal;
  $('dep-view-mode').onchange = renderDepView;
  if (sel.value) renderDepView();
}

async function renderDepView() {
  const sysId = $('dep-sys-sel').value;
  if (!sysId) return;
  S.requirements = await window.api.getRequirements({ systemId: sysId });
  const deps = loadDeps(sysId);
  const mode = $('dep-view-mode').value;
  if (mode === 'matrix') renderDepMatrix(deps);
  else renderDepList(deps);
}

function loadDeps(sysId) {
  try { return JSON.parse(localStorage.getItem(`deps-${sysId}`) || '[]'); } catch(e) { return []; }
}
function saveDeps(sysId, deps) {
  localStorage.setItem(`deps-${sysId}`, JSON.stringify(deps));
}

function renderDepList(deps) {
  const wrap = $('dep-content');
  if (!S.requirements.length) {
    wrap.innerHTML = '<div class="empty-state"><h3>Keine Anforderungen</h3></div>';
    return;
  }
  if (!deps.length) {
    wrap.innerHTML = '<div class="empty-state"><div class="es-icon">🔗</div><h3>Keine Abhängigkeiten</h3><p>Klicken Sie auf "+ Abhängigkeit hinzufügen" oder lassen Sie die KI analysieren.</p></div>';
    return;
  }
  wrap.innerHTML = deps.map(d => {
    const from = S.requirements.find(r => r.id === d.from);
    const to   = S.requirements.find(r => r.id === d.to);
    if (!from || !to) return '';
    const type = DEP_TYPES[d.type] || DEP_TYPES.related;
    return `<div class="dep-card">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:600;color:var(--t1)">${esc(from.id)}: ${esc(from.title)}</div>
          <div style="font-size:11px;color:var(--t3);margin-top:2px">${esc(from.description||'').substring(0,80)}</div>
        </div>
        <span class="dep-tag ${type.cls}">${type.icon} ${type.label}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:600;color:var(--t1)">${esc(to.id)}: ${esc(to.title)}</div>
          <div style="font-size:11px;color:var(--t3);margin-top:2px">${esc(to.description||'').substring(0,80)}</div>
        </div>
        <button onclick="removeDep('${d.id}')" style="background:none;border:none;color:var(--t3);cursor:pointer;font-size:14px;padding:2px 6px" title="Entfernen">✕</button>
      </div>
      ${d.note ? `<div style="font-size:11px;color:var(--t3);margin-top:8px;padding-top:8px;border-top:1px solid var(--b1)">💬 ${esc(d.note)}</div>` : ''}
    </div>`;
  }).join('');
}

function renderDepMatrix(deps) {
  const reqs = S.requirements.slice(0, 15); // max 15 für Übersichtlichkeit
  if (!reqs.length) { $('dep-content').innerHTML = '<div class="empty-state"><h3>Keine Anforderungen</h3></div>'; return; }
  const depMap = {};
  deps.forEach(d => { depMap[`${d.from}_${d.to}`] = d.type; });
  const header = reqs.map(r => `<th title="${esc(r.title)}">${esc(r.id)}</th>`).join('');
  const rows = reqs.map(from => {
    const cells = reqs.map(to => {
      if (from.id === to.id) return '<td class="dep-cell-self">—</td>';
      const type = depMap[`${from.id}_${to.id}`];
      if (!type) return `<td class="dep-cell-none" onclick="openAddDepModalPrefilled('${from.id}','${to.id}')" title="Klicken zum Hinzufügen">·</td>`;
      const t = DEP_TYPES[type];
      return `<td class="dep-cell-${type}" title="${esc(t.label)}">${t.icon}</td>`;
    }).join('');
    return `<tr><th title="${esc(from.title)}">${esc(from.id)}</th>${cells}</tr>`;
  }).join('');
  $('dep-content').innerHTML = `<div style="overflow:auto;max-height:100%"><table class="dep-matrix"><thead><tr><th>Von / Nach</th>${header}</tr></thead><tbody>${rows}</tbody></table><p style="font-size:11px;color:var(--t3);margin-top:8px;padding:0 4px">Zeigt max. 15 Anforderungen. Klicken Sie auf eine Zelle um eine Abhängigkeit hinzuzufügen.</p></div>`;
}

async function analyzeDependencies() {
  const sysId = $('dep-sys-sel').value;
  if (!sysId) { toast('⚠ System auswählen'); return; }
  if (!S.requirements.length) { toast('ℹ Keine Anforderungen'); return; }
  const btn = $('btn-analyze-deps'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Analysiere …';
  const rl = S.requirements.map(r => `${r.id}: ${r.title} — ${(r.description||'').substring(0,100)}`).join('\n');
  const res = await callAPI([{role:'user', content:`Analysiere Abhängigkeiten zwischen diesen Anforderungen. Erkenne:\n- "blocks": A muss vor B fertig sein\n- "needs": A braucht B als Voraussetzung\n- "related": A und B sind thematisch verbunden\n\nJSON ohne Backticks:\n{"dependencies":[{"from":"REQ-001","to":"REQ-002","type":"blocks","note":"Kurze Begründung"}],"summary":"..."}\n\nAnforderungen:\n${rl}`}], langNote(), 2000);
  btn.disabled = false; btn.innerHTML = '⚡ KI analysieren';
  if (!res.ok) { toast('❌ ' + res.text); return; }
  try {
    const result = JSON.parse(res.text.replace(/```json|```/g, '').trim());
    const existing = loadDeps(sysId);
    const newDeps = (result.dependencies || []).map(d => ({...d, id: 'dep' + Date.now() + Math.random()}));
    const merged = [...existing];
    for (const d of newDeps) {
      if (!merged.find(e => e.from === d.from && e.to === d.to)) merged.push(d);
    }
    saveDeps(sysId, merged);
    renderDepView();
    toast(`✅ ${newDeps.length} Abhängigkeit(en) gefunden — ${result.summary || ''}`);
    addNotif('🔗', 'Abhängigkeitsanalyse abgeschlossen', `${newDeps.length} neue Abhängigkeiten`, () => switchView('dependencies'));
  } catch(e) { toast('❌ Parsing-Fehler'); }
}

function openAddDepModal() {
  const opts = S.requirements.map(r => `<option value="${r.id}">${esc(r.id)}: ${esc(r.title.substring(0,50))}</option>`).join('');
  openModal('Abhängigkeit hinzufügen', `
    <div class="frow"><label>Von (blockiert / benötigt)</label><select id="dep-from">${opts}</select></div>
    <div class="frow"><label>Typ</label><select id="dep-type">
      <option value="blocks">🚫 Blockiert</option>
      <option value="needs">⬆ Benötigt</option>
      <option value="related">↔ Verwandt</option>
    </select></div>
    <div class="frow"><label>Nach</label><select id="dep-to">${opts}</select></div>
    <div class="frow"><label>Notiz (optional)</label><input type="text" id="dep-note" placeholder="Kurze Begründung …"/></div>
    <div style="display:flex;gap:8px;margin-top:6px"><button class="btn-primary" onclick="saveNewDep()">Speichern</button><button class="btn-secondary" onclick="closeModal()">Abbrechen</button></div>`);
}

function openAddDepModalPrefilled(fromId, toId) {
  openAddDepModal();
  setTimeout(() => { setVal('dep-from', fromId); setVal('dep-to', toId); }, 50);
}

function saveNewDep() {
  const from = $('dep-from').value, to = $('dep-to').value, type = $('dep-type').value;
  if (!from || !to || from === to) { toast('⚠ Verschiedene Anforderungen auswählen'); return; }
  const sysId = $('dep-sys-sel').value;
  const deps = loadDeps(sysId);
  if (deps.find(d => d.from === from && d.to === to)) { toast('ℹ Abhängigkeit bereits vorhanden'); closeModal(); return; }
  deps.push({ id: 'dep' + Date.now(), from, to, type, note: $('dep-note').value.trim() });
  saveDeps(sysId, deps);
  closeModal(); renderDepView(); toast('✅ Abhängigkeit gespeichert');
}

function removeDep(depId) {
  const sysId = $('dep-sys-sel').value;
  const deps = loadDeps(sysId).filter(d => d.id !== depId);
  saveDeps(sysId, deps); renderDepView(); toast('✅ Entfernt');
}

window.loadDependencies=loadDependencies;
window.analyzeDependencies=analyzeDependencies;
window.openAddDepModal=openAddDepModal;
window.openAddDepModalPrefilled=openAddDepModalPrefilled;
window.saveNewDep=saveNewDep;
window.removeDep=removeDep;

// ── Window Globals ──────────────────────────────────────────
window.renderDepView = renderDepView;
window.loadDeps = loadDeps;
window.saveDeps = saveDeps;
window.renderDepList = renderDepList;
window.renderDepMatrix = renderDepMatrix;
