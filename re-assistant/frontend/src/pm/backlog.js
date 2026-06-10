'use strict';
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
  const rl=reqs.map(r=>`${r.id}: ${r.title} [${r.priority}] — ${(r.description||'').substring(0,100)}`).join('\n');
  const res=await callAPI([{role:'user',content:`Strukturiertes Backlog. ${langNote()}\n\nAnforderungen:\n${rl}\n\nJSON ohne Backticks:\n{"epics":[{"id":"EPIC-1","title":"...","description":"...","features":[{"id":"FEAT-1.1","title":"...","stories":[{"id":"US-1.1.1","title":"...","description":"...","storyPoints":5,"priority":"medium","reqRef":"REQ-001"}]}]}]}`}],langNote(),3000);
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
  $('backlog-area').innerHTML=(bl.epics||[]).map(ep=>`<div class="epic-block">
    <div class="epic-head"><div><div class="epic-title">📦 ${esc(ep.id)}: ${esc(ep.title)}</div><div style="font-size:12px;color:var(--t2)">${esc(ep.description||'')}</div></div><span class="rtag">${(ep.features||[]).length} Features</span></div>
    <div class="epic-body">${(ep.features||[]).map(f=>`<div class="feature-block">
      <div class="feature-head">🔹 ${esc(f.id)}: ${esc(f.title)}</div>
      ${(f.stories||[]).map(s=>`<div class="story-row"><span class="sp-badge">${s.storyPoints||'?'} SP</span><div style="flex:1"><strong>${esc(s.id)}</strong>: ${esc(s.title)}<br/><span style="font-size:12px;color:var(--t2)">${esc(s.description||'')}</span></div><span class="sbadge p-${s.priority}">${priLabel(s.priority)}</span>${s.reqRef?`<span class="rtag" style="font-size:9px">${esc(s.reqRef)}</span>`:''}</div>`).join('')}
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
window.renderBacklog=renderBacklog;
window.exportBacklogMd=exportBacklogMd;
window.exportBacklogJira=exportBacklogJira;
window.doBlJiraExport=doBlJiraExport;
