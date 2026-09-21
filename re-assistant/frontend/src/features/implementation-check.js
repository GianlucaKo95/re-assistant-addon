'use strict';
const $ = window.$ || (id => document.getElementById(id));
/**
 * features/implementation-check.js
 * Umsetzungsstatus — KI-gestützter Abgleich "Ist diese Anforderung bereits
 * im Code umgesetzt?". Gegenrichtung zur Implementierungsplanung in
 * developer/work.js (devAnalyzeSource plant eine NEUE Umsetzung, hier wird
 * geprüft ob bereits eine BESTEHENDE existiert). Nutzt für den Code-Kontext
 * dasselbe RAG-System wie devAnalyzeSource/runSmartCheck (getRAGContextForQuery
 * mit role:'deep'), nicht sys.docs[].content — das enthält seit dem
 * Chunking-Umbau nie den Originaltext eines Dokuments.
 * Gedacht für die Rollen Entwickler (developer/work.js) und BA (req-analysis.js).
 */

const IMPL_STATUS_META = {
  implemented:     { label: '✅ Bereits umgesetzt',    bg: 'rgba(63,185,80,.15)',  color: 'var(--grn)' },
  partial:         { label: '🟡 Teilweise umgesetzt',  bg: 'rgba(251,191,36,.15)', color: 'var(--amb)' },
  not_implemented: { label: '❌ Noch nicht umgesetzt',  bg: 'rgba(248,81,73,.15)',  color: 'var(--red)' },
  unclear:         { label: '❓ Unklar',                bg: 'var(--s3)',            color: 'var(--t3)'  },
};

function renderImplStatusBadge(check) {
  if (!check || !check.status) return '';
  const meta = IMPL_STATUS_META[check.status] || IMPL_STATUS_META.unclear;
  return `<span class="sbadge" style="background:${meta.bg};color:${meta.color}">${meta.label}${check.confidence != null ? ' · ' + check.confidence + '%' : ''}</span>`;
}

/* ── Kernfunktion: RAG-Kontext holen, KI abgleichen lassen, speichern ── */
async function runImplementationCheck(reqId, btn, afterUpdate) {
  const req = (S.requirements || []).find(r => r.id === reqId);
  if (!req) return;
  const origLabel = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span>'; }

  try {
    // "implementiert" im Suchtext erzwingt in buildRAGContext die
    // Deep-Query-Strategie (volle Dateien statt nur Chunk-Schnipsel) —
    // ohne echten Code sieht die KI nur Doku-Zusammenfassungen und kann
    // den Umsetzungsstatus nicht verlässlich beurteilen.
    const query = `${req.title} ${req.description || ''} bereits implementiert im Code`;
    const ragCtx = typeof getRAGContextForQuery === 'function'
      ? await getRAGContextForQuery(req.systemId, query, { role: 'deep' }).catch(() => '')
      : '';

    if (!ragCtx) {
      toast('⚠ Keine indexierten Code-/Dokumentdateien für dieses System gefunden');
      return;
    }

    const res = await fetch(`api/requirements/${reqId}/implementation-check`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ragContext: ragCtx.substring(0, 20000) }),
    });
    const data = await res.json();
    if (!data.ok) { toast('❌ ' + (data.error || 'Fehler')); return; }

    req.implementationCheck = data.result;
    req.implementationCheckHash = data.contentHash;
    showImplementationCheckResult(reqId, data.result);
    if (typeof afterUpdate === 'function') await afterUpdate(req, data.result);
  } catch(e) {
    toast('❌ ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = origLabel || '🔍 Umsetzung prüfen'; }
  }
}

function showImplementationCheckResult(reqId, result) {
  const meta = IMPL_STATUS_META[result.status] || IMPL_STATUS_META.unclear;
  const evidence = (result.evidence || []).map(e => `
    <div style="background:var(--s3);border-radius:4px;padding:8px 10px;margin-bottom:6px">
      <div style="font-family:var(--mono);font-size:11px;color:var(--ab)">${esc(e.file || '')}${e.function ? ' · ' + esc(e.function) : ''}</div>
      <div style="font-size:11px;color:var(--t2);margin-top:2px">${esc(e.explanation || '')}</div>
    </div>`).join('') || '<div style="font-size:12px;color:var(--t3)">Keine Belege angegeben</div>';

  const missing = (result.missing_aspects || result.missingAspects || [])
    .map(m => `<li style="font-size:12px;color:var(--t2);margin-bottom:4px">${esc(m)}</li>`).join('');

  openModal(`Umsetzungsstatus — ${esc(reqId)}`, `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap">
      <span class="sbadge" style="font-size:13px;padding:5px 12px;background:${meta.bg};color:${meta.color}">${meta.label}</span>
      ${result.confidence != null ? `<span style="font-size:11px;color:var(--t3)">Konfidenz: ${esc(String(result.confidence))}%</span>` : ''}
    </div>
    ${result.summary ? `<div style="font-size:13px;color:var(--t1);margin-bottom:14px;white-space:pre-wrap">${esc(result.summary)}</div>` : ''}
    <div style="font-size:10px;font-weight:600;color:var(--t3);margin-bottom:6px">BELEGE IM CODE</div>
    ${evidence}
    ${missing ? `<div style="margin-top:12px">
      <div style="font-size:10px;font-weight:600;color:var(--amb);margin-bottom:6px">FEHLENDE ASPEKTE</div>
      <ul style="padding-left:18px;margin:0">${missing}</ul>
    </div>` : ''}
    ${result.recommendation ? `<div style="margin-top:12px;background:var(--s2);border-radius:var(--r);padding:10px 12px">
      <div style="font-size:10px;font-weight:600;color:var(--t3);margin-bottom:4px">EMPFEHLUNG</div>
      <div style="font-size:12px;color:var(--t2)">${esc(result.recommendation)}</div>
    </div>` : ''}
    <div class="modal-footer-actions"><button class="btn-secondary" onclick="closeModal()">Schließen</button></div>
  `);
}

/* ── BA-Tab in req-analysis.js: Umsetzungsstatus für alle Reqs eines Systems ── */
async function renderImplementationCheckTab(el, sysId) {
  const reqs = (S.requirements || []).filter(r => r.systemId === sysId);
  if (!reqs.length) {
    el.innerHTML = '<div class="empty-state"><div class="es-icon">🔍</div><p>Keine Anforderungen vorhanden</p></div>';
    return;
  }

  el.innerHTML = `
    <p style="font-size:12px;color:var(--t3);margin-bottom:12px">
      Vergleicht eine Anforderung per KI mit dem indexierten Quellcode/der Dokumentation dieses Systems und schätzt ein,
      ob sie bereits umgesetzt ist. Ein gespeichertes Ergebnis bleibt erhalten, solange sich die Anforderung nicht ändert.
    </p>
    <div style="display:flex;flex-direction:column;gap:6px">
      ${reqs.map(r => {
        const check = r.implementationCheck;
        const isCurrent = check && r.implementationCheckHash && r.implementationCheckHash === hashReqContent(r);
        return `<div style="background:var(--s2);border:1px solid var(--b1);border-radius:var(--r);
          padding:10px 12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <div style="flex:1;min-width:200px">
            <div style="font-size:12px;font-weight:600">${esc(r.title)}</div>
            <div style="font-size:10px;color:var(--t3);margin-top:2px">${esc(r.id)} · ${esc(r.category||'')} · ${esc(r.priority||'')}</div>
            ${check ? `<div style="margin-top:6px">${renderImplStatusBadge(check)}</div>` : ''}
            ${check && !isCurrent ? `<div style="font-size:10px;color:var(--amb);margin-top:4px">⚠ Geändert seit letzter Prüfung</div>` : ''}
          </div>
          ${isCurrent ? `<button class="btn-secondary" style="font-size:11px;padding:5px 10px;flex-shrink:0"
            onclick="showImplementationCheckResult('${r.id}', ${esc(JSON.stringify(check))})">👁 Ansehen</button>` : ''}
          <button class="btn-secondary" style="font-size:11px;padding:5px 10px;flex-shrink:0"
            onclick="raCheckImplementation('${r.id}', this)">
            ${check ? '🔄 Neu prüfen' : '🔍 Prüfen'}
          </button>
        </div>`;
      }).join('')}
    </div>`;
}

async function raCheckImplementation(reqId, btn) {
  await runImplementationCheck(reqId, btn, () => loadAnalysisTab('impl-check'));
}

window.renderImplStatusBadge = renderImplStatusBadge;
window.runImplementationCheck = runImplementationCheck;
window.showImplementationCheckResult = showImplementationCheckResult;
window.renderImplementationCheckTab = renderImplementationCheckTab;
window.raCheckImplementation = raCheckImplementation;
