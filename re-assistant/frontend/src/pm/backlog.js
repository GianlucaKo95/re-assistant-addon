'use strict';
const $ = window.$ || (id => document.getElementById(id));
/**
 * pm/backlog.js
 * PM Backlog Builder — Epics/Features/Stories, Jira-Export.
 */

/* ══ PM: BACKLOG ═════════════════════════════════════════════ */
async function loadPMBacklog(){
  S.systems=await window.api.getSystems();
  const sel=$('backlog-sys-sel');
  sel.innerHTML='<option value="">System wählen …</option>'+S.systems.filter(s=>(S.user.systems||[]).includes(s.id)).map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');
  $('btn-gen-backlog').onclick=generateBacklog;
  $('btn-bl-export-md').onclick=exportBacklogMd;
  $('btn-bl-export-jira').onclick=exportBacklogJira;
  const saved=await window.api.getBacklogs('');
  if(saved.length&&!S.currentBacklog){S.currentBacklog=saved[saved.length-1];renderBacklog(S.currentBacklog);}
  else if(!saved.length)$('backlog-area').innerHTML='<div class="empty-state"><div class="es-icon">📦</div><h3>System auswählen und Backlog generieren</h3></div>';
}
async function generateBacklog(){
  const sysId=$('backlog-sys-sel').value;if(!sysId){toast('⚠ System auswählen');return;}
  const reqs=await window.api.getRequirements({systemId:sysId});if(!reqs.length){toast('ℹ Keine Anforderungen');return;}
  const btn=$('btn-gen-backlog');btn.disabled=true;btn.innerHTML='<span class="spin"></span> Generiere …';
  $('backlog-area').innerHTML='<div class="empty-state"><div class="spin"></div><p>Erstelle Backlog …</p></div>';
  // RE-Kontext laden
  let blShCtx = '', blQgCtx = '', blCacheCtx = '';
  try {
    const [shs, qgs, cache, ucs, bounds] = await Promise.all([
      fetch('api/systems/' + sysId + '/stakeholders',  {credentials:'include'}).then(r=>r.json()).catch(()=>[]),
      fetch('api/systems/' + sysId + '/quality-goals', {credentials:'include'}).then(r=>r.json()).catch(()=>[]),
      fetch('api/embeddings/summary?systemId=' + sysId, {credentials:'include'}).then(r=>r.json()).catch(()=>null),
      fetch('api/systems/' + sysId + '/use-cases',     {credentials:'include'}).then(r=>r.json()).catch(()=>[]),
      fetch('api/systems/' + sysId + '/boundaries',    {credentials:'include'}).then(r=>r.json()).catch(()=>[]),
    ]);
    if (shs.length)   blShCtx   = 'Stakeholder: ' + shs.map(s => s.name + ' (' + s.role + ', Einfluss: ' + s.influence + ')').join('\n- ');
    if (qgs.length)   blQgCtx   = 'Qualitätsziele (ISO-25010): ' + qgs.map(g => g.iso_char + ': ' + g.description + (g.target ? ' → ' + g.target : '')).join(' | ');
    if (cache?.summary) blCacheCtx = 'SYSTEMÜBERBLICK:\n' + cache.summary.substring(0, 2500);
    if (ucs.length)   blShCtx += '\n\nUse Cases: ' + ucs.map(u => u.title + ' (' + (u.actor||'?') + ')').join(', ');
    if (bounds.filter(b=>b.type==='in_scope').length) {
      blQgCtx += '\nIm Umfang: ' + bounds.filter(b=>b.type==='in_scope').map(b=>b.description).join(', ');
    }
  } catch(e) {}

  const rl = reqs.map(r =>
    r.id + ': ' + r.title + ' [' + r.priority + '][Score:' + (r.quality_score||'—') + ']' +
    (r.business_value ? '[BV:' + r.business_value + ']' : '') +
    (r.complexity ? '[' + r.complexity + ']' : '') +
    ' — ' + (r.description||'').substring(0, 80)
  ).join('\n');

  const blSchema = '{"epics":[{"id":"EPIC-1","title":"...","description":"Welches Nutzerziel wird adressiert?","features":[{"id":"FEAT-1.1","title":"...","description":"...","stories":[{"id":"US-1.1.1","title":"Als [Stakeholder] möchte ich [Funktion] damit [Nutzen]","description":"...","storyPoints":5,"priority":"high|medium|low","acceptanceCriteria":["Gegeben...Wenn...Dann..."],"reqRef":"REQ-001"}]}]}]}';

  const blPrompt = [
    'Du bist erfahrener Product Owner. Erstelle ein strukturiertes Backlog nach SAFe/Scrum.',
    langNote(),
    blCacheCtx,
    blShCtx,
    blQgCtx,
    '',
    'REGELN:',
    '- Epics nach STAKEHOLDER-DOMÄNEN oder Geschäftsprozessen strukturieren (nicht nach Technik)',
    '- User Stories im Format: Als [konkreter Stakeholder aus der Liste] möchte ich [Funktion] damit [messbarer Nutzen]',
    '- Jeden Stakeholder aus der Liste mindestens in einer Story adressieren',
    '- Qualitätsziele (ISO-25010) als eigene Epics wenn relevant',
    '- Story Points nach Fibonacci (1,2,3,5,8,13)',
    '- Akzeptanzkriterien (Gegeben/Wenn/Dann) für jede Story',
    '- Epics nach Nutzerziel/Domäne gruppieren, nicht nach technischer Komponente',
    '- Business Value und Qualitätsziele berücksichtigen',
    '',
    'ANFORDERUNGEN:',
    rl,
    '',
    'JSON ohne Backticks:',
    blSchema,
  ].filter(Boolean).join('\n');

  const res=await callAPI([{role:'user',content:blPrompt}],
    'Du bist zertifizierter Product Owner und Scrum Master. ' + langNote(), 4000);
  btn.disabled=false;btn.innerHTML='⚡ Backlog generieren';
  if(!res.ok){toast('❌ '+res.text);return;}
  try{
    const bl=JSON.parse(res.text.replace(/```json|```/g,'').trim());
    const sys=S.systems.find(s=>s.id===sysId);
    S.currentBacklog={id:null,systemId:sysId,systemName:sys?.name||'',epics:bl.epics};
    await window.api.saveBacklog(S.currentBacklog);
    renderBacklog(S.currentBacklog);
    // Netzwerk auch neu rendern falls sichtbar
    if (document.getElementById('backlog-network-wrap')?.style.display !== 'none') {
      if (window.renderBacklogNetwork) renderBacklogNetwork(S.currentBacklog);
    }
    toast('✅ Backlog erstellt');
  }catch(e){toast('❌ Parsing-Fehler');}
}
function renderBacklog(bl){
  $('backlog-area').innerHTML=(bl.epics||[]).map(ep=>`<div class="epic-block" data-epic-id="${esc(ep.id)}">
    <div class="epic-head"><div><div class="epic-title">📦 ${esc(ep.id)}: ${esc(ep.title)}</div><div style="font-size:12px;color:var(--t2)">${esc(ep.description||'')}</div></div><span class="rtag">${(ep.features||[]).length} Features</span></div>
    <div class="epic-body">${(ep.features||[]).map(f=>`<div class="feature-block">
      <div class="feature-head">🔹 ${esc(f.id)}: ${esc(f.title)}</div>
      ${(f.stories||[]).map(s=>`<div class="story-row" data-id=\"${s.id}\" data-epic=\"${ep.id}\" data-feat=\"${f.id}\"><span class="sp-badge">${s.storyPoints||'?'} SP</span><div style="flex:1"><strong>${esc(s.id)}</strong>: ${esc(s.title)}<br/><span style="font-size:12px;color:var(--t2)">${esc(s.description||'')}</span></div><span class="sbadge p-${s.priority}">${priLabel(s.priority)}</span>${s.reqRef?`<span class="rtag" style="font-size:9px">${esc(s.reqRef)}</span>`:''}</div>`).join('')}
    </div>`).join('')}</div></div>`).join('');
}
async function exportBacklogMd(){
  if(!S.currentBacklog){toast('⚠ Kein Backlog');return;}
  let md=`# Backlog: ${S.currentBacklog.systemName||'System'}\n\n`;
  for(const ep of S.currentBacklog.epics||[]){md+=`## 📦 ${ep.id}: ${ep.title}\n${ep.description||''}\n\n`;for(const f of ep.features||[]){md+=`### 🔹 ${f.id}: ${f.title}\n\n`;for(const s of f.stories||[])md+=`- **${s.id}** (${s.storyPoints||'?'} SP, ${s.priority}): ${s.title}\n  ${s.description||''}\n`;md+='\n';}}
  await window.api.exportMarkdown({requirements:[],stories:[],projectName:S.currentBacklog.systemName,extra:md});toast('✅ Exportiert');
}
async function exportBacklogJira(){
  if(!S.settings.jiraUrl){toast('⚠ Jira-Zugangsdaten in Einstellungen eintragen');switchView('settings');return;}
  if(!S.currentBacklog){toast('⚠ Kein Backlog');return;}
  const pr=await window.api.jiraGetProjects({url:S.settings.jiraUrl,email:S.settings.jiraEmail,token:S.settings.jiraToken});
  if(!pr.ok&&!pr.values){toast('❌ Jira-Verbindung fehlgeschlagen');return;}
  const projects=pr.values||pr.data?.values||[];
  openModal('Jira-Projekt wählen',`
    <div class="frow"><label>Projekt</label><select id="bl-jira-proj">${projects.map(p=>`<option value="${esc(p.key)}">${esc(p.name)} (${esc(p.key)})</option>`).join('')}</select></div>
    <div style="display:flex;gap:8px;margin-top:8px"><button class="btn-primary" onclick="doBlJiraExport()">Exportieren</button><button class="btn-secondary" onclick="closeModal()">Abbrechen</button></div>`);
}
async function doBlJiraExport(){
  const pk=$('bl-jira-proj').value;if(!pk)return;
  const issues=[];for(const ep of S.currentBacklog.epics||[])for(const f of ep.features||[])for(const s of f.stories||[])issues.push({title:s.title,description:s.description||'',type:'Story',priority:s.priority});
  const res=await window.api.jiraCreateIssues({url:S.settings.jiraUrl,email:S.settings.jiraEmail,token:S.settings.jiraToken,projectKey:pk,issues});
  closeModal();if(res.ok||(res.errors&&res.errors.length<issues.length))toast(`✅ ${issues.length} Issues nach Jira exportiert`);else toast('❌ Export fehlgeschlagen');
}

window.loadPMBacklog=loadPMBacklog;
window.generateBacklog=generateBacklog;

// ── Automatische Epic-Aktualisierung nach neuen Anforderungen ──
// Wird aufgerufen nach jeder Anforderungserstellung.
// Läuft im Hintergrund — kein Blocking, kein Toast wenn schon ein Backlog läuft.
let _autoEpicTimeout = null;

async function scheduleAutoEpicUpdate(systemId) {
  // Debounce: warten bis keine neuen Anforderungen mehr kommen (3 Sek)
  clearTimeout(_autoEpicTimeout);
  _autoEpicTimeout = setTimeout(() => runAutoEpicUpdate(systemId), 3000);
}

async function runAutoEpicUpdate(systemId) {
  if (!systemId) return;

  const reqs = await window.api.getRequirements({ systemId }).catch(() => []);
  if (!reqs.length) return;

  // Nur ausführen wenn noch kein vollständiger Backlog vorhanden
  // ODER wenn neue Anforderungen seit letztem Build hinzugekommen sind
  const existing = S.currentBacklog;
  const existingReqIds = new Set();
  if (existing) {
    for (const ep of existing.epics || []) {
      for (const f of ep.features || []) {
        for (const s of f.stories || []) {
          if (s.reqRef) existingReqIds.add(s.reqRef);
        }
      }
    }
  }

  const newReqs = reqs.filter(r => !existingReqIds.has(r.id));
  if (!newReqs.length && existing) return; // Nichts Neues

  // Nur neue Anforderungen in bestehenden Backlog einarbeiten
  if (existing && newReqs.length > 0) {
    await mergeNewReqsIntoBacklog(existing, newReqs, systemId);
    return;
  }

  // Kein Backlog vorhanden → vollständig neu generieren (still, kein User-Prompt)
  if (!existing && reqs.length >= 3) {
    await autoGenerateBacklog(systemId, reqs);
  }
}

// Neue Anforderungen in bestehenden Backlog eingliedern
async function mergeNewReqsIntoBacklog(backlog, newReqs, systemId) {
  try {
    const sys = (S.systems || []).find(s => s.id === systemId);

    // RAG-Kontext für bessere Einordnung
    let ragCtx = '';
    try {
      if (typeof getRAGContextForQuery === 'function') {
        ragCtx = await getRAGContextForQuery(systemId,
          newReqs.map(r => r.title).join(' '), { role: 'normal' }
        );
      }
    } catch(e) {}

    const existingEpics = backlog.epics.map(ep =>
      `${ep.id}: ${ep.title} (${(ep.features||[]).flatMap(f=>f.stories||[]).length} Stories)`
    ).join('
');

    const newReqList = newReqs.map(r =>
      `${r.id}: ${r.title} [${r.category||'?'}][${r.priority||'medium'}]` +
      (r.description ? ' — ' + r.description.substring(0, 80) : '')
    ).join('
');

    const prompt = 'Bestehender Backlog hat diese Epics:\n' + existingEpics
      + '\n\nNeue Anforderungen die einzugliedern sind:\n' + newReqList
      + (ragCtx ? '\n\nSystemkontext:\n' + ragCtx.substring(0, 1500) : '')
      + '\n\nGliedere jede neue Anforderung als User Story in das passende Epic ein.'
      + ' Falls kein passendes Epic existiert, schlage ein neues vor.'
      + '\nJSON ohne Backticks:\n'
      + '{"updates":[{"reqId":"REQ-001","epicId":"EPIC-1","storyTitle":"Als [Akteur] möchte ich [Funktion] damit [Nutzen]","storyPoints":3,"newEpic":null}],'
      + '"newEpics":[{"id":"EPIC-N","title":"...","description":"..."}]}';

    const res = await callAPI([{ role: 'user', content: prompt }],
      'Du bist Product Owner. ' + langNote(), 2000);

    if (!res.ok) return;

    let plan;
    try { plan = JSON.parse(res.text.replace(/```json|```/g, '').trim()); }
    catch(e) { return; }

    // Neue Epics hinzufügen
    for (const newEpic of plan.newEpics || []) {
      const id = 'EPIC-' + (backlog.epics.length + 1);
      backlog.epics.push({
        id, title: newEpic.title, description: newEpic.description || '',
        features: [{ id: id + '.1', title: 'Neue Features', stories: [] }],
      });
    }

    // Anforderungen eingliedern
    for (const update of plan.updates || []) {
      const req = newReqs.find(r => r.id === update.reqId);
      if (!req) continue;

      // Epic finden
      const epic = backlog.epics.find(ep => ep.id === update.epicId)
        || backlog.epics[backlog.epics.length - 1];
      if (!epic) continue;

      // Erstes Feature des Epics nutzen (oder neues erstellen)
      if (!epic.features?.length) {
        epic.features = [{ id: epic.id + '.1', title: 'Features', stories: [] }];
      }
      const feature = epic.features[0];
      feature.stories = feature.stories || [];

      feature.stories.push({
        id:       'US-' + Date.now() + '-' + Math.floor(Math.random() * 100),
        title:    update.storyTitle || ('Als Nutzer möchte ich ' + req.title),
        description: req.description || '',
        storyPoints: update.storyPoints || 3,
        priority:    req.priority || 'medium',
        reqRef:      req.id,
        acceptanceCriteria: req.acceptance_criteria_text
          ? req.acceptance_criteria_text.split('\n').filter(Boolean)
          : [],
      });
    }

    backlog.updatedAt = new Date().toISOString();
    S.currentBacklog = backlog;
    await window.api.saveBacklog(backlog).catch(() => {});

    // Backlog-View aktualisieren falls gerade offen
    if (document.getElementById('backlog-area')) {
      renderBacklog(backlog);
    }

    // Notification im BA-Dashboard
    if (typeof addNotif === 'function') {
      addNotif('📦', 'Backlog aktualisiert',
        `${newReqs.length} neue Anforderung(en) in Epics eingegliedert`);
    }

  } catch(e) {
    console.warn('Auto-Epic-Update fehlgeschlagen:', e.message);
  }
}

// Vollständig neuen Backlog im Hintergrund generieren
async function autoGenerateBacklog(systemId, reqs) {
  try {
    const sys = (S.systems || []).find(s => s.id === systemId);

    // Stakeholder + Cache für bessere Strukturierung
    let shCtx = '', cacheCtx = '';
    try {
      const [shs, cache] = await Promise.all([
        fetch('api/systems/' + systemId + '/stakeholders', {credentials:'include'}).then(r=>r.json()).catch(()=>[]),
        fetch('api/embeddings/summary?systemId=' + systemId, {credentials:'include'}).then(r=>r.json()).catch(()=>null),
      ]);
      if (shs.length) shCtx = 'Stakeholder: ' + shs.map(s => s.name + ' (' + s.role + ')').join(', ');
      if (cache?.summary) cacheCtx = cache.summary.substring(0, 1500);
    } catch(e) {}

    const reqList = reqs.slice(0, 30).map(r =>
      r.id + ': ' + r.title + ' [' + (r.category||'?') + '][' + (r.priority||'medium') + ']'
      + (r.business_value ? '[BV:' + r.business_value + ']' : '')
    ).join('
');

    const schema = '{"epics":[{"id":"EPIC-1","title":"...","description":"Welches Nutzerziel?","features":[{"id":"FEAT-1.1","title":"...","stories":[{"id":"US-1.1.1","title":"Als [Stakeholder] möchte ich [Funktion] damit [Nutzen]","storyPoints":3,"priority":"high|medium|low","reqRef":"REQ-001","acceptanceCriteria":["Gegeben...Wenn...Dann..."]}]}]}]}';

    const prompt = 'Erstelle einen strukturierten Backlog aus diesen Anforderungen.'
      + (shCtx ? '\n' + shCtx : '')
      + (cacheCtx ? '\nSystem: ' + cacheCtx : '')
      + '\n\nAnforderungen:\n' + reqList
      + '\n\nJSON ohne Backticks:\n' + schema;

    const res = await callAPI([{ role: 'user', content: prompt }],
      'Du bist zertifizierter Product Owner. ' + langNote(), 3000);

    if (!res.ok) return;

    let bl;
    try { bl = JSON.parse(res.text.replace(/```json|```/g, '').trim()); }
    catch(e) { return; }

    const backlog = {
      id: null, systemId, systemName: sys?.name || '',
      epics: bl.epics || [], createdAt: new Date().toISOString(),
    };

    S.currentBacklog = backlog;
    await window.api.saveBacklog(backlog).catch(() => {});

    if (document.getElementById('backlog-area')) renderBacklog(backlog);

    if (typeof addNotif === 'function') {
      addNotif('📦', 'Backlog automatisch erstellt',
        `${bl.epics?.length || 0} Epics aus ${reqs.length} Anforderungen generiert`);
    }
  } catch(e) {
    console.warn('Auto-Backlog-Generierung fehlgeschlagen:', e.message);
  }
}

window.scheduleAutoEpicUpdate = scheduleAutoEpicUpdate;
window.runAutoEpicUpdate      = runAutoEpicUpdate;
window.autoGenerateBacklog    = autoGenerateBacklog;

window.renderBacklog=renderBacklog;
window.exportBacklogMd=exportBacklogMd;
window.exportBacklogJira=exportBacklogJira;
window.doBlJiraExport=doBlJiraExport;
