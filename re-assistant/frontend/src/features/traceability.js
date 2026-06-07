'use strict';\nconst $ = window.$ || (id => document.getElementById(id));
/**
 * features/traceability.js
 * Nr. 7: Vollständige Traceability-Matrix
 * Business-Req → User Story → Akzeptanzkriterium → Source-Datei
 */

async function loadTraceability() {
  S.systems = await window.api.getSystems();
  const sel = $('trace-sys-sel');
  if (sel) {
    sel.innerHTML = '<option value="">System wählen …</option>' +
      S.systems.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
    sel.onchange = renderTraceabilityMatrix;
  }
  $('btn-export-trace')?.addEventListener('click', exportTraceabilityMatrix);
  $('btn-build-trace')?.addEventListener('click', buildTraceabilityWithAI);
}

async function renderTraceabilityMatrix() {
  const sysId = $('trace-sys-sel')?.value;
  if (!sysId) return;

  const wrap = $('trace-matrix-wrap');
  if (!wrap) return;
  wrap.innerHTML = '<div class="empty-state"><div class="spin"></div><p>Lade Traceability-Daten …</p></div>';

  const allReqs  = await window.api.getRequirements({ systemId: sysId });
  const backlogs = await window.api.getBacklogs(sysId);
  const sys      = S.systems.find(s => s.id === sysId);
  const lastBL   = backlogs[backlogs.length - 1];

  if (!allReqs.length) {
    wrap.innerHTML = '<div class="empty-state"><h3>Keine Anforderungen</h3></div>';
    return;
  }

  // Traceability-Daten aufbauen
  const matrix = allReqs.map(req => {
    // User Stories aus Backlog verlinkt?
    const linkedStories = [];
    if (lastBL) {
      for (const epic of lastBL.epics || [])
        for (const feat of epic.features || [])
          for (const story of feat.stories || [])
            if (story.reqRef === req.id) linkedStories.push({ ...story, epicTitle: epic.title, featureTitle: feat.title });
    }

    // Source-Dateien aus sourceAnalysis
    const sourceFiles = (req.sourceAnalysis?.affectedFiles || []).map(f => f.file);

    // AC-Fortschritt
    const ac = req.acceptanceCriteria || [];
    const acDone = ac.filter(a => a.done).length;

    return {
      req,
      stories:     linkedStories,
      sourceFiles,
      ac,
      acDone,
      acTotal:     ac.length,
      complete:    linkedStories.length > 0 && (ac.length === 0 || acDone === ac.length),
    };
  });

  const completePct = Math.round((matrix.filter(m => m.complete).length / matrix.length) * 100);

  wrap.innerHTML = `
    <!-- Summary -->
    <div class="stats-row" style="flex-shrink:0">
      <div class="stat-card accent">
        <span class="stat-n">${matrix.length}</span>
        <span class="stat-l">Anforderungen</span>
      </div>
      <div class="stat-card">
        <span class="stat-n">${matrix.reduce((s,m)=>s+m.stories.length,0)}</span>
        <span class="stat-l">User Stories</span>
      </div>
      <div class="stat-card">
        <span class="stat-n">${matrix.reduce((s,m)=>s+m.acTotal,0)}</span>
        <span class="stat-l">Akzeptanzkriterien</span>
      </div>
      <div class="stat-card">
        <span class="stat-n">${completePct}%</span>
        <span class="stat-l">Traceability</span>
      </div>
    </div>

    <!-- Fortschrittsbalken -->
    <div style="padding:0 20px 12px;flex-shrink:0">
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--t3);margin-bottom:4px">
        <span>Traceability-Abdeckung</span>
        <span style="color:${completePct>=80?'var(--grn)':completePct>=50?'var(--amb)':'var(--red)'}">${completePct}%</span>
      </div>
      <div style="height:6px;background:var(--s3);border-radius:3px;overflow:hidden">
        <div style="height:100%;width:${completePct}%;background:${completePct>=80?'var(--grn)':completePct>=50?'var(--amb)':'var(--red)'};border-radius:3px;transition:width .5s"></div>
      </div>
    </div>

    <!-- Matrix-Tabelle -->
    <div style="flex:1;overflow:auto;padding:0 20px 16px">
      <table class="data-table" style="min-width:800px">
        <thead><tr>
          <th style="min-width:180px">Anforderung</th>
          <th style="min-width:60px">Prio</th>
          <th style="min-width:60px">Status</th>
          <th style="min-width:80px">QS Score</th>
          <th style="min-width:120px">User Stories</th>
          <th style="min-width:100px">AC</th>
          <th style="min-width:120px">Source-Dateien</th>
          <th style="min-width:80px">Vollständig</th>
        </tr></thead>
        <tbody>
          ${matrix.map(m => `<tr>
            <td>
              <div class="req-id">${esc(m.req.id)}</div>
              <div style="font-size:12px;font-weight:600;margin-top:2px">${esc(m.req.title)}</div>
            </td>
            <td><span class="sbadge p-${m.req.priority}">${priLabel(m.req.priority)}</span></td>
            <td><span class="sbadge s-${m.req.status}">${statusLabel(m.req.status)}</span></td>
            <td>
              ${m.req.qualityScore != null
                ? `<span style="font-weight:700;color:${m.req.qualityScore>=7?'var(--grn)':m.req.qualityScore>=4?'var(--amb)':'var(--red)'}">${m.req.qualityScore}/10</span>`
                : '<span style="color:var(--t3)">—</span>'}
            </td>
            <td>
              ${m.stories.length
                ? m.stories.map(s => `<span class="rtag" style="display:block;margin-bottom:2px;font-size:9px">${esc(s.id)}</span>`).join('')
                : `<button class="btn-secondary" style="font-size:9px;padding:2px 7px" onclick="openPipelineWizard('requirements','${m.req.id}')">+ Backlog</button>`}
            </td>
            <td>
              ${m.acTotal
                ? `<div style="font-size:12px">${m.acDone}/${m.acTotal}</div>
                   <div style="height:4px;background:var(--s3);border-radius:2px;margin-top:3px;overflow:hidden">
                     <div style="height:100%;width:${m.acTotal?Math.round(m.acDone/m.acTotal*100):0}%;background:var(--grn);border-radius:2px"></div>
                   </div>`
                : `<button class="btn-secondary" style="font-size:9px;padding:2px 7px" onclick="openACGenerator('${m.req.id}')">+ AC</button>`}
            </td>
            <td>
              ${m.sourceFiles.length
                ? m.sourceFiles.slice(0,2).map(f => `<span style="font-family:var(--mono);font-size:9px;color:var(--ab);display:block">${esc(f.split('/').pop())}</span>`).join('') +
                  (m.sourceFiles.length>2 ? `<span style="font-size:9px;color:var(--t3)">+${m.sourceFiles.length-2}</span>` : '')
                : '<span style="color:var(--t3);font-size:11px">—</span>'}
            </td>
            <td style="text-align:center">
              ${m.complete
                ? '<span style="color:var(--grn);font-size:16px">✓</span>'
                : '<span style="color:var(--red);font-size:16px">○</span>'}
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

async function buildTraceabilityWithAI() {
  const sysId = $('trace-sys-sel')?.value;
  if (!sysId) { toast('⚠ System auswählen'); return; }
  toast('✦ KI analysiert Traceability-Lücken …');

  const reqs     = await window.api.getRequirements({ systemId: sysId });
  const noAC     = reqs.filter(r => !(r.acceptanceCriteria||[]).length);
  const noStory  = reqs.filter(r => !r.storyRef);

  openModal('✦ Traceability-Lücken', `
    <p style="font-size:13px;color:var(--t2);margin-bottom:14px">
      KI hat ${noAC.length} Anforderungen ohne AC und ${noStory.length} ohne User Story gefunden.
    </p>
    ${noAC.length ? `
      <div style="font-size:11px;font-weight:700;color:var(--amb);text-transform:uppercase;margin-bottom:8px">
        Ohne Akzeptanzkriterien (${noAC.length})
      </div>
      ${noAC.slice(0,5).map(r => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--b1);font-size:12px">
          <span>${esc(r.id)}: ${esc(r.title)}</span>
          <button class="btn-secondary" style="font-size:10px;padding:3px 9px" onclick="closeModal();openACGenerator('${r.id}')">AC generieren</button>
        </div>`).join('')}
      <button class="btn-primary" style="margin-top:10px;font-size:12px" onclick="closeModal();batchGenerateAC('${sysId}')">Alle AC generieren</button>
    ` : ''}
    <div style="margin-top:14px"><button class="btn-secondary" onclick="closeModal()">Schließen</button></div>`);
}

async function batchGenerateAC(sysId) {
  const reqs  = await window.api.getRequirements({ systemId: sysId });
  const noAC  = reqs.filter(r => !(r.acceptanceCriteria||[]).length);
  toast(`Generiere AC für ${noAC.length} Anforderungen …`);
  let done = 0;
  for (const req of noAC) {
    const res = await callAPI([{ role:'user', content:
      `Erstelle 3 testbare Akzeptanzkriterien für: "${req.title} — ${req.description||''}".
JSON ohne Backticks: {"criteria":[{"text":"...","type":"positive"}]}` }], langNote(), 500);
    try {
      const r = JSON.parse(res.text.replace(/```json|```/g,'').trim());
      await window.api.saveRequirement({ ...req, acceptanceCriteria: r.criteria.map(c=>({...c,done:false,createdAt:Date.now()})) });
      done++;
    } catch(e) {}
  }
  toast(`✅ AC für ${done}/${noAC.length} Anforderungen generiert`);
  renderTraceabilityMatrix();
}

async function exportTraceabilityMatrix() {
  const sysId = $('trace-sys-sel')?.value;
  if (!sysId) { toast('⚠ System auswählen'); return; }
  const reqs = await window.api.getRequirements({ systemId: sysId });
  const sys  = S.systems.find(s => s.id === sysId);
  const e    = v => `"${String(v||'').replace(/"/g,'""')}"`;
  let csv = 'ID,Titel,Priorität,Status,QS-Score,AC-Gesamt,AC-Erledigt,Source-Dateien,Traceability\n';
  for (const r of reqs) {
    const ac   = r.acceptanceCriteria || [];
    const src  = (r.sourceAnalysis?.affectedFiles || []).map(f => f.file).join(';');
    const done = ac.filter(a => a.done).length;
    csv += [r.id, r.title, r.priority, r.status, r.qualityScore||'', ac.length, done, src, done===ac.length&&ac.length>0?'Vollständig':'Unvollständig'].map(e).join(',') + '\n';
  }
  const blob = new Blob(['\uFEFF'+csv], { type:'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `traceability-${sys?.name||sysId}.csv`; a.click();
  URL.revokeObjectURL(a.href);
  toast('✅ Traceability-Matrix exportiert');
}

window.loadTraceability          = loadTraceability;
window.renderTraceabilityMatrix  = renderTraceabilityMatrix;
window.buildTraceabilityWithAI   = buildTraceabilityWithAI;
window.batchGenerateAC           = batchGenerateAC;
window.exportTraceabilityMatrix  = exportTraceabilityMatrix;
