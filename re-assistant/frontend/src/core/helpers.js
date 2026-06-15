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
  if (!t) return '';

  // Code-Blöcke ZUERST extrahieren (vor dem Escaping)
  const codeBlocks = [];
  t = t.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push({ lang: lang || '', code });
    return `\x00CODE${idx}\x00`;
  });

  // Inline-Code extrahieren
  const inlineCodes = [];
  t = t.replace(/`([^`]+)`/g, (_, code) => {
    const idx = inlineCodes.length;
    inlineCodes.push(code);
    return `\x00INLINE${idx}\x00`;
  });

  // Jetzt escapen
  t = t
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');

  // Block-Elemente (Zeilen-basiert)
  const lines = t.split('\n');
  const out = [];
  let inList = false;
  let inTable = false;
  let tableRows = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Überschriften
    const hMatch = line.match(/^(#{1,4})\s+(.+)/);
    if (hMatch) {
      if (inList) { out.push('</ul>'); inList = false; }
      const level = hMatch[1].length;
      const sizes = ['18px','16px','14px','13px'];
      out.push(`<div style="font-size:${sizes[level-1]||'13px'};font-weight:700;margin:10px 0 4px;color:var(--t1)">${hMatch[2]}</div>`);
      continue;
    }

    // Tabellen
    if (line.includes('|') && line.trim().startsWith('|')) {
      if (!inTable) { inTable = true; tableRows = []; }
      tableRows.push(line);
      continue;
    } else if (inTable) {
      // Tabelle rendern
      const validRows = tableRows.filter(r => !r.match(/^\s*\|[-:\s|]+\|\s*$/));
      if (validRows.length) {
        out.push('<div style="overflow-x:auto;margin:8px 0"><table style="border-collapse:collapse;font-size:12px;width:100%">');
        validRows.forEach((row, ri) => {
          const cells = row.split('|').filter((_, ci) => ci > 0 && ci < row.split('|').length - 1);
          const tag = ri === 0 ? 'th' : 'td';
          const style = ri === 0
            ? 'padding:6px 10px;background:var(--s3);font-weight:600;border:1px solid var(--b1);text-align:left'
            : 'padding:5px 10px;border:1px solid var(--b1);vertical-align:top';
          out.push('<tr>' + cells.map(c => `<${tag} style="${style}">${c.trim()}</${tag}>`).join('') + '</tr>');
        });
        out.push('</table></div>');
      }
      inTable = false; tableRows = [];
    }

    // Listen
    const liMatch = line.match(/^(\s*)([-*+]|\d+\.)\s+(.+)/);
    if (liMatch) {
      if (!inList) { out.push('<ul style="margin:4px 0;padding-left:20px">'); inList = true; }
      out.push(`<li style="margin:2px 0">${liMatch[3]}</li>`);
      continue;
    } else if (inList) {
      out.push('</ul>');
      inList = false;
    }

    // Horizontale Linie
    if (line.match(/^(---+|===+|\*\*\*+)$/)) {
      out.push('<hr style="border:none;border-top:1px solid var(--b1);margin:10px 0"/>');
      continue;
    }

    // Blockquote
    if (line.startsWith('&gt;')) {
      out.push(`<blockquote style="border-left:3px solid var(--aa);margin:4px 0;padding:4px 10px;color:var(--t2);font-style:italic">${line.slice(4).trim()}</blockquote>`);
      continue;
    }

    // Leere Zeile
    if (!line.trim()) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push('<br>');
      continue;
    }

    out.push(line);
  }

  if (inList) out.push('</ul>');
  if (inTable && tableRows.length) out.push('');

  t = out.join('\n');

  // Inline-Formatierung
  t = t
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g,   '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,        '<em>$1</em>')
    .replace(/~~(.+?)~~/g,          '<del>$1</del>')
    .replace(/\n/g, '<br>');

  // Inline-Code wiederherstellen
  t = t.replace(/\x00INLINE(\d+)\x00/g, (_, idx) =>
    `<code style="background:var(--s3);padding:1px 5px;border-radius:4px;font-family:var(--mono);font-size:12px">${esc(inlineCodes[+idx])}</code>`
  );

  // Code-Blöcke wiederherstellen
  t = t.replace(/\x00CODE(\d+)\x00(<br>)?/g, (_, idx) => {
    const { lang, code } = codeBlocks[+idx];
    return `<div style="position:relative;margin:8px 0">` +
      (lang ? `<div style="font-size:10px;color:var(--t3);background:var(--s3);padding:3px 10px;border-radius:6px 6px 0 0;border:1px solid var(--b1);border-bottom:none">${esc(lang)}</div>` : '') +
      `<pre style="background:var(--s3);border:1px solid var(--b1);border-radius:${lang?'0 0 6px 6px':'6px'};` +
      `padding:10px 12px;overflow-x:auto;font-size:12px;font-family:var(--mono);margin:0;line-height:1.5">` +
      `<code>${esc(code).trimEnd()}</code></pre>` +
      `<button onclick="navigator.clipboard.writeText(${JSON.stringify(code)})" ` +
      `style="position:absolute;top:${lang?'28':'6'}px;right:6px;background:var(--s2);border:1px solid var(--b1);` +
      `border-radius:4px;padding:2px 7px;font-size:10px;cursor:pointer;color:var(--t3)" title="Kopieren">⎘</button>` +
      `</div>`;
  });

  return t;
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
            ${window.workflowBadge ? workflowBadge(r.workflowStatus || r.workflow_status, true) : ''}
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
window.$      = $;
window.setVal = setVal;
window.esc    = esc;
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

// ── Offline-Handling ─────────────────────────────────────────
function showOfflineBanner(show) {
  let banner = document.getElementById('offline-banner');
  if (!banner && show) {
    banner = document.createElement('div');
    banner.id = 'offline-banner';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#f59e0b;color:#000;text-align:center;padding:6px;font-size:12px;font-weight:600';
    banner.textContent = '⚡ Keine Internetverbindung — Änderungen werden lokal gespeichert';
    document.body.prepend(banner);
  } else if (banner && !show) {
    banner.remove();
  }
}

window.addEventListener('online',  () => { showOfflineBanner(false); toast('✅ Verbindung wiederhergestellt'); });
window.addEventListener('offline', () => showOfflineBanner(true));
if (!navigator.onLine) showOfflineBanner(true);
