'use strict';
const $ = window.$ || (id => document.getElementById(id));
/**
 * features/word-analysis.js
 * Word-Analyse — .docx hochladen, KI extrahiert Requirements direkt aus dem Dokumenttext.
 * Zwei Modi (Umschalter "Systemzugehörigkeit"):
 *  - "Neu": eigenständig, ohne Stakeholder-/RAG-/Systemkontext.
 *  - "Vorhandenes System": Pflichtauswahl eines Systems VOR der Analyse; dessen
 *    Stakeholder/Use-Cases/Qualitätsziele/RAG-Zusammenfassung fließen in den Prompt ein
 *    (wie bei der system-gebundenen Dokumentenanalyse). Dasselbe System dient danach
 *    auch als Ziel beim Übernehmen der Ergebnisse.
 */

let _waText = '';
let _waFileName = '';
let _waScope = 'none'; // 'none' | 'system'

async function loadWordAnalysis() {
  S.systems = S.systems?.length ? S.systems : await window.api.getSystems();
  const sel = $('wa-sys-select');
  if (sel) {
    sel.innerHTML = '<option value="">Zielsystem wählen (optional, zum Speichern) …</option>' +
      S.systems.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  }
  $('btn-wa-pick').onclick = pickWordFile;
  $('btn-wa-analyze').onclick = runWordAnalysis;
  $('btn-wa-scope-none').onclick   = () => setWaScope('none');
  $('btn-wa-scope-system').onclick = () => setWaScope('system');
  if (sel) sel.onchange = () => { if (_waScope === 'system') sel.style.outline = sel.value ? '' : '1px solid var(--red)'; };
  setWaScope(_waScope);
}

function setWaScope(scope) {
  _waScope = scope;
  $('btn-wa-scope-none').classList.toggle('active', scope === 'none');
  $('btn-wa-scope-system').classList.toggle('active', scope === 'system');
  const sel = $('wa-sys-select');
  const hint = $('wa-scope-hint');
  if (scope === 'system') {
    hint.textContent = 'Anforderung gehört zu einem vorhandenen System — die Analyse bezieht dessen Stakeholder, Use Cases, Qualitätsziele und RAG-Kontext mit ein.';
    if (sel) sel.style.outline = sel.value ? '' : '1px solid var(--red)';
  } else {
    hint.textContent = 'Neue, noch keinem System zugeordnete Anforderung — Analyse nutzt ausschließlich den Dokumentinhalt.';
    if (sel) sel.style.outline = '';
  }
}

async function pickWordFile() {
  const files = await window.api.pickFiles('.docx');
  if (!files.length) return;
  const file = files[0];

  $('wa-upload-status').innerHTML = '<div class="empty-state"><div class="spin"></div><p>Lese Dokument …</p></div>';
  $('wa-results').innerHTML = '';
  $('btn-wa-analyze').disabled = true;

  try {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('api/docs/extract-text', { method: 'POST', body: fd, credentials: 'include' });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      $('wa-upload-status').innerHTML = `<div class="empty-state"><h3>Fehler</h3><p>${esc(data.error || 'Textextraktion fehlgeschlagen')}</p></div>`;
      return;
    }
    _waText = data.text;
    _waFileName = data.name;
    const preview = _waText.trim().substring(0, 400);
    $('wa-upload-status').innerHTML = `
      <div style="background:var(--s1);border:1px solid var(--b1);border-radius:var(--rl);padding:14px 16px;box-shadow:0 3px 10px rgba(0,0,0,.18)">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <span style="font-size:18px">📄</span>
          <strong style="font-size:13px">${esc(_waFileName)}</strong>
          <span style="font-size:11px;color:var(--t3)">${_waText.length.toLocaleString('de-DE')} Zeichen</span>
        </div>
        <div style="font-size:12px;color:var(--t2);line-height:1.6;white-space:pre-wrap">${esc(preview)}${_waText.length > 400 ? '…' : ''}</div>
      </div>`;
    $('btn-wa-analyze').disabled = false;
  } catch(e) {
    $('wa-upload-status').innerHTML = `<div class="empty-state"><h3>Fehler</h3><p>${esc(e.message)}</p></div>`;
  }
}

async function runWordAnalysis() {
  if (!_waText) { toast('⚠ Zuerst ein Word-Dokument hochladen'); return; }

  const sysId = $('wa-sys-select')?.value || '';
  if (_waScope === 'system' && !sysId) {
    toast('⚠ Bitte ein vorhandenes System auswählen');
    $('wa-sys-select').style.outline = '1px solid var(--red)';
    return;
  }

  const btn = $('btn-wa-analyze');
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span> Analysiere …';
  $('wa-results').innerHTML = '<div class="empty-state"><div class="spin"></div><p>Analysiere Dokument …</p></div>';

  // Bei Systembindung: denselben RE-Kontext einbeziehen wie die system-gebundene Dokumentenanalyse
  let shCtx = '', ucCtx = '', qgCtx = '', ragCtx = '';
  if (_waScope === 'system' && sysId) {
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
  }
  const boundToSystem = _waScope === 'system' && (shCtx || ucCtx || qgCtx || ragCtx);

  const schema = '{"requirements":[{"title":"Beginnt mit Verb","description":"vollständig und messbar","category":"Funktional|Nicht-Funktional|Sicherheit|Performance|Schnittstelle","priority":"high|medium|low","confidence":"high|medium|low","rationale":"Warum wichtig?","acceptance_criteria_text":"Gegeben...Wenn...Dann..."}],"assumptions":[{"text":"...","impact":"hoch|mittel|niedrig"}],"risks":[{"text":"...","probability":"hoch|mittel|niedrig","impact":"hoch|mittel|niedrig","mitigation":"Gegenmaßnahme"}],"gaps":["Vermutlich fehlende Anforderung basierend auf dem Dokument..."],"qualityIssues":[{"type":"Widerspruch|Mehrdeutigkeit|Fehlende Angabe|Unvollständigkeit|Unrealistisch/nicht verifizierbar","severity":"hoch|mittel|niedrig","description":"Was genau ist das Problem und warum?","quote":"Wörtliches Zitat der betroffenen Textstelle(n)","suggestion":"Konkreter Verbesserungsvorschlag"}],"summary":"Zusammenfassung"}';

  const prompt = [
    'Du bist CPRE-zertifizierter Requirements Engineer. Analysiere das folgende Dokument.',
    boundToSystem
      ? 'Das Dokument gehört zu einem bekannten System — beziehe den folgenden Systemkontext aktiv mit ein (Stakeholder-Zuordnung, Abgleich mit bekannten Use Cases/Qualitätszielen).'
      : 'WICHTIG: Es liegt KEIN zusätzlicher Systemkontext vor — keine bekannten Stakeholder, Use Cases oder Qualitätsziele. Arbeite ausschließlich mit dem Dokumenteninhalt.',
    boundToSystem ? shCtx : '', boundToSystem ? ucCtx : '', boundToSystem ? qgCtx : '', boundToSystem ? ragCtx : '',
    '',
    'EXTRAHIERE:',
    '1. Anforderungen — explizit UND implizit, mit Akzeptanzkriterien',
    '2. Annahmen — implizite Voraussetzungen, die das Dokument nicht ausspricht',
    '3. Risiken — mit konkreten Gegenmaßnahmen',
    '4. Lücken — Anforderungen, die aus dem Dokumenteninhalt heraus vermutlich fehlen',
    boundToSystem
      ? '5. Qualitätsprüfung — prüfe den Text kritisch auf Widersprüche (auch zu Stakeholdern/Use Cases/Qualitätszielen oben, falls vorhanden), Mehrdeutigkeiten, fehlende Angaben und unrealistische oder nicht verifizierbare Formulierungen. Zitiere für jeden Fund die betroffene Textstelle wörtlich — keine Vermutungen ohne Beleg im Text.'
      : '5. Qualitätsprüfung — prüfe den Text kritisch auf Widersprüche, Mehrdeutigkeiten, fehlende Angaben und unrealistische oder nicht verifizierbare Formulierungen. Zitiere für jeden Fund die betroffene Textstelle wörtlich — keine Vermutungen ohne Beleg im Text.',
    '',
    `DOKUMENT: ${_waFileName}`,
    _waText.substring(0, 12000),
    '',
    'Antworte NUR mit JSON (keine Backticks):',
    schema,
  ].filter(Boolean).join('\n');

  const res = await callAPI([{ role:'user', content: prompt }],
    'Du bist CPRE-zertifizierter Requirements Engineer. ' + langNote(), 4500);

  btn.disabled = false;
  btn.innerHTML = '🔍 Analysieren';

  if (!res.ok) { toast('❌ ' + res.text); $('wa-results').innerHTML = ''; return; }
  try {
    const a = JSON.parse((() => { let _r=res.text.trim().replace(/```json\s*/gi,'').replace(/```\s*/g,'').trim(); const _fi=_r.indexOf('['),_li=_r.lastIndexOf(']'),_fo=_r.indexOf('{'),_lo=_r.lastIndexOf('}'); const _arrFirst=_fi!==-1&&(_fo===-1||_fi<_fo); if(_arrFirst&&_li>_fi)_r=_r.substring(_fi,_li+1); else if(_fo!==-1&&_lo>_fo)_r=_r.substring(_fo,_lo+1); return _r.replace(/,\s*}/g,'}').replace(/,\s*]/g,']'); })());
    renderWordAnalysis(a);
    toast(`✅ ${a.requirements?.length||0} Anforderungen · ${a.assumptions?.length||0} Annahmen · ${a.risks?.length||0} Risiken · ${a.qualityIssues?.length||0} QS-Befunde`);
  } catch(e) { toast('❌ Parsing-Fehler'); }
}

function renderWordAnalysis(a) {
  const wr = $('wa-results');
  wr.innerHTML = '';

  if (a.summary) {
    const s = document.createElement('div');
    s.style.cssText = 'font-size:13px;color:var(--t2);padding:12px 16px;background:var(--s2);border-radius:var(--r);margin-bottom:14px;line-height:1.6';
    s.textContent = a.summary;
    wr.appendChild(s);
  }

  if (a.requirements?.length) {
    const g = document.createElement('div');
    g.className = 'da-group';
    const allReqsJson = JSON.stringify(a.requirements).replace(/</g,'<').replace(/'/g,"\'");
    const reqItems = a.requirements.map(r => {
      const rJson = JSON.stringify(r).replace(/</g,'<').replace(/'/g,"\'");
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
        + ' onclick=\'saveWordReq(' + rJson + ')\'>✓ Übernehmen</button>'
        + '</div></div>';
    }).join('');
    g.innerHTML = '<div class="da-group-head">'
      + '<span>📋 Anforderungen (' + a.requirements.length + ')</span>'
      + '<button class="btn-primary" style="font-size:11px;padding:5px 10px"'
      + ' onclick=\'saveAllWordReqs(' + allReqsJson + ')\'>Alle übernehmen</button>'
      + '</div><div class="da-group-body">' + reqItems + '</div>';
    wr.appendChild(g);
  }

  if (a.assumptions?.length) {
    const g = document.createElement('div');
    g.className = 'da-group';
    const items = a.assumptions.map(x =>
      '<div class="da-item">'
      + '<div class="da-item-icon" style="background:var(--ambbg)">💭</div>'
      + '<div class="da-item-body">' + esc(x.text||'')
      + '<span class="rtag" style="margin-left:6px;font-size:9px">Auswirkung: ' + esc(x.impact||'') + '</span>'
      + '</div></div>'
    ).join('');
    g.innerHTML = '<div class="da-group-head">💭 Annahmen (' + a.assumptions.length + ')</div>'
      + '<div class="da-group-body">' + items + '</div>';
    wr.appendChild(g);
  }

  if (a.gaps?.length) {
    const g = document.createElement('div');
    g.className = 'da-group';
    const items = a.gaps.map(x =>
      '<div class="da-item">'
      + '<div class="da-item-icon" style="background:var(--redbg)">🕳</div>'
      + '<div class="da-item-body">' + esc(x) + '</div>'
      + '</div>'
    ).join('');
    g.innerHTML = '<div class="da-group-head">🕳 Erkannte Lücken (' + a.gaps.length + ')</div>'
      + '<div class="da-group-body">' + items + '</div>';
    wr.appendChild(g);
  }

  if (a.risks?.length) {
    const g = document.createElement('div');
    g.className = 'da-group';
    const items = a.risks.map(x =>
      '<div class="da-item">'
      + '<div class="da-item-icon" style="background:var(--redbg)">⚠</div>'
      + '<div class="da-item-body">' + esc(x.text||'')
      + '<div style="display:flex;gap:5px;margin-top:3px">'
      + '<span class="rtag" style="font-size:9px">W: ' + esc(x.probability||'') + '</span>'
      + '<span class="rtag" style="font-size:9px">A: ' + esc(x.impact||'') + '</span>'
      + '</div></div></div>'
    ).join('');
    g.innerHTML = '<div class="da-group-head">⚠ Risiken (' + a.risks.length + ')</div>'
      + '<div class="da-group-body">' + items + '</div>';
    wr.appendChild(g);
  }

  // Qualitätsprüfung (Widersprüche, Mehrdeutigkeiten, Lücken im Text selbst)
  if (a.qualityIssues?.length) {
    const g = document.createElement('div');
    g.className = 'da-group';
    const sevColor = { hoch:'var(--red)', mittel:'var(--amb)', niedrig:'var(--blue)' };
    const items = a.qualityIssues.map(x => {
      const c = sevColor[x.severity] || 'var(--t3)';
      return '<div class="da-item">'
        + '<div class="da-item-icon" style="background:' + c + '22">⚖</div>'
        + '<div class="da-item-body">'
        + '<div style="display:flex;gap:5px;align-items:center;margin-bottom:3px">'
        + '<span class="rtag" style="font-size:9px">' + esc(x.type||'') + '</span>'
        + '<span class="sbadge" style="font-size:9px;background:' + c + '22;color:' + c + '">' + esc(x.severity||'?') + '</span>'
        + '</div>'
        + '<div style="font-size:12px">' + esc(x.description||'') + '</div>'
        + (x.quote ? '<div style="font-size:11px;color:var(--t2);font-style:italic;border-left:2px solid ' + c + ';padding:3px 8px;margin-top:5px;background:var(--s2)">„' + esc(x.quote) + '"</div>' : '')
        + (x.suggestion ? '<div style="font-size:11px;color:var(--grn);margin-top:5px">💡 ' + esc(x.suggestion) + '</div>' : '')
        + '</div></div>';
    }).join('');
    g.innerHTML = '<div class="da-group-head">⚖ Qualitätsprüfung (' + a.qualityIssues.length + ')</div>'
      + '<div class="da-group-body">' + items + '</div>';
    wr.appendChild(g);
  }
}

// ── Speichern: braucht ein zum Zeitpunkt des Speicherns gewähltes Zielsystem ──
async function saveWordReq(r) {
  const sysId = $('wa-sys-select')?.value;
  if (!sysId) { toast('⚠ Zielsystem wählen'); return; }
  await window.saveSingleDocReq(r, sysId);
}

async function saveAllWordReqs(reqs) {
  const sysId = $('wa-sys-select')?.value;
  if (!sysId) { toast('⚠ Zielsystem wählen'); return; }
  await window.saveAllDocReqs(reqs, sysId);
}

window.loadWordAnalysis  = loadWordAnalysis;
window.pickWordFile      = pickWordFile;
window.runWordAnalysis   = runWordAnalysis;
window.saveWordReq       = saveWordReq;
window.saveAllWordReqs   = saveAllWordReqs;
