'use strict';
const $ = window.$ || (id => document.getElementById(id));
/**
 * features/comments.js
 * 🟡 FIX 5: Kommentare für alle Rollen — nicht nur Entwickler.
 * Wiederverwendbare Kommentar-Komponente.
 */

/**
 * Rendert einen vollständigen Kommentar-Thread inkl. Eingabefeld.
 * @param {string} reqId - ID der Anforderung
 * @param {Array}  comments - bestehende Kommentare
 * @param {string} containerId - ID des Container-Elements
 */
function renderComments(reqId, comments, containerId) {
  const el = $(containerId);
  if (!el) return;
  el.innerHTML = `
    <div class="comment-thread-header">
      <span style="font-size:11px;font-weight:600;color:var(--t3);text-transform:uppercase;letter-spacing:.06em">
        💬 Kommentare (${(comments||[]).length})
      </span>
    </div>
    <div id="comments-list-${reqId}">
      ${renderCommentList(comments)}
    </div>
    <div class="comment-input-wrap">
      <div class="comment-avatar" style="background:var(--ag)">
        ${S.user.name.substring(0,2).toUpperCase()}
      </div>
      <div style="flex:1">
        <textarea id="comment-inp-${reqId}"
          placeholder="Kommentar schreiben …"
          rows="2"
          style="width:100%;font-size:12px;resize:vertical;min-height:40px"
          onkeydown="handleCommentKey(event,'${reqId}')"></textarea>
        <div style="display:flex;justify-content:flex-end;margin-top:4px">
          <button class="btn-primary" style="font-size:11px;padding:5px 12px"
            onclick="submitCommentGeneral('${reqId}')">
            Senden
          </button>
        </div>
      </div>
    </div>`;
}

function renderCommentList(comments) {
  if (!(comments||[]).length)
    return '<div style="font-size:12px;color:var(--t3);padding:8px 0">Noch keine Kommentare.</div>';
  return (comments||[]).map(c => `
    <div class="comment">
      <div class="comment-avatar">${(c.authorName||'?').substring(0,2).toUpperCase()}</div>
      <div style="flex:1">
        <div>
          <span class="comment-author">${esc(c.authorName||'')}</span>
          <span class="comment-time"> · ${new Date(c.createdAt).toLocaleString('de-DE',{hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit'})}</span>
        </div>
        <div class="comment-text">${renderMD(c.text)}</div>
      </div>
    </div>`).join('');
}

function handleCommentKey(e, reqId) {
  // Ctrl+Enter oder Cmd+Enter sendet
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    submitCommentGeneral(reqId);
  }
}

async function submitCommentGeneral(reqId) {
  const inp  = $(`comment-inp-${reqId}`);
  const text = inp?.value.trim();
  if (!text) return;
  inp.value = '';
  inp.disabled = true;

  await window.api.addComment({
    reqId,
    comment: { text, authorId: S.user.id, authorName: S.user.name }
  });

  // Kommentare neu laden und rendern
  const reqs = await window.api.getRequirements({});
  const req  = reqs.find(r => r.id === reqId);
  const listEl = $(`comments-list-${reqId}`);
  if (listEl) listEl.innerHTML = renderCommentList(req?.comments || []);

  inp.disabled = false;
  inp.focus();
}

/**
 * Zeigt Versionsverlauf einer Anforderung in einem Modal.
 * 🟡 FIX 4 (UI-Teil)
 */
async function showReqHistory(reqId, reqTitle) {
  openModal(`📋 Verlauf: ${reqTitle}`,
    '<div style="text-align:center;padding:20px"><div class="spin"></div><p>Lade Verlauf …</p></div>');

  let history = [];
  try {
    history = await window.api.getReqHistory(reqId);
  } catch(e) {
    $('modal-body').innerHTML = '<p style="color:var(--red);font-size:13px">Verlauf konnte nicht geladen werden.</p>';
    return;
  }

  if (!history.length) {
    $('modal-body').innerHTML = '<p style="color:var(--t3);font-size:13px">Noch keine Änderungshistorie vorhanden.</p>';
    return;
  }

  $('modal-body').innerHTML = `
    <p style="font-size:12px;color:var(--t3);margin-bottom:14px">
      ${history.length} Änderung(en) — neueste zuerst
    </p>
    ${history.map((h, i) => `
      <div style="background:var(--s1);border:1px solid var(--b1);border-radius:var(--r);padding:12px 14px;margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <span style="font-size:11px;font-weight:700;color:var(--aa)">Version ${history.length - i}</span>
          <span style="font-size:11px;color:var(--t3)">
            ${esc(h.changedByName)} · ${new Date(h.changedAt).toLocaleString('de-DE')}
          </span>
        </div>
        <div style="font-size:13px;font-weight:600;margin-bottom:4px">${esc(h.title)}</div>
        <div style="font-size:12px;color:var(--t2);line-height:1.6">${esc((h.description||'').substring(0,200))}${(h.description||'').length>200?'…':''}</div>
        <div style="display:flex;gap:6px;margin-top:6px">
          <span class="sbadge p-${h.priority}">${priLabel(h.priority)}</span>
          <span class="rtag" style="font-size:9px">${esc(h.category)}</span>
        </div>
        ${i > 0 ? `<button class="btn-secondary" style="font-size:11px;padding:4px 10px;margin-top:8px"
          onclick="restoreVersion('${reqId}',${JSON.stringify(h).replace(/</g,'\\u003c').replace(/'/g,"\\'")})">
          ↩ Diese Version wiederherstellen
        </button>` : ''}
      </div>`).join('')}`;
}

async function restoreVersion(reqId, histVersion) {
  if (!confirm('Diese Version wiederherstellen?')) return;
  const reqs = await window.api.getRequirements({});
  const req  = reqs.find(r => r.id === reqId);
  if (!req) return;
  await window.api.saveRequirement({
    ...req,
    title:       histVersion.title,
    description: histVersion.description,
    priority:    histVersion.priority,
    category:    histVersion.category,
    rationale:   histVersion.rationale,
  });
  closeModal();
  toast('✅ Version wiederhergestellt');
}

window.renderComments         = renderComments;
window.renderCommentList      = renderCommentList;
window.handleCommentKey       = handleCommentKey;
window.submitCommentGeneral   = submitCommentGeneral;
window.showReqHistory         = showReqHistory;
window.restoreVersion         = restoreVersion;

// ── Window Globals ──────────────────────────────────────────
