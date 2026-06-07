'use strict';\nconst $ = window.$ || (id => document.getElementById(id));
/**
 * business/req-list.js
 * Anforderungs-Übersicht mit serverseitiger Pagination, Filter und Sortierung.
 */

let _bizPgCtrl = null;

async function loadBizReqs() {
  S.systems = await window.api.getSystems();

  // Filter-Dropdowns befüllen
  const ss = $('biz-filter-sys');
  if (ss) ss.innerHTML = '<option value="">Alle Systeme</option>' +
    S.systems.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');

  // Stats aus der DB holen (einmalig für Gesamtzahlen)
  _loadStats();

  // Alten Controller aufräumen
  _bizPgCtrl?.destroy();

  // PaginationController initialisieren
  _bizPgCtrl = new PaginationController({
    containerId:    'biz-reqs-list',
    systemId:       ss?.value || null,
    pageSize:       50,
    infiniteScroll: true,
    renderItem:     (r) => _renderBizReqCard(r),
    onLoaded:       (result) => {
      // Stats-Zeile aktualisieren
      const statsEl = $('biz-filter-count');
      if (statsEl) statsEl.textContent = `${result.total} Anforderungen`;
    },
  });

  // Filter-Events verdrahten
  const filters = [
    ['biz-filter-sys',    'systemId'],
    ['biz-filter-status', 'status'],
    ['biz-filter-cat-global', 'category'],
  ];
  filters.forEach(([id, key]) => {
    const el = $(id);
    if (!el) return;
    el.onchange = () => {
      if (key === 'systemId') _bizPgCtrl.setSystem(el.value || null);
      else _bizPgCtrl.setFilter(key, el.value);
      _loadStats(el.value || null);
    };
  });

  // Freitext-Suche mit Debounce
  const qEl = $('biz-filter-q');
  if (qEl) {
    let _qt;
    qEl.oninput = () => {
      clearTimeout(_qt);
      _qt = setTimeout(() => _bizPgCtrl.setFilter('q', qEl.value), 300);
    };
  }

  $('btn-new-req-biz').onclick  = () => openReqModal(null, S.activeSystemId);
  $('btn-dedup-global').onclick = runGlobalDedup;

  // Globale Referenz für Pagination-Buttons
  window.__pg_biz_reqs_list = _bizPgCtrl;

  _bizPgCtrl.load(true);
}

async function _loadStats(systemId) {
  try {
    const params = new URLSearchParams({ limit: '1', page: '0' });
    if (systemId) params.set('systemId', systemId);

    // Total
    const total = await fetchReqsPage({ systemId: systemId || undefined, limit: 1, page: 0 });

    const statsEl = $('biz-stats');
    if (!statsEl || !total) return;
    statsEl.innerHTML = `
      <div class="stat-card accent"><span class="stat-n">${total.total}</span><span class="stat-l">Gesamt</span></div>
      <div class="stat-card"><span class="stat-n" id="biz-stat-open">…</span><span class="stat-l">Offen</span></div>
      <div class="stat-card"><span class="stat-n" id="biz-stat-done">…</span><span class="stat-l">Erledigt</span></div>
      <div class="stat-card"><span class="stat-n" id="biz-filter-count">—</span><span class="stat-l">Gefiltert</span></div>`;

    // Open/Done parallel laden
    const [open, done] = await Promise.all([
      fetchReqsPage({ systemId: systemId||undefined, status:'open',   limit:1, page:0 }),
      fetchReqsPage({ systemId: systemId||undefined, status:'done',   limit:1, page:0 }),
    ]);
    if ($('biz-stat-open')) $('biz-stat-open').textContent = open.total ?? '—';
    if ($('biz-stat-done')) $('biz-stat-done').textContent = done.total ?? '—';
  } catch(e) { /* Stats sind optional */ }
}

function _renderBizReqCard(r) {
  const sys = S.systems?.find(s => s.id === r.systemId);
  const ac  = r.acceptanceCriteria || [];
  const acDone = ac.filter(a => a.done).length;
  return `
    <div class="req-card" data-id="${r.id}" id="brc-${r.id}">
      <div style="padding:10px 14px">
        <div style="display:flex;align-items:center;gap:7px;margin-bottom:5px;flex-wrap:wrap">
          <span class="req-id">${esc(r.id)}</span>
          <span class="sbadge s-${r.status}">${statusLabel(r.status)}</span>
          <span class="sbadge p-${r.priority}">${priLabel(r.priority)}</span>
          ${sys ? `<span class="rtag" style="font-size:9px">${esc(sys.name)}</span>` : ''}
          ${r.qualityScore != null ? `<span style="font-size:9px;padding:1px 6px;border-radius:99px;background:${r.qualityScore>=7?'var(--grnbg)':r.qualityScore>=4?'var(--ambbg)':'var(--redbg)'};color:${r.qualityScore>=7?'var(--grn)':r.qualityScore>=4?'var(--amb)':'var(--red)'}">QS:${r.qualityScore}</span>` : ''}
        </div>
        <div style="font-size:13px;font-weight:600;margin-bottom:3px">${esc(r.title)}</div>
        ${r.description ? `<div style="font-size:12px;color:var(--t2)">${esc(r.description.substring(0,120))}${r.description.length>120?'…':''}</div>` : ''}
        ${ac.length ? `<div style="font-size:10px;color:var(--t3);margin-top:4px">AC: ${acDone}/${ac.length}</div>` : ''}
      </div>
      <div style="padding:6px 14px 10px;display:flex;gap:6px;border-top:1px solid var(--b1)">
        <button class="btn-secondary" style="font-size:11px;padding:3px 9px"
          onclick="openReqModal('${r.id}','${r.systemId}')">✏ Bearbeiten</button>
        <button class="btn-secondary" style="font-size:11px;padding:3px 9px"
          onclick="openACGenerator('${r.id}')">✓ AC</button>
        <button class="btn-secondary" style="font-size:11px;padding:3px 9px"
          onclick="openReviewDetail('${r.id}')">🔍 Review</button>
        <button class="btn-danger" style="font-size:11px;padding:3px 9px;margin-left:auto"
          onclick="delPaneReq('${r.id}')">✕</button>
      </div>
    </div>`;
}

// Nach Speichern einer Anforderung: Pagination neu laden
const _origRefreshReqPane = window.refreshReqPane;
window.refreshReqPane = async function() {
  _bizPgCtrl?.load(true);
  if (_origRefreshReqPane) await _origRefreshReqPane();
};

window.loadBizReqs  = loadBizReqs;
window._bizPgCtrl   = () => _bizPgCtrl;
