/* ══ PM: DASHBOARD ═══════════════════════════════════════════ */
async function loadPMDash(){
  const my=S.systems.filter(s=>(S.user.systems||[]).includes(s.id));
  if(!S.pmActiveSystemId&&my.length)S.pmActiveSystemId=my[0].id;
  S.requirements=await window.api.getRequirements({});
  const mr=S.requirements.filter(r=>my.some(s=>s.id===r.systemId));
  const wrap=$('pm-stats-row');wrap.className='stats-row';
  wrap.innerHTML=`<div class="stat-card accent"><span class="stat-n">${mr.length}</span><span class="stat-l">Gesamt</span></div><div class="stat-card"><span class="stat-n">${mr.filter(r=>r.status==='open').length}</span><span class="stat-l">Offen</span></div><div class="stat-card"><span class="stat-n">${mr.filter(r=>r.status==='assigned').length}</span><span class="stat-l">Zugewiesen</span></div><div class="stat-card"><span class="stat-n">${mr.filter(r=>r.status==='done').length}</span><span class="stat-l">Erledigt</span></div>`;
  $('pm-systems-tabs').className='sys-tabs';
  $('pm-systems-tabs').innerHTML=my.map(s=>`<button class="sys-tab${s.id===S.pmActiveSystemId?' active':''}" onclick="pmSelSys('${s.id}')">${esc(s.name)}</button>`).join('');
  renderReqList('pm-req-list',mr.filter(r=>r.systemId===S.pmActiveSystemId),'pm');
}
async function pmSelSys(id){S.pmActiveSystemId=id;await loadPMDash();}

/* ══ PM: CHAT ════════════════════════════════════════════════ */
async function loadPMChat(){
  const my=S.systems.filter(s=>(S.user.systems||[]).includes(s.id));
  $('pmc-system-list').innerHTML='';
  my.forEach(sys=>{const btn=document.createElement('button');btn.className='sys-btn'+(S.activeSystemId===sys.id?' active':'');btn.innerHTML=`<span class="sys-dot"></span>${esc(sys.name)}`;btn.onclick=()=>{S.activeSystemId=sys.id;loadPMChat();};$('pmc-system-list').appendChild(btn);});
  if(!S.activeSystemId&&my.length)S.activeSystemId=my[0].id;
  const inp=$('pmc-input');
  $('pmc-send').onclick=sendPMChat;
  inp.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendPMChat();}autoResize(inp);};
  inp.oninput=()=>autoResize(inp);
  document.querySelectorAll('#pmc-chips .chip').forEach(c=>c.onclick=()=>{inp.value=c.dataset.p;sendPMChat();});
  $('pmc-mic').onclick=()=>toggleChatMic('pmc-input','pmc-mic');
  if(!$('pm-chat-msgs').children.length){const sys=S.systems.find(s=>s.id===S.activeSystemId);pushMsg('pm-chat-msgs','a',sys?`PM-Modus: **${sys.name}**.`:'Kein System.');}
}
async function sendPMChat(){
  const inp=$('pmc-input');const text=inp.value.trim();if(!text)return;
  inp.value='';inp.style.height='auto';
  pushMsg('pm-chat-msgs','u',text);S.chatHistory.pmc.push({role:'user',content:text});
  const typing=addTyping('pm-chat-msgs');
  const sys=S.systems.find(s=>s.id===S.activeSystemId);
  const sr=S.requirements.filter(r=>r.systemId===S.activeSystemId).map(r=>`- ${r.id}: ${r.title} [${r.status}]`).join('\n');
  const res=await callAPI(S.chatHistory.pmc,`PM-Assistent. ${langNote()}\n${sys?`System: ${sys.name}\nAnforderungen:\n${sr}\n\n${getCtx(sys)}`:'Kein System.'}`,1800);
  typing.remove();pushMsg('pm-chat-msgs','a',res.ok?res.text:`❌ ${res.text}`);
  if(res.ok){S.chatHistory.pmc.push({role:'assistant',content:res.text});if(S.chatHistory.pmc.length>40)S.chatHistory.pmc=S.chatHistory.pmc.slice(-40);}
}

/* ══ PM: ASSIGN ══════════════════════════════════════════════ */
async function loadPMAssign(){
  S.requirements=await window.api.getRequirements({});
  S.users=await window.api.getUsers();
  const devs=S.users.filter(u=>u.role==='developer');
  const mySys=S.systems.filter(s=>(S.user.systems||[]).includes(s.id));
  const sel=$('assign-filter-sys');
  sel.innerHTML='<option value="">System wählen …</option>'+mySys.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');
  if(!sel.value&&mySys.length)sel.value=mySys[0].id;
  const render=()=>{
    const sF=sel.value,stF=$('assign-filter-status').value;
    const w=$('assign-req-list');w.innerHTML='';
    const reqs=S.requirements.filter(r=>(!sF||r.systemId===sF)&&(!stF||r.status===stF));
    if(!reqs.length){w.innerHTML='<div class="empty-state"><h3>Keine Anforderungen</h3></div>';return;}
    reqs.forEach(r=>{
      const do_=devs.map(d=>`<option value="${d.id}"${r.assignedTo===d.id?' selected':''}>${esc(d.name)}</option>`).join('');
      const so=(devs.find(d=>d.id===r.assignedTo)?.subcategories||[]).map(s=>`<option value="${s}">${esc(s)}</option>`).join('');
      const div=document.createElement('div');div.className='assign-row';
      div.innerHTML=`<div class="assign-row-info"><div style="display:flex;gap:7px;margin-bottom:4px;flex-wrap:wrap"><span class="req-id">${esc(r.id)}</span><span class="sbadge s-${r.status}">${statusLabel(r.status)}</span><span class="sbadge p-${r.priority}">${priLabel(r.priority)}</span></div><div class="req-title" style="font-size:13px">${esc(r.title)}</div><div style="font-size:12px;color:var(--t2)">${esc((r.description||'').substring(0,120))}</div></div>
      <div class="assign-controls"><select id="adev-${r.id}" onchange="updSubOpts('${r.id}')"><option value="">Entwickler …</option>${do_}</select><select id="asub-${r.id}"><option value="">Unterbereich …</option>${so}</select>
      <div style="display:flex;gap:5px"><button class="btn-primary" style="font-size:11px;flex:1;padding:6px" onclick="assignReq('${r.id}')">Zuweisen</button><button class="btn-secondary" style="font-size:11px;padding:6px 10px" onclick="analyzeSource('${r.id}')" title="Source-Analyse">🔍</button></div></div>`;
      w.appendChild(div);
    });
  };
  sel.oninput=render;$('assign-filter-status').oninput=render;render();
}
function updSubOpts(rid){const devId=$(`adev-${rid}`)?.value;const dev=S.users.find(u=>u.id===devId);const sel=$(`asub-${rid}`);if(!sel)return;sel.innerHTML='<option value="">Unterbereich …</option>'+(dev?.subcategories||[]).map(s=>`<option value="${s}">${esc(s)}</option>`).join('');}
async function assignReq(reqId){const devId=$(`adev-${reqId}`)?.value;if(!devId){toast('⚠ Entwickler auswählen');return;}await window.api.assignRequirement({reqId,userId:devId,subcategory:$(`asub-${reqId}`)?.value});toast('✅ Zugewiesen');await loadPMAssign();}
async function analyzeSource(reqId){
  const req=S.requirements.find(r=>r.id===reqId);if(!req)return;
  const sys=S.systems.find(s=>s.id===req.systemId);if(!sys?.docs?.length){toast('⚠ Keine Dokumentation');return;}
  toast('🔍 Analysiere Source …');
  const code=(sys.docs||[]).filter(d=>['.js','.ts','.py','.java','.cs','.go','.rs','.cpp','.jsx','.tsx'].some(e=>d.name.endsWith(e))).slice(0,8).map(d=>`### ${d.relativePath||d.name}\n\`\`\`\n${d.content.substring(0,3000)}\n\`\`\``).join('\n\n');
  const res=await callAPI([{role:'user',content:`Analysiere. JSON ohne Backticks:\n{"affectedFiles":[{"file":"...","reason":"..."}],"summary":"...","suggestion":"+ //neu\\n- //alt"}\n\nAnforderung: ${req.title} — ${req.description}\n\nCode:\n${code}`}],'',2000);
  if(!res.ok){toast('❌ Analyse fehlgeschlagen');return;}
  try{const a=JSON.parse(res.text.replace(/```json|```/g,'').trim());await window.api.saveRequirement({...req,sourceAnalysis:a,sourceSuggestion:a.suggestion});S.requirements=await window.api.getRequirements({});toast('✅ Source-Analyse gespeichert');await loadPMAssign();}
  catch(e){toast('❌ Parsing-Fehler');}
}

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
    await window.api.saveBacklog(S.currentBacklog);renderBacklog(S.currentBacklog);toast('✅ Backlog erstellt');
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

/* ══ DEVELOPER ═══════════════════════════════════════════════ */
async function loadDevWork(){
  S.requirements=await window.api.getRequirements({userId:S.user.id,role:'developer'});
  $('dev-sub').textContent=`Bereiche: ${(S.user.subcategories||[]).join(', ')||'Alle'}`;
  const subs=[...new Set(S.requirements.map(r=>r.subcategory).filter(Boolean))];
  $('dev-filter-sub').innerHTML='<option value="">Alle</option>'+subs.map(s=>`<option value="${s}">${esc(s)}</option>`).join('');
  const render=()=>{const stF=$('dev-filter-status').value,subF=$('dev-filter-sub').value;renderDevReqs(S.requirements.filter(r=>(!stF||r.status===stF)&&(!subF||r.subcategory===subF)));};
  $('dev-filter-status').oninput=render;$('dev-filter-sub').oninput=render;render();
}
function renderDevReqs(reqs){
  const w=$('dev-req-list');
  if(!reqs.length){w.innerHTML='<div class="empty-state"><h3>Keine Aufgaben</h3><p>Noch keine Anforderungen zugewiesen.</p></div>';return;}
  w.innerHTML=reqs.map(r=>`<div class="dev-req-card ${r.priority}">
    <div class="dev-req-expand" onclick="toggleDevReq('${r.id}')">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px">
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;flex-wrap:wrap">
            <span class="req-id">${esc(r.id)}</span>
            <span class="sbadge s-${r.status}">${statusLabel(r.status)}</span>
            <span class="sbadge p-${r.priority}">${priLabel(r.priority)}</span>
            ${r.subcategory?`<span class="rtag">${esc(r.subcategory)}</span>`:''}
            ${r.sourceAnalysis?'<span class="sbadge" style="background:var(--bluebg);color:var(--blue)">🔍 Source</span>':''}
          </div>
          <div class="req-title">${esc(r.title)}</div>
          <div class="req-desc" style="font-size:12px">${esc((r.description||'').substring(0,140))}${(r.description||'').length>140?'…':''}</div>
        </div>
        <select onchange="updateDevStatus('${r.id}',this.value)" style="font-size:11px;padding:4px 7px" onclick="event.stopPropagation()">
          <option value="assigned"${r.status==='assigned'?' selected':''}>Zugewiesen</option>
          <option value="in-progress"${r.status==='in-progress'?' selected':''}>In Bearbeitung</option>
          <option value="done"${r.status==='done'?' selected':''}>Erledigt</option>
        </select>
      </div>
    </div>
    <div class="dev-req-detail" id="drd-${r.id}">
      <div class="req-desc" style="padding:12px 0">${esc(r.description||'')}</div>
      ${r.rationale?`<div class="req-rat">${esc(r.rationale)}</div>`:''}
      ${renderSourceBlock(r)}
      ${renderCommentThread(r)}
      <div style="display:flex;gap:7px;margin-top:10px">
        ${!r.sourceAnalysis?`<button class="btn-secondary" style="font-size:11px;padding:5px 11px" onclick="devAnalyzeSource('${r.id}')">🔍 Source analysieren</button>`:''}
        <button class="btn-secondary" style="font-size:11px;padding:5px 11px" onclick="toggleCommentInput('${r.id}')">💬 Kommentar</button>
      </div>
      <div id="ci-wrap-${r.id}" style="display:none;margin-top:8px">
        <div style="display:flex;gap:7px">
          <input type="text" id="ci-${r.id}" placeholder="Kommentar …" style="flex:1;font-size:12px"/>
          <button class="btn-primary" style="font-size:11px;padding:6px 12px" onclick="submitComment('${r.id}')">Senden</button>
        </div>
      </div>
    </div></div>`).join('');
}
function toggleDevReq(id){$(`drd-${id}`)?.classList.toggle('open');}
async function updateDevStatus(reqId,status){
  const req=S.requirements.find(r=>r.id===reqId);if(!req)return;
  await window.api.saveRequirement({...req,status});toast(`✅ Status: ${statusLabel(status)}`);await loadDevWork();
}
function renderSourceBlock(r){
  if(!r.sourceAnalysis)return'';
  const aff=(r.sourceAnalysis.affectedFiles||[]).map(f=>`<div class="affected-file"><span class="afile-name">${esc(f.file)}</span><span class="afile-reason">${esc(f.reason)}</span></div>`).join('');
  const sugg=r.sourceSuggestion?`<div style="margin-top:8px"><pre>${esc(r.sourceSuggestion).split('\n').map(l=>l.startsWith('+')?`<span class="add">${l}</span>`:l.startsWith('-')?`<span class="rem">${l}</span>`:l).join('\n')}</pre></div>`:'';
  return`<div class="source-block"><div class="source-block-head"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg> ${esc(r.sourceAnalysis.summary||'Source-Analyse')}</div><div class="source-block-body">${aff}${sugg}</div></div>`;
}
function renderCommentThread(r){
  if(!(r.comments||[]).length)return'';
  return`<div class="comment-thread">${(r.comments||[]).map(c=>`<div class="comment"><div class="comment-avatar">${(c.authorName||'?').substring(0,2).toUpperCase()}</div><div class="comment-body"><span class="comment-author">${esc(c.authorName||'')}</span><span class="comment-time"> · ${new Date(c.createdAt).toLocaleString('de-DE',{hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit'})}</span><div class="comment-text">${esc(c.text)}</div></div></div>`).join('')}</div>`;
}
function toggleCommentInput(reqId){const d=$(`ci-wrap-${reqId}`);if(d)d.style.display=d.style.display==='none'?'block':'none';}
async function submitComment(reqId){
  const inp=$(`ci-${reqId}`);const text=inp.value.trim();if(!text)return;
  await window.api.addComment({reqId,comment:{text,authorId:S.user.id,authorName:S.user.name}});
  inp.value='';S.requirements=await window.api.getRequirements({userId:S.user.id,role:'developer'});renderDevReqs(S.requirements);toast('✅ Kommentar gespeichert');
}
async function devAnalyzeSource(reqId){
  const req=S.requirements.find(r=>r.id===reqId);if(!req)return;
  const sys=S.systems.find(s=>s.id===req.systemId);if(!sys?.docs?.length){toast('⚠ Keine Dokumentation');return;}
  toast('🔍 Analysiere Source …');
  const code=(sys.docs||[]).filter(d=>['.js','.ts','.py','.java','.cs','.go','.rs','.cpp','.jsx','.tsx'].some(e=>d.name.endsWith(e))).slice(0,8).map(d=>`### ${d.name}\n\`\`\`\n${d.content.substring(0,3000)}\n\`\`\``).join('\n\n');
  const res=await callAPI([{role:'user',content:`Analysiere. JSON ohne Backticks:\n{"affectedFiles":[{"file":"...","reason":"..."}],"summary":"...","suggestion":"+ //neu\\n- //alt"}\n\nAnforderung: ${req.title} — ${req.description}\n\nCode:\n${code}`}],'',2000);
  if(!res.ok){toast('❌ Analyse fehlgeschlagen');return;}
  try{const a=JSON.parse(res.text.replace(/```json|```/g,'').trim());await window.api.saveRequirement({...req,sourceAnalysis:a,sourceSuggestion:a.suggestion});S.requirements=await window.api.getRequirements({userId:S.user.id,role:'developer'});renderDevReqs(S.requirements);toast('✅ Source-Analyse abgeschlossen');}
  catch(e){toast('❌ Parsing-Fehler');}
}

/* ══ VOICE BOT ═══════════════════════════════════════════════ */
function buildVoice(){
  $('voice-orb').onclick=toggleVoiceOrb;
  $('vt-slower').onclick=()=>{S.ttsSpeed=Math.max(.5,+(S.ttsSpeed-.1).toFixed(1));$('vt-speed').textContent=S.ttsSpeed+'×';};
  $('vt-faster').onclick=()=>{S.ttsSpeed=Math.min(2,+(S.ttsSpeed+.1).toFixed(1));$('vt-speed').textContent=S.ttsSpeed+'×';};
  $('vt-stop').onclick=stopSpeaking;
  $('vt-clear').onclick=()=>{S.chatHistory.voice=[];$('voice-log').innerHTML='';};
}
function toggleVoiceOrb(){
  if(S.voiceOrbState==='listening'){stopVoiceRec();return;}
  if(S.voiceOrbState==='thinking')return;
  if(S.voiceOrbState==='speaking'){stopSpeaking();return;}
  startVoiceRec();
}
function startVoiceRec(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){toast('Spracherkennung nicht verfügbar (Chrome/Edge empfohlen)');return;}
  S.voiceRec=new SR();S.voiceRec.continuous=false;S.voiceRec.interimResults=true;
  S.voiceRec.lang=S.settings.language==='de'?'de-DE':'en-US';
  setOrbState('listening');$('voice-label').textContent='Hört zu …';$('voice-interim').textContent='';
  S.voiceRec.onresult=e=>{let t='';for(const r of e.results)t+=r[0].transcript;$('voice-interim').textContent=t;};
  S.voiceRec.onend=()=>{const t=$('voice-interim').textContent.trim();$('voice-interim').textContent='';if(t)processVoiceInput(t);else{setOrbState('idle');$('voice-label').textContent='Drücken & sprechen';}};
  S.voiceRec.onerror=err=>{setOrbState('idle');$('voice-label').textContent=err.error==='no-speech'?'Nichts gehört':'Fehler: '+err.error;};
  S.voiceRec.start();
}
function stopVoiceRec(){try{S.voiceRec?.stop();}catch(e){}}
async function processVoiceInput(text){
  appendVoiceLog('u',text);setOrbState('thinking');$('voice-label').textContent='Denkt nach …';
  S.chatHistory.voice.push({role:'user',content:text});
  const personas={professional:'Professioneller RE-Assistent. Präzise, kurz (2-4 Sätze). Kein Markdown.',friendly:'Freundlicher RE-Assistent. Locker, kurz, kein Markdown.',concise:'Maximal 1-3 Sätze.',socratic:'Kurze Antwort, dann eine Gegenfrage.'};
  const sys=S.systems.find(s=>s.id===S.activeSystemId);
  const res=await callAPI(S.chatHistory.voice,`${personas[S.settings.persona||'professional']} ${langNote()}\n${sys?`Aktives System: ${sys.name}`:''}`,600);
  const reply=res.ok?res.text:'Entschuldigung, da ist etwas schiefgelaufen.';
  S.chatHistory.voice.push({role:'assistant',content:reply});
  if(S.chatHistory.voice.length>30)S.chatHistory.voice=S.chatHistory.voice.slice(-30);
  appendVoiceLog('a',reply);speak(reply);
}
function speak(text){
  if(!window.speechSynthesis){setOrbState('idle');return;}
  window.speechSynthesis.cancel();
  const utt=new SpeechSynthesisUtterance(text);
  utt.rate=S.ttsSpeed;utt.lang=S.settings.language==='de'?'de-DE':'en-US';
  const voices=window.speechSynthesis.getVoices();
  const pref=S.settings.voiceURI?voices.find(v=>v.voiceURI===S.settings.voiceURI):null;
  if(pref)utt.voice=pref;else{const lc=utt.lang.split('-')[0];utt.voice=voices.find(v=>v.lang.startsWith(lc))||null;}
  utt.onstart=()=>{setOrbState('speaking');$('voice-label').textContent='Spricht …';};
  utt.onend=utt.onerror=()=>{setOrbState('idle');$('voice-label').textContent='Drücken & sprechen';};
  window.speechSynthesis.speak(utt);
}
function stopSpeaking(){window.speechSynthesis?.cancel();setOrbState('idle');$('voice-label').textContent='Drücken & sprechen';}
function setOrbState(state){
  S.voiceOrbState=state;
  const orb=$('voice-orb'),area=$('orb-area');
  orb.className='';area.className='';
  $('orb-mic-svg').style.display='';$('orb-stop-svg').style.display='none';
  if(state==='listening'){orb.classList.add('listening');area.classList.add('rings-active');$('orb-mic-svg').style.display='none';$('orb-stop-svg').style.display='';}
  else if(state==='speaking'){orb.classList.add('speaking');area.classList.add('rings-active');}
}
function appendVoiceLog(role,text){
  const log=$('voice-log'),item=document.createElement('div');item.className='vlog-item';
  item.innerHTML=role==='u'?`<div class="vlog-u">${esc(text)}</div><div class="vmeta" style="text-align:right">Sie · ${now()}</div>`:`<div class="vlog-a">${esc(text)}</div><div class="vmeta">RE-Assistent · ${now()}</div>`;
  log.appendChild(item);log.scrollTop=log.scrollHeight;
}
function populateVoices(){
  const fill=()=>{
    const voices=window.speechSynthesis?.getVoices()||[];
    const sel=$('cfg-voice');if(!sel)return;
    const lc=S.settings.language||'de';const rel=voices.filter(v=>v.lang.toLowerCase().startsWith(lc));const rest=voices.filter(v=>!v.lang.toLowerCase().startsWith(lc));
    sel.innerHTML='<option value="">Standard</option>'+(rel.length?`<optgroup label="${lc==='de'?'Deutsch':'English'}">${rel.map(v=>`<option value="${esc(v.voiceURI)}"${v.voiceURI===S.settings.voiceURI?' selected':''}>${esc(v.name)}</option>`).join('')}</optgroup>`:'')+
    (rest.length?`<optgroup label="Andere">${rest.map(v=>`<option value="${esc(v.voiceURI)}">${esc(v.name)}</option>`).join('')}</optgroup>`:'');
  };
  if(window.speechSynthesis){fill();window.speechSynthesis.onvoiceschanged=fill;}
}
