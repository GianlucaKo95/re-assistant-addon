'use strict';
const $ = window.$ || (id => document.getElementById(id));
/**
 * features/pipeline.js
 * Nr. 3: Durchgehende Pipeline Workshop → Requirements → Backlog
 * Ein Klick statt drei getrennte Workflows.
 */

async function openPipelineWizard(startFrom, sourceId) {
  // startFrom: 'workshop' | 'requirements'
  openModal('⚡ Pipeline-Assistent', `
    <div id="pipeline-wizard">
      <div id="pipeline-steps">
        <div class="pipeline-step active" id="pstep-1">
          <div class="pstep-num">1</div>
          <div class="pstep-label">Quelle</div>
        </div>
        <div class="pipeline-step-arrow">→</div>
        <div class="pipeline-step" id="pstep-2">
          <div class="pstep-num">2</div>
          <div class="pstep-label">Requirements</div>
        </div>
        <div class="pipeline-step-arrow">→</div>
        <div class="pipeline-step" id="pstep-3">
          <div class="pstep-num">3</div>
          <div class="pstep-label">QS</div>
        </div>
        <div class="pipeline-step-arrow">→</div>
        <div class="pipeline-step" id="pstep-4">
          <div class="pstep-num">4</div>
          <div class="pstep-label">Backlog</div>
        </div>
      </div>
      <div id="pipeline-content" style="margin-top:16px"></div>
      <div id="pipeline-actions" style="display:flex;gap:8px;margin-top:14px;padding-top:14px;border-top:1px solid var(--b1)">
        <button class="btn-secondary" onclick="closeModal()">Abbrechen</button>
      </div>
    </div>`);

  injectPipelineStyles();
  window._pipeline = { step:1, sourceId, startFrom, reqs:[], systemId:null, backlog:null };
  await pipelineStep1();
}

async function pipelineStep1() {
  const w    = window._pipeline;
  const cont = $('pipeline-content');
  activePipelineStep(1);

  if (w.startFrom === 'workshop') {
    const workshops = await window.api.getWorkshops('');
    const ws = workshops.find(x => x.id === w.sourceId) || workshops[0];
    if (!ws) { cont.innerHTML = '<p style="color:var(--red)">Kein Workshop gefunden.</p>'; return; }

    cont.innerHTML = `
      <div style="font-size:13px;font-weight:600;margin-bottom:8px">Workshop auswählen</div>
      <select id="pl-ws-sel" style="width:100%;margin-bottom:10px">
        ${workshops.map(x => `<option value="${x.id}"${x.id===ws.id?' selected':''}>${esc(x.name)}</option>`).join('')}
      </select>
      <div id="pl-ws-preview"></div>`;

    const updatePreview = async () => {
      const sel = $(document.getElementById('pl-ws-sel').value ? 'pl-ws-sel' : null);
      const wsId = $('pl-ws-sel').value;
      const selWs = workshops.find(x => x.id === wsId);
      if (!selWs) return;
      const reqs = (selWs.structured?.requirements || []);
      $('pl-ws-preview').innerHTML = `
        <div style="background:var(--s2);border-radius:var(--r);padding:10px 12px;font-size:12px">
          <div style="font-weight:600;margin-bottom:6px">Gefundene Anforderungen (${reqs.length}):</div>
          ${reqs.slice(0,5).map(r => `<div style="color:var(--t2);padding:2px 0">• ${esc(r)}</div>`).join('')}
          ${reqs.length > 5 ? `<div style="color:var(--t3)">… ${reqs.length-5} weitere</div>` : ''}
        </div>`;
    };
    await updatePreview();
    $('pl-ws-sel').onchange = updatePreview;

  } else {
    // startFrom = 'requirements'
    cont.innerHTML = `<p style="font-size:13px;color:var(--t2)">Anforderungen aus einem System in die Pipeline übernehmen.</p>`;
  }

  $('pipeline-actions').innerHTML = `
    <button class="btn-secondary" onclick="closeModal()">Abbrechen</button>
    <button class="btn-primary" onclick="pipelineStep2()">Weiter →</button>`;
}

async function pipelineStep2() {
  const w    = window._pipeline;
  const cont = $('pipeline-content');
  activePipelineStep(2);

  // System auswählen + Requirements extrahieren/auswählen
  const systems = S.systems;
  cont.innerHTML = `
    <div style="font-size:13px;font-weight:600;margin-bottom:8px">Ziel-System wählen</div>
    <select id="pl-sys-sel" style="width:100%;margin-bottom:12px">
      ${systems.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}
    </select>

    <div style="font-size:13px;font-weight:600;margin-bottom:8px">Requirements aus Workshop extrahieren</div>
    <div id="pl-req-list" style="max-height:200px;overflow-y:auto;border:1px solid var(--b1);border-radius:var(--r);padding:8px"></div>
    <div style="display:flex;gap:8px;margin-top:8px">
      <button class="btn-secondary" style="font-size:11px" onclick="pipelineExtractReqs()">✦ KI extrahieren</button>
    </div>`;

  // Wenn Workshop → direkt extrahieren
  if (w.startFrom === 'workshop') {
    await pipelineExtractReqs();
  }

  $('pipeline-actions').innerHTML = `
    <button class="btn-secondary" onclick="pipelineStep1()">← Zurück</button>
    <button class="btn-primary" onclick="pipelineStep3()">Weiter → QS</button>`;
}

async function pipelineExtractReqs() {
  const list = $('pl-req-list');
  list.innerHTML = '<div class="spin"></div> Extrahiere …';

  const w = window._pipeline;
  let rawReqs = [];

  if (w.startFrom === 'workshop') {
    const wsId    = $('pl-ws-sel')?.value || w.sourceId;
    const wsList  = await window.api.getWorkshops('');
    const ws      = wsList.find(x => x.id === wsId);
    rawReqs = (ws?.structured?.requirements || []).map(t => ({ title: t.substring(0,80), description:t }));
  }

  if (!rawReqs.length) {
    list.innerHTML = '<div style="font-size:12px;color:var(--t3);padding:8px">Keine Anforderungen gefunden.</div>';
    return;
  }

  // KI verbessert die extrahierten Requirements
  const res = await callAPI([{ role:'user', content:
    `Verbessere und strukturiere diese Requirements. ${langNote()}
JSON ohne Backticks:
[{"title":"...","description":"...","category":"Funktional","priority":"medium"}]

Input:
${rawReqs.map(r => r.title).join('\n')}` }], langNote(), 1500);

  try {
    const improved = JSON.parse(res.text.replace(/```json|```/g,'').trim());
    w.reqs = improved;
    list.innerHTML = improved.map((r, i) => `
      <div style="display:flex;align-items:flex-start;gap:8px;padding:6px 0;border-bottom:1px solid var(--b1)">
        <input type="checkbox" checked id="pl-req-${i}" style="flex-shrink:0;margin-top:2px"/>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:600">${esc(r.title)}</div>
          <div style="font-size:11px;color:var(--t3)">${esc(r.category)} · ${esc(r.priority)}</div>
        </div>
      </div>`).join('');
  } catch(e) {
    list.innerHTML = rawReqs.map((r,i) => `<div style="font-size:12px;padding:4px 0">• ${esc(r.title)}</div>`).join('');
    w.reqs = rawReqs;
  }
}

async function pipelineStep3() {
  const w    = window._pipeline;
  const cont = $('pipeline-content');
  activePipelineStep(3);

  // Ausgewählte Reqs speichern
  const sysId = $('pl-sys-sel')?.value;
  if (!sysId) { toast('⚠ System auswählen'); return; }
  w.systemId = sysId;

  const selected = (w.reqs || []).filter((_, i) => !document.getElementById(`pl-req-${i}`) || document.getElementById(`pl-req-${i}`).checked);

  // Requirements speichern
  const savedIds = [];
  for (const r of selected) {
    const id = 'REQ-' + Date.now() + '-' + Math.floor(Math.random()*1000);
    await window.api.saveRequirement({
      ...r, id, systemId: sysId, createdBy: S.user.id, createdByName: S.user.name, status:'open',
    });
    savedIds.push(id);
  }
  w.savedReqIds = savedIds;

  // QS-Score berechnen
  cont.innerHTML = '<div class="empty-state"><div class="spin"></div><p>Führe QS-Prüfung durch …</p></div>';

  const allReqs = await window.api.getRequirements({ systemId: sysId });
  const toCheck = allReqs.filter(r => savedIds.includes(r.id));
  const rl = toCheck.map(r => `ID:${r.id}\nTitel: ${r.title}\nBeschreibung: ${r.description||''}`).join('\n\n---\n\n');

  const qsRes = await callAPI([{ role:'user', content:
    `Bewerte kurz nach ISO 29148. JSON ohne Backticks:
[{"reqId":"REQ-001","score":7,"issues":[{"type":"ambiguity","text":"..."}]}]
${rl}` }], langNote(), 2000);

  let qsResults = [];
  try { qsResults = JSON.parse(qsRes.text.replace(/```json|```/g,'').trim()); } catch(e) {}

  // Scores speichern
  for (const qr of qsResults) {
    const req = toCheck.find(r => r.id === qr.reqId);
    if (req) await window.api.saveRequirement({ ...req, qualityScore: qr.score });
  }

  const avgQS = qsResults.length ? (qsResults.reduce((s,r) => s+r.score,0)/qsResults.length).toFixed(1) : '—';
  const lowCount = qsResults.filter(r => r.score < 5).length;

  cont.innerHTML = `
    <div style="text-align:center;padding:16px 0">
      <div style="font-size:36px;margin-bottom:8px">🔬</div>
      <div style="font-size:15px;font-weight:600">${selected.length} Requirements gespeichert</div>
      <div style="font-size:13px;color:var(--t2);margin-top:4px">Ø QS-Score: <strong>${avgQS}/10</strong></div>
      ${lowCount ? `<div style="font-size:12px;color:var(--red);margin-top:4px">${lowCount} Anforderung(en) mit Score &lt; 5</div>` : ''}
    </div>`;

  $('pipeline-actions').innerHTML = `
    <button class="btn-secondary" onclick="closeModal();switchView('ba-quality')">QS Details ansehen</button>
    <button class="btn-primary" onclick="pipelineStep4()">Weiter → Backlog ⚡</button>`;
}

async function pipelineStep4() {
  const w    = window._pipeline;
  const cont = $('pipeline-content');
  activePipelineStep(4);

  cont.innerHTML = '<div class="empty-state"><div class="spin"></div><p>Erstelle Backlog …</p></div>';

  const reqs   = await window.api.getRequirements({ systemId: w.systemId });
  const toUse  = reqs.filter(r => w.savedReqIds.includes(r.id));
  const rl     = toUse.map(r => `${r.id}: ${r.title} [${r.priority}]`).join('\n');
  const sys    = S.systems.find(s => s.id === w.systemId);

  const res = await callAPI([{ role:'user', content:
    `Erstelle strukturiertes Backlog. ${langNote()}
JSON ohne Backticks:
{"epics":[{"id":"EPIC-1","title":"...","description":"...","features":[{"id":"FEAT-1.1","title":"...","stories":[{"id":"US-1.1.1","title":"...","description":"...","storyPoints":5,"priority":"medium","reqRef":"REQ-001"}]}]}]}

Anforderungen:
${rl}` }], langNote(), 2000);

  try {
    const bl = JSON.parse(res.text.replace(/```json|```/g,'').trim());
    const backlog = { id:null, systemId:w.systemId, systemName:sys?.name||'', epics:bl.epics, createdAt:Date.now() };
    await window.api.saveBacklog(backlog);
    S.currentBacklog = backlog;

    cont.innerHTML = `
      <div style="text-align:center;padding:16px 0">
        <div style="font-size:36px;margin-bottom:8px">🎉</div>
        <div style="font-size:15px;font-weight:600">Pipeline abgeschlossen!</div>
        <div style="font-size:13px;color:var(--t2);margin-top:6px;line-height:1.6">
          ✅ ${toUse.length} Requirements gespeichert<br>
          ✅ QS-Prüfung durchgeführt<br>
          ✅ ${(bl.epics||[]).length} Epics im Backlog erstellt
        </div>
      </div>`;

    if (typeof addNotif === 'function')
      addNotif('⚡', 'Pipeline abgeschlossen', `${toUse.length} Reqs → QS → ${(bl.epics||[]).length} Epics`,
        () => switchView('pm-backlog'));

    $('pipeline-actions').innerHTML = `
      <button class="btn-secondary" onclick="closeModal()">Schließen</button>
      <button class="btn-primary" onclick="closeModal();switchView('pm-backlog')">Backlog ansehen</button>`;

  } catch(e) {
    cont.innerHTML = '<p style="color:var(--red)">❌ Backlog-Erstellung fehlgeschlagen.</p>';
  }
}

function activePipelineStep(n) {
  for (let i = 1; i <= 4; i++) {
    const el = $(`pstep-${i}`);
    if (!el) continue;
    el.classList.toggle('active', i === n);
    el.classList.toggle('done', i < n);
  }
}

function injectPipelineStyles() {
  if (document.getElementById('pipeline-styles')) return;
  const s = document.createElement('style');
  s.id = 'pipeline-styles';
  s.textContent = `
    #pipeline-steps{display:flex;align-items:center;gap:6px;margin-bottom:4px}
    .pipeline-step{display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:99px;
      background:var(--s2);border:1px solid var(--b1);font-size:12px;transition:all .2s}
    .pipeline-step.active{background:rgba(168,85,247,.15);border-color:rgba(168,85,247,.4);color:var(--aa)}
    .pipeline-step.done{background:var(--grnbg);border-color:rgba(52,211,153,.3);color:var(--grn)}
    .pstep-num{width:20px;height:20px;border-radius:50%;background:currentColor;color:white;
      display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;opacity:.8}
    .pipeline-step-arrow{color:var(--t3);font-size:14px}`;
  document.head.appendChild(s);
}

window.openPipelineWizard  = openPipelineWizard;
window.pipelineStep1       = pipelineStep1;
window.pipelineStep2       = pipelineStep2;
window.pipelineStep3       = pipelineStep3;
window.pipelineStep4       = pipelineStep4;
window.pipelineExtractReqs = pipelineExtractReqs;
