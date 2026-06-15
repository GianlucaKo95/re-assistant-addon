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

  // Dokument-Inhalt sicher lesen
  // Falls d.content leer: RAG-Cache wird als Hauptkontext genutzt (bessere Strategie)
  const hasContent = docs.some(d => d.content && d.content.length > 50);
  const contentParts = hasContent
    ? docs.map(d => {
        const text = d.content || '';
        return '### ' + d.name + '\n' + (text ? text.substring(0, 4000) : '(Inhalt via RAG-Index)');
      }).join('\n\n---\n\n')
    : '(Dokumente sind via RAG-Index verfügbar — Analyse basiert auf dem Systemkontext)';

  // Vollständiger RE-Kontext
  let shCtx = '', ucCtx = '', qgCtx = '', ragCtx = '';
  try {
    const [shs, ucs, qgs, cache] = await Promise.all([
      fetch(`api/systems/${sysId}/stakeholders`,  {credentials:'include'}).then(r=>r.json()).catch(()=>[]),
      fetch(`api/systems/${sysId}/use-cases`,     {credentials:'include'}).then(r=>r.json()).catch(()=>[]),
      fetch(`api/systems/${sysId}/quality-goals`, {credentials:'include'}).then(r=>r.json()).catch(()=>[]),
      fetch(`api/embeddings/summary?systemId=${sysId}`, {credentials:'include'}).then(r=>r.json()).catch(()=>null),
    ]);
    if (shs.length) shCtx = 'Stakeholder: ' + shs.map(s => s.name + ' (' + s.role + ')').join(', ');
    if (ucs.length) ucCtx = 'Bekannte Use Cases: ' + ucs.map(u => u.title).join(', ');
    if (qgs.length) qgCtx = 'Qualitätsziele: ' + qgs.map(g => g.iso_char + ': ' + g.description).join(' | ');
    if (cache?.summary) ragCtx = 'SYSTEMÜBERBLICK (KI-analysiert):\n' + cache.summary.substring(0, 5000);
  } catch(e) {}

  const schema = '{"requirements":[{"title":"Beginnt mit Verb","description":"vollständig und messbar","category":"Funktional|Nicht-Funktional|Sicherheit|Performance|Schnittstelle","priority":"high|medium|low","confidence":"high|medium|low","rationale":"Warum wichtig?","acceptance_criteria_text":"Gegeben...Wenn...Dann...","stakeholders":"Betroffene Stakeholder","iso_category":"ISO-25010 Charakteristik","risk_level":"hoch|mittel|niedrig"}],"assumptions":[{"text":"...","impact":"hoch|mittel|niedrig","affectedStakeholders":"..."}],"risks":[{"text":"...","probability":"hoch|mittel|niedrig","impact":"hoch|mittel|niedrig","mitigation":"Gegenmaßnahme"}],"gaps":["Fehlende Anforderung aus Stakeholder-Sicht..."],"summary":"Zusammenfassung"}';

  const prompt = [
    'Du bist CPRE-zertifizierter Requirements Engineer. Analysiere die Dokumentation tiefgründig.',
    '',
    shCtx, ucCtx, qgCtx, ragCtx,
    '',
    'EXTRAHIERE:',
    '1. Anforderungen — explizit UND implizit, mit Akzeptanzkriterien und Stakeholder-Zuordnung',
    '2. Annahmen — implizite Voraussetzungen mit Auswirkung auf betroffene Stakeholder',
    '3. Risiken — mit konkreten Gegenmaßnahmen',
    '4. Lücken — Anforderungen die aus Stakeholder-Perspektive fehlen',
    '',
    'DOKUMENTATION:',
    contentParts,
    '',
    'Antworte NUR mit JSON (keine Backticks):',
    schema,
  ].filter(Boolean).join('\n');

  const res = await callAPI([{ role:'user', content: prompt }],
    'Du bist CPRE-zertifizierter Requirements Engineer. ' + langNote(), 4500);

  btn.disabled = false;
  btn.innerHTML = '🔍 Analysieren';

  if (!res.ok) { toast('❌ ' + res.text); $('da-results').innerHTML = ''; return; }
  try {
    const a = JSON.parse((() => { let _r=res.text.trim().replace(/```json\\s*/gi,'').replace(/```\\s*/g,'').trim(); const _fi=_r.indexOf('['),_li=_r.lastIndexOf(']'),_fo=_r.indexOf('{'),_lo=_r.lastIndexOf('}'); if(_fi!==-1&&_li>_fi)_r=_r.substring(_fi,_li+1); else if(_fo!==-1&&_lo>_fo)_r=_r.substring(_fo,_lo+1); return _r.replace(/,\\s*}/g,'}').replace(/,\\s*]/g,']'); })());
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
    const allReqsJson = JSON.stringify(a.requirements).replace(/</g,'\u003c').replace(/'/g,"\'");
    const reqItems = a.requirements.map(r => {
      const rJson = JSON.stringify(r).replace(/</g,'\u003c').replace(/'/g,"\'");
      const confColor = r.confidence==='high'?'var(--grn)':r.confidence==='medium'?'var(--amb)':'var(--red)';
      return '<div class="da-item">'
        + '<div class="da-item-icon" style="background:var(--bluebg)">📝</div>'
        + '<div class="da-item-body">'
        + '<div style="font-weight:600;font-size:13px">' + esc(r.title) + '</div>'
        + '<div style="font-size:12px;color:var(--t2);margin-top:2px">' + esc(r.description||'') + '</div>'
        + '<div style="display:flex;gap:5px;margin-top:5px">'
        + '<span class="sbadge p-' + r.priority + '" style="font-size:9px">' + priLabel(r.priority) + '</span>'
        + '<span class="rtag" style="font-size:9px">' + esc(r.category||'') + '</span>'
        + '<span class="rtag" style="font-size:9px;color:' + confColor + '">Konfidenz: ' + esc(r.confidence||'?') + '</span>'
        + '</div></div>'
        + '<div class="da-item-actions">'
        + '<button class="btn-secondary" style="font-size:11px;padding:4px 9px"'
        + ' onclick=\'saveSingleDocReq(' + rJson + ',\"' + sysId + '\")\'>✓ Übernehmen</button>'
        + '</div></div>';
    }).join('');
    g.innerHTML = '<div class="da-group-head">'
      + '<span>📋 Anforderungen (' + a.requirements.length + ')</span>'
      + '<button class="btn-primary" style="font-size:11px;padding:5px 10px"'
      + ' onclick=\'saveAllDocReqs(' + allReqsJson + ',\"' + sysId + '\")\'>Alle übernehmen</button>'
      + '</div><div class="da-group-body">' + reqItems + '</div>';
    dr.appendChild(g);
  }

  // Annahmen
  if (a.assumptions?.length) {
    const g = document.createElement('div');
    g.className = 'da-group';
    const assumItems = a.assumptions.map(x =>
      '<div class="da-item">'
      + '<div class="da-item-icon" style="background:var(--ambbg)">💭</div>'
      + '<div class="da-item-body">' + esc(x.text||'')
      + '<span class="rtag" style="margin-left:6px;font-size:9px">Auswirkung: ' + esc(x.impact||'') + '</span>'
      + '</div></div>'
    ).join('');
    g.innerHTML = '<div class="da-group-head">💭 Annahmen (' + a.assumptions.length + ')</div>'
      + '<div class="da-group-body">' + assumItems + '</div>';
    dr.appendChild(g);
  }

  // Lücken
  if (a.gaps?.length) {
    const g = document.createElement('div');
    g.className = 'da-group';
    const gapItems = a.gaps.map(x =>
      '<div class="da-item">'
      + '<div class="da-item-icon" style="background:var(--redbg)">🕳</div>'
      + '<div class="da-item-body">' + esc(x) + '</div>'
      + '</div>'
    ).join('');
    g.innerHTML = '<div class="da-group-head">🕳 Erkannte Lücken (' + a.gaps.length + ')</div>'
      + '<div class="da-group-body">' + gapItems + '</div>';
    dr.appendChild(g);
  }

  // Risiken
  if (a.risks?.length) {
    const g = document.createElement('div');
    g.className = 'da-group';
    const riskItems = a.risks.map(x =>
      '<div class="da-item">'
      + '<div class="da-item-icon" style="background:var(--redbg)">⚠</div>'
      + '<div class="da-item-body">' + esc(x.text||'')
      + '<div style="display:flex;gap:5px;margin-top:3px">'
      + '<span class="rtag" style="font-size:9px">W: ' + esc(x.probability||'') + '</span>'
      + '<span class="rtag" style="font-size:9px">A: ' + esc(x.impact||'') + '</span>'
      + '</div></div></div>'
    ).join('');
    g.innerHTML = '<div class="da-group-head">⚠ Risiken (' + a.risks.length + ')</div>'
      + '<div class="da-group-body">' + riskItems + '</div>';
    dr.appendChild(g);
  }
}

async function saveSingleDocReq(r, sysId) {
  await window.api.saveRequirement({
    ...r,
    id:                       'REQ-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
    systemId:                 sysId,
    createdBy:                S.user.id,
    createdByName:            S.user.name,
    status:                   'open',
    acceptance_criteria_text: r.acceptance_criteria_text || '',
    iso_category:             r.iso_category || '',
    risk_level:               r.risk_level || '',
    source:                   'doc-analysis',
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
