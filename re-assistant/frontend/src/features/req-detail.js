'use strict';
const $ = window.$ || (id => document.getElementById(id));
/**
 * features/req-detail.js
 * Anforderungs-Detail-Panel mit Tabs:
 * Details | Kommentare | Historie | Verknüpfungen | Anhänge
 */

let _currentReq = null;
let _activeTab  = 'details';

// ── Detail-Panel öffnen ───────────────────────────────────────
async function openReqDetail(reqId) {
  const req = await fetch(`api/requirements/${reqId}`, { credentials: 'include' })
    .then(r => r.json()).catch(() => null);
  if (!req) { toast('❌ Anforderung nicht gefunden'); return; }
  _currentReq = req;
  _activeTab  = 'details';
  renderReqDetailPanel(req);
}

function renderReqDetailPanel(req) {
  const isWatching = (req.watchers || []).includes(S.user?.id);
  const sys = S.systems?.find(s => s.id === req.systemId);

  // Slide-in Panel
  let panel = document.getElementById('req-detail-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'req-detail-panel';
    panel.style.cssText = `
      position:fixed;top:0;right:0;bottom:0;width:520px;max-width:95vw;
      background:var(--s1);border-left:1px solid var(--b1);
      z-index:800;display:flex;flex-direction:column;
      box-shadow:-8px 0 32px rgba(0,0,0,.3);
      transform:translateX(100%);transition:transform .25s ease;
    `;
    document.body.appendChild(panel);
    setTimeout(() => panel.style.transform = 'translateX(0)', 10);
  } else {
    panel.style.transform = 'translateX(0)';
  }

  panel.innerHTML = `
    <!-- Header -->
    <div style="padding:14px 16px;border-bottom:1px solid var(--b1);flex-shrink:0">
      <div style="display:flex;align-items:flex-start;gap:8px">
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
            <code style="font-size:11px;color:var(--t3);background:var(--s2);
              padding:1px 7px;border-radius:4px">${esc(req.id)}</code>
            <span class="sbadge p-${req.priority}" style="font-size:10px">${priLabel(req.priority)}</span>
            <span class="sbadge s-${req.status}" style="font-size:10px">${statusLabel(req.status)}</span>
          </div>
          <div style="font-size:14px;font-weight:600;line-height:1.4" id="rdp-title">${esc(req.title)}</div>
          ${sys ? `<div style="font-size:11px;color:var(--t3);margin-top:2px">📁 ${esc(sys.name)}</div>` : ''}
        </div>
        <div style="display:flex;gap:4px;flex-shrink:0">
          <button title="${isWatching ? 'Beobachten beenden' : 'Beobachten'}"
            onclick="toggleWatch('${req.id}')"
            style="background:${isWatching?'var(--bluebg)':'var(--s2)'};
            border:1px solid ${isWatching?'rgba(88,166,255,.3)':'var(--b1)'};
            border-radius:var(--r);padding:5px 8px;cursor:pointer;font-size:12px;
            color:${isWatching?'var(--blue)':'var(--t2)'}">
            ${isWatching ? '👁 Beobachte' : '👁 Beobachten'}
          </button>
          <button onclick="closeReqDetailPanel()"
            style="background:none;border:none;color:var(--t3);font-size:18px;
            cursor:pointer;padding:4px 6px">×</button>
        </div>
      </div>

      <!-- Tabs -->
      <div style="display:flex;gap:0;margin-top:12px;border-bottom:1px solid var(--b1);margin-bottom:-1px">
        ${[
          ['details',   '📋 Details'],
          ['comments',  '💬 Kommentare'],
          ['history',   '📜 Historie'],
          ['links',     '🔗 Verknüpfungen'],
          ['attachments','📎 Anhänge'],
        ].map(([id, label]) => `
          <button onclick="switchReqTab('${id}')" id="rdp-tab-${id}"
            style="background:none;border:none;border-bottom:2px solid ${_activeTab===id?'var(--aa)':'transparent'};
            padding:6px 12px;font-size:12px;cursor:pointer;
            color:${_activeTab===id?'var(--aa)':'var(--t3)'};font-weight:${_activeTab===id?'600':'400'};
            transition:all .15s;white-space:nowrap">
            ${label}
          </button>`).join('')}
      </div>
    </div>

    <!-- Tab-Inhalt -->
    <div id="rdp-content" style="flex:1;overflow-y:auto;padding:0">
      ${_activeTab === 'details'     ? renderDetailsTab(req) : ''}
      ${_activeTab === 'comments'    ? '<div id="rdp-comments-wrap" style="padding:14px"><div class="spin"></div></div>' : ''}
      ${_activeTab === 'history'     ? '<div id="rdp-history-wrap" style="padding:14px"><div class="spin"></div></div>' : ''}
      ${_activeTab === 'links'       ? '<div id="rdp-links-wrap" style="padding:14px"><div class="spin"></div></div>' : ''}
      ${_activeTab === 'attachments' ? renderAttachmentsTab(req) : ''}
    </div>`;

  // Async Tabs laden
  if (_activeTab === 'comments')    loadCommentsTab(req.id);
  if (_activeTab === 'history')     loadHistoryTab(req.id);
  if (_activeTab === 'links')       loadLinksTab(req);
}

// ── Details Tab ───────────────────────────────────────────────
function renderDetailsTab(req) {
  return `<div style="padding:14px 16px">
    <!-- Beschreibung -->
    <div class="frow" style="margin-bottom:12px">
      <label>Beschreibung</label>
      <div style="font-size:13px;color:var(--t2);line-height:1.6;white-space:pre-wrap">${esc(req.description || '—')}</div>
    </div>

    <!-- Due Date + Story Points -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
      <div class="frow">
        <label>📅 Fälligkeitsdatum</label>
        <input type="date" id="rdp-due-date"
          value="${req.dueDate ? new Date(req.dueDate).toISOString().split('T')[0] : ''}"
          onchange="saveReqField('${req.id}', 'dueDate', this.value)"
          style="font-size:13px"/>
      </div>
      <div class="frow">
        <label>🎯 Story Points</label>
        <select id="rdp-story-points"
          onchange="saveReqField('${req.id}', 'storyPoints', this.value)"
          style="font-size:13px">
          <option value="">—</option>
          ${[1,2,3,5,8,13,21].map(p =>
            `<option value="${p}" ${req.storyPoints==p?'selected':''}>${p}</option>`
          ).join('')}
        </select>
      </div>
    </div>

    <!-- Priorität + Status -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
      <div class="frow">
        <label>Priorität</label>
        <select onchange="saveReqField('${req.id}', 'priority', this.value)">
          ${['high','medium','low'].map(p =>
            `<option value="${p}" ${req.priority===p?'selected':''}>${priLabel(p)}</option>`
          ).join('')}
        </select>
      </div>
      <div class="frow">
        <label>Status</label>
        <select onchange="saveReqField('${req.id}', 'status', this.value)">
          ${['open','in-progress','review','done','rejected'].map(s =>
            `<option value="${s}" ${req.status===s?'selected':''}>${statusLabel(s)}</option>`
          ).join('')}
        </select>
      </div>
    </div>

    <!-- Akzeptanzkriterien -->
    ${req.acceptanceCriteria?.length ? `
      <div class="frow" style="margin-bottom:12px">
        <label>✓ Akzeptanzkriterien</label>
        <ul style="margin:0;padding-left:16px">
          ${req.acceptanceCriteria.map(ac =>
            `<li style="font-size:12px;color:var(--t2);margin-bottom:3px">${esc(ac)}</li>`
          ).join('')}
        </ul>
      </div>` : ''}

    <!-- Watcher -->
    <div class="frow">
      <label>👁 Beobachter (${(req.watchers||[]).length})</label>
      <div style="font-size:12px;color:var(--t3)">
        ${(req.watchers||[]).length
          ? `${(req.watchers||[]).length} Nutzer beobachten diese Anforderung`
          : 'Keine Beobachter'}
      </div>
    </div>
  </div>`;
}

// ── Kommentare Tab ────────────────────────────────────────────
async function loadCommentsTab(reqId) {
  const wrap = document.getElementById('rdp-comments-wrap');
  if (!wrap) return;

  const comments = await fetch(`api/requirements/${reqId}/comments`, { credentials:'include' })
    .then(r => r.json()).catch(() => []);

  wrap.innerHTML = `
    <!-- Kommentar schreiben -->
    <div style="background:var(--s2);border-radius:var(--rl);padding:12px;margin-bottom:14px">
      <textarea id="rdp-new-comment" rows="3" placeholder="Kommentar schreiben …"
        style="width:100%;resize:vertical;font-size:13px"></textarea>
      <div style="display:flex;justify-content:flex-end;margin-top:6px">
        <button class="btn-primary" style="font-size:12px"
          onclick="submitComment('${reqId}')">💬 Kommentieren</button>
      </div>
    </div>

    <!-- Kommentare -->
    <div id="rdp-comments-list">
      ${comments.length ? comments.map(c => renderComment(c, reqId)).join('') :
        '<div style="text-align:center;color:var(--t3);padding:20px;font-size:13px">Noch keine Kommentare</div>'}
    </div>`;
}

function renderComment(c, reqId) {
  const isOwn = c.userId === S.user?.id;
  const time  = new Date(c.createdAt).toLocaleString('de-DE', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
  return `
    <div style="border-bottom:1px solid var(--b1);padding:10px 0" id="cmt-${c.id}">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <div style="width:26px;height:26px;border-radius:50%;background:var(--aa);
          display:flex;align-items:center;justify-content:center;font-size:11px;
          color:#fff;font-weight:700;flex-shrink:0">
          ${esc((c.userName||'??').substring(0,2).toUpperCase())}
        </div>
        <div style="flex:1;min-width:0">
          <span style="font-size:12px;font-weight:600">${esc(c.userName)}</span>
          <span style="font-size:11px;color:var(--t3);margin-left:6px">${time}</span>
          ${c.edited ? '<span style="font-size:10px;color:var(--t3)"> · bearbeitet</span>' : ''}
        </div>
        ${isOwn ? `
          <div style="display:flex;gap:4px">
            <button onclick="editComment('${c.id}','${reqId}')"
              style="background:none;border:none;color:var(--t3);font-size:11px;cursor:pointer">✎</button>
            <button onclick="deleteComment('${c.id}','${reqId}')"
              style="background:none;border:none;color:var(--t3);font-size:11px;cursor:pointer">✕</button>
          </div>` : ''}
      </div>
      <div style="font-size:13px;color:var(--t2);line-height:1.5;white-space:pre-wrap;
        padding-left:34px" id="cmt-text-${c.id}">${esc(c.content)}</div>
    </div>`;
}

async function submitComment(reqId) {
  const ta = document.getElementById('rdp-new-comment');
  const content = ta?.value.trim();
  if (!content) { toast('⚠ Kommentar eingeben'); return; }

  await fetch(`api/requirements/${reqId}/comments`, {
    method:'POST', credentials:'include',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ content }),
  });
  ta.value = '';
  loadCommentsTab(reqId);
  toast('✅ Kommentar gespeichert');
}

async function deleteComment(commentId, reqId) {
  if (!confirm('Kommentar löschen?')) return;
  await fetch(`api/requirements/${reqId}/comments/${commentId}`, { method:'DELETE', credentials:'include' });
  loadCommentsTab(reqId);
}

async function editComment(commentId, reqId) {
  const textEl = document.getElementById(`cmt-text-${commentId}`);
  if (!textEl) return;
  const current = textEl.textContent;
  textEl.innerHTML = `
    <textarea id="edit-cmt-${commentId}" style="width:100%;font-size:13px;resize:vertical" rows="3">${esc(current)}</textarea>
    <div style="display:flex;gap:6px;margin-top:4px">
      <button class="btn-primary" style="font-size:11px" onclick="saveEditComment('${commentId}','${reqId}')">Speichern</button>
      <button class="btn-secondary" style="font-size:11px" onclick="loadCommentsTab('${reqId}')">Abbrechen</button>
    </div>`;
}

async function saveEditComment(commentId, reqId) {
  const content = document.getElementById(`edit-cmt-${commentId}`)?.value.trim();
  if (!content) return;
  await fetch(`api/requirements/${reqId}/comments/${commentId}`, {
    method:'PUT', credentials:'include',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ content }),
  });
  loadCommentsTab(reqId);
}

// ── Historie Tab ──────────────────────────────────────────────
async function loadHistoryTab(reqId) {
  const wrap = document.getElementById('rdp-history-wrap');
  if (!wrap) return;

  const history = await fetch(`api/requirements/${reqId}/history`, { credentials:'include' })
    .then(r => r.json()).catch(() => []);

  const fieldLabels = {
    title:'Titel', description:'Beschreibung', priority:'Priorität',
    status:'Status', category:'Kategorie', rationale:'Begründung',
    due_date:'Fälligkeitsdatum', story_points:'Story Points',
  };
  const priorityColors = { high:'var(--red)', medium:'var(--amb)', low:'var(--t3)' };

  wrap.innerHTML = history.length ? history.map(h => {
    const time = new Date(h.created_at).toLocaleString('de-DE', {
      day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'
    });
    return `
      <div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--b1)">
        <div style="width:28px;height:28px;border-radius:50%;background:var(--s2);
          display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">
          ✏️
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px">
            <strong>${esc(h.user_name)}</strong>
            <span style="color:var(--t3)"> hat </span>
            <strong>${fieldLabels[h.field] || h.field}</strong>
            <span style="color:var(--t3)"> geändert</span>
          </div>
          <div style="display:flex;align-items:center;gap:6px;margin-top:3px;flex-wrap:wrap">
            ${h.old_value ? `<span style="font-size:11px;color:var(--red);text-decoration:line-through">${esc(h.old_value.substring(0,40))}</span>
            <span style="color:var(--t3)">→</span>` : ''}
            <span style="font-size:11px;color:var(--grn)">${esc((h.new_value||'').substring(0,40))}</span>
          </div>
          <div style="font-size:10px;color:var(--t3);margin-top:2px">${time}</div>
        </div>
      </div>`;
  }).join('') :
    '<div style="text-align:center;color:var(--t3);padding:20px;font-size:13px">Noch keine Änderungen protokolliert</div>';
}

// ── Verknüpfungen Tab ─────────────────────────────────────────
async function loadLinksTab(req) {
  const wrap = document.getElementById('rdp-links-wrap');
  if (!wrap) return;

  const links = req.linkedReqs || [];
  const linkTypes = {
    blocks:     { label: 'Blockiert',     color: 'var(--red)',  icon: '🚫' },
    blocked_by: { label: 'Blockiert von', color: 'var(--amb)',  icon: '⛔' },
    relates:    { label: 'Verwandt mit',  color: 'var(--blue)', icon: '🔗' },
    duplicates: { label: 'Duplikat von',  color: 'var(--t3)',   icon: '📋' },
  };

  // Verknüpfte Anforderungen laden
  const linkedDetails = await Promise.all(
    links.map(l => fetch(`api/requirements/${l.id}`, { credentials:'include' })
      .then(r => r.json()).catch(() => null))
  );

  wrap.innerHTML = `
    <!-- Neue Verknüpfung -->
    <div style="background:var(--s2);border-radius:var(--rl);padding:12px;margin-bottom:14px">
      <div style="font-size:12px;font-weight:600;margin-bottom:8px">+ Verknüpfung hinzufügen</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <select id="rdp-link-type" style="font-size:12px">
          <option value="relates">🔗 Verwandt mit</option>
          <option value="blocks">🚫 Blockiert</option>
          <option value="blocked_by">⛔ Blockiert von</option>
          <option value="duplicates">📋 Duplikat von</option>
        </select>
        <input type="text" id="rdp-link-id" placeholder="Anforderungs-ID (z.B. REQ-001)"
          style="flex:1;min-width:120px;font-size:12px"/>
        <button class="btn-primary" style="font-size:12px"
          onclick="addLink('${req.id}')">+ Verknüpfen</button>
      </div>
    </div>

    <!-- Bestehende Verknüpfungen -->
    ${links.length ? links.map((l, i) => {
      const linked = linkedDetails[i];
      const lt = linkTypes[l.type] || linkTypes.relates;
      return `
        <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--b1)">
          <span style="font-size:18px">${lt.icon}</span>
          <div style="flex:1;min-width:0">
            <div style="font-size:11px;color:${lt.color};font-weight:600">${lt.label}</div>
            <div style="font-size:13px">${linked ? esc((linked.title||'').substring(0,50)) : esc(l.id)}</div>
            <code style="font-size:10px;color:var(--t3)">${esc(l.id)}</code>
          </div>
          <button onclick="removeLink('${req.id}','${l.id}')"
            style="background:none;border:none;color:var(--t3);cursor:pointer;font-size:14px">✕</button>
        </div>`;
    }).join('') :
      '<div style="text-align:center;color:var(--t3);padding:20px;font-size:13px">Keine Verknüpfungen</div>'}`;
}

async function addLink(reqId) {
  const targetId  = document.getElementById('rdp-link-id')?.value.trim();
  const linkType  = document.getElementById('rdp-link-type')?.value || 'relates';
  if (!targetId) { toast('⚠ Anforderungs-ID eingeben'); return; }

  const res  = await fetch(`api/requirements/${reqId}/links`, {
    method:'POST', credentials:'include',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ targetId, linkType }),
  });
  const data = await res.json();
  if (data.ok) {
    toast('✅ Verknüpfung gespeichert');
    // Neu laden
    const updatedReq = await fetch(`api/requirements/${reqId}`, { credentials:'include' }).then(r=>r.json());
    _currentReq = updatedReq;
    loadLinksTab(updatedReq);
  } else {
    toast('❌ ' + (data.error || 'Fehler'));
  }
}

async function removeLink(reqId, targetId) {
  await fetch(`api/requirements/${reqId}/links/${targetId}`, { method:'DELETE', credentials:'include' });
  const updatedReq = await fetch(`api/requirements/${reqId}`, { credentials:'include' }).then(r=>r.json());
  _currentReq = updatedReq;
  loadLinksTab(updatedReq);
  toast('✅ Verknüpfung entfernt');
}

// ── Anhänge Tab ───────────────────────────────────────────────
function renderAttachmentsTab(req) {
  const attachments = req.attachments || [];
  return `<div style="padding:14px 16px">
    <button class="btn-secondary" style="width:100%;margin-bottom:12px;font-size:12px"
      onclick="addAttachment('${req.id}')">📎 Datei anhängen</button>
    attachments.length ? attachments.map(a => "<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--b1)">         <span style="font-size:20px">📄</span>         <div style="flex:1;min-width:0">           <div style="font-size:13px">' + (esc(a.name)) + '</div>           <div style="font-size:11px;color:var(--t3)">' + (((a.size||0)/1024).toFixed(1)) + ' KB</div>         </div>").join("")}
      '<div style="text-align:center;color:var(--t3);padding:20px;font-size:13px">Keine Anhänge</div>'}
  </div>`;
}

async function addAttachment(reqId) {
  const files = await window.api.pickFiles('*');
  if (!files.length) return;
  const file = files[0];
  // Anhang als Base64 in requirements.attachments speichern
  const reader = new FileReader();
  reader.onload = async () => {
    const req_ = await fetch(`api/requirements/${reqId}`, { credentials:'include' }).then(r=>r.json());
    const attachments = [...(req_.attachments||[]), {
      id: 'att-' + Date.now(), name: file.name, size: file.size, addedAt: Date.now(),
    }];
    await window.api.saveRequirement({ ...req_, attachments });
    toast(`✅ ${file.name} angehängt`);
    _currentReq = { ..._currentReq, attachments };
    switchReqTab('attachments');
  };
  reader.readAsDataURL(file);
}

// ── Tab wechseln ──────────────────────────────────────────────
function switchReqTab(tabId) {
  _activeTab = tabId;
  renderReqDetailPanel(_currentReq);
}

// ── Beobachten togglen ────────────────────────────────────────
async function toggleWatch(reqId) {
  const res  = await fetch(`api/requirements/${reqId}/watch`, { method:'POST', credentials:'include' });
  const data = await res.json();
  toast(data.watching ? '👁 Beobachte diese Anforderung' : '👁 Beobachten beendet');
  const updatedReq = await fetch(`api/requirements/${reqId}`, { credentials:'include' }).then(r=>r.json());
  _currentReq = updatedReq;
  renderReqDetailPanel(updatedReq);
}

// ── Feld inline speichern ─────────────────────────────────────
async function saveReqField(reqId, field, value) {
  const req_ = await fetch(`api/requirements/${reqId}`, { credentials:'include' }).then(r=>r.json());
  await window.api.saveRequirement({ ...req_, [field]: value || null });
  _currentReq = { ..._currentReq, [field]: value };
  toast('✅ Gespeichert');
}

// ── Panel schließen ───────────────────────────────────────────
function closeReqDetailPanel() {
  const panel = document.getElementById('req-detail-panel');
  if (!panel) return;
  panel.style.transform = 'translateX(100%)';
  setTimeout(() => panel.remove(), 250);
}

window.openReqDetail       = openReqDetail;
window.closeReqDetailPanel = closeReqDetailPanel;
window.switchReqTab        = switchReqTab;
window.toggleWatch         = toggleWatch;
window.saveReqField        = saveReqField;
window.submitComment       = submitComment;
window.deleteComment       = deleteComment;
window.editComment         = editComment;
window.saveEditComment     = saveEditComment;
window.loadCommentsTab     = loadCommentsTab;
window.addLink             = addLink;
window.removeLink          = removeLink;
window.addAttachment       = addAttachment;
