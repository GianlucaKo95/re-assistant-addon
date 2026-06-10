'use strict';
const $ = window.$ || (id => document.getElementById(id));
/**
 * ba/quality.js
 * ISO 29148 Qualitätssicherung für Anforderungen.
 */

async function loadBaQS() {
  S.systems = await window.api.getSystems();
  const sel = $('qs-sys-select');
  sel.innerHTML = '<option value="">System wählen …</option>' +
    S.systems.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  $('btn-run-qs').onclick = runQS;
  $('qs-results').innerHTML = `<div class="empty-state"><div class="es-icon">🔬</div>
    <h3>System auswählen und QS starten</h3>
    <p>Die KI bewertet jede Anforderung nach ISO 29148:<br>Eindeutigkeit, Vollständigkeit, Testbarkeit.</p></div>`;
}

async function runQS() {
  setAPIContext('qs', S.activeSystemId);
  const sysId = $('qs-sys-select').value;
  if (!sysId) { toast('⚠ System auswählen'); return; }
  const reqs = await window.api.getRequirements({ systemId: sysId });
  if (!reqs.length) { toast('ℹ Keine Anforderungen im System'); return; }

  const btn = $('btn-run-qs');
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span> Analysiere …';
  $('qs-results').innerHTML = '<div class="empty-state"><div class="spin"></div><p>Analyse läuft …</p></div>';

  const reqList = reqs.map(r =>
    `ID:${r.id}\nTitel: ${r.title}\nBeschreibung: ${r.description || '(keine)'}`
  ).join('\n\n---\n\n');

  const res = await callAPI([{ role:'user', content:
    `Du bist ISO-29148-Experte. Bewerte jede Anforderung auf:
    - Eindeutigkeit: Erkenne Ambiguitäten ("schnell","einfach","effizient","benutzerfreundlich","zeitnah")
    - Vollständigkeit: Fehlen Akzeptanzkriterien, Randbedingungen, Ausnahmen?
    - Testbarkeit: Ist die Anforderung messbar und verifizierbar?
    - Korrektheit: Grammatikalisch und fachlich korrekt?
    
    JSON-Array ohne Backticks:
    [{
      "reqId": "REQ-001",
      "score": 7,
      "issues": [
        {"type": "ambiguity", "text": "Das Wort 'schnell' ist ambig", "suggestion": "Ladezeit < 2 Sekunden"}
      ],
      "improvedTitle": "Verbesserter Titel",
      "improvedDescription": "Verbesserte, präzisere Beschreibung"
    }]
    
    Typen: ambiguity | missing | not_testable | suggestion
    Score: 1-10 (10 = perfekt)
    
    Anforderungen:
    ${reqList}` }],
    langNote(), 3500);

  btn.disabled = false;
  btn.innerHTML = '▶ QS starten';
  if (!res.ok) { toast('❌ ' + res.text); $('qs-results').innerHTML = ''; return; }

  try {
    const results = JSON.parse(res.text.replace(/```json|```/g, '').trim());
    // Scores zurückspeichern
    for (const r of results) {
      const req = reqs.find(x => x.id === r.reqId);
      if (req) await window.api.saveRequirement({
        ...req,
        qualityScore: r.score,
        isoIssues: (r.issues || []).map(i => i.text),
      });
    }
    renderQSResults(results, reqs);
    const avg = (results.reduce((s, r) => s + r.score, 0) / results.length).toFixed(1);
    toast(`✅ ${results.length} bewertet — Ø Score: ${avg}/10`);
  } catch(e) { console.error(e); toast('❌ Parsing-Fehler'); }
}

function renderQSResults(results, reqs) {
  const sorted = [...results].sort((a, b) => a.score - b.score);
  $('qs-results').innerHTML = sorted.map(r => {
    const req = reqs.find(x => x.id === r.reqId);
    const col = r.score >= 7 ? 'var(--grn)' : r.score >= 4 ? 'var(--amb)' : 'var(--red)';
    const typeLabels = {
      ambiguity:   '⚠ Ambiguität',
      missing:     '✗ Fehlt',
      not_testable:'✗ Nicht testbar',
      suggestion:  '💡 Vorschlag',
    };
    return `<div class="qs-card">
      <div class="qs-card-head" onclick="this.nextElementSibling.classList.toggle('open')">
        <div style="flex:1;min-width:0">
          <div class="req-id">${esc(r.reqId)}</div>
          <div class="req-title" style="font-size:13px">${esc(req?.title || r.reqId)}</div>
        </div>
        <div class="qs-score">
          <div class="qs-score-bar">
            <div class="qs-score-fill" style="width:${r.score*10}%;background:${col}"></div>
          </div>
          <div class="qs-score-num" style="color:${col}">${r.score}<span style="font-size:11px;color:var(--t3)">/10</span></div>
        </div>
      </div>
      <div class="qs-body">
        ${(r.issues || []).map(i => `
          <div class="qs-issue">
            <span class="qs-issue-type qt-${i.type}">${typeLabels[i.type] || i.type}</span>
            <div style="flex:1">
              ${esc(i.text)}
              ${i.suggestion ? `
                <div class="qs-suggestion-box">
                  <div class="qs-suggestion-label">Verbesserungsvorschlag</div>
                  <div id="sug-${r.reqId}-${i.type}-${Math.random().toString(36).slice(2,6)}">${esc(i.suggestion)}</div>
                  <button class="btn-accept" onclick="acceptQSSuggestion('${r.reqId}','${esc(i.suggestion).replace(/'/g,"\\'")}')">
                    ✓ Übernehmen
                  </button>
                </div>` : ''}
            </div>
          </div>`).join('')}
        ${r.improvedTitle || r.improvedDescription ? `
          <div class="qs-suggestion-box" style="margin-top:10px">
            <div class="qs-suggestion-label">✦ Vollständig verbesserte Anforderung</div>
            ${r.improvedTitle ? `<strong style="font-size:13px">${esc(r.improvedTitle)}</strong><br/>` : ''}
            ${r.improvedDescription ? `<span style="font-size:12px;color:var(--t2)">${esc(r.improvedDescription)}</span><br/>` : ''}
            <button class="btn-accept" onclick="acceptImprovedReq('${r.reqId}','${esc(r.improvedTitle||'').replace(/'/g,"\\'")}','${esc(r.improvedDescription||'').replace(/'/g,"\\'")}')">
              ✓ Verbesserte Version übernehmen
            </button>
          </div>` : ''}
      </div>
    </div>`;
  }).join('');
}

async function acceptQSSuggestion(reqId, suggestion) {
  const all = await window.api.getRequirements({});
  const req = all.find(r => r.id === reqId);
  if (!req) return;
  await window.api.saveRequirement({ ...req, description: suggestion });
  toast('✅ Vorschlag übernommen');
}

async function acceptImprovedReq(reqId, title, desc) {
  const all = await window.api.getRequirements({});
  const req = all.find(r => r.id === reqId);
  if (!req) return;
  const upd = { ...req };
  if (title) upd.title       = title;
  if (desc)  upd.description = desc;
  await window.api.saveRequirement(upd);
  toast('✅ Verbesserte Version übernommen');
}

window.loadBaQS           = loadBaQS;
window.runQS              = runQS;
window.acceptQSSuggestion = acceptQSSuggestion;
window.acceptImprovedReq  = acceptImprovedReq;
