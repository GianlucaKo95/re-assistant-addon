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
  const status = req.review_status || 'draft';

  const canSubmit  = !isFrozen && status === 'draft' && ['business','businessanalyst'].includes(user.role);
  const canDecide  = status === 'in_review' && ['admin','businessanalyst'].includes(user.role);
  const canFreeze  = status === 'approved'  && ['admin','businessanalyst'].includes(user.role);

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
  if (isFrozen && ['admin','businessanalyst'].includes(user.role)) btns.push(
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
  if (data.ok) { toast('📤 Zur Review eingereicht'); refreshReqPane?.(); }
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
  } else toast('❌ ' + data.error);
}

// ── Freeze / Unfreeze ─────────────────────────────────────────
async function freezeReq(reqId) {
  if (!confirm('Anforderung einfrieren? Sie kann danach nicht mehr bearbeitet werden.')) return;
  const res = await fetch(`api/requirements/${reqId}/freeze`, { method:'POST', credentials:'include' });
  const data = await res.json();
  if (data.ok) { toast('🔒 Eingefroren'); refreshReqPane?.(); }
  else toast('❌ ' + data.error);
}

async function unfreezeReq(reqId) {
  if (!confirm('Anforderung freigeben? Sie kann dann wieder bearbeitet werden.')) return;
  const res = await fetch(`api/requirements/${reqId}/unfreeze`, { method:'POST', credentials:'include' });
  const data = await res.json();
  if (data.ok) { toast('🔓 Freigegeben'); refreshReqPane?.(); }
  else toast('❌ ' + data.error);
}

// ── Review-Queue (BA-Dashboard-Widget) ───────────────────────
async function loadReviewQueue(containerId = 'review-queue-list') {
  const el = document.getElementById(containerId);
  if (!el) return;

  try {
    const params = S.activeSystemId ? '?systemId=' + S.activeSystemId : '';
    const reqs = await fetch('api/review-queue' + params, { credentials: 'include' }).then(r => r.json());

    if (!reqs.length) {
      el.innerHTML = '<div style="font-size:12px;color:var(--t3);padding:8px">Keine Anforderungen in Review</div>';
      return;
    }

    el.innerHTML = reqs.map(r => `
      <div style="background:var(--s2);border:1px solid var(--amb);border-left:3px solid var(--amb);
        border-radius:var(--r);padding:10px 12px;margin-bottom:6px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div>
            <span class="req-id">${esc(r.id)}</span>
            <span style="font-size:11px;color:var(--t3);margin-left:6px">${esc(r.system_name||'')}</span>
            <div style="font-size:13px;font-weight:600;margin-top:2px">${esc(r.title)}</div>
          </div>
          <div style="display:flex;gap:5px;flex-shrink:0">
            <button class="btn-primary" style="font-size:10px;padding:3px 8px;background:var(--grn)"
              onclick="approveReq('${r.id}')">✅</button>
            <button class="btn-secondary" style="font-size:10px;padding:3px 8px;color:var(--red)"
              onclick="rejectReq('${r.id}')">❌</button>
          </div>
        </div>
        ${r.description ? `<div style="font-size:11px;color:var(--t2);margin-top:4px">${esc(r.description.substring(0,120))}…</div>` : ''}
      </div>`).join('');
  } catch(e) {
    el.innerHTML = `<div style="font-size:11px;color:var(--red)">Fehler: ${esc(e.message)}</div>`;
  }
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
window.toggleBulkMode    = toggleBulkMode;
window.toggleReqSelect   = toggleReqSelect;
window.selectAllReqs     = selectAllReqs;
window.clearReqSelection = clearReqSelection;
window.executeBulkOp     = executeBulkOp;
window.renderBulkBar     = renderBulkBar;
