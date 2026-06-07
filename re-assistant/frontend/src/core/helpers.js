'use strict';
/**
 * core/helpers.js
 * DOM-Utilities, Toast, Modal, Markdown-Renderer, Zeit-Helfer.
 */

// ── DOM ───────────────────────────────────────────────────────
function $(id) { return document.getElementById(id); }
function setVal(id, v) { const e = $(id); if (e) e.value = v; }

// ── String-Escaping ───────────────────────────────────────────
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Zeit ──────────────────────────────────────────────────────
function now() {
  return new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}
function timeSince(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)    return 'Gerade eben';
  if (s < 3600)  return `Vor ${Math.floor(s / 60)} Min.`;
  if (s < 86400) return `Vor ${Math.floor(s / 3600)} Std.`;
  return new Date(ts).toLocaleDateString('de-DE');
}

// ── Labels ────────────────────────────────────────────────────
function statusLabel(s) {
  return { open:'Offen', assigned:'Zugewiesen', 'in-progress':'In Bearbeitung', done:'Erledigt', rejected:'Abgelehnt' }[s] || s;
}
function priLabel(p) {
  return { high:'Hoch', medium:'Mittel', low:'Niedrig' }[p] || p;
}
function roleLabel(r) {
  return { admin:'Administrator', business:'Business', businessanalyst:'Business Analyst', projectmanager:'Projektmanager', developer:'Entwickler' }[r] || r;
}

// ── Markdown-Renderer (einfach, sicher) ───────────────────────
function renderMD(t) {
  return esc(t)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g,     '<em>$1</em>')
    .replace(/`(.*?)`/g,       '<code>$1</code>')
    .replace(/^#{1,3} (.+)/gm, '<strong style="font-size:14px">$1</strong>')
    .replace(/^- (.+)/gm,      '<li style="margin:2px 0 2px 14px">$1</li>')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g,   '<br>');
}

// ── Toast ─────────────────────────────────────────────────────
let _toastTimer;
function toast(msg, duration = 3200) {
  const t = $('toast');
  if (!t) return;
  t.innerHTML = msg;
  t.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('show'), duration);
}

// ── Modal ─────────────────────────────────────────────────────
function openModal(title, bodyHTML) {
  $('modal-title').textContent = title;
  $('modal-body').innerHTML    = bodyHTML;
  $('modal-overlay').style.display = 'flex';
}
function closeModal() {
  $('modal-overlay').style.display = 'none';
}

// ── Chat-Nachrichten ──────────────────────────────────────────
function pushMsg(containerId, role, md) {
  const c = $(containerId);
  if (!c) return;
  const div = document.createElement('div');
  div.className = `msg ${role === 'u' || role === 'user' ? 'u' : 'a'}`;
  div.innerHTML = `<div class="bubble">${renderMD(md)}</div>
    <div class="msg-meta">${role === 'u' || role === 'user' ? 'Sie' : 'RE-Assistent · ' + now()}</div>`;
  c.appendChild(div);
  c.scrollTop = c.scrollHeight;
  return div;
}
function addTyping(containerId) {
  const c = $(containerId);
  if (!c) return { remove: () => {} };
  const div = document.createElement('div');
  div.className = 'msg a';
  div.innerHTML = '<div class="bubble"><div class="typing-dots"><div class="tdot"></div><div class="tdot"></div><div class="tdot"></div></div></div>';
  c.appendChild(div);
  c.scrollTop = c.scrollHeight;
  return div;
}

// ── Textarea Auto-Resize ──────────────────────────────────────
function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 150) + 'px';
}

// ── Generische Req-Listen-Darstellung ─────────────────────────
function renderReqList(containerId, reqs, mode) {
  const w = $(containerId);
  if (!w) return;
  if (!reqs.length) {
    w.innerHTML = '<div class="empty-state"><h3>Keine Anforderungen</h3><p>Noch keine Anforderungen vorhanden.</p></div>';
    return;
  }
  w.innerHTML = reqs.map(r => {
    const sys = S.systems.find(s => s.id === r.systemId);
    return `<div class="req-card">
      <div class="req-card-head">
        <div>
          <div style="display:flex;align-items:center;gap:7px;margin-bottom:3px;flex-wrap:wrap">
            <span class="req-id">${esc(r.id)}</span>
            <span class="sbadge s-${r.status}">${statusLabel(r.status)}</span>
            <span class="sbadge p-${r.priority}">${priLabel(r.priority)}</span>
            ${sys ? `<span class="rtag">${esc(sys.name)}</span>` : ''}
            ${r.subcategory ? `<span class="rtag">${esc(r.subcategory)}</span>` : ''}
            ${r.qualityScore ? `<span class="sbadge" style="background:${r.qualityScore>=7?'var(--grnbg)':r.qualityScore>=4?'var(--ambbg)':'var(--redbg)'};color:${r.qualityScore>=7?'var(--grn)':r.qualityScore>=4?'var(--amb)':'var(--red)'}">QS:${r.qualityScore}</span>` : ''}
            ${r.sourceAnalysis ? '<span class="sbadge" style="background:var(--bluebg);color:var(--blue)">🔍 Source</span>' : ''}
          </div>
          <div class="req-title">${esc(r.title)}</div>
        </div>
        ${mode !== 'developer' ? `<button class="btn-secondary" style="font-size:11px;padding:4px 10px" onclick="openReqModal('${r.id}')">Bearbeiten</button>` : ''}
      </div>
      <div class="req-card-body">
        <div class="req-desc">${esc(r.description || '')}</div>
        ${r.rationale ? `<div class="req-rat">${esc(r.rationale)}</div>` : ''}
        <div class="req-foot">${(r.tags || []).map(t => `<span class="rtag">${esc(t)}</span>`).join('')}</div>
      </div>
    </div>`;
  }).join('');
}

// Req-Modal (Bearbeiten / Neu)
function openReqModal(reqId, defaultSystemId) {
  const r = reqId
    ? (S.requirements || []).find(x => x.id === reqId)
    : { id:null, systemId:defaultSystemId||'', title:'', description:'', category:'Funktional', priority:'medium', rationale:'', tags:[] };
  const so = S.systems.map(s => `<option value="${s.id}"${r.systemId===s.id?' selected':''}>${esc(s.name)}</option>`).join('');
  openModal(reqId ? 'Anforderung bearbeiten' : 'Neue Anforderung', `
    <div class="frow"><label>System</label><select id="rm-sys">${so}</select></div>
    <div class="frow"><label>Titel</label><input type="text" id="rm-title" value="${esc(r.title)}"/></div>
    <div class="frow"><label>Beschreibung</label><textarea id="rm-desc" rows="4">${esc(r.description||'')}</textarea></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="frow"><label>Kategorie</label><select id="rm-cat">
        ${['Funktional','Nicht-funktional','Sicherheit','Performance','UI/UX','Daten','Integration','Wartbarkeit'].map(c=>`<option${r.category===c?' selected':''}>${c}</option>`).join('')}
      </select></div>
      <div class="frow"><label>Priorität</label><select id="rm-pri">
        <option value="high"${r.priority==='high'?' selected':''}>Hoch</option>
        <option value="medium"${r.priority==='medium'?' selected':''}>Mittel</option>
        <option value="low"${r.priority==='low'?' selected':''}>Niedrig</option>
      </select></div>
    </div>
    <div class="frow"><label>Begründung</label><textarea id="rm-rat" rows="2">${esc(r.rationale||'')}</textarea></div>
    <div class="frow"><label>Tags (kommagetrennt)</label><input type="text" id="rm-tags" value="${(r.tags||[]).join(', ')}"/></div>
    <div style="display:flex;gap:8px;margin-top:6px">
      <button class="btn-primary" onclick="saveReqModal('${reqId||''}')">Speichern</button>
      ${reqId ? `<button class="btn-danger" style="font-size:12px;padding:6px 12px" onclick="deleteReqModal('${reqId}')">Löschen</button>` : ''}
      <button class="btn-secondary" onclick="closeModal()">Abbrechen</button>
    </div>`);
}
async function saveReqModal(reqId) {
  const tags = $('rm-tags').value.split(',').map(t => t.trim()).filter(Boolean);
  await window.api.saveRequirement({
    id: reqId || null,
    systemId: $('rm-sys').value,
    title: $('rm-title').value.trim(),
    description: $('rm-desc').value.trim(),
    category: $('rm-cat').value,
    priority: $('rm-pri').value,
    rationale: $('rm-rat').value.trim(),
    tags, createdBy: S.user.id, createdByName: S.user.name, status: 'open'
  });
  closeModal();
  toast('✅ Gespeichert');
  if (S.activeView === 'business-reqs') loadBizReqs();
  if (S.activeView === 'pm-dashboard')  loadPMDash();
}
async function deleteReqModal(id) {
  if (!confirm('Löschen?')) return;
  await window.api.deleteRequirement(id);
  closeModal();
  toast('✅ Gelöscht');
  if (S.activeView === 'business-reqs') loadBizReqs();
}

// Globale Keyboard-Shortcuts
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if ($('modal-overlay')?.style.display !== 'none') { closeModal(); return; }
  }
});

// Modal-Overlay Klick schließt
document.addEventListener('DOMContentLoaded', () => {
  $('modal-overlay')?.addEventListener('click', e => {
    if (e.target === $('modal-overlay')) closeModal();
  });
  $('modal-close')?.addEventListener('click', closeModal);
});

// Exports (global, da kein Bundler-Tree-Shaking für globale Funktionen)
window.$ = $;
window.setVal = setVal;
window.esc = esc;
window.now = now;
window.timeSince = timeSince;
window.statusLabel = statusLabel;
window.priLabel = priLabel;
window.roleLabel = roleLabel;
window.renderMD = renderMD;
window.toast = toast;
window.openModal = openModal;
window.closeModal = closeModal;
window.pushMsg = pushMsg;
window.addTyping = addTyping;
window.autoResize = autoResize;
window.renderReqList = renderReqList;
window.openReqModal = openReqModal;
window.saveReqModal = saveReqModal;
window.deleteReqModal = deleteReqModal;

// ── Window Globals ──────────────────────────────────────────
