'use strict';
const $ = window.$ || (id => document.getElementById(id));
/**
 * pm/integrations.js
 * Jira und Azure DevOps — Export, Import, KI-Analyse.
 */

/* ══ JIRA ══════════════════════════════════════════════════════ */

async function loadPMJira(){
  S.systems=await window.api.getSystems();
  $('jira-sys-sel').innerHTML='<option value="">System wählen …</option>'+S.systems.filter(s=>(S.user.systems||[]).includes(s.id)).map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');
  if(S.settings.jiraUrl){setVal('jira-url',S.settings.jiraUrl);setVal('jira-email',S.settings.jiraEmail);setVal('jira-token',S.settings.jiraToken);}
  $('btn-jira-connect').onclick=connectJira;$('btn-jira-export').onclick=jiraExport;$('btn-jira-import').onclick=jiraImport;
}

async function connectJira(){
  const url=$('jira-url').value.trim(),email=$('jira-email').value.trim(),token=$('jira-token').value.trim();
  if(!url||!email||!token){toast('⚠ Alle Felder ausfüllen');return;}

  // URL-Format prüfen
  if(!url.startsWith('http')){
    $('jira-status').innerHTML='<span style="color:var(--red)">❌ URL muss mit https:// beginnen</span>';
    return;
  }

  $('jira-status').innerHTML='<span class="spin"></span> Verbinde …';

  try {
    const res=await window.api.jiraGetProjects({url,email,token});

    // HTTP-Fehler prüfen
    if(res.status===401||res.errorMessages?.includes('401')){
      $('jira-status').innerHTML='<span style="color:var(--red)">❌ Authentifizierung fehlgeschlagen — E-Mail oder API-Token falsch</span>';
      return;
    }
    if(res.status===403){
      $('jira-status').innerHTML='<span style="color:var(--red)">❌ Zugriff verweigert — fehlende Berechtigungen</span>';
      return;
    }
    if(res.status===404||(!res.values&&!res.data?.values&&res.errorMessages)){
      $('jira-status').innerHTML=`<span style="color:var(--red)">❌ Jira nicht erreichbar — URL prüfen (${esc(url)})</span>`;
      return;
    }

    const projects=res.values||res.data?.values||[];
    if(!projects.length){
      $('jira-status').innerHTML='<span style="color:var(--amb)">⚠ Verbunden, aber keine Projekte gefunden — Berechtigungen prüfen</span>';
      return;
    }

    S.jiraProjects=projects;
    S.settings.jiraUrl=url;S.settings.jiraEmail=email;S.settings.jiraToken=token;
    await window.api.saveSettings(S.settings);
    $('jira-status').innerHTML=`<span style="color:var(--grn)">✅ Verbunden — ${S.jiraProjects.length} Projekte gefunden</span>`;
    $('jira-project-pane').style.display='';
    $('jira-project-sel').innerHTML='<option value="">Projekt wählen …</option>'+S.jiraProjects.map(p=>`<option value="${esc(p.key)}">${esc(p.name)} (${esc(p.key)})</option>`).join('');
    $('jira-results-pane').innerHTML=`<div style="padding:16px"><h3 style="font-size:15px;margin-bottom:8px">✅ Verbunden mit ${esc(url)}</h3><p style="font-size:13px;color:var(--t2)">${projects.length} Projekte verfügbar</p></div>`;
  } catch(e) {
    $('jira-status').innerHTML=`<span style="color:var(--red)">❌ Verbindungsfehler: ${esc(e.message)}</span>`;
  }
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
  const a=document.createElement('div');a.style.cssText='margin-top:16px;padding:14px;background:var(--s2);border-radius:var(--rl);font-size:13px;line-height:1.7;border:1px solid var(--b1);box-shadow:0 3px 10px rgba(0,0,0,.14)';
  a.innerHTML=`<div style="font-size:11px;font-weight:700;color:var(--aa);text-transform:uppercase;margin-bottom:8px">✦ KI-Analyse</div>${renderMD(res.text)}`;
  $('jira-results-pane').querySelector('div').appendChild(a);
}

'use strict';
/**
 * pm/integrations.js
 * Jira und Azure DevOps — Export, Import, KI-Analyse.
 */

function switchIntTab(tab) {
  document.querySelectorAll('.int-tab').forEach((t, i) => t.classList.toggle('active', i === (tab==='jira'?0:1)));
  document.querySelectorAll('.int-pane').forEach(p => p.classList.remove('active'));
  $(`int-pane-${tab}`)?.classList.add('active');
  if (tab === 'jira') initJiraPane();
  else initAdoPane();
}

async function loadPMIntegrations() {
  S.systems = await window.api.getSystems();
  // Initialize Jira side (default tab)
  initJiraPane();
}

async function initJiraPane() {
  const jiraSysSel = $('jira-sys-sel');
  if (jiraSysSel) {
    jiraSysSel.innerHTML = '<option value="">System wählen …</option>' +
      S.systems.filter(s => (S.user.systems||[]).includes(s.id)).map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  }
  if (S.settings.jiraUrl) { setVal('jira-url', S.settings.jiraUrl); setVal('jira-email', S.settings.jiraEmail); setVal('jira-token', S.settings.jiraToken); }
  const connectBtn = $('btn-jira-connect');
  if (connectBtn) connectBtn.onclick = connectJira;
  const exportBtn = $('btn-jira-export');
  if (exportBtn) exportBtn.onclick = jiraExport;
  const importBtn = $('btn-jira-import');
  if (importBtn) importBtn.onclick = jiraImport;
}

async function initAdoPane() {
  const sel = $('ado-sys-sel');
  if (sel) sel.innerHTML = '<option value="">System wählen …</option>' +
    S.systems.filter(s => (S.user.systems||[]).includes(s.id)).map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  if (S.settings.adoUrl) { setVal('ado-url', S.settings.adoUrl); setVal('ado-project', S.settings.adoProject); setVal('ado-token', S.settings.adoToken); }
  $('btn-ado-connect').onclick  = connectAdo;
  $('btn-ado-export').onclick   = adoExport;
  $('btn-ado-import').onclick   = adoImport;
}

async function connectAdo() {
  const url = $('ado-url').value.trim(), project = $('ado-project').value.trim(), token = $('ado-token').value.trim();
  if (!url || !project || !token) { toast('⚠ Alle Felder ausfüllen'); return; }
  $('ado-status').innerHTML = '<span class="spin"></span> Verbinde …';
  try {
    const auth = btoa(`:${token}`);
    const res  = await fetch(`${url}/${encodeURIComponent(project)}/_apis/wit/workitemtypes?api-version=7.0`, {
      headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    $('ado-status').innerHTML = '<span style="color:var(--grn)">✅ Verbunden</span>';
    $('ado-action-pane').style.display = '';
    S.settings.adoUrl = url; S.settings.adoProject = project; S.settings.adoToken = token;
    await window.api.saveSettings(S.settings);
    $('ado-results-pane').innerHTML = `<div style="padding:16px"><h3 style="font-size:15px;margin-bottom:8px">✅ Verbunden mit ${esc(url)}/${esc(project)}</h3><p style="font-size:13px;color:var(--t2)">Azure DevOps bereit.</p></div>`;
  } catch(e) {
    $('ado-status').innerHTML = `<span style="color:var(--red)">❌ Verbindung fehlgeschlagen: ${esc(e.message)}</span>`;
  }
}

async function adoExport() {
  const url = $('ado-url').value.trim(), project = $('ado-project').value.trim(), token = $('ado-token').value.trim();
  const sysId = $('ado-sys-sel').value;
  if (!url || !project || !token) { toast('⚠ Zuerst verbinden'); return; }
  if (!sysId) { toast('⚠ System wählen'); return; }
  const reqs = await window.api.getRequirements({ systemId: sysId });
  if (!reqs.length) { toast('ℹ Keine Anforderungen'); return; }
  const auth = btoa(`:${token}`);
  let ok = 0, err = 0;
  $('ado-results-pane').innerHTML = '<div style="padding:16px"><div class="spin"></div> Exportiere …</div>';
  for (const r of reqs) {
    try {
      const body = [
        { op:'add', path:'/fields/System.Title',       value: r.title },
        { op:'add', path:'/fields/System.Description', value: r.description || '' },
        { op:'add', path:'/fields/Microsoft.VSTS.Common.Priority', value: r.priority==='high'?1:r.priority==='low'?3:2 },
        { op:'add', path:'/fields/System.Tags',        value: (r.tags||[]).join('; ') },
      ];
      const res = await fetch(`${url}/${encodeURIComponent(project)}/_apis/wit/workitems/$User%20Story?api-version=7.0`, {
        method: 'POST', headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json-patch+json' },
        body: JSON.stringify(body)
      });
      if (res.ok) ok++; else err++;
    } catch(e) { err++; }
  }
  $('ado-results-pane').innerHTML = `<div style="padding:16px"><h3 style="font-size:14px;color:var(--grn)">✅ Export abgeschlossen</h3><p style="font-size:13px;color:var(--t2);margin-top:8px">${ok} erfolgreich, ${err} fehlgeschlagen.</p></div>`;
  toast(`✅ ${ok} Work Items nach Azure DevOps exportiert`);
  addNotif('🔷', 'Azure DevOps Export', `${ok} Work Items exportiert`, () => switchView('pm-integrations'));
}

async function adoImport() {
  const url = $('ado-url').value.trim(), project = $('ado-project').value.trim(), token = $('ado-token').value.trim();
  if (!url || !project || !token) { toast('⚠ Zuerst verbinden'); return; }
  $('ado-results-pane').innerHTML = '<div style="padding:16px"><div class="spin"></div> Importiere …</div>';
  try {
    const auth = btoa(`:${token}`);
    const res = await fetch(`${url}/${encodeURIComponent(project)}/_apis/wit/wiql?api-version=7.0`, {
      method: 'POST', headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: "SELECT [System.Id],[System.Title],[System.State],[System.WorkItemType] FROM WorkItems WHERE [System.TeamProject] = @project ORDER BY [System.CreatedDate] DESC" })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const items = data.workItems || [];
    window._adoItems = items;
    $('ado-results-pane').innerHTML = `<div style="padding:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <h3 style="font-size:14px">${items.length} Work Items aus ${esc(project)}</h3>
        <button class="btn-primary" style="font-size:12px" onclick="analyzeAdoImport()">✦ KI analysieren</button>
      </div>
      ${items.slice(0,50).map(i => `<div class="jira-issue"><span class="jira-key" style="color:var(--ba)">#${i.id}</span><div style="font-size:13px">${esc(i.fields?.['System.Title']||i.url||'')}</div></div>`).join('')}
      ${items.length > 50 ? `<p style="font-size:11px;color:var(--t3);margin-top:8px">… und ${items.length - 50} weitere</p>` : ''}
    </div>`;
    toast(`✅ ${items.length} Work Items geladen`);
  } catch(e) { $('ado-results-pane').innerHTML = `<div style="padding:16px;color:var(--red)">❌ Import fehlgeschlagen: ${esc(e.message)}</div>`; }
}

async function analyzeAdoImport() {
  if (!window._adoItems?.length) return;
  const list = window._adoItems.slice(0, 50).map(i => `#${i.id}: ${i.fields?.['System.Title']||''}`).join('\n');
  const res = await callAPI([{role:'user', content:`Analysiere diesen Azure DevOps Backlog: Duplikate, Lücken, Qualitätsprobleme, Priorisierungsempfehlungen.\n\n${list}`}], langNote(), 1500);
  if (!res.ok) return;
  const analysis = document.createElement('div');
  analysis.style.cssText = 'margin-top:16px;padding:14px;background:var(--s2);border-radius:var(--rl);font-size:13px;line-height:1.7;border:1px solid var(--b1);box-shadow:0 3px 10px rgba(0,0,0,.14)';
  analysis.innerHTML = `<div style="font-size:11px;font-weight:700;color:var(--ba);text-transform:uppercase;margin-bottom:8px">✦ KI-Analyse</div>${renderMD(res.text)}`;
  $('ado-results-pane').querySelector('div').appendChild(analysis);
}

window.loadPMIntegrations=loadPMIntegrations;
window.switchIntTab=switchIntTab;
window.connectJira=connectJira;
window.jiraExport=jiraExport;
window.jiraImport=jiraImport;
window.analyzeJiraImport=analyzeJiraImport;
window.connectAdo=connectAdo;
window.adoExport=adoExport;
window.adoImport=adoImport;
window.analyzeAdoImport=analyzeAdoImport;
