'use strict';
const $ = window.$ || (id => document.getElementById(id));
/**
 * features/workflow.js
 * Workflow-Status für Anforderungen — Kanban, Status-Badge, Rollenberechtigung
 */

const WORKFLOW_STATES = [
  { id:'backlog',           label:'Im Backlog',       color:'#8b949e', icon:'📋' },
  { id:'refinement',        label:'Refinement',        color:'#58a6ff', icon:'🔍' },
  { id:'business_analysis', label:'Business Analyse',  color:'#a371f7', icon:'📊' },
  { id:'in_progress',       label:'In Umsetzung',      color:'#3fb950', icon:'⚡' },
  { id:'testing',           label:'Testing',           color:'#e3b341', icon:'🧪' },
  { id:'done',              label:'Abgeschlossen',     color:'#56d364', icon:'✅' },
  { id:'cancelled',         label:'Abgebrochen',       color:'#f85149', icon:'❌' },
];

const WORKFLOW_PERMISSIONS = {
  admin:           ['backlog','refinement','business_analysis','in_progress','testing','done','cancelled'],
  projectmanager:  ['backlog','refinement','business_analysis','in_progress','testing','done','cancelled'],
  businessanalyst: ['backlog','refinement','business_analysis','testing'],
  business:        ['backlog','refinement'],
  developer:       ['in_progress','testing','done'],
};

function getWorkflowState(id) {
  return WORKFLOW_STATES.find(s => s.id === id) || WORKFLOW_STATES[0];
}

function canSetStatus(role, statusId) {
  return (WORKFLOW_PERMISSIONS[role] || []).includes(statusId);
}

// ── Status-Badge HTML ─────────────────────────────────────────
function workflowBadge(statusId, small = false) {
  const s = getWorkflowState(statusId || 'backlog');
  const sz = small ? 'font-size:10px;padding:2px 7px' : 'font-size:11px;padding:3px 9px';
  return `<span class="wf-badge" data-status="${s.id}" style="
    background:${s.color}22;border:1px solid ${s.color}55;
    border-radius:99px;color:${s.color};${sz};
    white-space:nowrap;font-weight:500">
    ${s.icon} ${s.label}
  </span>`;
}

// ── Status-Dropdown für eine Anforderung ─────────────────────
function workflowDropdown(reqId, currentStatus, role) {
  const allowed = WORKFLOW_PERMISSIONS[role] || [];
  const options = WORKFLOW_STATES
    .filter(s => allowed.includes(s.id) || s.id === currentStatus)
    .map(s => `<option value="${s.id}" ${s.id === currentStatus ? 'selected' : ''}
      style="background:#1a2535;color:${s.color}">
      ${s.icon} ${s.label}
    </option>`).join('');

  return `<select class="wf-select" data-req-id="${reqId}"
    style="background:var(--s2);border:1px solid var(--b1);border-radius:6px;
    color:var(--t1);font-size:11px;padding:3px 6px;cursor:pointer"
    ${!allowed.length ? 'disabled' : ''}>
    ${options}
  </select>`;
}

// ── Status ändern (API) ───────────────────────────────────────
async function setWorkflowStatus(reqId, newStatus, comment) {
  const res = await fetch(`api/requirements/${reqId}/workflow`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: newStatus, comment }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Fehler');
  return data;
}

// ── Kanban Board ──────────────────────────────────────────────
async function loadKanbanBoard() {
  const wrap = $('kanban-board-wrap');
  if (!wrap) return;

  const systemId = $('kanban-sys-sel')?.value || '';
  wrap.innerHTML = '<div class="loading-pulse" style="padding:40px;text-align:center">Lade …</div>';

  try {
    const url = systemId ? `api/kanban?systemId=${systemId}` : 'api/kanban';
    const data = await fetch(url, { credentials: 'include' }).then(r => r.json());

    wrap.innerHTML = `
      <div class="kanban-board">
        ${data.states.map(state => {
          const list = data.board[state.id] || [];
          return `<div class="kanban-col" data-status="${state.id}">
            <div class="kanban-col-head" style="border-top:3px solid ${state.color}">
              <span style="color:${state.color}">${state.icon} ${state.label}</span>
              <span class="kanban-count" style="background:${state.color}22;color:${state.color};
                border-radius:99px;padding:1px 8px;font-size:11px">${list.length}</span>
            </div>
            <div class="kanban-cards" data-status="${state.id}">
              ${list.map(req => kanbanCard(req, state.color)).join('')}
              ${!list.length ? '<div style="padding:20px;text-align:center;color:var(--t3);font-size:12px">Keine Anforderungen</div>' : ''}
            </div>
          </div>`;
        }).join('')}
      </div>`;

    // Event-Listener auf Karten
    wrap.querySelectorAll('.kanban-card').forEach(card => {
      card.addEventListener('click', () => {
        const reqId = card.dataset.reqId;
        if (typeof openReqModal === 'function') openReqModal(reqId, true);
      });
    });

    // Status-Dropdowns
    wrap.querySelectorAll('.wf-select').forEach(sel => {
      sel.addEventListener('change', async function(e) {
        e.stopPropagation();
        const reqId = this.dataset.reqId;
        const newStatus = this.value;
        try {
          await setWorkflowStatus(reqId, newStatus);
          toast(`✅ Status geändert: ${getWorkflowState(newStatus).label}`);
          await loadKanbanBoard();
        } catch(err) {
          toast('❌ ' + err.message);
          await loadKanbanBoard(); // Zurücksetzen
        }
      });
    });

  } catch(e) {
    wrap.innerHTML = `<div class="empty-state"><h3>Fehler</h3><p>${esc(e.message)}</p></div>`;
  }
}

function kanbanCard(req, colColor) {
  const role = S.user?.role || 'business';
  return `
    <div class="kanban-card" data-req-id="${req.id}" style="border-left:3px solid ${colColor}">
      <div class="kanban-card-head">
        <span class="rtag" style="font-size:9px">${esc(req.id)}</span>
        <span class="sbadge p-${req.priority}" style="font-size:9px">${priLabel(req.priority)}</span>
      </div>
      <div class="kanban-card-title">${esc(req.title)}</div>
      ${req.system_name ? `<div class="kanban-card-sys">${esc(req.system_name)}</div>` : ''}
      <div class="kanban-card-foot">
        ${req.assignee_name
          ? `<span style="font-size:10px;color:var(--t3)">👤 ${esc(req.assignee_name)}</span>`
          : '<span></span>'}
        ${workflowDropdown(req.id, req.workflow_status || 'backlog', role)}
      </div>
    </div>`;
}

// ── Workflow-Historie Modal ───────────────────────────────────
async function showWorkflowHistory(reqId, reqTitle) {
  openModal(`📋 Status-Historie: ${reqTitle}`, '<div class="loading-pulse">Lade …</div>');
  try {
    const history = await fetch(`api/requirements/${reqId}/workflow/history`, { credentials: 'include' }).then(r => r.json());
    const body = history.length
      ? `<div style="display:flex;flex-direction:column;gap:8px;max-height:400px;overflow-y:auto">
          ${history.map(h => {
            const from = getWorkflowState(h.from_status);
            const to   = getWorkflowState(h.to_status);
            const date = new Date(h.changed_at).toLocaleString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
            return `<div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--s2);border-radius:var(--r)">
              <div style="flex:1">
                <div style="display:flex;align-items:center;gap:6px;font-size:12px">
                  ${h.from_status ? `<span style="color:${from.color}">${from.icon} ${from.label}</span>
                    <span style="color:var(--t3)">→</span>` : ''}
                  <span style="color:${to.color}">${to.icon} ${to.label}</span>
                </div>
                <div style="font-size:11px;color:var(--t2);margin-top:3px">
                  ${esc(h.user_name || h.changed_by)} · ${date}
                </div>
                ${h.comment ? `<div style="font-size:11px;color:var(--t3);margin-top:3px">💬 ${esc(h.comment)}</div>` : ''}
              </div>
            </div>`;
          }).join('')}
        </div>`
      : '<p style="color:var(--t3);text-align:center;padding:20px">Keine Historie vorhanden</p>';

    const modal = document.getElementById('modal-body');
    if (modal) modal.innerHTML = body;
  } catch(e) {
    const modal = document.getElementById('modal-body');
    if (modal) modal.innerHTML = `<p style="color:var(--red)">${esc(e.message)}</p>`;
  }
}

window.WORKFLOW_STATES        = WORKFLOW_STATES;
window.getWorkflowState       = getWorkflowState;
window.canSetStatus           = canSetStatus;
window.workflowBadge          = workflowBadge;
window.workflowDropdown       = workflowDropdown;
window.setWorkflowStatus      = setWorkflowStatus;
window.loadKanbanBoard        = loadKanbanBoard;
window.showWorkflowHistory    = showWorkflowHistory;

// ── Kanban View laden ─────────────────────────────────────────
async function loadKanbanView() {
  // System-Select befüllen
  const sel = $('kanban-sys-sel');
  if (sel && S.systems?.length) {
    sel.innerHTML = '<option value="">Alle Systeme</option>' +
      S.systems.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  }

  // Event-Listener
  if (sel) sel.onchange = loadKanbanBoard;
  const refreshBtn = $('btn-kanban-refresh');
  if (refreshBtn) refreshBtn.onclick = loadKanbanBoard;

  await loadKanbanBoard();
}

window.loadKanbanView = loadKanbanView;
