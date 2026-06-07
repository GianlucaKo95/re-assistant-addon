'use strict';
const $ = window.$ || (id => document.getElementById(id));
/**
 * features/nl-query.js
 * M: Natürlichsprachliche Abfragen — KI als Query-Engine über Requirements.
 * "Zeig mir alle Anforderungen die mit Datenschutz zusammenhängen und noch keinen Reviewer haben"
 */

let _nlHistory = [];

async function loadNLQuery() {
  S.systems      = await window.api.getSystems();
  S.requirements = await window.api.getRequirements({});
  S.users        = await window.api.getUsers().catch(()=>[]);

  const inp  = $('nlq-input');
  const send = $('nlq-send');
  if (!inp || !send) return;

  send.onclick = executeNLQuery;
  inp.onkeydown = e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); executeNLQuery(); } };

  // Beispiel-Abfragen
  document.querySelectorAll('.nlq-example').forEach(el =>
    el.onclick = () => { inp.value = el.textContent.trim(); executeNLQuery(); }
  );
}

async function executeNLQuery() {
  setAPIContext('nlquery');
  const inp  = $('nlq-input');
  const q    = inp?.value.trim();
  if (!q) return;

  const wrap = $('nlq-results');
  if (wrap) wrap.innerHTML = '<div style="padding:20px;text-align:center"><div class="spin"></div><p style="font-size:12px;color:var(--t3);margin-top:8px">Analysiere Anforderungen …</p></div>';

  // Kontext aufbauen
  const reqSummary = S.requirements.slice(0,200).map(r =>
    `${r.id}|${r.title}|${r.status}|${r.priority}|${r.category}|${r.reviewStatus||'draft'}|${r.assignedTo||''}|${r.reviewedByName||''}|${(r.tags||[]).join(',')}|QS:${r.qualityScore||'?'}|AC:${(r.acceptanceCriteria||[]).length}`
  ).join('\n');

  const systemsInfo = S.systems.map(s => `${s.id}: ${s.name}`).join(', ');
  const usersInfo   = S.users.map(u => `${u.id}: ${u.name} (${u.role})`).join(', ');

  const res = await callAPI([
    ..._nlHistory,
    { role:'user', content:
      `Du bist eine Query-Engine für Requirements. ${langNote()}
Beantworte die Frage des Nutzers basierend auf den Requirements-Daten.

Antworte mit JSON ohne Backticks:
{
  "reqIds": ["REQ-001", "REQ-002"],
  "answer": "Kurze direkte Antwort auf die Frage",
  "stats": {"total": 5, "filtered": 2},
  "insights": ["Interessante Beobachtung 1"],
  "suggestedActions": [{"label": "QS prüfen", "view": "ba-quality"}]
}

Falls die Frage keine Liste erfordert sondern eine Analyse, dann reqIds=[] und answer mit der Analyse.

Systeme: ${systemsInfo}
Benutzer: ${usersInfo}

Anforderungen (Format: ID|Titel|Status|Priorität|Kategorie|ReviewStatus|ZugewiesenAn|ReviewedBy|Tags|QS|AC-Anzahl):
${reqSummary}

Frage: "${q}"` }
  ], langNote(), 1500);

  if (!res.ok) {
    if (wrap) wrap.innerHTML = `<div style="color:var(--red);padding:16px;font-size:13px">❌ ${esc(res.text)}</div>`;
    return;
  }

  try {
    const result = JSON.parse(res.text.replace(/```json|```/g,'').trim());
    _nlHistory.push({ role:'user', content: q });
    _nlHistory.push({ role:'assistant', content: JSON.stringify(result) });
    if (_nlHistory.length > 20) _nlHistory = _nlHistory.slice(-20);
    renderNLQResult(result, q);
  } catch(e) {
    if (wrap) wrap.innerHTML = `<div style="color:var(--red);padding:16px;font-size:13px">❌ Parsing-Fehler</div>`;
  }
}

function renderNLQResult(result, query) {
  const wrap = $('nlq-results');
  if (!wrap) return;

  const matchedReqs = (result.reqIds||[])
    .map(id => S.requirements.find(r => r.id === id))
    .filter(Boolean);

  // Verlauf hinzufügen
  const histEl = $('nlq-history');
  if (histEl) {
    const item = document.createElement('div');
    item.style.cssText = 'border-bottom:1px solid var(--b1);padding:10px 0';
    item.innerHTML = `
      <div style="font-size:11px;color:var(--t3);margin-bottom:4px">❓ ${esc(query)}</div>
      <div style="font-size:13px;color:var(--t1);margin-bottom:6px">${esc(result.answer||'')}</div>
      ${(result.insights||[]).map(i => `<div style="font-size:11px;color:var(--aa);margin-top:3px">💡 ${esc(i)}</div>`).join('')}`;
    histEl.insertBefore(item, histEl.firstChild);
  }

  wrap.innerHTML = `
    <!-- Antwort -->
    <div style="background:rgba(168,85,247,.08);border:1px solid rgba(168,85,247,.2);border-radius:var(--rl);padding:14px 16px;margin-bottom:14px">
      <div style="font-size:11px;font-weight:700;color:var(--aa);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">✦ Antwort</div>
      <div style="font-size:14px;line-height:1.6">${esc(result.answer||'')}</div>
      ${result.stats ? `<div style="font-size:11px;color:var(--t3);margin-top:6px">${result.stats.filtered || matchedReqs.length} von ${result.stats.total || S.requirements.length} Anforderungen</div>` : ''}
    </div>

    <!-- Insights -->
    ${(result.insights||[]).length ? `
      <div style="margin-bottom:14px">
        ${result.insights.map(i => `
          <div style="display:flex;gap:8px;align-items:flex-start;padding:6px 0;border-bottom:1px solid var(--b1);font-size:12px;color:var(--t2)">
            <span style="color:var(--aa);flex-shrink:0">💡</span> ${esc(i)}
          </div>`).join('')}
      </div>` : ''}

    <!-- Empfohlene Aktionen -->
    ${(result.suggestedActions||[]).length ? `
      <div style="display:flex;gap:7px;flex-wrap:wrap;margin-bottom:14px">
        ${result.suggestedActions.map(a => `
          <button class="btn-secondary" style="font-size:11px;padding:5px 11px"
            onclick="switchView('${a.view||'business-reqs'}')">
            → ${esc(a.label)}
          </button>`).join('')}
      </div>` : ''}

    <!-- Gefundene Anforderungen -->
    ${matchedReqs.length ? `
      <div style="font-size:11px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">
        Gefundene Anforderungen (${matchedReqs.length})
      </div>
      <div style="border:1px solid var(--b1);border-radius:var(--rl);overflow:hidden">
        ${matchedReqs.map(r => {
          const sys = S.systems.find(s=>s.id===r.systemId);
          return `<div style="padding:10px 14px;border-bottom:1px solid var(--b1);display:flex;gap:10px;align-items:flex-start;transition:background .12s" onmouseover="this.style.background='var(--s1)'" onmouseout="this.style.background=''">
            <div style="flex:1;min-width:0">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;flex-wrap:wrap">
                <span class="req-id">${esc(r.id)}</span>
                <span class="sbadge s-${r.status}">${statusLabel(r.status)}</span>
                <span class="sbadge p-${r.priority}">${priLabel(r.priority)}</span>
                ${sys ? `<span class="rtag" style="font-size:9px">${esc(sys.name)}</span>` : ''}
                ${r.qualityScore ? `<span style="font-size:9px;color:${r.qualityScore>=7?'var(--grn)':r.qualityScore>=4?'var(--amb)':'var(--red)'}">QS:${r.qualityScore}</span>` : ''}
              </div>
              <div style="font-size:13px;font-weight:500">${esc(r.title)}</div>
            </div>
            <button class="btn-secondary" style="font-size:10px;padding:3px 9px;flex-shrink:0"
              onclick="S.activeSystemId='${r.systemId}';switchView('business-reqs')">→</button>
          </div>`;
        }).join('')}
      </div>
      <div style="margin-top:8px;display:flex;gap:7px">
        <button class="btn-secondary" style="font-size:11px;padding:5px 11px"
          onclick="exportNLQResults(${JSON.stringify(result.reqIds||[]).replace(/'/g,"\\'")})">↓ Exportieren</button>
      </div>` : ''}`;
}

async function exportNLQResults(reqIds) {
  const reqs = reqIds.map(id=>S.requirements.find(r=>r.id===id)).filter(Boolean);
  if (!reqs.length) return;
  await window.api.exportCSV({ requirements: reqs });
  toast('✅ Exportiert');
}

function clearNLQHistory() {
  _nlHistory = [];
  const h = $('nlq-history');
  if (h) h.innerHTML = '';
  const r = $('nlq-results');
  if (r) r.innerHTML = '';
  toast('✅ Verlauf gelöscht');
}

window.loadNLQuery       = loadNLQuery;
window.executeNLQuery    = executeNLQuery;
window.exportNLQResults  = exportNLQResults;
window.clearNLQHistory   = clearNLQHistory;

// ── Window Globals ──────────────────────────────────────────
window.renderNLQResult = renderNLQResult;
