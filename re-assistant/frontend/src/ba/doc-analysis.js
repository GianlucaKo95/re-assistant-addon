'use strict';
const $ = window.$ || (id => document.getElementById(id));
/**
 * ba/doc-analysis.js
 * Dokumentenanalyse — KI extrahiert Requirements, Annahmen, Risiken.
 */

async function loadBaDocAnalysis() {
  S.systems = await window.api.getSystems();
  const sel = $('da-sys-select');
  sel.innerHTML = '<option value="">System wählen …</option>' +
    S.systems.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  sel.onchange = () => {
    const sys  = S.systems.find(s => s.id === sel.value);
    const docs = sys?.docs || [];
    $('da-doc-list').innerHTML = docs.length
      ? docs.map(d => `
          <div class="da-doc-item">
            <input type="checkbox" checked id="dadc-${d.id}"/>
            <label for="dadc-${d.id}" style="cursor:pointer;flex:1">
              ${esc(d.name)}
              <span style="font-size:10px;color:var(--t3);margin-left:5px">
                ${((d.size||0)/1024).toFixed(1)} KB
              </span>
            </label>
          </div>`).join('')
      : '<div style="padding:10px;font-size:12px;color:var(--t3)">Keine Dokumente im System.</div>';
  };
  $('btn-run-da').onclick = runDocAnalysis;
}

async function runDocAnalysis() {
  const sysId = $('da-sys-select').value;
  if (!sysId) { toast('⚠ System auswählen'); return; }
  const sys = S.systems.find(s => s.id === sysId);
  if (!sys?.docs?.length) { toast('ℹ Keine Dokumente im System'); return; }

  const checked = Array.from(document.querySelectorAll('#da-doc-list input[type=checkbox]:checked'))
    .map(c => c.id.replace('dadc-', ''));
  const docs = (sys.docs || []).filter(d => checked.includes(d.id));
  if (!docs.length) { toast('⚠ Mindestens ein Dokument auswählen'); return; }

  const btn = $('btn-run-da');
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span>';
  $('da-results').innerHTML = '<div class="empty-state"><div class="spin"></div><p>Analysiere Dokumente …</p></div>';

  const content = docs.map(d => `### ${d.name}\n${d.content.substring(0, 8000)}`).join('\n\n---\n\n');

  const res = await callAPI([{ role:'user', content:
    `Analysiere diese Dokumentation strukturiert und extrahiere:
    1. Anforderungen (funktionale und nicht-funktionale)
    2. Annahmen (implizite Voraussetzungen)
    3. Risiken (potenzielle Probleme)
    
    JSON ohne Backticks:
    {
      "requirements": [{"id":"REQ-001","title":"...","description":"...","category":"Funktional","priority":"medium","confidence":"high"}],
      "assumptions":  [{"text":"...","impact":"hoch|mittel|niedrig"}],
      "risks":        [{"text":"...","probability":"hoch|mittel|niedrig","impact":"hoch|mittel|niedrig"}],
      "summary":      "Kurze Zusammenfassung der Dokumentation"
    }
    
    Confidence-Werte: high = klar explizit, medium = implizit erkennbar, low = Vermutung
    
    Dokumentation:
    ${content}` }],
    langNote(), 3500);

  btn.disabled = false;
  btn.innerHTML = '🔍 Analysieren';

  if (!res.ok) { toast('❌ ' + res.text); $('da-results').innerHTML = ''; return; }
  try {
    const a = JSON.parse(res.text.replace(/```json|```/g, '').trim());
    renderDocAnalysis(a, sysId);
    toast(`✅ ${a.requirements?.length||0} Anforderungen · ${a.assumptions?.length||0} Annahmen · ${a.risks?.length||0} Risiken`);
  } catch(e) { toast('❌ Parsing-Fehler'); }
}

function renderDocAnalysis(a, sysId) {
  const dr = $('da-results');
  dr.innerHTML = '';

  if (a.summary) {
    const s = document.createElement('div');
    s.style.cssText = 'font-size:13px;color:var(--t2);padding:12px 16px;background:var(--s2);border-radius:var(--r);margin-bottom:14px;line-height:1.6';
    s.textContent = a.summary;
    dr.appendChild(s);
  }

  // Anforderungen
  if (a.requirements?.length) {
    const g = document.createElement('div');
    g.className = 'da-group';
    g.innerHTML = `
      <div class="da-group-head">
        <span>📋 Anforderungen (${a.requirements.length})</span>
        <button class="btn-primary" style="font-size:11px;padding:5px 10px"
          onclick="saveAllDocReqs(${JSON.stringify(a.requirements).replace(/</g,'\\u003c')
            .replace(/'/g,"\\'")},'${sysId}')">
          Alle übernehmen
        </button>
      </div>
      <div class="da-group-body">
        ${a.requirements.map(r => `
          <div class="da-item">
            <div class="da-item-icon" style="background:var(--bluebg)">📝</div>
            <div class="da-item-body">
              <div style="font-weight:600;font-size:13px">${esc(r.title)}</div>
              <div style="font-size:12px;color:var(--t2);margin-top:2px">${esc(r.description)}</div>
              <div style="display:flex;gap:5px;margin-top:5px">
                <span class="sbadge p-${r.priority}" style="font-size:9px">${priLabel(r.priority)}</span>
                <span class="rtag" style="font-size:9px">${esc(r.category)}</span>
                <span class="rtag" style="font-size:9px;color:${
                  r.confidence==='high'?'var(--grn)':r.confidence==='medium'?'var(--amb)':'var(--red)'}">
                  Konfidenz: ${esc(r.confidence||'?')}
                </span>
              </div>
            </div>
            <div class="da-item-actions">
              <button class="btn-secondary" style="font-size:11px;padding:4px 9px"
                onclick='saveSingleDocReq(${JSON.stringify(r).replace(/</g,"\\u003c").replace(/'/g,"\\'")},"${sysId}")'>
                ✓ Übernehmen
              </button>
            </div>
          </div>`).join('')}
      </div>`;
    dr.appendChild(g);
  }

  // Annahmen
  if (a.assumptions?.length) {
    const g = document.createElement('div');
    g.className = 'da-group';
    g.innerHTML = `
      <div class="da-group-head">💭 Annahmen (${a.assumptions.length})</div>
      <div class="da-group-body">
        ${a.assumptions.map(x => `
          <div class="da-item">
            <div class="da-item-icon" style="background:var(--ambbg)">💭</div>
            <div class="da-item-body">
              ${esc(x.text)}
              <span class="rtag" style="margin-left:6px;font-size:9px">Auswirkung: ${esc(x.impact)}</span>
            </div>
          </div>`).join('')}
      </div>`;
    dr.appendChild(g);
  }

  // Risiken
  if (a.risks?.length) {
    const g = document.createElement('div');
    g.className = 'da-group';
    g.innerHTML = `
      <div class="da-group-head">⚠ Risiken (${a.risks.length})</div>
      <div class="da-group-body">
        ${a.risks.map(x => `
          <div class="da-item">
            <div class="da-item-icon" style="background:var(--redbg)">⚠</div>
            <div class="da-item-body">
              ${esc(x.text)}
              <div style="display:flex;gap:5px;margin-top:3px">
                <span class="rtag" style="font-size:9px">W: ${esc(x.probability)}</span>
                <span class="rtag" style="font-size:9px">A: ${esc(x.impact)}</span>
              </div>
            </div>
          </div>`).join('')}
      </div>`;
    dr.appendChild(g);
  }
}

async function saveSingleDocReq(r, sysId) {
  await window.api.saveRequirement({
    ...r,
    id:            'REQ-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
    systemId:      sysId,
    createdBy:     S.user.id,
    createdByName: S.user.name,
    status:        'open',
  });
  toast('✅ Anforderung gespeichert');
}

async function saveAllDocReqs(reqs, sysId) {
  for (const r of reqs) await saveSingleDocReq(r, sysId);
  toast(`✅ ${reqs.length} Anforderungen gespeichert`);
}

window.loadBaDocAnalysis = loadBaDocAnalysis;
window.runDocAnalysis    = runDocAnalysis;
window.saveSingleDocReq  = saveSingleDocReq;
window.saveAllDocReqs    = saveAllDocReqs;

// ── Window Globals ──────────────────────────────────────────
window.renderDocAnalysis = renderDocAnalysis;
