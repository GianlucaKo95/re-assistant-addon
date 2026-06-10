'use strict';
/**
 * ba/workshop.js
 * Workshop-Moderation — Live-Mitschrift, KI-Strukturierung, Export, Req-Extraktion.
 */

/* ══ BA: WORKSHOP ════════════════════════════════════════════ */
async function loadBaWorkshop(){
  S.workshops=await window.api.getWorkshops('');renderWsList();
  $('btn-new-workshop').onclick=openNewWs;
}
function renderWsList(){
  const list=$('ws-list');list.innerHTML='';
  if(!S.workshops.length){list.innerHTML='<div style="padding:12px;font-size:12px;color:var(--t3)">Keine Workshops.</div>';return;}
  S.workshops.forEach(w=>{
    const item=document.createElement('div');item.className='ws-list-item'+(S.activeWorkshopId===w.id?' active':'');
    item.innerHTML=`<div class="ws-item-name">${esc(w.name)}</div><div class="ws-item-meta">${new Date(w.createdAt).toLocaleDateString('de-DE')} · ${(w.entries||[]).length} Beiträge</div>`;
    item.onclick=()=>loadWorkshop(w.id);list.appendChild(item);
  });
}
function openNewWs(){
  openModal('Neuer Workshop',`
    <div class="frow"><label>Titel</label><input type="text" id="ws-title-inp" placeholder="z.B. Sprint-Planning Q2"/></div>
    <div class="frow"><label>Ziel / Thema</label><textarea id="ws-goal-inp" rows="3" placeholder="Ziel des Workshops …"></textarea></div>
    <div style="display:flex;gap:8px;margin-top:6px"><button class="btn-primary" onclick="createWs()">Starten</button><button class="btn-secondary" onclick="closeModal()">Abbrechen</button></div>`);
}
async function createWs(){
  const name=$('ws-title-inp').value.trim(),goal=$('ws-goal-inp').value.trim();
  if(!name){toast('⚠ Titel erforderlich');return;}
  await window.api.saveWorkshop({id:null,name,goal,entries:[],structured:{themes:[],decisions:[],openPoints:[],requirements:[]}});
  S.workshops=await window.api.getWorkshops('');renderWsList();closeModal();
  await loadWorkshop(S.workshops[S.workshops.length-1].id);
}
async function loadWorkshop(id){
  S.activeWorkshopId=id;renderWsList();
  const ws=S.workshops.find(w=>w.id===id);if(!ws)return;
  $('ws-empty').style.display='none';$('ws-active').style.display='flex';
  $('ws-active-title').textContent=ws.name;
  $('ws-send').onclick=sendWsMsg;
  $('ws-input').onkeydown=e=>{if(e.key==='Enter')sendWsMsg();};
  $('ws-mic').onclick=()=>toggleChatMic('ws-input','ws-mic');
  $('btn-ws-export').onclick=()=>exportWs(id);
  $('btn-ws-extract-reqs').onclick=()=>extractWsReqs(id);
  renderWsTranscript(ws);renderWsStructured(ws);
}
async function sendWsMsg(){
  const inp=$('ws-input'),text=inp.value.trim();if(!text)return;inp.value='';
  const ws=S.workshops.find(w=>w.id===S.activeWorkshopId);if(!ws)return;
  if(!ws.entries)ws.entries=[];
  ws.entries.push({role:'user',name:S.user.name,text,ts:Date.now()});
  await window.api.saveWorkshop(ws);renderWsTranscript(ws);
  S.chatHistory.ws.push({role:'user',content:text});
  const res=await callAPI(S.chatHistory.ws,
    `Du bist Workshop-Moderator und Protokollant. ${langNote()}\nWorkshop: ${ws.name}\nZiel: ${ws.goal||''}\n\nFasse zusammen, strukturiere, identifiziere Themen/Entscheidungen/offene Punkte/Anforderungen. Kurze, moderierende Antworten.`,600);
  if(!res.ok)return;
  S.chatHistory.ws.push({role:'assistant',content:res.text});
  if(S.chatHistory.ws.length>60)S.chatHistory.ws=S.chatHistory.ws.slice(-60);
  ws.entries.push({role:'ai',name:'RE-Assistent',text:res.text,ts:Date.now()});
  await updateWsStructured(ws);
  await window.api.saveWorkshop(ws);renderWsTranscript(ws);renderWsStructured(ws);
}
async function updateWsStructured(ws){
  const allText=ws.entries.filter(e=>e.role==='user').map(e=>e.text).join('\n');
  const res=await callAPI([{role:'user',content:`Extrahiere strukturiert. JSON ohne Backticks:\n{"themes":["Thema1"],"decisions":["Entscheidung1"],"openPoints":["Offener Punkt1"],"requirements":["Anforderung1"]}\n\nTranskript:\n${allText}`}],langNote(),800);
  if(!res.ok)return;
  try{ws.structured=JSON.parse(res.text.replace(/```json|```/g,'').trim());}catch(e){}
}
function renderWsTranscript(ws){
  const el=$('ws-transcript');
  el.innerHTML=(ws.entries||[]).map(e=>`<div class="ws-entry"><span class="ws-entry-role ws-role-${e.role==='user'?'user':'ai'}">${esc(e.name)}</span><div style="flex:1">${esc(e.text)}</div></div>`).join('');
  el.scrollTop=el.scrollHeight;
}
function renderWsStructured(ws){
  const s=ws.structured||{};
  $('ws-structured').innerHTML=['themes','decisions','openPoints','requirements'].map(k=>{
    const items=s[k]||[];if(!items.length)return'';
    const labels={themes:'Themen',decisions:'Entscheidungen',openPoints:'Offene Punkte',requirements:'Anforderungen'};
    return`<div class="ws-structured-section"><div class="ws-struct-title">${labels[k]}</div>${items.map(i=>`<div class="ws-struct-item">${esc(i)}</div>`).join('')}</div>`;
  }).join('');
}
async function exportWs(id){
  const ws=S.workshops.find(w=>w.id===id);if(!ws)return;const s=ws.structured||{};
  let md=`# Workshop-Protokoll: ${ws.name}\n**Datum:** ${new Date(ws.createdAt).toLocaleDateString('de-DE')}\n\n## Ziel\n${ws.goal||'—'}\n\n`;
  if(s.themes?.length)md+=`## Themen\n${s.themes.map(t=>`- ${t}`).join('\n')}\n\n`;
  if(s.decisions?.length)md+=`## Entscheidungen\n${s.decisions.map(d=>`- ${d}`).join('\n')}\n\n`;
  if(s.openPoints?.length)md+=`## Offene Punkte\n${s.openPoints.map(p=>`- ${p}`).join('\n')}\n\n`;
  if(s.requirements?.length)md+=`## Anforderungen\n${s.requirements.map(r=>`- ${r}`).join('\n')}\n\n`;
  md+=`## Transkript\n${(ws.entries||[]).map(e=>`**${e.name}:** ${e.text}`).join('\n\n')}`;
  await window.api.exportMarkdown({requirements:[],stories:[],projectName:ws.name,extra:md});toast('✅ Protokoll exportiert');
}
async function extractWsReqs(id){
  const ws=S.workshops.find(w=>w.id===id);
  if(!ws?.structured?.requirements?.length){toast('ℹ Keine Anforderungen im Workshop');return;}
  openModal('System wählen',`
    <p style="font-size:13px;color:var(--t2);margin-bottom:12px">${ws.structured.requirements.length} Anforderung(en) gefunden.</p>
    <div class="frow"><label>System</label><select id="ws-sys-sel">${S.systems.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></div>
    <div style="display:flex;gap:8px;margin-top:10px"><button class="btn-primary" onclick="doExtractWsReqs('${id}')">Übernehmen</button><button class="btn-secondary" onclick="closeModal()">Abbrechen</button></div>`);
}
async function doExtractWsReqs(wsId){
  const sysId=$('ws-sys-sel').value;if(!sysId){toast('⚠ System auswählen');return;}
  const ws=S.workshops.find(w=>w.id===wsId);
  for(const r of ws.structured.requirements||[])
    await window.api.saveRequirement({id:'REQ-'+Date.now()+'-'+Math.floor(Math.random()*1000),systemId:sysId,title:r.substring(0,80),description:r,category:'Funktional',priority:'medium',rationale:`Aus Workshop: ${ws.name}`,tags:['workshop'],createdBy:S.user.id,createdByName:S.user.name,status:'open'});
  closeModal();toast(`✅ ${ws.structured.requirements.length} Anforderungen gespeichert`);
}

window.loadBaWorkshop   = loadBaWorkshop;
window.createWs         = createWs;
window.loadWorkshop     = loadWorkshop;
window.sendWsMsg        = sendWsMsg;
window.exportWs         = exportWs;
window.extractWsReqs    = extractWsReqs;
window.doExtractWsReqs  = doExtractWsReqs;
window.renderWsList     = renderWsList;
