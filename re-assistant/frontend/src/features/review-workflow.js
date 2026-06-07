'use strict';\nconst $ = window.$ || (id => document.getElementById(id));
/**
 * features/review-workflow.js
 * Nr. 1: Review-Workflow — Business schreibt, BA reviewed, PM genehmigt.
 * Status-Maschine: draft → in_review → approved | rejected → revision
 */

// Review-Stati (ergänzen die normalen Req-Stati)
const REVIEW_STATES = {
  draft:      { label:'Entwurf',      icon:'✏',  color:'var(--t3)',   next:['in_review'] },
  in_review:  { label:'In Review',    icon:'🔍', color:'var(--blue)', next:['approved','rejected'] },
  approved:   { label:'Freigegeben',  icon:'✅', color:'var(--grn)',  next:['revision'] },
  rejected:   { label:'Abgelehnt',    icon:'❌', color:'var(--red)',  next:['revision','in_review'] },
  revision:   { label:'Überarbeitung',icon:'🔄', color:'var(--amb)',  next:['in_review'] },
};

// Wer darf welche Transition auslösen
const REVIEW_PERMISSIONS = {
  draft_to_in_review:    ['business','businessanalyst','admin'],
  in_review_to_approved: ['businessanalyst','projectmanager','admin'],
  in_review_to_rejected: ['businessanalyst','projectmanager','admin'],
  approved_to_revision:  ['projectmanager','admin'],
  rejected_to_revision:  ['business','businessanalyst','admin'],
  revision_to_in_review: ['business','businessanalyst','admin'],
};

function canTransition(from, to, role) {
  const key = `${from}_to_${to}`;
  return (REVIEW_PERMISSIONS[key] || []).includes(role);
}

// ── View ──────────────────────────────────────────────────────
async function loadReviewDashboard() {
  S.systems = await window.api.getSystems();
  const allReqs = await window.api.getRequirements({});

  // Nur Anforderungen mit reviewStatus
  const reviewReqs = allReqs.filter(r => r.reviewStatus);
  const pending    = reviewReqs.filter(r => r.reviewStatus === 'in_review');
  const approved   = reviewReqs.filter(r => r.reviewStatus === 'approved');
  const draft      = allReqs.filter(r => !r.reviewStatus || r.reviewStatus === 'draft');

  const wrap = $('review-dashboard-wrap');
  if (!wrap) return;

  wrap.innerHTML = `
    <!-- Stats -->
    <div class="stats-row">
      <div class="stat-card"><span class="stat-n">${draft.length}</span><span class="stat-l">Entwürfe</span></div>
      <div class="stat-card accent"><span class="stat-n" style="color:var(--blue)">${pending.length}</span><span class="stat-l">In Review</span></div>
      <div class="stat-card"><span class="stat-n" style="color:var(--grn)">${approved.length}</span><span class="stat-l">Freigegeben</span></div>
      <div class="stat-card"><span class="stat-n" style="color:var(--red)">${reviewReqs.filter(r=>r.reviewStatus==='rejected').length}</span><span class="stat-l">Abgelehnt</span></div>
    </div>

    <!-- Kanban-Board -->
    <div id="review-board">
      ${['draft','in_review','approved','rejected','revision'].map(state => {
        const rs    = REVIEW_STATES[state];
        const reqs  = state === 'draft'
          ? allReqs.filter(r => !r.reviewStatus || r.reviewStatus === 'draft')
          : allReqs.filter(r => r.reviewStatus === state);
        return `
          <div class="review-col">
            <div class="review-col-head">
              <span>${rs.icon} ${rs.label}</span>
              <span class="review-count">${reqs.length}</span>
            </div>
            <div class="review-col-body" id="review-col-${state}">
              ${reqs.slice(0, 20).map(r => renderReviewCard(r, state)).join('')}
              ${reqs.length > 20 ? `<div style="font-size:11px;color:var(--t3);padding:8px;text-align:center">… ${reqs.length-20} weitere</div>` : ''}
            </div>
          </div>`;
      }).join('')}
    </div>`;

  injectReviewStyles();
}

function renderReviewCard(r, state) {
  const rs   = REVIEW_STATES[state] || REVIEW_STATES.draft;
  const sys  = S.systems.find(s => s.id === r.systemId);
  const nextStates = rs.next.filter(ns => canTransition(state, ns, S.user.role));
  const acCount = (r.acceptanceCriteria || []).length;
  const acDone  = (r.acceptanceCriteria || []).filter(a => a.done).length;

  return `
    <div class="review-card" id="rcard-${r.id}">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px;margin-bottom:6px">
        <div style="flex:1;min-width:0">
          <div class="req-id">${esc(r.id)}</div>
          <div style="font-size:12px;font-weight:600;margin-top:2px;line-height:1.4">${esc(r.title)}</div>
        </div>
        <span class="sbadge p-${r.priority}" style="font-size:9px;flex-shrink:0">${priLabel(r.priority)}</span>
      </div>
      ${sys ? `<div style="font-size:10px;color:var(--t3);margin-bottom:6px">${esc(sys.name)}</div>` : ''}
      ${acCount ? `<div style="font-size:10px;color:var(--t3);margin-bottom:4px">AC: ${acDone}/${acCount}</div>` : ''}
      ${r.reviewComment ? `<div style="font-size:11px;color:var(--amb);padding:5px 8px;background:var(--ambbg);border-radius:5px;margin-bottom:6px">"${esc(r.reviewComment.substring(0,80))}"</div>` : ''}
      <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px">
        ${nextStates.map(ns => {
          const ns_state = REVIEW_STATES[ns];
          const isApprove = ns === 'approved';
          const isReject  = ns === 'rejected';
          return `<button
            class="${isApprove ? 'btn-primary' : 'btn-secondary'}"
            style="font-size:10px;padding:3px 9px;${isReject ? 'color:var(--red);border-color:rgba(248,113,113,.3)' : ''}"
            onclick="transitionReview('${r.id}','${state}','${ns}')">
            ${ns_state.icon} ${ns_state.label}
          </button>`;
        }).join('')}
        <button class="btn-secondary" style="font-size:10px;padding:3px 9px"
          onclick="openReviewDetail('${r.id}')">Detail</button>
      </div>
    </div>`;
}

async function transitionReview(reqId, fromState, toState) {
  // Bei Ablehnung → Kommentar anfordern
  if (toState === 'rejected' || toState === 'revision') {
    const comment = window.prompt(
      toState === 'rejected'
        ? 'Ablehnungsgrund eingeben (Pflicht):'
        : 'Überarbeitungshinweis eingeben (optional):'
    );
    if (toState === 'rejected' && !comment?.trim()) {
      toast('⚠ Ablehnungsgrund ist erforderlich');
      return;
    }
    await _doTransition(reqId, toState, comment?.trim());
  } else {
    await _doTransition(reqId, toState, null);
  }
}

async function _doTransition(reqId, newState, comment) {
  const allReqs = await window.api.getRequirements({});
  const req     = allReqs.find(r => r.id === reqId);
  if (!req) return;

  const rs = REVIEW_STATES[newState];
  await window.api.saveRequirement({
    ...req,
    reviewStatus:  newState,
    reviewComment: comment || null,
    reviewedBy:    S.user.id,
    reviewedByName:S.user.name,
    reviewedAt:    Date.now(),
  });

  // Benachrichtigung
  if (typeof addNotif === 'function') {
    addNotif(rs.icon, `Anforderung ${rs.label}`, req.title,
      () => { switchView('review-workflow'); });
  }

  toast(`${rs.icon} "${req.title}" → ${rs.label}`);
  await loadReviewDashboard();
}

async function openReviewDetail(reqId) {
  const allReqs = await window.api.getRequirements({});
  const req     = allReqs.find(r => r.id === reqId);
  if (!req) return;
  const rs = REVIEW_STATES[req.reviewStatus || 'draft'];

  openModal(`Review: ${req.title}`, `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
      <span style="font-size:20px">${rs.icon}</span>
      <span style="font-size:14px;font-weight:600;color:${rs.color}">${rs.label}</span>
      ${req.reviewedByName ? `<span style="font-size:11px;color:var(--t3)">von ${esc(req.reviewedByName)}</span>` : ''}
      ${req.reviewedAt ? `<span style="font-size:11px;color:var(--t3)">· ${new Date(req.reviewedAt).toLocaleString('de-DE')}</span>` : ''}
    </div>
    ${req.reviewComment ? `
      <div style="background:var(--ambbg);border:1px solid rgba(251,191,36,.2);border-radius:8px;padding:10px 12px;margin-bottom:14px;font-size:12px">
        <strong>Kommentar:</strong> ${esc(req.reviewComment)}
      </div>` : ''}
    <div class="frow"><label>Beschreibung</label>
      <div style="font-size:13px;color:var(--t2);line-height:1.6;padding:8px 0">${esc(req.description||'—')}</div>
    </div>
    <div class="frow"><label>Akzeptanzkriterien (${(req.acceptanceCriteria||[]).length})</label>
      <div>
        ${(req.acceptanceCriteria||[]).map(ac => `
          <div style="display:flex;align-items:center;gap:7px;padding:4px 0;font-size:12px">
            <span style="color:${ac.done?'var(--grn)':'var(--t3)'}">${ac.done?'✓':'○'}</span>
            <span style="color:${ac.done?'var(--grn)':'var(--t2)'}">${esc(ac.text)}</span>
          </div>`).join('') || '<span style="font-size:12px;color:var(--t3)">Keine AC definiert</span>'}
        <button class="btn-secondary" style="font-size:11px;padding:4px 10px;margin-top:6px"
          onclick="closeModal();openACGenerator('${reqId}')">✦ AC generieren</button>
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-top:14px">
      ${(rs.next||[]).filter(ns => canTransition(req.reviewStatus||'draft', ns, S.user.role)).map(ns => {
        const ns_state = REVIEW_STATES[ns];
        return `<button class="${ns==='approved'?'btn-primary':'btn-secondary'}"
          onclick="closeModal();transitionReview('${reqId}','${req.reviewStatus||'draft'}','${ns}')">
          ${ns_state.icon} ${ns_state.label}
        </button>`;
      }).join('')}
      <button class="btn-secondary" onclick="closeModal()">Schließen</button>
    </div>`);
}

// Massen-Review: alle Anforderungen eines Systems in Review schicken
async function submitSystemForReview(systemId) {
  const reqs = await window.api.getRequirements({ systemId });
  const drafts = reqs.filter(r => !r.reviewStatus || r.reviewStatus === 'draft');
  if (!drafts.length) { toast('ℹ Keine Entwürfe vorhanden'); return; }
  if (!confirm(`${drafts.length} Anforderungen in Review schicken?`)) return;
  for (const r of drafts)
    await window.api.saveRequirement({ ...r, reviewStatus:'in_review', reviewedBy:S.user.id, reviewedByName:S.user.name, reviewedAt:Date.now() });
  toast(`✅ ${drafts.length} Anforderungen in Review`);
  if (typeof addNotif === 'function')
    addNotif('🔍', 'Review angefordert', `${drafts.length} Anforderungen warten auf Review`);
  await loadReviewDashboard();
}

function injectReviewStyles() {
  if (document.getElementById('review-styles')) return;
  const s = document.createElement('style');
  s.id = 'review-styles';
  s.textContent = `
    #review-board{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;padding:16px 20px;flex:1;overflow:auto;min-width:900px}
    .review-col{background:var(--s1);border:1px solid var(--b1);border-radius:var(--rl);display:flex;flex-direction:column;max-height:calc(100vh - 200px)}
    .review-col-head{padding:10px 12px;border-bottom:1px solid var(--b1);display:flex;align-items:center;justify-content:space-between;font-size:12px;font-weight:600;flex-shrink:0}
    .review-count{background:var(--s2);border-radius:99px;padding:1px 8px;font-size:10px;color:var(--t3)}
    .review-col-body{overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:7px;flex:1}
    .review-card{background:var(--bg);border:1px solid var(--b1);border-radius:var(--r);padding:10px 11px;transition:border-color .15s}
    .review-card:hover{border-color:var(--b2);background:var(--s1)}
    @media(max-width:900px){#review-board{grid-template-columns:1fr;min-width:unset}}`;
  document.head.appendChild(s);
}

window.loadReviewDashboard    = loadReviewDashboard;
window.transitionReview       = transitionReview;
window.openReviewDetail       = openReviewDetail;
window.submitSystemForReview  = submitSystemForReview;
window.REVIEW_STATES          = REVIEW_STATES;
