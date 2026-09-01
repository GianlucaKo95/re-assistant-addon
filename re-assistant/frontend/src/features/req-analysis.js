'use strict';
/**
 * req-analysis.js
 * Vollständiger RE-Analyse-Workflow:
 * - Stakeholder-Management
 * - Systemgrenzen
 * - Use Cases
 * - Qualitätsziele (ISO-25010)
 * - SMART-Qualitätsprüfung
 * - KI-gestützte Vollanalyse
 */

const ISO_CHARS = [
  'Funktionale Eignung', 'Leistungseffizienz', 'Kompatibilität',
  'Gebrauchstauglichkeit', 'Zuverlässigkeit', 'Sicherheit',
  'Wartbarkeit', 'Portierbarkeit',
];

const SMART_LABELS = {
  specific:   { label: 'Spezifisch',  desc: 'Klar und eindeutig formuliert?' },
  measurable: { label: 'Messbar',     desc: 'Gibt es messbare Kriterien?' },
  achievable: { label: 'Erreichbar',  desc: 'Technisch und wirtschaftlich umsetzbar?' },
  relevant:   { label: 'Relevant',    desc: 'Trägt zum Systemziel bei?' },
  timebound:  { label: 'Terminiert',  desc: 'Zeitrahmen oder Priorität definiert?' },
};

// ── Haupt-View laden ──────────────────────────────────────────
async function loadReqAnalysis() {
  if (!S.activeSystemId) {
    document.getElementById('req-analysis-content').innerHTML =
      '<div class="empty-state"><div class="es-icon">📊</div><h3>Kein System ausgewählt</h3></div>';
    return;
  }
  renderReqAnalysisTabs();
  loadAnalysisTab('stakeholders');
}

function renderReqAnalysisTabs() {
  const el = document.getElementById('req-analysis-content');
  if (!el) return;
  el.innerHTML = `
    <div style="display:flex;gap:0;border-bottom:1px solid var(--b1);margin-bottom:16px;overflow-x:auto">
      ${[
        ['stakeholders','👥 Stakeholder'],
        ['boundaries','🗺 Systemgrenzen'],
        ['use-cases','📋 Use Cases'],
        ['quality-goals','🎯 Qualitätsziele'],
        ['smart-check','⭐ SMART-Prüfung'],
        ['consistency','⚡ Konsistenz'],
      ].map(([id, label]) => `
        <button class="ra-tab" id="ra-tab-${id}" onclick="loadAnalysisTab('${id}')"
          style="padding:8px 14px;border:none;background:transparent;color:var(--t3);
          font-size:12px;cursor:pointer;white-space:nowrap;border-bottom:2px solid transparent;
          transition:all .15s">
          ${label}
        </button>`).join('')}
      <div style="flex:1"></div>
      <button class="btn-primary" style="font-size:11px;padding:5px 12px;margin:4px 8px"
        onclick="runFullAnalysis()">
        🤖 KI-Vollanalyse
      </button>
    </div>
    <div id="ra-tab-content"></div>`;
}

async function loadAnalysisTab(tab) {
  // Tab aktivieren
  document.querySelectorAll('.ra-tab').forEach(b => {
    b.style.color = 'var(--t3)';
    b.style.borderBottomColor = 'transparent';
  });
  const active = document.getElementById('ra-tab-' + tab);
  if (active) { active.style.color = 'var(--t1)'; active.style.borderBottomColor = 'var(--aa)'; }

  const el = document.getElementById('ra-tab-content');
  if (!el) return;
  el.innerHTML = '<div class="spin" style="margin:20px auto"></div>';

  const sysId = S.activeSystemId;
  try {
    switch(tab) {
      case 'stakeholders':   await renderStakeholders(el, sysId); break;
      case 'boundaries':     await renderBoundaries(el, sysId); break;
      case 'use-cases':      await renderUseCases(el, sysId); break;
      case 'quality-goals':  await renderQualityGoals(el, sysId); break;
      case 'smart-check':    await renderSmartCheck(el, sysId); break;
      case 'consistency':    await renderConsistencyTab(el, sysId); break;
    }
  } catch(e) {
    el.innerHTML = `<div style="color:var(--red);padding:12px">Fehler: ${esc(e.message)}</div>`;
  }
}

// ── Stakeholder ───────────────────────────────────────────────
async function renderStakeholders(el, sysId) {
  const rows = await fetch(`api/systems/${sysId}/stakeholders`, {credentials:'include'}).then(r=>r.json());
  const shItems = rows.map(sh => {
    const infColor = sh.influence==='hoch'?'rgba(248,81,73,.15)':sh.influence==='mittel'?'rgba(251,191,36,.15)':'rgba(63,185,80,.15)';
    const txtColor = sh.influence==='hoch'?'var(--red)':sh.influence==='mittel'?'var(--amb)':'var(--grn)';
    return '<div style="background:var(--s2);border:1px solid var(--b1);border-radius:var(--r);padding:12px 14px;margin-bottom:8px">'
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start"><div>'
      + '<div style="font-size:13px;font-weight:600">' + esc(sh.name) + '</div>'
      + '<div style="font-size:11px;color:var(--t3)">' + esc(sh.role) + '</div></div>'
      + '<div style="display:flex;gap:6px;align-items:center">'
      + '<span style="font-size:10px;padding:2px 8px;border-radius:99px;background:' + infColor + ';color:' + txtColor + '">' + esc(sh.influence) + ' Einfluss</span>'
      + '<button onclick="deleteStakeholder(\'' + sh.id + '\')" style="background:transparent;border:none;color:var(--t3);cursor:pointer">✕</button>'
      + '</div></div>'
      + '<div style="font-size:12px;color:var(--t2);margin-top:8px">' + esc(sh.interests) + '</div></div>';
  }).join('');
  el.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">'
    + '<div style="font-size:13px;color:var(--t2)">' + rows.length + ' Stakeholder definiert</div>'
    + '<div style="display:flex;gap:6px">'
    + '<button class="btn-secondary" style="font-size:11px" onclick="aiAnalyze(\'stakeholders\')">🤖 KI-Analyse</button>'
    + '<button class="btn-primary" style="font-size:11px" onclick="addStakeholder()">+ Hinzufügen</button>'
    + '</div></div>'
    + (rows.length ? shItems : '<div class="empty-state"><div class="es-icon">👥</div><p>Noch keine Stakeholder</p></div>');
}

function addStakeholder() {
  openModal('Stakeholder hinzufügen', `
    <div class="frow"><label>Name</label><input id="sh-name" placeholder="z.B. Produktmanager"/></div>
    <div class="frow"><label>Rolle</label><input id="sh-role" placeholder="Rolle im Projekt"/></div>
    <div class="frow"><label>Erwartungen/Interessen</label>
      <textarea id="sh-interests" rows="3" placeholder="Was erwartet dieser Stakeholder vom System?"></textarea></div>
    <div class="frow"><label>Einfluss</label>
      <select id="sh-influence">
        <option value="hoch">Hoch</option>
        <option value="mittel" selected>Mittel</option>
        <option value="niedrig">Niedrig</option>
      </select></div>
    <div class="modal-footer-actions">
      <button class="btn-primary" onclick="saveStakeholder()">Speichern</button>
      <button class="btn-secondary" onclick="closeModal()">Abbrechen</button>
    </div>`);
}

async function saveStakeholder() {
  const body = {
    name: document.getElementById('sh-name')?.value.trim(),
    role: document.getElementById('sh-role')?.value.trim(),
    interests: document.getElementById('sh-interests')?.value.trim(),
    influence: document.getElementById('sh-influence')?.value,
  };
  if (!body.name) { toast('⚠ Name fehlt'); return; }
  await fetch(`api/systems/${S.activeSystemId}/stakeholders`, {
    method:'POST', credentials:'include',
    headers:{'Content-Type':'application/json'}, body:JSON.stringify(body),
  });
  closeModal();
  toast('✅ Stakeholder gespeichert');
  loadAnalysisTab('stakeholders');
}

async function deleteStakeholder(id) {
  await fetch(`api/systems/${S.activeSystemId}/stakeholders/${id}`, {method:'DELETE',credentials:'include'});
  loadAnalysisTab('stakeholders');
}

// ── Systemgrenzen ─────────────────────────────────────────────
async function renderBoundaries(el, sysId) {
  const rows = await fetch(`api/systems/${sysId}/boundaries`, {credentials:'include'}).then(r=>r.json());
  const types = {in_scope:'Im Umfang ✓', out_of_scope:'Außerhalb ✗', interface:'Schnittstelle ⟷'};
  const colors = {in_scope:'var(--grn)', out_of_scope:'var(--red)', interface:'var(--ab)'};
  const grouped = {in_scope:[], out_of_scope:[], interface:[]};
  rows.forEach(r => (grouped[r.type]||grouped.in_scope).push(r));

  el.innerHTML = `
    <div style="display:flex;justify-content:flex-end;gap:6px;margin-bottom:12px">
      <button class="btn-secondary" style="font-size:11px" onclick="aiAnalyze('boundaries')">🤖 KI-Analyse</button>
      <button class="btn-primary" style="font-size:11px" onclick="addBoundary()">+ Hinzufügen</button>
    </div>
    ${Object.entries(grouped).map(([type, items]) => `
      <div style="margin-bottom:16px">
        <div style="font-size:12px;font-weight:600;color:${colors[type]};margin-bottom:8px">
          ${types[type]} (${items.length})</div>
        ${items.map(b => `<div style="background:var(--s2);border:1px solid var(--b1);border-left:3px solid ${colors[type]};
          border-radius:var(--r);padding:10px 12px;margin-bottom:6px;
          display:flex;justify-content:space-between;align-items:center">
          <div style="font-size:12px">${esc(b.description)}</div>
          <button onclick="deleteBoundary('${b.id}')" style="background:transparent;border:none;
            color:var(--t3);cursor:pointer;margin-left:8px">✕</button>
        </div>`).join('')}
      </div>`).join('')}`;
}

function addBoundary() {
  openModal('Systemgrenze hinzufügen', `
    <div class="frow"><label>Typ</label>
      <select id="sb-type">
        <option value="in_scope">Im Systemumfang ✓</option>
        <option value="out_of_scope">Explizit ausgeschlossen ✗</option>
        <option value="interface">Schnittstelle zu externem System ⟷</option>
      </select></div>
    <div class="frow"><label>Beschreibung</label>
      <textarea id="sb-desc" rows="3" placeholder="Was gehört dazu / nicht dazu / ist eine Schnittstelle?"></textarea></div>
    <div class="modal-footer-actions">
      <button class="btn-primary" onclick="saveBoundary()">Speichern</button>
      <button class="btn-secondary" onclick="closeModal()">Abbrechen</button>
    </div>`);
}

async function saveBoundary() {
  const body = { type: document.getElementById('sb-type')?.value, description: document.getElementById('sb-desc')?.value.trim() };
  if (!body.description) { toast('⚠ Beschreibung fehlt'); return; }
  await fetch(`api/systems/${S.activeSystemId}/boundaries`, {
    method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body),
  });
  closeModal();
  toast('✅ Systemgrenze gespeichert');
  loadAnalysisTab('boundaries');
}

async function deleteBoundary(id) {
  await fetch(`api/systems/${S.activeSystemId}/boundaries/${id}`, {method:'DELETE',credentials:'include'});
  loadAnalysisTab('boundaries');
}

// ── Use Cases ─────────────────────────────────────────────────
async function renderUseCases(el, sysId) {
  const rows = await fetch(`api/systems/${sysId}/use-cases`, {credentials:'include'}).then(r=>r.json());
  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <div style="font-size:13px;color:var(--t2)">${rows.length} Use Cases definiert</div>
      <div style="display:flex;gap:6px">
        <button class="btn-secondary" style="font-size:11px" onclick="aiAnalyze('use-cases')">🤖 KI-Analyse</button>
        <button class="btn-primary" style="font-size:11px" onclick="addUseCase()">+ Hinzufügen</button>
      </div>
    </div>
    ${rows.map(uc => `
      <div style="background:var(--s2);border:1px solid var(--b1);border-radius:var(--r);
        padding:12px 14px;margin-bottom:8px;cursor:pointer" onclick="expandUseCase('uc-${uc.id}')">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <span style="font-size:10px;font-family:var(--mono);color:var(--ab);margin-right:6px">${uc.id}</span>
            <span style="font-size:13px;font-weight:600">${esc(uc.title)}</span>
            <span style="font-size:11px;color:var(--t3);margin-left:8px">Akteur: ${esc(uc.actor)}</span>
          </div>
          <button onclick="event.stopPropagation();deleteUseCase('${uc.id}')"
            style="background:transparent;border:none;color:var(--t3);cursor:pointer">✕</button>
        </div>
        <div id="uc-${uc.id}" style="display:none;margin-top:10px">
          ${[
            ['Ziel', uc.description],
            ['Vorbedingungen', uc.preconditions],
            ['Hauptablauf', uc.main_flow],
            ['Alternativszenarien', uc.alt_flows],
            ['Nachbedingungen', uc.postconditions],
          ].filter(([,v])=>v).map(([k,v]) => `
            <div style="margin-top:6px">
              <div style="font-size:10px;font-weight:600;color:var(--t3)">${k}</div>
              <div style="font-size:12px;white-space:pre-line">${esc(v)}</div>
            </div>`).join('')}
        </div>
      </div>`).join('')
    || '<div class="empty-state"><div class="es-icon">📋</div><p>Noch keine Use Cases — KI-Analyse oder manuell hinzufügen</p></div>'}`;
}

function expandUseCase(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function addUseCase() {
  openModal('Use Case hinzufügen', `
    <div class="frow"><label>Titel</label><input id="uc-title" placeholder="UC-001: Benutzer anmelden"/></div>
    <div class="frow"><label>Primärer Akteur</label><input id="uc-actor" placeholder="z.B. Endnutzer"/></div>
    <div class="frow"><label>Beschreibung / Ziel</label>
      <textarea id="uc-desc" rows="2" placeholder="Was will der Akteur erreichen?"></textarea></div>
    <div class="frow"><label>Vorbedingungen</label>
      <textarea id="uc-pre" rows="2" placeholder="Was muss gegeben sein?"></textarea></div>
    <div class="frow"><label>Hauptablauf</label>
      <textarea id="uc-main" rows="4" placeholder="1. Akteur gibt Daten ein\n2. System prüft..."></textarea></div>
    <div class="frow"><label>Alternativszenarien</label>
      <textarea id="uc-alt" rows="2" placeholder="Was passiert bei Fehler/Ausnahme?"></textarea></div>
    <div class="frow"><label>Nachbedingungen</label>
      <textarea id="uc-post" rows="2" placeholder="Was ist der Endzustand?"></textarea></div>
    <div class="modal-footer-actions">
      <button class="btn-primary" onclick="saveUseCase()">Speichern</button>
      <button class="btn-secondary" onclick="closeModal()">Abbrechen</button>
    </div>`);
}

async function saveUseCase() {
  const body = {
    title:          document.getElementById('uc-title')?.value.trim(),
    actor:          document.getElementById('uc-actor')?.value.trim(),
    description:    document.getElementById('uc-desc')?.value.trim(),
    preconditions:  document.getElementById('uc-pre')?.value.trim(),
    main_flow:      document.getElementById('uc-main')?.value.trim(),
    alt_flows:      document.getElementById('uc-alt')?.value.trim(),
    postconditions: document.getElementById('uc-post')?.value.trim(),
  };
  if (!body.title) { toast('⚠ Titel fehlt'); return; }
  await fetch(`api/systems/${S.activeSystemId}/use-cases`, {
    method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body),
  });
  closeModal();
  toast('✅ Use Case gespeichert');
  loadAnalysisTab('use-cases');
}

async function deleteUseCase(id) {
  await fetch(`api/systems/${S.activeSystemId}/use-cases/${id}`, {method:'DELETE',credentials:'include'});
  loadAnalysisTab('use-cases');
}

// ── Qualitätsziele ────────────────────────────────────────────
async function renderQualityGoals(el, sysId) {
  const rows = await fetch(`api/systems/${sysId}/quality-goals`, {credentials:'include'}).then(r=>r.json());
  const byChar = {};
  ISO_CHARS.forEach(c => { byChar[c] = []; });
  rows.forEach(r => { if (byChar[r.iso_char]) byChar[r.iso_char].push(r); });

  el.innerHTML = `
    <div style="display:flex;justify-content:flex-end;gap:6px;margin-bottom:12px">
      <button class="btn-secondary" style="font-size:11px" onclick="aiAnalyze('quality-goals')">🤖 KI-Analyse</button>
      <button class="btn-primary" style="font-size:11px" onclick="addQualityGoal()">+ Hinzufügen</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px">
      ${ISO_CHARS.map(char => {
        const goals = byChar[char] || [];
        return `<div style="background:var(--s2);border:1px solid var(--b1);border-radius:var(--r);padding:12px">
          <div style="font-size:12px;font-weight:600;color:var(--aa);margin-bottom:8px">${char}</div>
          ${goals.map(g => `
            <div style="border-top:1px solid var(--b1);padding-top:8px;margin-top:8px">
              <div style="font-size:12px">${esc(g.description)}</div>
              ${g.measure ? `<div style="font-size:10px;color:var(--t3);margin-top:3px">📐 ${esc(g.measure)}</div>` : ''}
              ${g.target ? `<div style="font-size:10px;color:var(--grn);margin-top:2px">🎯 Ziel: ${esc(g.target)}</div>` : ''}
              <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px">
                <span style="font-size:10px;color:var(--t3)">${g.priority}</span>
                <button onclick="deleteQualityGoal('${g.id}')"
                  style="background:transparent;border:none;color:var(--t3);cursor:pointer;font-size:12px">✕</button>
              </div>
            </div>`).join('')}
          ${!goals.length ? '<div style="font-size:11px;color:var(--t3)">Kein Ziel definiert</div>' : ''}
        </div>`;
      }).join('')}
    </div>`;
}

function addQualityGoal() {
  openModal('Qualitätsziel hinzufügen (ISO-25010)', `
    <div class="frow"><label>ISO-25010 Charakteristik</label>
      <select id="qg-char">${ISO_CHARS.map(c => `<option>${c}</option>`).join('')}</select></div>
    <div class="frow"><label>Beschreibung</label>
      <textarea id="qg-desc" rows="2" placeholder="Das System soll..."></textarea></div>
    <div class="frow"><label>Messmethode</label>
      <input id="qg-measure" placeholder="z.B. Antwortzeit messen über Lasttest"/></div>
    <div class="frow"><label>Zielwert</label>
      <input id="qg-target" placeholder="z.B. < 200ms bei 100 gleichzeitigen Nutzern"/></div>
    <div class="frow"><label>Priorität</label>
      <select id="qg-prio">
        <option value="hoch">Hoch</option>
        <option value="mittel" selected>Mittel</option>
        <option value="niedrig">Niedrig</option>
      </select></div>
    <div class="modal-footer-actions">
      <button class="btn-primary" onclick="saveQualityGoal()">Speichern</button>
      <button class="btn-secondary" onclick="closeModal()">Abbrechen</button>
    </div>`);
}

async function saveQualityGoal() {
  const body = {
    iso_char: document.getElementById('qg-char')?.value,
    description: document.getElementById('qg-desc')?.value.trim(),
    measure: document.getElementById('qg-measure')?.value.trim(),
    target: document.getElementById('qg-target')?.value.trim(),
    priority: document.getElementById('qg-prio')?.value,
  };
  if (!body.description) { toast('⚠ Beschreibung fehlt'); return; }
  await fetch(`api/systems/${S.activeSystemId}/quality-goals`, {
    method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body),
  });
  closeModal();
  toast('✅ Qualitätsziel gespeichert');
  loadAnalysisTab('quality-goals');
}

async function deleteQualityGoal(id) {
  await fetch(`api/systems/${S.activeSystemId}/quality-goals/${id}`, {method:'DELETE',credentials:'include'});
  loadAnalysisTab('quality-goals');
}

// ── SMART-Qualitätsprüfung ─────────────────────────────────────
async function renderSmartCheck(el, sysId) {
  const reqs = (S.requirements||[]).filter(r => r.systemId === sysId);
  if (!reqs.length) {
    el.innerHTML = '<div class="empty-state"><div class="es-icon">⭐</div><p>Keine Anforderungen vorhanden</p></div>';
    return;
  }

  el.innerHTML = `
    <p style="font-size:12px;color:var(--t3);margin-bottom:12px">
      Klicke auf eine Anforderung um eine KI-gestützte SMART-Qualitätsprüfung nach IEEE-830 und ISO-25010 durchzuführen.
    </p>
    <div style="display:flex;flex-direction:column;gap:6px">
      ${reqs.map(r => {
        const score = r.quality_score;
        const scoreColor = score >= 80 ? 'var(--grn)' : score >= 50 ? 'var(--amb)' : score ? 'var(--red)' : 'var(--t3)';
        return `<div style="background:var(--s2);border:1px solid var(--b1);border-radius:var(--r);
          padding:10px 12px;display:flex;gap:10px;align-items:center">
          <div style="flex:1;min-width:0">
            <div style="font-size:12px;font-weight:600">${esc(r.title)}</div>
            <div style="font-size:10px;color:var(--t3);margin-top:2px">${esc(r.id)} · ${esc(r.category||'')} · ${esc(r.priority||'')}</div>
            ${r.iso_category ? `<div style="font-size:10px;color:var(--ab);margin-top:2px">ISO: ${esc(r.iso_category)}</div>` : ''}
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div style="font-size:20px;font-weight:700;color:${scoreColor}">${score != null ? score : '—'}</div>
            <div style="font-size:9px;color:var(--t3)">/100</div>
          </div>
          <button class="btn-secondary" style="font-size:11px;padding:5px 10px;flex-shrink:0"
            onclick="runSmartCheck('${r.id}', this)">
            ${score != null ? '🔄 Neu prüfen' : '⭐ Prüfen'}
          </button>
        </div>`;
      }).join('')}
    </div>`;
}

async function runSmartCheck(reqId, btn) {
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span>'; }
  try {
    // RAG-Kontext für diesen spezifischen Req vorab laden und mitsenden
    const req = (S.requirements||[]).find(r => r.id === reqId);
    const ragHint = req && typeof getRAGContextForQuery === 'function'
      ? await getRAGContextForQuery(req.systemId, req.title + ' ' + (req.description||''), { role: 'deep' }).catch(()=>'')
      : '';

    const res = await fetch(`api/requirements/${reqId}/quality-check`, {
      method:'POST', credentials:'include',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ ragContext: ragHint.substring(0, 8000) }),
    });
    const data = await res.json();
    if (!data.ok) { toast('❌ ' + (data.error||'Fehler')); return; }
    showSmartResult(reqId, data.result);
  } catch(e) {
    toast('❌ ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '🔄 Neu prüfen'; }
  }
}

// ── Konsistenz ────────────────────────────────────────────────
async function renderConsistencyTab(el, sysId) {
  el.innerHTML = `
    <div style="padding:8px 0 14px">
      <p style="font-size:13px;color:var(--t2);margin-bottom:12px">
        Prüft alle Anforderungen dieses Systems auf inhaltliche Widersprüche (z.B. sich gegenseitig ausschließende Vorgaben).
      </p>
      <button class="btn-primary" id="btn-consistency-check" onclick="runConsistencyCheck('${sysId}')">
        🔍 Konsistenz prüfen
      </button>
    </div>
    <div id="consistency-results"></div>`;
}

function showSmartResult(reqId, result) {
  const scoreColor = result.overall_score >= 80 ? 'var(--grn)' : result.overall_score >= 50 ? 'var(--amb)' : 'var(--red)';
  openModal(`SMART-Analyse — Score: ${result.overall_score}/100`, `
    <!-- SMART Scores -->
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-bottom:16px">
      ${Object.entries(SMART_LABELS).map(([key, {label}]) => {
        const s = result.smart?.[key];
        const c = s?.score >= 8 ? 'var(--grn)' : s?.score >= 5 ? 'var(--amb)' : 'var(--red)';
        return `<div style="background:var(--s2);border-radius:var(--r);padding:8px;text-align:center">
          <div style="font-size:18px;font-weight:700;color:${c}">${s?.score ?? '?'}</div>
          <div style="font-size:9px;color:var(--t3)">${label}</div>
          ${s?.issue ? `<div style="font-size:9px;color:var(--amb);margin-top:3px">${esc(s.issue)}</div>` : ''}
        </div>`;
      }).join('')}
    </div>

    <!-- ISO + Verifikation -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
      <div style="background:var(--s2);border-radius:var(--r);padding:8px">
        <div style="font-size:10px;color:var(--t3)">ISO-25010</div>
        <div style="font-size:12px;margin-top:2px">${esc(result.iso_category||'—')}</div>
      </div>
      <div style="background:var(--s2);border-radius:var(--r);padding:8px">
        <div style="font-size:10px;color:var(--t3)">Verifikation</div>
        <div style="font-size:12px;margin-top:2px">${esc(result.verification_method||'—')}</div>
      </div>
      <div style="background:var(--s2);border-radius:var(--r);padding:8px">
        <div style="font-size:10px;color:var(--t3)">Risiko</div>
        <div style="font-size:12px;color:${result.risk_level==='hoch'?'var(--red)':result.risk_level==='mittel'?'var(--amb)':'var(--grn)'};margin-top:2px">${esc(result.risk_level||'—')}</div>
      </div>
      <div style="background:var(--s2);border-radius:var(--r);padding:8px">
        <div style="font-size:10px;color:var(--t3)">Business Value</div>
        <div style="font-size:12px;margin-top:2px">${result.business_value || '—'}/10</div>
      </div>
    </div>

    <!-- Verbesserungsvorschläge -->
    ${result.improved_title ? `
    <div style="background:var(--s2);border-radius:var(--r);padding:10px;margin-bottom:8px">
      <div style="font-size:10px;color:var(--t3);margin-bottom:4px">💡 Verbesserter Titel</div>
      <div style="font-size:12px">${esc(result.improved_title)}</div>
    </div>` : ''}

    ${result.improved_description ? `
    <div style="background:var(--s2);border-radius:var(--r);padding:10px;margin-bottom:8px">
      <div style="font-size:10px;color:var(--t3);margin-bottom:4px">💡 Verbesserte Beschreibung</div>
      <div style="font-size:12px">${esc(result.improved_description)}</div>
    </div>` : ''}

    <!-- Akzeptanzkriterien -->
    ${result.acceptance_criteria?.length ? `
    <div style="background:var(--s2);border-radius:var(--r);padding:10px;margin-bottom:8px">
      <div style="font-size:10px;color:var(--t3);margin-bottom:6px">✅ Akzeptanzkriterien</div>
      ${result.acceptance_criteria.map(c =>
        `<div style="font-size:11px;padding:4px 0;border-bottom:1px solid var(--b1)">${esc(c)}</div>`
      ).join('')}
    </div>` : ''}

    <!-- Konflikte -->
    ${result.conflicts?.length ? `
    <div style="background:rgba(248,81,73,.08);border:1px solid rgba(248,81,73,.2);border-radius:var(--r);padding:10px;margin-bottom:8px">
      <div style="font-size:10px;color:var(--red);margin-bottom:6px">⚠ Mögliche Konflikte</div>
      ${result.conflicts.map(c => `<div style="font-size:11px;color:var(--t2);padding:2px 0">${esc(c)}</div>`).join('')}
    </div>` : ''}

    <!-- IEEE-Issues -->
    ${result.ieee_issues?.filter(i=>i!=='...').length ? `
    <div style="background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.2);border-radius:var(--r);padding:10px;margin-bottom:8px">
      <div style="font-size:10px;color:var(--amb);margin-bottom:6px">📋 IEEE-830 Hinweise</div>
      ${result.ieee_issues.map(i => `<div style="font-size:11px;color:var(--t2);padding:2px 0">• ${esc(i)}</div>`).join('')}
    </div>` : ''}

    <div class="modal-footer-actions">
      <button class="btn-primary" onclick="applySmartImprovements('${reqId}', ${JSON.stringify(result).replace(/"/g,'&quot;')})">
        ✅ Verbesserungen übernehmen
      </button>
      <button class="btn-secondary" onclick="closeModal()">Schließen</button>
    </div>`);
}

async function applySmartImprovements(reqId, result) {
  const req = (S.requirements||[]).find(r => r.id === reqId);
  if (!req) { toast('⚠ Anforderung nicht gefunden'); return; }
  const updates = {
    title:                    result.improved_title || req.title,
    description:              result.improved_description || req.description,
    acceptance_criteria_text: (result.acceptance_criteria||[]).join('\n') || req.acceptance_criteria_text || '',
    iso_category:             result.iso_category || '',
    verification_method:      result.verification_method || '',
    risk_level:               result.risk_level || '',
    complexity:               result.complexity || '',
    business_value:           result.business_value || 0,
  };
  await window.api.saveRequirement({ ...req, ...updates });
  closeModal();
  toast('✅ Anforderung verbessert');
  if (typeof loadAnalysisTab === 'function') loadAnalysisTab('smart-check');
  // Backlog-Eintrag ggf. aktualisieren
  if (typeof scheduleAutoEpicUpdate === 'function') {
    scheduleAutoEpicUpdate((S.requirements||[]).find(r=>r.id===reqId)?.systemId || S.activeSystemId);
  }
}

// ── KI-Vollanalyse ────────────────────────────────────────────
async function runFullAnalysis() {
  const sysId = S.activeSystemId;
  if (!sysId) { toast('⚠ System auswählen'); return; }

  openModal('🤖 KI-Vollanalyse', `
    <p style="font-size:12px;color:var(--t3);margin-bottom:16px">
      Die KI analysiert das System und identifiziert Stakeholder, Systemgrenzen, Use Cases und Qualitätsziele.
      Bestehende Einträge werden <strong>nicht</strong> überschrieben.
    </p>
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">
      ${[
        ['stakeholders', '👥', 'Stakeholder identifizieren'],
        ['boundaries', '🗺', 'Systemgrenzen definieren'],
        ['use-cases', '📋', 'Use Cases ableiten'],
        ['quality-goals', '🎯', 'Qualitätsziele (ISO-25010)'],
        ['full', '🔬', 'Alles + Lücken & Empfehlungen'],
      ].map(([aspect, icon, label]) => `
        <button class="btn-secondary" style="text-align:left;padding:10px 14px;font-size:12px"
          onclick="runAiAnalysis('${aspect}', this)">
          ${icon} ${label}
        </button>`).join('')}
    </div>
    <div id="analysis-result" style="display:none"></div>
    <div class="modal-footer-actions">
      <button class="btn-secondary" onclick="closeModal()">Schließen</button>
    </div>`);
}

async function aiAnalyze(aspect) {
  runFullAnalysis();
  // Kurz warten bis Modal offen, dann direkt ausführen
  setTimeout(() => {
    const btn = document.querySelector(`button[onclick="runAiAnalysis('${aspect}', this)"]`);
    if (btn) btn.click();
  }, 100);
}

async function runAiAnalysis(aspect, btn) {
  const sysId = S.activeSystemId;
  if (!sysId) return;

  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Analysiere…'; }

  const resultEl = document.getElementById('analysis-result');
  if (resultEl) { resultEl.style.display = 'none'; }

  try {
    const res = await fetch(`api/systems/${sysId}/analyze-requirements`, {
      method:'POST', credentials:'include',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ aspect }),
    });
    const data = await res.json();
    if (!data.ok) { toast('❌ ' + (data.error||'Fehler')); return; }

    const { result } = data;
    let saved = 0;

    // Ergebnisse speichern
    if (aspect === 'stakeholders' || aspect === 'full') {
      for (const sh of (result.stakeholders || result || [])) {
        await fetch(`api/systems/${sysId}/stakeholders`, {
          method:'POST', credentials:'include',
          headers:{'Content-Type':'application/json'}, body:JSON.stringify(sh),
        }).catch(() => {});
        saved++;
      }
    }
    if (aspect === 'boundaries' || aspect === 'full') {
      for (const b of (result.boundaries || result || [])) {
        await fetch(`api/systems/${sysId}/boundaries`, {
          method:'POST', credentials:'include',
          headers:{'Content-Type':'application/json'}, body:JSON.stringify(b),
        }).catch(() => {});
        saved++;
      }
    }
    if (aspect === 'use-cases' || aspect === 'full') {
      const items = result.use_cases || result || [];
      for (const uc of items) {
        await fetch(`api/systems/${sysId}/use-cases`, {
          method:'POST', credentials:'include',
          headers:{'Content-Type':'application/json'}, body:JSON.stringify(uc),
        }).catch(() => {});
        saved++;
      }
    }
    if (aspect === 'quality-goals' || aspect === 'full') {
      const items = result.quality_goals || result || [];
      for (const g of items) {
        await fetch(`api/systems/${sysId}/quality-goals`, {
          method:'POST', credentials:'include',
          headers:{'Content-Type':'application/json'}, body:JSON.stringify(g),
        }).catch(() => {});
        saved++;
      }
    }

    // Für Vollanalyse: Lücken und Empfehlungen anzeigen
    if (aspect === 'full' && resultEl) {
      resultEl.style.display = 'block';
      resultEl.innerHTML = `
        <div style="border-top:1px solid var(--b1);padding-top:12px;margin-top:8px">
          ${result.gaps?.length ? `
          <div style="margin-bottom:10px">
            <div style="font-size:11px;font-weight:600;color:var(--red);margin-bottom:6px">⚠ Erkannte Lücken</div>
            ${result.gaps.map(g => `<div style="font-size:11px;padding:3px 0;color:var(--t2)">• ${esc(g)}</div>`).join('')}
          </div>` : ''}
          ${result.conflicts?.length ? `
          <div style="margin-bottom:10px">
            <div style="font-size:11px;font-weight:600;color:var(--amb);margin-bottom:6px">🔀 Mögliche Widersprüche</div>
            ${result.conflicts.map(c => `<div style="font-size:11px;padding:3px 0;color:var(--t2)">• ${esc(c)}</div>`).join('')}
          </div>` : ''}
          ${result.recommendations?.length ? `
          <div>
            <div style="font-size:11px;font-weight:600;color:var(--grn);margin-bottom:6px">💡 Empfehlungen</div>
            ${result.recommendations.map(r => `<div style="font-size:11px;padding:3px 0;color:var(--t2)">• ${esc(r)}</div>`).join('')}
          </div>` : ''}
        </div>`;
    }

    toast(`✅ ${saved} Einträge gespeichert`);
    loadAnalysisTab(aspect === 'full' ? 'stakeholders' : aspect);

  } catch(e) {
    toast('❌ ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = btn.textContent.trim() || 'Fertig'; }
  }
}

// Window exports
window.loadReqAnalysis         = loadReqAnalysis;
window.loadAnalysisTab         = loadAnalysisTab;
window.addStakeholder          = addStakeholder;
window.saveStakeholder         = saveStakeholder;
window.deleteStakeholder       = deleteStakeholder;
window.addBoundary             = addBoundary;
window.saveBoundary            = saveBoundary;
window.deleteBoundary          = deleteBoundary;
window.addUseCase              = addUseCase;
window.saveUseCase             = saveUseCase;
window.deleteUseCase           = deleteUseCase;
window.expandUseCase           = expandUseCase;
window.addQualityGoal          = addQualityGoal;
window.saveQualityGoal         = saveQualityGoal;
window.deleteQualityGoal       = deleteQualityGoal;
window.runSmartCheck           = runSmartCheck;
window.applySmartImprovements  = applySmartImprovements;
window.runFullAnalysis         = runFullAnalysis;
window.runAiAnalysis           = runAiAnalysis;
window.aiAnalyze               = aiAnalyze;
