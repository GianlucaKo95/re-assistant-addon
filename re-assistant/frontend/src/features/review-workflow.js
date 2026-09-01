'use strict';
/**
 * review-workflow.js
 * #9 Review-Workflow: Draft → In Review → Approved/Rejected
 * #11 Bulk-Operationen: Mehrfachauswahl + Massenaktionen
 * #12 Freeze: Anforderungen einfrieren/freigeben
 */

// ── Review-Status Labels & Farben ─────────────────────────────
const REVIEW_CONFIG = {
  draft:       { label: 'Entwurf',   color: 'var(--t3)',  icon: '✏' },
  in_review:   { label: 'In Review', color: 'var(--amb)', icon: '👁' },
  approved:    { label: 'Genehmigt', color: 'var(--grn)', icon: '✅' },
  rejected:    { label: 'Abgelehnt', color: 'var(--red)',  icon: '❌' },
};

// ── Rollen, die Review-Aktionen ausführen dürfen ──────────────
const SUBMIT_ROLES = ['business','businessanalyst'];
const DECIDE_ROLES = ['admin','businessanalyst','projectmanager'];

function reviewBadge(status, frozen) {
  const cfg = REVIEW_CONFIG[status] || REVIEW_CONFIG.draft;
  const frozenBadge = frozen
    ? `<span style="font-size:9px;background:rgba(99,102,241,.15);color:var(--aa);
        padding:1px 6px;border-radius:99px;margin-left:4px">🔒 Eingefroren</span>`
    : '';
  return `<span style="font-size:10px;padding:2px 7px;border-radius:99px;
    background:${cfg.color}22;color:${cfg.color}">${cfg.icon} ${cfg.label}</span>${frozenBadge}`;
}

// ── Review-Aktions-Buttons in Req-Card ────────────────────────
function renderReviewActions(req) {
  const user = S.user;
  const isFrozen = req.frozen;
  const status = req.reviewStatus || 'draft';

  const canSubmit  = !isFrozen && status === 'draft' && SUBMIT_ROLES.includes(user.role);
  const canDecide  = status === 'in_review' && DECIDE_ROLES.includes(user.role);
  const canFreeze  = status === 'approved'  && DECIDE_ROLES.includes(user.role);

  const btns = [];

  if (canSubmit) btns.push(
    `<button class="btn-secondary" style="font-size:10px;padding:3px 8px"
      onclick="submitForReview('${req.id}')">📤 Zur Review</button>`
  );
  if (canDecide) btns.push(
    `<button class="btn-primary" style="font-size:10px;padding:3px 8px;background:var(--grn)"
      onclick="approveReq('${req.id}')">✅ Genehmigen</button>`,
    `<button class="btn-secondary" style="font-size:10px;padding:3px 8px;color:var(--red)"
      onclick="rejectReq('${req.id}')">❌ Ablehnen</button>`
  );
  if (canFreeze && !isFrozen) btns.push(
    `<button class="btn-secondary" style="font-size:10px;padding:3px 8px"
      onclick="freezeReq('${req.id}')">🔒 Einfrieren</button>`
  );
  if (isFrozen && DECIDE_ROLES.includes(user.role)) btns.push(
    `<button class="btn-secondary" style="font-size:10px;padding:3px 8px"
      onclick="unfreezeReq('${req.id}')">🔓 Freigeben</button>`
  );

  return btns.length
    ? `<div style="display:flex;gap:5px;margin-top:6px;flex-wrap:wrap">${btns.join('')}</div>`
    : '';
}

// ── Review-Aktionen ────────────────────────────────────────────
async function submitForReview(reqId) {
  const res = await fetch(`api/requirements/${reqId}/submit-review`, {
    method: 'POST', credentials: 'include',
  });
  const data = await res.json();
  if (data.ok) { toast('📤 Zur Review eingereicht'); refreshReqPane?.(); refreshReviewDashboardIfActive(); }
  else toast('❌ ' + data.error);
}

async function approveReq(reqId) {
  openModal('Anforderung genehmigen', `
    <p style="font-size:13px;margin-bottom:12px">Kommentar (optional):</p>
    <textarea id="review-comment" rows="3" style="width:100%"
      placeholder="Genehmigt — Akzeptanzkriterien vollständig..."></textarea>
    <div class="modal-footer-actions">
      <button class="btn-primary" style="background:var(--grn)"
        onclick="submitDecision('${reqId}','approved')">✅ Genehmigen</button>
      <button class="btn-secondary" onclick="closeModal()">Abbrechen</button>
    </div>`);
}

async function rejectReq(reqId) {
  openModal('Anforderung ablehnen', `
    <p style="font-size:13px;margin-bottom:12px">Ablehnungsgrund (Pflicht):</p>
    <textarea id="review-comment" rows="3" style="width:100%"
      placeholder="Beschreibung zu ungenau — bitte Akzeptanzkriterien ergänzen..."></textarea>
    <div class="modal-footer-actions">
      <button class="btn-primary" style="background:var(--red)"
        onclick="submitDecision('${reqId}','rejected')">❌ Ablehnen</button>
      <button class="btn-secondary" onclick="closeModal()">Abbrechen</button>
    </div>`);
}

async function submitDecision(reqId, decision) {
  const comment = document.getElementById('review-comment')?.value.trim();
  if (decision === 'rejected' && !comment) { toast('⚠ Bitte Ablehnungsgrund angeben'); return; }
  const res = await fetch(`api/requirements/${reqId}/review-decision`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision, comment }),
  });
  const data = await res.json();
  closeModal();
  if (data.ok) {
    toast(decision === 'approved' ? '✅ Genehmigt' : '❌ Abgelehnt');
    refreshReqPane?.();
    refreshReviewDashboardIfActive();
  } else toast('❌ ' + data.error);
}

// ── Freeze / Unfreeze ─────────────────────────────────────────
async function freezeReq(reqId) {
  if (!confirm('Anforderung einfrieren? Sie kann danach nicht mehr bearbeitet werden.')) return;
  const res = await fetch(`api/requirements/${reqId}/freeze`, { method:'POST', credentials:'include' });
  const data = await res.json();
  if (data.ok) { toast('🔒 Eingefroren'); refreshReqPane?.(); refreshReviewDashboardIfActive(); }
  else toast('❌ ' + data.error);
}

async function unfreezeReq(reqId) {
  if (!confirm('Anforderung freigeben? Sie kann dann wieder bearbeitet werden.')) return;
  const res = await fetch(`api/requirements/${reqId}/unfreeze`, { method:'POST', credentials:'include' });
  const data = await res.json();
  if (data.ok) { toast('🔓 Freigegeben'); refreshReqPane?.(); refreshReviewDashboardIfActive(); }
  else toast('❌ ' + data.error);
}

function refreshReviewDashboardIfActive() {
  if (S.activeView === 'review-workflow' && typeof loadReviewDashboard === 'function') loadReviewDashboard();
}

// ── Review-Queue (BA-Dashboard-Widget & PM Review-Dashboard) ──
async function loadReviewQueue(containerId = 'review-queue-list', systemId) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const sysId = systemId !== undefined ? systemId : S.activeSystemId;
  const canDecide = DECIDE_ROLES.includes(S.user?.role);

  try {
    const params = sysId ? '?systemId=' + sysId : '';
    const reqs = await fetch('api/review-queue' + params, { credentials: 'include' }).then(r => r.json());

    if (!reqs.length) {
      el.innerHTML = '<div style="font-size:12px;color:var(--t3);padding:8px">Keine Anforderungen in Review</div>';
      return;
    }

    el.innerHTML = reqs.map(r => `
      <div style="background:var(--s2);border:1px solid var(--amb);border-left:3px solid var(--amb);
        border-radius:var(--r);padding:10px 12px;margin-bottom:6px;box-shadow:0 3px 10px rgba(0,0,0,.14)">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div>
            <span class="req-id">${esc(r.id)}</span>
            <span style="font-size:11px;color:var(--t3);margin-left:6px">${esc(r.system_name||'')}</span>
            <div style="font-size:13px;font-weight:600;margin-top:2px">${esc(r.title)}</div>
          </div>
          ${canDecide ? `<div style="display:flex;gap:5px;flex-shrink:0">
            <button class="btn-primary" style="font-size:10px;padding:3px 8px;background:var(--grn)"
              onclick="approveReq('${r.id}')">✅</button>
            <button class="btn-secondary" style="font-size:10px;padding:3px 8px;color:var(--red)"
              onclick="rejectReq('${r.id}')">❌</button>
          </div>` : ''}
        </div>
        ${r.description ? `<div style="font-size:11px;color:var(--t2);margin-top:4px">${esc(r.description.substring(0,120))}…</div>` : ''}
      </div>`).join('');
  } catch(e) {
    el.innerHTML = `<div style="font-size:11px;color:var(--red)">Fehler: ${esc(e.message)}</div>`;
  }
}

// ── Review-Dashboard (PM/BA-Hauptansicht "Review & Freigabe") ─
async function loadReviewDashboard() {
  const sysSel = $('review-sys-filter');
  if (sysSel && !sysSel.dataset.wired) {
    const mySys = S.systems.filter(s => (S.user.systems||[]).includes(s.id));
    sysSel.innerHTML = '<option value="">Alle Systeme</option>'
      + mySys.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
    sysSel.onchange = () => loadReviewQueue('review-dashboard-wrap', sysSel.value);
    sysSel.dataset.wired = '1';
  }

  const submitBtn = $('btn-submit-review');
  if (submitBtn) {
    submitBtn.style.display = SUBMIT_ROLES.includes(S.user?.role) ? '' : 'none';
    if (!submitBtn.dataset.wired) {
      submitBtn.onclick = openSubmitReviewPicker;
      submitBtn.dataset.wired = '1';
    }
  }

  await loadReviewQueue('review-dashboard-wrap', sysSel?.value);
}

// ── "In Review schicken": Entwürfe zur Review auswählen ───────
async function openSubmitReviewPicker() {
  const sysId = $('review-sys-filter')?.value;
  S.requirements = await window.api.getRequirements(sysId ? { systemId: sysId } : {});
  const drafts = S.requirements.filter(r =>
    !r.frozen && (r.reviewStatus || 'draft') === 'draft'
  );

  const body = drafts.length
    ? drafts.map(r => {
        const sys = S.systems.find(s => s.id === r.systemId);
        return `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;
          background:var(--s2);border-radius:var(--r);padding:8px 10px;margin-bottom:6px">
          <div style="min-width:0">
            <span class="req-id">${esc(r.id)}</span>
            <span style="font-size:11px;color:var(--t3);margin-left:6px">${esc(sys?.name||'')}</span>
            <div style="font-size:13px;font-weight:600">${esc(r.title)}</div>
          </div>
          <button class="btn-primary" style="font-size:11px;padding:4px 10px;flex-shrink:0"
            onclick="submitForReview('${r.id}');closeModal()">📤 Einreichen</button>
        </div>`;
      }).join('')
    : '<div style="font-size:12px;color:var(--t3)">Keine Entwürfe zum Einreichen gefunden.</div>';

  openModal('📤 Zur Review einreichen', body
    + '<div class="modal-footer-actions"><button class="btn-secondary" onclick="closeModal()">Schließen</button></div>');
}

// ── Bulk-Selektion & Operationen ──────────────────────────────
let _selectedReqIds = new Set();

function toggleBulkMode() {
  const active = document.body.classList.toggle('bulk-mode');
  if (!active) {
    _selectedReqIds.clear();
    document.querySelectorAll('.req-checkbox').forEach(cb => cb.checked = false);
    renderBulkBar();
  }
  renderBulkBar();
}

function toggleReqSelect(reqId) {
  if (_selectedReqIds.has(reqId)) {
    _selectedReqIds.delete(reqId);
  } else {
    _selectedReqIds.add(reqId);
  }
  renderBulkBar();
}

function selectAllReqs() {
  document.querySelectorAll('[data-req-id]').forEach(el => {
    const id = el.dataset.reqId;
    if (id) _selectedReqIds.add(id);
    const cb = el.querySelector('.req-checkbox');
    if (cb) cb.checked = true;
  });
  renderBulkBar();
}

function clearReqSelection() {
  _selectedReqIds.clear();
  document.querySelectorAll('.req-checkbox').forEach(cb => cb.checked = false);
  renderBulkBar();
}

function renderBulkBar() {
  const bar = document.getElementById('bulk-action-bar');
  if (!bar) return;

  const count = _selectedReqIds.size;
  if (!count) {
    bar.style.display = 'none';
    return;
  }

  bar.style.display = 'flex';
  bar.innerHTML = `
    <div style="font-size:12px;font-weight:600;color:var(--aa)">${count} ausgewählt</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      <select id="bulk-op" style="font-size:11px;padding:4px 8px;border-radius:6px">
        <option value="">Aktion wählen …</option>
        <optgroup label="Priorität">
          <option value="set_priority:high">↑ Hohe Priorität</option>
          <option value="set_priority:medium">→ Mittlere Priorität</option>
          <option value="set_priority:low">↓ Niedrige Priorität</option>
        </optgroup>
        <optgroup label="Status">
          <option value="set_status:open">Status: Offen</option>
          <option value="set_status:in-progress">Status: In Bearbeitung</option>
          <option value="set_status:done">Status: Erledigt</option>
        </optgroup>
        <optgroup label="Review & Freeze">
          <option value="submit_review:">📤 Zur Review einreichen</option>
          <option value="freeze:">🔒 Einfrieren</option>
          <option value="unfreeze:">🔓 Freigeben</option>
        </optgroup>
        <optgroup label="Sonstiges">
          <option value="archive:">🗄 Archivieren</option>
          <option value="delete:">🗑 Löschen</option>
        </optgroup>
      </select>
      <button class="btn-primary" style="font-size:11px;padding:5px 12px"
        onclick="executeBulkOp()">Ausführen</button>
      <button class="btn-secondary" style="font-size:11px;padding:5px 10px"
        onclick="selectAllReqs()">Alle</button>
      <button class="btn-secondary" style="font-size:11px;padding:5px 10px"
        onclick="clearReqSelection()">✕</button>
    </div>`;
}

async function executeBulkOp() {
  const sel = document.getElementById('bulk-op')?.value;
  if (!sel) { toast('⚠ Aktion auswählen'); return; }

  const [operation, value] = sel.split(':');
  const ids = [..._selectedReqIds];

  if (!ids.length) { toast('⚠ Anforderungen auswählen'); return; }

  if (operation === 'delete') {
    if (!confirm(`${ids.length} Anforderungen löschen? Dies kann nicht rückgängig gemacht werden.`)) return;
  }

  const res = await fetch('api/requirements/bulk', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, operation, value: value || undefined }),
  });
  const data = await res.json();

  if (data.ok) {
    toast(`✅ ${data.updated} Anforderungen aktualisiert${data.skipped ? ` (${data.skipped} übersprungen)` : ''}`);
    clearReqSelection();
    document.body.classList.remove('bulk-mode');
    refreshReqPane?.();
  } else {
    toast('❌ ' + data.error);
  }
}

// Exports
window.reviewBadge       = reviewBadge;
window.renderReviewActions = renderReviewActions;
window.submitForReview   = submitForReview;
window.approveReq        = approveReq;
window.rejectReq         = rejectReq;
window.submitDecision    = submitDecision;
window.freezeReq         = freezeReq;
window.unfreezeReq       = unfreezeReq;
window.loadReviewQueue   = loadReviewQueue;
window.loadReviewDashboard    = loadReviewDashboard;
window.openSubmitReviewPicker = openSubmitReviewPicker;
window.toggleBulkMode    = toggleBulkMode;
window.toggleReqSelect   = toggleReqSelect;
window.selectAllReqs     = selectAllReqs;
window.clearReqSelection = clearReqSelection;
window.executeBulkOp     = executeBulkOp;
window.renderBulkBar     = renderBulkBar;

// ── openReviewDetail: Review-Aktionen für eine Anforderung ──
async function openReviewDetail(reqId) {
  const req = await fetch('api/requirements/' + reqId, { credentials: 'include' })
    .then(r => r.json()).catch(() => null);
  if (!req) { toast('❌ Anforderung nicht gefunden'); return; }

  const status    = req.reviewStatus || 'draft';
  const isFrozen  = req.frozen;
  const canSubmit = !isFrozen && status === 'draft' && SUBMIT_ROLES.includes(S.user?.role);
  const canDecide = !isFrozen && status === 'in_review' && DECIDE_ROLES.includes(S.user?.role);

  openModal('🔍 Review: ' + esc(req.title),
    '<div style="margin-bottom:12px">'
    + '<div style="font-size:11px;color:var(--t3);margin-bottom:4px">Status</div>'
    + reviewBadge(status, req.frozen)
    + '</div>'
    + (req.reviewComment ? '<div style="background:var(--s2);border-radius:var(--r);padding:10px;margin-bottom:12px;font-size:12px">'
        + '<div style="font-size:10px;color:var(--t3);margin-bottom:4px">Kommentar</div>'
        + esc(req.reviewComment) + '</div>' : '')
    + '<div style="margin-bottom:12px">'
    + '<div style="font-size:11px;color:var(--t3);margin-bottom:6px">Beschreibung</div>'
    + '<div style="font-size:12px;color:var(--t2)">' + esc((req.description||'').substring(0,200)) + '</div>'
    + '</div>'
    + (req.acceptanceCriteriaText ? '<div style="background:rgba(63,185,80,.08);border-radius:var(--r);padding:8px 10px;margin-bottom:12px">'
        + '<div style="font-size:10px;font-weight:600;color:var(--grn);margin-bottom:4px">✅ Akzeptanzkriterien</div>'
        + req.acceptanceCriteriaText.split('\n').filter(Boolean)
            .map(c => '<div style="font-size:11px;padding:2px 0">' + esc(c) + '</div>').join('')
        + '</div>' : '')
    + '<div class="modal-footer-actions">'
    + (canSubmit ? '<button class="btn-primary" onclick="submitForReview(\'' + reqId + '\');closeModal()">📤 Zur Review einreichen</button>' : '')
    + (canDecide ? '<button class="btn-primary" style="background:var(--grn)" onclick="approveReq(\'' + reqId + '\')">✅ Genehmigen</button>' : '')
    + (canDecide ? '<button class="btn-secondary" style="color:var(--red)" onclick="rejectReq(\'' + reqId + '\')">❌ Ablehnen</button>' : '')
    + (!isFrozen && status === 'approved' && DECIDE_ROLES.includes(S.user?.role)
        ? '<button class="btn-secondary" onclick="freezeReq(\'' + reqId + '\');closeModal()">🔒 Einfrieren</button>' : '')
    + '<button class="btn-secondary" onclick="closeModal()">Schließen</button>'
    + '</div>'
  );
}
window.openReviewDetail = openReviewDetail;
