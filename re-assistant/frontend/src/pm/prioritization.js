'use strict';
const $ = window.$ || (id => document.getElementById(id));
/**
 * pm/prioritization.js
 * PM Prioritization — WSJF, RICE, MoSCoW mit KI-Begründungen.
 */

/* ══ PM: PRIORISIERUNG ═══════════════════════════════════════ */
async function loadPMPrio(){
  S.systems=await window.api.getSystems();
  $('prio-sys-sel').innerHTML='<option value="">System wählen …</option>'+S.systems.filter(s=>(S.user.systems||[]).includes(s.id)).map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');
  $('btn-run-prio').onclick=runPrio;
  $('prio-results').innerHTML='<div class="empty-state"><div class="es-icon">📊</div><h3>System auswählen und Priorisierung starten</h3></div>';
}
async function runPrio(){
  const sysId=$('prio-sys-sel').value,method=$('prio-method').value;
  if(!sysId){toast('⚠ System auswählen');return;}
  const reqs=await window.api.getRequirements({systemId:sysId});if(!reqs.length){toast('ℹ Keine Anforderungen');return;}
  const btn=$('btn-run-prio');btn.disabled=true;btn.innerHTML='<span class="spin"></span>';
  $('prio-results').innerHTML='<div class="empty-state"><div class="spin"></div><p>Berechne …</p></div>';
  const rl=reqs.map(r=>`${r.id}: ${r.title} — ${(r.description||'').substring(0,100)}`).join('\n');
  const mi={moscow:`MoSCoW. JSON:\n{"groups":{"must":["REQ-001"],"should":[],"could":[],"wont":[]},"items":[{"reqId":"REQ-001","rationale":"..."}]}`,rice:`RICE. JSON:\n{"items":[{"reqId":"REQ-001","score":85,"rationale":"..."}]}`,wsjf:`WSJF. JSON:\n{"items":[{"reqId":"REQ-001","score":7.5,"rationale":"..."}]}`}[method];
  const res=await callAPI([{role:'user',content:`${mi}\n\nAnforderungen:\n${rl}`}],langNote(),2000);
  btn.disabled=false;btn.innerHTML='▶ Priorisierung starten';
  if(!res.ok){toast('❌ '+res.text);return;}
  try{const pr=JSON.parse(res.text.replace(/```json|```/g,'').trim());renderPrio(pr,reqs,method);toast('✅ Priorisierung abgeschlossen');}
  catch(e){toast('❌ Parsing-Fehler');}
}
function renderPrio(pr,reqs,method){
  const w=$('prio-results');
  if(method==='moscow'&&pr.groups){
    const labels={must:'Must Have',should:'Should Have',could:'Could Have',wont:"Won't Have"},cls={must:'m-must',should:'m-should',could:'m-could',wont:'m-wont'};
    w.innerHTML=Object.entries(pr.groups).map(([cat,ids])=>{
      const items=ids.map(id=>reqs.find(r=>r.id===id)).filter(Boolean);if(!items.length)return'';
      return`<div class="moscow-section"><div class="moscow-title ${cls[cat]}">${labels[cat]} (${items.length})</div>${items.map(r=>`<div class="prio-card"><div class="prio-row"><div class="prio-info"><div class="req-title" style="font-size:13px">${esc(r.title)}</div><div class="req-id">${esc(r.id)}</div></div><span class="sbadge p-${r.priority}">${priLabel(r.priority)}</span></div>${(pr.items||[]).find(i=>i.reqId===r.id)?.rationale?`<div class="prio-rationale">${esc((pr.items.find(i=>i.reqId===r.id)).rationale)}</div>`:''}</div>`).join('')}</div>`;
    }).join('');
  }else{
    const items=[...(pr.items||[])].sort((a,b)=>(+b.score)-(+a.score));const max=Math.max(...items.map(i=>+i.score),1);
    w.innerHTML=items.map((item,idx)=>{const r=reqs.find(x=>x.id===item.reqId);if(!r)return'';
      return`<div class="prio-card"><div class="prio-row"><div class="prio-rank">${idx+1}</div><div class="prio-info"><div class="req-title" style="font-size:13px">${esc(r.title)}</div><div class="req-id">${esc(r.id)}</div></div><div class="prio-score-area"><div class="prio-score">${(+item.score).toFixed(1)}</div><div class="prio-score-label">${method.toUpperCase()}</div><div class="prio-bar"><div class="prio-bar-fill" style="width:${Math.round((+item.score/max)*100)}%"></div></div></div></div>${item.rationale?`<div class="prio-rationale">${esc(item.rationale)}</div>`:''}</div>`;
    }).join('');
  }
}

/* ══ PM: JIRA ════════════════════════════════════════════════ */
async function loadPMJira(){
  S.systems=await window.api.getSystems();
  $('jira-sys-sel').innerHTML='<option value="">System wählen …</option>'+S.systems.filter(s=>(S.user.systems||[]).includes(s.id)).map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');
  if(S.settings.jiraUrl){setVal('jira-url',S.settings.jiraUrl);setVal('jira-email',S.settings.jiraEmail);setVal('jira-token',S.settings.jiraToken);}
  $('btn-jira-connect').onclick=connectJira;$('btn-jira-export').onclick=jiraExport;$('btn-jira-import').onclick=jiraImport;
}
async function connectJira(){
  const url=$('jira-url').value.trim(),email=$('jira-email').value.trim(),token=$('jira-token').value.trim();
  if(!url||!email||!token){toast('⚠ Alle Felder ausfüllen');return;}
  $('jira-status').innerHTML='<span class="spin"></span> Verbinde …';
  const res=await window.api.jiraGetProjects({url,email,token});
  const projects=res.values||res.data?.values||[];
  if(!projects.length&&!res.ok){$('jira-status').innerHTML='<span style="color:var(--red)">❌ Verbindung fehlgeschlagen</span>';return;}
  S.jiraProjects=projects;
  S.settings.jiraUrl=url;S.settings.jiraEmail=email;S.settings.jiraToken=token;
  await window.api.saveSettings(S.settings);
  $('jira-status').innerHTML=`<span style="color:var(--grn)">✅ Verbunden — ${S.jiraProjects.length} Projekte</span>`;
  $('jira-project-pane').style.display='';
  $('jira-project-sel').innerHTML='<option value="">Projekt wählen …</option>'+S.jiraProjects.map(p=>`<option value="${esc(p.key)}">${esc(p.name)} (${esc(p.key)})</option>`).join('');
  $('jira-results-pane').innerHTML=`<div style="padding:16px"><h3 style="font-size:15px;margin-bottom:8px">✅ Verbunden mit ${esc(url)}</h3></div>`;
}
async function jiraExport(){
  const pk=$('jira-project-sel').value,sysId=$('jira-sys-sel').value;
  if(!pk||!sysId){toast('⚠ Projekt und System wählen');return;}
  const reqs=await window.api.getRequirements({systemId:sysId});if(!reqs.length){toast('ℹ Keine Anforderungen');return;}
  const res=await window.api.jiraCreateIssues({url:S.settings.jiraUrl,email:S.settings.jiraEmail,token:S.settings.jiraToken,projectKey:pk,issues:reqs.map(r=>({title:r.title,description:r.description||'',type:'Story',priority:r.priority}))});
  if(res.ok||(res.errors?.length<reqs.length))toast(`✅ ${reqs.length} Issues nach Jira exportiert`);else toast('❌ Export fehlgeschlagen');
}
async function jiraImport(){
  const pk=$('jira-project-sel').value;if(!pk){toast('⚠ Projekt wählen');return;}
  const res=await window.api.jiraGetIssues({url:S.settings.jiraUrl,email:S.settings.jiraEmail,token:S.settings.jiraToken,projectKey:pk});
  const issues=(res.issues||res.data?.issues||[]);
  window._jiraIssues=issues;
  $('jira-results-pane').innerHTML=`<div style="padding:16px"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px"><h3 style="font-size:14px">${issues.length} Issues aus ${esc(pk)}</h3><button class="btn-primary" style="font-size:12px" onclick="analyzeJiraImport()">✦ KI analysieren</button></div>${issues.map(i=>`<div class="jira-issue"><span class="jira-key">${esc(i.key)}</span><div><strong style="font-size:13px">${esc(i.fields?.summary||'')}</strong><div style="font-size:12px;color:var(--t2)">${esc(i.fields?.status?.name||'')} · ${esc(i.fields?.issuetype?.name||'')}</div></div></div>`).join('')}</div>`;
  toast(`✅ ${issues.length} Issues geladen`);
}
async function analyzeJiraImport(){
  if(!window._jiraIssues?.length)return;
  const list=window._jiraIssues.map(i=>`${i.key}: ${i.fields?.summary||''}`).join('\n');
  const res=await callAPI([{role:'user',content:`Analysiere diesen Jira-Backlog: Duplikate, Lücken, Qualitätsprobleme, Priorisierungsempfehlungen.\n\n${list}`}],langNote(),1500);
  if(!res.ok)return;
  const a=document.createElement('div');a.style.cssText='margin-top:16px;padding:14px;background:var(--s2);border-radius:var(--rl);font-size:13px;line-height:1.7;border:1px solid var(--b1)';
  a.innerHTML=`<div style="font-size:11px;font-weight:700;color:var(--aa);text-transform:uppercase;margin-bottom:8px">✦ KI-Analyse</div>${renderMD(res.text)}`;
  $('jira-results-pane').querySelector('div').appendChild(a);
}

window.loadPMPrio=loadPMPrio;
window.runPrio=runPrio;
window.renderPrio=renderPrio;
