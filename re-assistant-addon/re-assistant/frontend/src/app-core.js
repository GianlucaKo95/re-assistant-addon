'use strict';
/* ══ STATE ══════════════════════════════════════════════════ */
const S = {
  user:null,
  settings:{apiKey:'',model:'claude-sonnet-4-20250514',language:'de',detail:'standard',
    voiceURI:'',persona:'professional',jiraUrl:'',jiraEmail:'',jiraToken:''},
  systems:[],users:[],requirements:[],backlogs:[],workshops:[],diagrams:[],
  activeView:null, activeSystemId:null, pmActiveSystemId:null,
  chatHistory:{bc:[],pmc:[],voice:[],ws:[]},
  ttsSpeed:1.0, voiceOrbState:'idle', voiceRec:null, chatMicRec:null,
  activeWorkshopId:null, activeDiagramId:null, dedupSuggestion:null,
  jiraProjects:[], currentBacklog:null,
};

/* ══ HELPERS ════════════════════════════════════════════════ */
function $(id){return document.getElementById(id);}
function setVal(id,v){const e=$(id);if(e)e.value=v;}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function now(){return new Date().toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});}
function statusLabel(s){return{open:'Offen',assigned:'Zugewiesen','in-progress':'In Bearbeitung',done:'Erledigt',rejected:'Abgelehnt'}[s]||s;}
function priLabel(p){return{high:'Hoch',medium:'Mittel',low:'Niedrig'}[p]||p;}
function roleLabel(r){return{admin:'Administrator',business:'Business',businessanalyst:'Business Analyst',projectmanager:'Projektmanager',developer:'Entwickler'}[r]||r;}
function renderMD(t){
  return esc(t)
    .replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.*?)\*/g,'<em>$1</em>')
    .replace(/`(.*?)`/g,'<code>$1</code>')
    .replace(/^#{1,3} (.+)/gm,'<strong>$1</strong>')
    .replace(/^- (.+)/gm,'<li style="margin:2px 0 2px 14px">$1</li>')
    .replace(/\n\n/g,'<br><br>').replace(/\n/g,'<br>');
}
function autoResize(el){el.style.height='auto';el.style.height=Math.min(el.scrollHeight,150)+'px';}

let toastTimer;
function toast(msg){
  const t=$('toast');t.textContent=msg;t.classList.add('show');
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),3200);
}
function openModal(title,bodyHTML){
  $('modal-title').textContent=title;$('modal-body').innerHTML=bodyHTML;
  $('modal-overlay').style.display='flex';
}
function closeModal(){$('modal-overlay').style.display='none';}

function pushMsg(containerId,role,md){
  const c=$(containerId);const div=document.createElement('div');
  div.className=`msg ${role==='u'||role==='user'?'u':'a'}`;
  div.innerHTML=`<div class="bubble">${renderMD(md)}</div><div class="msg-meta">${role==='u'||role==='user'?'Sie':'RE-Assistent · '+now()}</div>`;
  c.appendChild(div);c.scrollTop=c.scrollHeight;return div;
}
function addTyping(containerId){
  const c=$(containerId);const div=document.createElement('div');div.className='msg a';
  div.innerHTML='<div class="bubble"><div class="typing-dots"><div class="tdot"></div><div class="tdot"></div><div class="tdot"></div></div></div>';
  c.appendChild(div);c.scrollTop=c.scrollHeight;return div;
}

/* ══ API ════════════════════════════════════════════════════ */
function getCtx(sys,max=50000){
  if(!sys?.docs?.length)return'';
  let tot=0,parts=[];
  for(const d of sys.docs){const c=d.content.substring(0,12000);tot+=c.length;if(tot>max)break;parts.push(`### ${d.relativePath||d.name}\n\n${c}`);}
  return parts.join('\n\n---\n\n');
}
function langNote(){return S.settings.language==='de'?'Antworte auf Deutsch.':'Respond in English.';}
async function callAPI(messages,system='',maxTokens=2000){
  if(!S.settings.apiKey)return{ok:false,text:'Kein API-Key. Bitte unter Einstellungen eintragen.'};
  const res=await window.api.anthropicRequest({apiKey:S.settings.apiKey,body:{model:S.settings.model||'claude-sonnet-4-20250514',max_tokens:maxTokens,system,messages}});
  if(!res.ok)return{ok:false,text:`API-Fehler (${res.status}): ${res.data?.error?.message||'Unbekannt'}`};
  return{ok:true,text:res.data.content?.find(c=>c.type==='text')?.text||''};
}

/* ══ BOOT ═══════════════════════════════════════════════════ */
(async function boot(){
  $('login-btn').onclick=doLogin;
  $('l-pass').onkeydown=e=>{if(e.key==='Enter')doLogin();};
  $('app-ver').textContent=await window.api.getAppVersion();
  S.settings=await window.api.loadSettings();
  applySettings();populateVoices();
})();

async function doLogin(){
  const email=$('l-email').value.trim(),pass=$('l-pass').value;
  $('login-error').textContent='';
  const res=await window.api.login({email,password:pass});
  if(!res.ok){$('login-error').textContent=res.error;return;}
  S.user=res.user;
  $('login-screen').style.display='none';$('app-screen').style.display='flex';
  await initApp();
}

async function initApp(){
  $('user-avatar').textContent=S.user.name.split(' ').map(w=>w[0]).join('').toUpperCase().substring(0,2);
  $('user-name-label').textContent=S.user.name;
  const rb=$('user-role-badge');rb.textContent=roleLabel(S.user.role);rb.className=`rb-${S.user.role}`;
  $('btn-logout').onclick=()=>{
    S.user=null;Object.keys(S.chatHistory).forEach(k=>S.chatHistory[k]=[]);
    $('app-screen').style.display='none';$('login-screen').style.display='flex';
  };
  $('btn-settings-nav').onclick=()=>switchView('settings');
  S.systems=await window.api.getSystems();
  if(S.user.role==='admin')S.users=await window.api.getUsers();
  buildNav();bindGlobal();buildVoice();
  const dv={admin:'admin-users',business:'business-chat',businessanalyst:'ba-quality',projectmanager:'pm-dashboard',developer:'dev-work'};
  switchView(dv[S.user.role]||'settings');
}

/* ══ NAV ════════════════════════════════════════════════════ */
function icoSvg(d){return`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${d}</svg>`;}
const ICONS={
  users:icoSvg('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
  layers:icoSvg('<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>'),
  chat:icoSvg('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'),
  list:icoSvg('<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>'),
  check:icoSvg('<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>'),
  doc:icoSvg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>'),
  diagram:icoSvg('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>'),
  workshop:icoSvg('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
  dash:icoSvg('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>'),
  assign:icoSvg('<polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/>'),
  backlog:icoSvg('<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>'),
  prio:icoSvg('<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>'),
  jira:icoSvg('<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>'),
  code:icoSvg('<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>'),
  mic:icoSvg('<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>'),
};

const NAV={
  admin:[{id:'admin-users',icon:ICONS.users,label:'Benutzer'},{id:'admin-systems',icon:ICONS.layers,label:'Systeme'},{id:'voice',icon:ICONS.mic,label:'Sprach-Bot'}],
  business:[{id:'business-chat',icon:ICONS.chat,label:'Chat & Prozesse'},{id:'business-reqs',icon:ICONS.list,label:'Anforderungen'},{id:'voice',icon:ICONS.mic,label:'Sprach-Bot'}],
  businessanalyst:[
    {id:'ba-quality',icon:ICONS.check,label:'QS (ISO 29148)'},
    {id:'ba-docanalysis',icon:ICONS.doc,label:'Dokumentenanalyse'},
    {id:'ba-diagrams',icon:ICONS.diagram,label:'Diagramme'},
    {id:'ba-workshop',icon:ICONS.workshop,label:'Workshop'},
    {id:'business-chat',icon:ICONS.chat,label:'Chat & Prozesse'},
    {id:'voice',icon:ICONS.mic,label:'Sprach-Bot'},
  ],
  projectmanager:[
    {id:'pm-dashboard',icon:ICONS.dash,label:'Dashboard'},
    {id:'pm-chat',icon:ICONS.chat,label:'Chat & Analyse'},
    {id:'pm-assign',icon:ICONS.assign,label:'Zuweisen'},
    {id:'pm-backlog',icon:ICONS.backlog,label:'Backlog Builder'},
    {id:'pm-prio',icon:ICONS.prio,label:'Priorisierung'},
    {id:'pm-jira',icon:ICONS.jira,label:'Jira'},
    {id:'voice',icon:ICONS.mic,label:'Sprach-Bot'},
  ],
  developer:[{id:'dev-work',icon:ICONS.code,label:'Meine Aufgaben'},{id:'voice',icon:ICONS.mic,label:'Sprach-Bot'}],
};

function buildNav(){
  $('ln-items').innerHTML=(NAV[S.user.role]||[]).map(n=>
    `<button class="ln-btn" id="nav-${n.id}" onclick="switchView('${n.id}')" title="${n.label}">${n.icon}<span class="ln-tooltip">${n.label}</span></button>`
  ).join('');
}

async function switchView(id){
  S.activeView=id;
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.querySelectorAll('.ln-btn').forEach(b=>b.classList.remove('active'));
  const v=$('view-'+id);if(v)v.classList.add('active');
  const nb=$('nav-'+id);if(nb)nb.classList.add('active');
  const map={
    'admin-users':loadAdminUsers,'admin-systems':loadAdminSystems,
    'business-chat':loadBizChat,'business-reqs':loadBizReqs,
    'ba-quality':loadBaQS,'ba-docanalysis':loadBaDocAnalysis,
    'ba-diagrams':loadBaDiagrams,'ba-workshop':loadBaWorkshop,
    'pm-dashboard':loadPMDash,'pm-chat':loadPMChat,'pm-assign':loadPMAssign,
    'pm-backlog':loadPMBacklog,'pm-prio':loadPMPrio,'pm-jira':loadPMJira,
    'dev-work':loadDevWork,
  };
  if(map[id])await map[id]();
}

function bindGlobal(){
  $('btn-save-cfg').onclick=saveCfg;
  $('cfg-toggle').onclick=()=>{const i=$('cfg-apikey');i.type=i.type==='password'?'text':'password';$('cfg-toggle').textContent=i.type==='password'?'Anzeigen':'Verbergen';};
  $('btn-docs').onclick=()=>window.api.openExternal('https://docs.anthropic.com');
  $('modal-overlay').onclick=e=>{if(e.target===$('modal-overlay'))closeModal();};
  $('modal-close').onclick=closeModal;
  $('btn-export-pm-md').onclick=async()=>{const r=await window.api.getRequirements({systemId:S.pmActiveSystemId});await window.api.exportMarkdown({requirements:r,stories:[],projectName:'PM-Export'});toast('✅ Exportiert');};
  $('btn-export-pm-csv').onclick=async()=>{const r=await window.api.getRequirements({systemId:S.pmActiveSystemId});await window.api.exportCSV({requirements:r});toast('✅ CSV exportiert');};
}

/* ══ SETTINGS ═══════════════════════════════════════════════ */
function applySettings(){
  setVal('cfg-apikey',S.settings.apiKey||'');setVal('cfg-model',S.settings.model);
  setVal('cfg-lang',S.settings.language);setVal('cfg-detail',S.settings.detail);
  setVal('cfg-persona',S.settings.persona||'professional');
  setVal('cfg-jira-url',S.settings.jiraUrl||'');setVal('cfg-jira-email',S.settings.jiraEmail||'');setVal('cfg-jira-token',S.settings.jiraToken||'');
}
async function saveCfg(){
  S.settings.apiKey=$('cfg-apikey').value.trim();S.settings.model=$('cfg-model').value;
  S.settings.language=$('cfg-lang').value;S.settings.detail=$('cfg-detail').value;
  S.settings.persona=$('cfg-persona').value;S.settings.voiceURI=$('cfg-voice').value;
  S.settings.jiraUrl=$('cfg-jira-url').value.trim();
  S.settings.jiraEmail=$('cfg-jira-email').value.trim();
  S.settings.jiraToken=$('cfg-jira-token').value.trim();
  await window.api.saveSettings(S.settings);
  $('cfg-msg').textContent='✅ Gespeichert.';setTimeout(()=>$('cfg-msg').textContent='',3000);
}

/* ══ ADMIN: USERS ═══════════════════════════════════════════ */
async function loadAdminUsers(){S.users=await window.api.getUsers();renderUsersTable();$('btn-new-user').onclick=()=>openUserModal(null);}
function renderUsersTable(){
  const w=$('users-table-wrap');
  if(!S.users.length){w.innerHTML='<div class="empty-state"><h3>Keine Benutzer</h3></div>';return;}
  w.innerHTML=`<table class="data-table"><thead><tr><th>Name</th><th>E-Mail</th><th>Rolle</th><th>Systeme</th><th>Bereiche</th><th>Aktionen</th></tr></thead><tbody>
  ${S.users.map(u=>`<tr>
    <td><strong>${esc(u.name)}</strong></td><td style="color:var(--t2)">${esc(u.email)}</td>
    <td><span class="sbadge rb-${u.role}">${roleLabel(u.role)}</span></td>
    <td>${(u.systems||[]).map(sid=>{const s=S.systems.find(x=>x.id===sid);return s?`<span class="rtag">${esc(s.name)}</span> `:''}).join('')||'—'}</td>
    <td>${(u.subcategories||[]).map(s=>`<span class="rtag">${esc(s)}</span>`).join('')||'—'}</td>
    <td><div style="display:flex;gap:5px">
      <button class="btn-secondary" style="font-size:11px;padding:4px 10px" onclick="openUserModal('${u.id}')">Bearbeiten</button>
      <button class="btn-danger" style="font-size:11px;padding:4px 10px" onclick="deleteUser('${u.id}')">Löschen</button>
    </div></td>
  </tr>`).join('')}</tbody></table>`;
}
function openUserModal(uid){
  const u=uid?S.users.find(x=>x.id===uid):{id:null,name:'',email:'',role:'business',systems:[],subcategories:[],password:''};
  const so=S.systems.map(s=>`<option value="${s.id}"${(u.systems||[]).includes(s.id)?' selected':''}>${esc(s.name)}</option>`).join('');
  openModal(uid?'Benutzer bearbeiten':'Neuer Benutzer',`
    <div class="frow"><label>Name</label><input type="text" id="um-name" value="${esc(u.name)}"/></div>
    <div class="frow"><label>E-Mail</label><input type="email" id="um-email" value="${esc(u.email)}"/></div>
    <div class="frow"><label>Rolle</label><select id="um-role">
      <option value="admin"${u.role==='admin'?' selected':''}>Administrator</option>
      <option value="business"${u.role==='business'?' selected':''}>Business</option>
      <option value="businessanalyst"${u.role==='businessanalyst'?' selected':''}>Business Analyst</option>
      <option value="projectmanager"${u.role==='projectmanager'?' selected':''}>Projektmanager</option>
      <option value="developer"${u.role==='developer'?' selected':''}>Entwickler</option>
    </select></div>
    <div class="frow"><label>Systeme (Strg/Cmd = Mehrfach)</label><select id="um-systems" multiple style="height:90px">${so}</select></div>
    <div class="frow"><label>Unterbereiche (kommagetrennt)</label><input type="text" id="um-subs" value="${(u.subcategories||[]).join(', ')}"/></div>
    <div class="frow"><label>${uid?'Neues Passwort (leer = unverändert)':'Passwort'}</label><input type="password" id="um-pass" placeholder="${uid?'leer lassen …':'Passwort …'}"/></div>
    <div style="display:flex;gap:8px;margin-top:6px">
      <button class="btn-primary" onclick="saveUserModal('${uid||''}')">Speichern</button>
      <button class="btn-secondary" onclick="closeModal()">Abbrechen</button>
    </div>`);
}
async function saveUserModal(uid){
  const ss=Array.from($('um-systems').selectedOptions).map(o=>o.value);
  const subs=$('um-subs').value.split(',').map(s=>s.trim()).filter(Boolean);
  const pw=$('um-pass').value;
  const d={id:uid||null,name:$('um-name').value.trim(),email:$('um-email').value.trim(),role:$('um-role').value,systems:ss,subcategories:subs};
  if(pw)d.password=pw;
  await window.api.saveUser(d);S.users=await window.api.getUsers();renderUsersTable();closeModal();toast('✅ Gespeichert');
}
async function deleteUser(id){if(!confirm('Löschen?'))return;await window.api.deleteUser(id);S.users=await window.api.getUsers();renderUsersTable();toast('✅ Gelöscht');}

/* ══ ADMIN: SYSTEMS ══════════════════════════════════════════ */
async function loadAdminSystems(){S.systems=await window.api.getSystems();renderSystems();$('btn-new-system').onclick=()=>openSysModal(null);}
function renderSystems(){
  const w=$('systems-list');
  if(!S.systems.length){w.innerHTML='<div class="empty-state"><h3>Keine Systeme</h3></div>';return;}
  w.innerHTML=S.systems.map(sys=>`<div class="system-card">
    <div class="system-card-head">
      <div><div class="req-title">${esc(sys.name)}</div><div class="view-sub">${esc(sys.description||'')}</div></div>
      <div style="display:flex;gap:6px">
        <button class="btn-secondary" style="font-size:11px;padding:4px 10px" onclick="openSysModal('${sys.id}')">Bearbeiten</button>
        <button class="btn-danger" style="font-size:11px;padding:4px 10px" onclick="delSys('${sys.id}')">Löschen</button>
      </div>
    </div>
    <div class="system-card-body">
      <div style="font-size:11px;font-weight:600;color:var(--t3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">${(sys.docs||[]).length} Dokumente</div>
      <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px">
        ${(sys.docs||[]).map(d=>`<span class="doc-chip">${esc(d.name)}<span class="rm" onclick="remDoc('${sys.id}','${d.id}')">✕</span></span>`).join('')}
      </div>
      <div style="display:flex;gap:7px">
        <button class="btn-secondary" style="font-size:11px;padding:5px 10px" onclick="addFiles('${sys.id}')">+ Dateien</button>
        <button class="btn-secondary" style="font-size:11px;padding:5px 10px" onclick="addFolder('${sys.id}')">+ Ordner</button>
      </div>
    </div></div>`).join('');
}
function openSysModal(id){
  const s=id?S.systems.find(x=>x.id===id):{id:null,name:'',description:''};
  openModal(id?'System bearbeiten':'Neues System',`
    <div class="frow"><label>Name</label><input type="text" id="sm-name" value="${esc(s.name)}"/></div>
    <div class="frow"><label>Beschreibung</label><textarea id="sm-desc" rows="3">${esc(s.description||'')}</textarea></div>
    <div style="display:flex;gap:8px;margin-top:6px">
      <button class="btn-primary" onclick="saveSys('${id||''}')">Speichern</button>
      <button class="btn-secondary" onclick="closeModal()">Abbrechen</button>
    </div>`);
}
async function saveSys(id){await window.api.saveSystem({id:id||null,name:$('sm-name').value.trim(),description:$('sm-desc').value.trim()});S.systems=await window.api.getSystems();renderSystems();closeModal();toast('✅ Gespeichert');}
async function delSys(id){if(!confirm('Löschen?'))return;await window.api.deleteSystem(id);S.systems=await window.api.getSystems();renderSystems();toast('✅ Gelöscht');}
async function addFiles(id){await window.api.addDocsToSystem(id);S.systems=await window.api.getSystems();renderSystems();toast('✅ Dateien hinzugefügt');}
async function addFolder(id){await window.api.addFolderToSystem(id);S.systems=await window.api.getSystems();renderSystems();toast('✅ Ordner geladen');}
async function remDoc(sid,did){await window.api.removeDoc({systemId:sid,docId:did});S.systems=await window.api.getSystems();renderSystems();}

/* ══ SHARED REQ RENDER ═══════════════════════════════════════ */
function renderReqList(containerId,reqs,mode){
  const w=$(containerId);if(!w)return;
  if(!reqs.length){w.innerHTML='<div class="empty-state"><h3>Keine Anforderungen</h3><p>Noch keine Anforderungen vorhanden.</p></div>';return;}
  w.innerHTML=reqs.map(r=>{
    const sys=S.systems.find(s=>s.id===r.systemId);
    return`<div class="req-card">
      <div class="req-card-head">
        <div>
          <div style="display:flex;align-items:center;gap:7px;margin-bottom:3px;flex-wrap:wrap">
            <span class="req-id">${esc(r.id)}</span>
            <span class="sbadge s-${r.status}">${statusLabel(r.status)}</span>
            <span class="sbadge p-${r.priority}">${priLabel(r.priority)}</span>
            ${sys?`<span class="rtag">${esc(sys.name)}</span>`:''}
            ${r.subcategory?`<span class="rtag">${esc(r.subcategory)}</span>`:''}
            ${r.qualityScore?`<span class="sbadge" style="background:${r.qualityScore>=7?'var(--grnbg)':r.qualityScore>=4?'var(--ambbg)':'var(--redbg)'};color:${r.qualityScore>=7?'var(--grn)':r.qualityScore>=4?'var(--amb)':'var(--red)'}">QS:${r.qualityScore}</span>`:''}
            ${r.sourceAnalysis?'<span class="sbadge" style="background:var(--bluebg);color:var(--blue)">🔍 Source</span>':''}
          </div>
          <div class="req-title">${esc(r.title)}</div>
        </div>
        ${mode!=='developer'?`<button class="btn-secondary" style="font-size:11px;padding:4px 10px" onclick="openReqModal('${r.id}')">Bearbeiten</button>`:''}
      </div>
      <div class="req-card-body">
        <div class="req-desc">${esc(r.description||'')}</div>
        ${r.rationale?`<div class="req-rat">${esc(r.rationale)}</div>`:''}
        <div class="req-foot">${(r.tags||[]).map(t=>`<span class="rtag">${esc(t)}</span>`).join('')}</div>
      </div></div>`;
  }).join('');
}

function openReqModal(reqId,defaultSystemId){
  const r=reqId?(S.requirements||[]).find(x=>x.id===reqId):{id:null,systemId:defaultSystemId||'',title:'',description:'',category:'Funktional',priority:'medium',rationale:'',tags:[]};
  const so=S.systems.map(s=>`<option value="${s.id}"${r.systemId===s.id?' selected':''}>${esc(s.name)}</option>`).join('');
  openModal(reqId?'Anforderung bearbeiten':'Neue Anforderung',`
    <div class="frow"><label>System</label><select id="rm-sys">${so}</select></div>
    <div class="frow"><label>Titel</label><input type="text" id="rm-title" value="${esc(r.title)}"/></div>
    <div class="frow"><label>Beschreibung</label><textarea id="rm-desc" rows="4">${esc(r.description||'')}</textarea></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="frow"><label>Kategorie</label><select id="rm-cat">${['Funktional','Nicht-funktional','Sicherheit','Performance','UI/UX','Daten','Integration','Wartbarkeit'].map(c=>`<option${r.category===c?' selected':''}>${c}</option>`).join('')}</select></div>
      <div class="frow"><label>Priorität</label><select id="rm-pri"><option value="high"${r.priority==='high'?' selected':''}>Hoch</option><option value="medium"${r.priority==='medium'?' selected':''}>Mittel</option><option value="low"${r.priority==='low'?' selected':''}>Niedrig</option></select></div>
    </div>
    <div class="frow"><label>Begründung</label><textarea id="rm-rat" rows="2">${esc(r.rationale||'')}</textarea></div>
    <div class="frow"><label>Tags (kommagetrennt)</label><input type="text" id="rm-tags" value="${(r.tags||[]).join(', ')}"/></div>
    <div style="display:flex;gap:8px;margin-top:6px">
      <button class="btn-primary" onclick="saveReqModal('${reqId||''}')">Speichern</button>
      ${reqId?`<button class="btn-danger" style="font-size:12px;padding:6px 12px" onclick="deleteReqModal('${reqId}')">Löschen</button>`:''}
      <button class="btn-secondary" onclick="closeModal()">Abbrechen</button>
    </div>`);
}
async function saveReqModal(reqId){
  const tags=$('rm-tags').value.split(',').map(t=>t.trim()).filter(Boolean);
  await window.api.saveRequirement({id:reqId||null,systemId:$('rm-sys').value,title:$('rm-title').value.trim(),description:$('rm-desc').value.trim(),category:$('rm-cat').value,priority:$('rm-pri').value,rationale:$('rm-rat').value.trim(),tags,createdBy:S.user.id,createdByName:S.user.name,status:'open'});
  closeModal();toast('✅ Gespeichert');
  if(S.activeView==='business-reqs')await loadBizReqs();
  if(S.activeView==='pm-dashboard')await loadPMDash();
}
async function deleteReqModal(id){if(!confirm('Löschen?'))return;await window.api.deleteRequirement(id);closeModal();toast('✅ Gelöscht');if(S.activeView==='business-reqs')await loadBizReqs();}
