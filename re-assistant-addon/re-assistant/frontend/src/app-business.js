/* ══ BUSINESS CHAT ═══════════════════════════════════════════ */
async function loadBizChat(){
  const sl=$('bc-system-list');sl.innerHTML='';
  S.systems.forEach(sys=>{
    const btn=document.createElement('button');
    btn.className='sys-btn'+(S.activeSystemId===sys.id?' active':'');
    btn.innerHTML=`<span class="sys-dot"></span>${esc(sys.name)}`;
    btn.onclick=()=>{S.activeSystemId=sys.id;loadBizChat();};
    sl.appendChild(btn);
  });
  if(!S.activeSystemId&&S.systems.length)S.activeSystemId=S.systems[0].id;
  const inp=$('bc-input');
  $('bc-send').onclick=sendBizChat;
  inp.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendBizChat();}autoResize(inp);};
  inp.oninput=()=>autoResize(inp);
  document.querySelectorAll('#bc-chips .chip').forEach(c=>c.onclick=()=>{inp.value=c.dataset.p;sendBizChat();});
  $('bc-mic').onclick=()=>toggleChatMic('bc-input','bc-mic');
  $('bc-btn-extract').onclick=extractFromConversation;
  $('bc-btn-dedup').onclick=dedupSystem;
  $('bc-btn-add-manual').onclick=openInlineAdd;
  $('bc-btn-export-reqs').onclick=exportPaneReqs;
  $('bc-dedup-apply').onclick=applyDedup;
  $('bc-dedup-dismiss').onclick=hideDedup;
  ['bc-req-search','bc-req-filter-cat','bc-req-filter-pri'].forEach(id=>{const el=$(id);if(el)el.oninput=renderReqPane;});
  if(!$('bc-chat-msgs').children.length){
    const sys=S.systems.find(s=>s.id===S.activeSystemId);
    pushMsg('bc-chat-msgs','a',sys?`Willkommen! System: **${sys.name}** (${(sys.docs||[]).length} Dokumente). Wie kann ich helfen?`:'Kein System ausgewählt.');
  }
  await refreshReqPane();
}

async function sendBizChat(){
  const inp=$('bc-input');const text=inp.value.trim();if(!text)return;
  inp.value='';inp.style.height='auto';
  pushMsg('bc-chat-msgs','u',text);S.chatHistory.bc.push({role:'user',content:text});
  const typing=addTyping('bc-chat-msgs');
  const sys=S.systems.find(s=>s.id===S.activeSystemId);
  const res=await callAPI(S.chatHistory.bc,
    `Du bist ein Requirements Engineer und Business-Analyst. ${langNote()}\n${sys?`System: ${sys.name}\n${getCtx(sys)}`:'Kein System.'}\n\nHilf bei Anforderungsdefinition und Prozessmodellierung.`,1800);
  typing.remove();
  const reply=res.ok?res.text:`❌ ${res.text}`;
  pushMsg('bc-chat-msgs','a',reply);
  if(res.ok){S.chatHistory.bc.push({role:'assistant',content:reply});if(S.chatHistory.bc.length>40)S.chatHistory.bc=S.chatHistory.bc.slice(-40);}
}

/* ══ REQ PANE ════════════════════════════════════════════════ */
async function refreshReqPane(){
  if(!$('bc-req-pane')||!S.activeSystemId)return;
  S.requirements=await window.api.getRequirements({systemId:S.activeSystemId});
  updatePaneCatFilter();renderReqPane();
}
function updatePaneCatFilter(){
  const sel=$('bc-req-filter-cat');if(!sel)return;
  const cats=[...new Set(S.requirements.map(r=>r.category).filter(Boolean))],cur=sel.value;
  sel.innerHTML='<option value="">Alle</option>'+cats.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');
  if(cats.includes(cur))sel.value=cur;
}
function renderReqPane(){
  const list=$('bc-req-list'),badge=$('bc-req-count-badge');if(!list)return;
  const q=($('bc-req-search')?.value||'').toLowerCase(),cat=$('bc-req-filter-cat')?.value||'',pri=$('bc-req-filter-pri')?.value||'';
  const reqs=S.requirements.filter(r=>r.systemId===S.activeSystemId&&(S.user.role==='admin'||r.createdBy===S.user.id));
  if(badge)badge.textContent=reqs.length;
  const f=reqs.filter(r=>(!q||r.title?.toLowerCase().includes(q)||r.description?.toLowerCase().includes(q))&&(!cat||r.category===cat)&&(!pri||r.priority===pri));
  if(!f.length){list.innerHTML=`<div style="padding:24px 10px;text-align:center;color:var(--t3);font-size:12px">${reqs.length?'Keine Treffer.':'Noch keine Anforderungen.'}</div>`;return;}
  list.innerHTML=f.map(r=>`<div class="bc-req-item${r.isDuplicate?' duplicate-flag':''}" id="bri-${r.id}">
    <div class="bri-top">
      <div style="display:flex;align-items:center;gap:5px">
        ${r.isDuplicate?'<span class="dup-dot"></span>':''}
        <span class="bri-id">${esc(r.id)}</span>
        ${r.qualityScore?`<span style="font-size:9px;font-weight:700;padding:1px 6px;border-radius:99px;background:${r.qualityScore>=7?'var(--grnbg)':r.qualityScore>=4?'var(--ambbg)':'var(--redbg)'};color:${r.qualityScore>=7?'var(--grn)':r.qualityScore>=4?'var(--amb)':'var(--red)'}">QS:${r.qualityScore}</span>`:''}
      </div>
      <span class="sbadge p-${r.priority}" style="font-size:9px">${priLabel(r.priority)}</span>
    </div>
    <div class="bri-title" onclick="toggleBriEdit('${r.id}')">${esc(r.title)}</div>
    <div class="bri-desc">${esc(r.description||'')}</div>
    <div class="bri-actions">
      <button class="bri-btn" onclick="toggleBriEdit('${r.id}')">✏ Bearbeiten</button>
      <button class="bri-btn" onclick="aiRefineReq('${r.id}')">✦ KI</button>
      <button class="bri-btn del" onclick="delPaneReq('${r.id}')">✕</button>
    </div>
    <div class="bri-edit-form" id="bri-edit-${r.id}">
      <input type="text" id="bri-t-${r.id}" value="${esc(r.title)}" placeholder="Titel"/>
      <textarea id="bri-d-${r.id}" placeholder="Beschreibung">${esc(r.description||'')}</textarea>
      <div class="bri-edit-row">
        <select id="bri-c-${r.id}">${['Funktional','Nicht-funktional','Sicherheit','Performance','UI/UX','Daten','Integration','Wartbarkeit'].map(c=>`<option${r.category===c?' selected':''}>${c}</option>`).join('')}</select>
        <select id="bri-p-${r.id}"><option value="high"${r.priority==='high'?' selected':''}>Hoch</option><option value="medium"${r.priority==='medium'?' selected':''}>Mittel</option><option value="low"${r.priority==='low'?' selected':''}>Niedrig</option></select>
      </div>
      <input type="text" id="bri-rat-${r.id}" value="${esc(r.rationale||'')}" placeholder="Begründung"/>
      <div class="bri-edit-actions">
        <button class="rp-btn rp-primary" onclick="savePaneReq('${r.id}')">Speichern</button>
        <button class="rp-btn" onclick="toggleBriEdit('${r.id}')">Abbrechen</button>
      </div>
    </div></div>`).join('');
}
function toggleBriEdit(id){$(`bri-edit-${id}`)?.classList.toggle('open');}
async function savePaneReq(id){
  const r=S.requirements.find(x=>x.id===id);if(!r)return;
  await window.api.saveRequirement({...r,title:$(`bri-t-${id}`)?.value.trim()||r.title,description:$(`bri-d-${id}`)?.value.trim(),category:$(`bri-c-${id}`)?.value||r.category,priority:$(`bri-p-${id}`)?.value||r.priority,rationale:$(`bri-rat-${id}`)?.value.trim()});
  toast('✅ Gespeichert');await refreshReqPane();
}
async function delPaneReq(id){if(!confirm('Entfernen?'))return;await window.api.deleteRequirement(id);toast('✅ Entfernt');await refreshReqPane();}
async function aiRefineReq(id){
  const r=S.requirements.find(x=>x.id===id);if(!r)return;toast('✦ Verfeinere …');
  const res=await callAPI([{role:'user',content:`Verbessere präziser und messbarer. JSON ohne Backticks:\n{"title":"...","description":"...","rationale":"..."}\n\nTitel: ${r.title}\nBeschreibung: ${r.description}`}],langNote(),500);
  if(!res.ok){toast('❌ Fehler');return;}
  try{const ref=JSON.parse(res.text.replace(/```json|```/g,'').trim());await window.api.saveRequirement({...r,...ref});toast('✅ Verfeinert');await refreshReqPane();}
  catch(e){toast('❌ Parsing-Fehler');}
}
async function extractFromConversation(){
  if(!S.activeSystemId){toast('⚠ System auswählen');return;}
  const btn=$('bc-btn-extract');btn.disabled=true;btn.innerHTML='<span class="spin"></span>';
  const hist=S.chatHistory.bc.map(m=>`${m.role==='user'?'Nutzer':'Assistent'}: ${m.content}`).join('\n\n');
  const existing=S.requirements.filter(r=>r.systemId===S.activeSystemId).map(r=>r.title).join(', ');
  const res=await callAPI([{role:'user',content:`Extrahiere alle Requirements aus dem Gespräch. NICHT duplizieren: ${existing||'(keine)'}\n\nGespräch:\n${hist}\n\nJSON-Array ohne Backticks:\n[{"id":"REQ-${Date.now()}","category":"Funktional","title":"...","description":"...","priority":"medium","rationale":"","tags":[]}]\n\nWenn keine neuen: []`}],langNote(),2500);
  btn.disabled=false;btn.innerHTML='<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>Extrahieren';
  if(!res.ok){toast('❌ '+res.text);return;}
  try{
    const reqs=JSON.parse(res.text.replace(/```json|```/g,'').trim());
    if(!reqs.length){toast('ℹ Keine neuen Requirements im Gespräch');return;}
    for(const r of reqs)await window.api.saveRequirement({...r,id:'REQ-'+Date.now()+'-'+Math.floor(Math.random()*1000),systemId:S.activeSystemId,createdBy:S.user.id,createdByName:S.user.name,status:'open'});
    toast(`✅ ${reqs.length} Anforderung(en) hinzugefügt`);await refreshReqPane();
  }catch(e){toast('❌ Parsing-Fehler');}
}
async function openInlineAdd(){
  openModal('Neue Anforderung',`
    <div class="frow"><label>Titel</label><input type="text" id="ip-t" placeholder="Kurzer Titel"/></div>
    <div class="frow"><label>Beschreibung</label><textarea id="ip-d" rows="3"></textarea></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="frow"><label>Kategorie</label><select id="ip-c">${['Funktional','Nicht-funktional','Sicherheit','Performance','UI/UX','Daten','Integration','Wartbarkeit'].map(c=>`<option>${c}</option>`).join('')}</select></div>
      <div class="frow"><label>Priorität</label><select id="ip-p"><option value="high">Hoch</option><option value="medium" selected>Mittel</option><option value="low">Niedrig</option></select></div>
    </div>
    <div class="frow"><label>Begründung</label><input type="text" id="ip-r" placeholder="Warum wichtig?"/></div>
    <div style="display:flex;gap:8px;margin-top:6px"><button class="btn-primary" onclick="saveInlineAdd()">Speichern</button><button class="btn-secondary" onclick="closeModal()">Abbrechen</button></div>`);
}
async function saveInlineAdd(){
  const t=$('ip-t').value.trim();if(!t){toast('⚠ Titel erforderlich');return;}
  await window.api.saveRequirement({id:'REQ-'+Date.now(),systemId:S.activeSystemId,title:t,description:$('ip-d').value.trim(),category:$('ip-c').value,priority:$('ip-p').value,rationale:$('ip-r').value.trim(),tags:[],createdBy:S.user.id,createdByName:S.user.name,status:'open'});
  closeModal();toast('✅ Hinzugefügt');await refreshReqPane();
}
async function exportPaneReqs(){
  const reqs=S.requirements.filter(r=>r.systemId===S.activeSystemId&&(S.user.role==='admin'||r.createdBy===S.user.id));
  await window.api.exportMarkdown({requirements:reqs,stories:[],projectName:S.systems.find(s=>s.id===S.activeSystemId)?.name||'Export'});
  toast('✅ Exportiert');
}

/* ══ DEDUP ═══════════════════════════════════════════════════ */
async function dedupSystem(){
  const reqs=S.requirements.filter(r=>r.systemId===S.activeSystemId);
  if(reqs.length<2){toast('ℹ Nicht genug Anforderungen');return;}
  await _runDedup(reqs,'pane');
}
async function runGlobalDedup(){
  const all=await window.api.getRequirements({});
  const my=all.filter(r=>S.user.role==='admin'||r.createdBy===S.user.id);
  if(my.length<2){toast('ℹ Nicht genug');return;}
  await _runDedup(my,'modal');
}
async function _runDedup(reqs,mode){
  toast('Analysiere Redundanzen …');
  const rl=reqs.map(r=>`ID:${r.id} [${r.category}] ${r.title} — ${(r.description||'').substring(0,120)}`).join('\n');
  const res=await callAPI([{role:'user',content:`Analysiere auf Redundanzen. JSON ohne Backticks:\n{"duplicateGroups":[{"reason":"...","reqIds":["REQ-001","REQ-002"],"merged":{"title":"...","description":"...","category":"Funktional","priority":"medium","rationale":"..."}}],"summary":"..."}\n\nAnforderungen:\n${rl}`}],langNote(),2000);
  if(!res.ok){toast('❌ '+res.text);return;}
  try{
    const a=JSON.parse(res.text.replace(/```json|```/g,'').trim());
    S.dedupSuggestion={analysis:a,allReqs:reqs};
    if(!a.duplicateGroups?.length){toast('✅ Keine Redundanzen — '+a.summary);return;}
    if(mode==='pane')showDedupBanner(a);else showDedupModal(a,reqs);
    a.duplicateGroups.flatMap(g=>g.reqIds).forEach(id=>{const el=$(`bri-${id}`);if(el)el.classList.add('duplicate-flag');});
  }catch(e){toast('❌ Parsing-Fehler');}
}
function showDedupBanner(a){
  const b=$('bc-dedup-banner'),t=$('bc-dedup-text');if(!b||!t)return;
  t.innerHTML=`<strong>${a.duplicateGroups.length} Gruppe(n).</strong> ${esc(a.summary)}`;
  b.style.display='';b.classList.add('visible');
}
function hideDedup(){const b=$('bc-dedup-banner');if(b){b.classList.remove('visible');setTimeout(()=>b.style.display='none',300);}S.dedupSuggestion=null;}
async function applyDedup(){
  if(!S.dedupSuggestion)return;
  let m=0,r=0;
  for(const g of S.dedupSuggestion.analysis.duplicateGroups){
    if(!g.reqIds?.length||!g.merged)continue;
    const primary=S.dedupSuggestion.allReqs.find(x=>x.id===g.reqIds[0]);if(!primary)continue;
    await window.api.saveRequirement({...primary,...g.merged});m++;
    for(const id of g.reqIds.slice(1)){await window.api.deleteRequirement(id);r++;}
  }
  hideDedup();toast(`✅ ${m} zusammengeführt, ${r} entfernt`);await refreshReqPane();
}
function showDedupModal(a,reqs){
  openModal(`${a.duplicateGroups.length} Redundanzgruppe(n)`,
    `<p style="font-size:13px;color:var(--t2);margin-bottom:14px">${esc(a.summary)}</p>`+
    a.duplicateGroups.map((g,i)=>`<div class="dedup-group">
      <div class="dedup-group-head">Gruppe ${i+1}: ${esc(g.reason)}</div>
      ${g.reqIds.map(id=>{const r=reqs.find(x=>x.id===id);if(!r)return'';const sys=S.systems.find(s=>s.id===r.systemId);return`<div style="padding:6px 0;border-bottom:1px solid var(--b1);font-size:12px"><strong>${esc(r.id)}</strong>${sys?` <span class="rtag" style="font-size:9px">${esc(sys.name)}</span>`:''} — ${esc(r.title)}</div>`;}).join('')}
      ${g.merged?`<div class="dedup-merged"><div class="dedup-merged-label">✦ KI-Vorschlag</div><strong>${esc(g.merged.title)}</strong><p style="font-size:12px;color:var(--t2);margin-top:4px">${esc(g.merged.description)}</p></div>`:''}
    </div>`).join('')+
    `<div style="display:flex;gap:8px;margin-top:8px"><button class="btn-primary" onclick="applyGlobalDedup()">Zusammenführen</button><button class="btn-secondary" onclick="closeModal()">Abbrechen</button></div>`);
}
async function applyGlobalDedup(){closeModal();await applyDedup();if(S.activeView==='business-reqs')await loadBizReqs();}

/* ══ BUSINESS REQS ═══════════════════════════════════════════ */
async function loadBizReqs(){
  S.requirements=await window.api.getRequirements({});
  const my=S.requirements.filter(r=>S.user.role==='admin'||r.createdBy===S.user.id);
  const ss=$('biz-filter-sys'),sc=$('biz-filter-cat-global');
  ss.innerHTML='<option value="">Alle Systeme</option>'+S.systems.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');
  const cats=[...new Set(my.map(r=>r.category).filter(Boolean))];
  if(sc)sc.innerHTML='<option value="">Alle Kategorien</option>'+cats.map(c=>`<option value="${c}">${esc(c)}</option>`).join('');
  const render=()=>{
    const sF=ss.value,stF=$('biz-filter-status').value,cF=sc?.value||'',q=$('biz-filter-q').value.toLowerCase();
    const f=my.filter(r=>(!sF||r.systemId===sF)&&(!stF||r.status===stF)&&(!cF||r.category===cF)&&(!q||r.title?.toLowerCase().includes(q)||r.description?.toLowerCase().includes(q)));
    renderReqList('biz-reqs-list',f,'business');
  };
  ['biz-filter-sys','biz-filter-status','biz-filter-cat-global','biz-filter-q'].forEach(id=>{const el=$(id);if(el)el.oninput=render;});
  $('btn-new-req-biz').onclick=()=>openReqModal(null,S.activeSystemId);
  $('btn-dedup-global').onclick=runGlobalDedup;
  render();
}

/* ══ CHAT MIC ════════════════════════════════════════════════ */
let _activeChatMic=null;
function toggleChatMic(inputId,btnId){
  if(_activeChatMic){try{_activeChatMic.stop();}catch(e){}_activeChatMic=null;document.querySelectorAll('.mic-btn').forEach(b=>b.classList.remove('mic-on'));return;}
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){toast('Spracherkennung nicht verfügbar');return;}
  _activeChatMic=new SR();_activeChatMic.continuous=false;_activeChatMic.interimResults=true;
  _activeChatMic.lang=S.settings.language==='de'?'de-DE':'en-US';
  $(btnId)?.classList.add('mic-on');
  _activeChatMic.onresult=e=>{let t='';for(const r of e.results)t+=r[0].transcript;$(inputId).value=t;autoResize($(inputId));};
  _activeChatMic.onend=()=>{_activeChatMic=null;$(btnId)?.classList.remove('mic-on');};
  _activeChatMic.onerror=()=>{_activeChatMic=null;$(btnId)?.classList.remove('mic-on');};
  _activeChatMic.start();
}
