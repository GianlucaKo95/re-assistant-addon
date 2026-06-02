/* ══ BA: QUALITÄTSSICHERUNG (ISO 29148) ══════════════════════ */
async function loadBaQS(){
  S.systems=await window.api.getSystems();
  const sel=$('qs-sys-select');
  sel.innerHTML='<option value="">System wählen …</option>'+S.systems.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');
  $('btn-run-qs').onclick=runQS;
  $('qs-results').innerHTML='<div class="empty-state"><div class="es-icon">🔬</div><h3>System auswählen und QS starten</h3><p>Die KI bewertet nach ISO 29148: Eindeutigkeit, Vollständigkeit, Testbarkeit.</p></div>';
}
async function runQS(){
  const sysId=$('qs-sys-select').value;if(!sysId){toast('⚠ System auswählen');return;}
  const reqs=await window.api.getRequirements({systemId:sysId});
  if(!reqs.length){toast('ℹ Keine Anforderungen im System');return;}
  const btn=$('btn-run-qs');btn.disabled=true;btn.innerHTML='<span class="spin"></span> Analysiere …';
  $('qs-results').innerHTML='<div class="empty-state"><div class="spin"></div><p>Analyse läuft …</p></div>';
  const reqList=reqs.map(r=>`ID:${r.id}\nTitel: ${r.title}\nBeschreibung: ${r.description||'(keine)'}`).join('\n\n---\n\n');
  const res=await callAPI([{role:'user',content:`Du bist ISO-29148-Experte. Bewerte jede Anforderung:
- Eindeutigkeit: Erkenne Ambiguitäten wie "schnell","einfach","effizient","benutzerfreundlich"
- Vollständigkeit: Fehlen Akzeptanzkriterien, Randbedingungen?
- Testbarkeit: Ist die Anforderung messbar und verifizierbar?

JSON-Array ohne Backticks:
[{"reqId":"REQ-001","score":7,"issues":[{"type":"ambiguity","text":"Das Wort X ist ambig","suggestion":"Präziserer Vorschlag"}],"improvedTitle":"Verbesserter Titel","improvedDescription":"Verbesserte Beschreibung"}]

Typen: ambiguity | missing | not_testable | suggestion

Anforderungen:\n${reqList}`}],langNote(),3500);
  btn.disabled=false;btn.innerHTML='▶ QS starten';
  if(!res.ok){toast('❌ '+res.text);$('qs-results').innerHTML='';return;}
  try{
    const results=JSON.parse(res.text.replace(/```json|```/g,'').trim());
    for(const r of results){const req=reqs.find(x=>x.id===r.reqId);if(req)await window.api.saveRequirement({...req,qualityScore:r.score,isoIssues:(r.issues||[]).map(i=>i.text)});}
    renderQSResults(results,reqs);
    toast(`✅ ${results.length} Anforderungen bewertet`);
  }catch(e){console.error(e);toast('❌ Parsing-Fehler');}
}
function renderQSResults(results,reqs){
  const sorted=[...results].sort((a,b)=>a.score-b.score);
  $('qs-results').innerHTML=sorted.map(r=>{
    const req=reqs.find(x=>x.id===r.reqId);
    const col=r.score>=7?'var(--grn)':r.score>=4?'var(--amb)':'var(--red)';
    return`<div class="qs-card">
      <div class="qs-card-head" onclick="this.nextElementSibling.classList.toggle('open')">
        <div style="flex:1;min-width:0"><div class="req-id">${esc(r.reqId)}</div><div class="req-title" style="font-size:13px">${esc(req?.title||r.reqId)}</div></div>
        <div class="qs-score">
          <div class="qs-score-bar"><div class="qs-score-fill" style="width:${r.score*10}%;background:${col}"></div></div>
          <div class="qs-score-num" style="color:${col}">${r.score}<span style="font-size:11px;color:var(--t3)">/10</span></div>
        </div>
      </div>
      <div class="qs-body">
        ${(r.issues||[]).map(i=>`<div class="qs-issue">
          <span class="qs-issue-type qt-${i.type}">${{ambiguity:'⚠ Ambiguität',missing:'✗ Fehlt',not_testable:'✗ Nicht testbar',suggestion:'💡 Vorschlag'}[i.type]||i.type}</span>
          <div style="flex:1">${esc(i.text)}${i.suggestion?`
            <div class="qs-suggestion-box">
              <div class="qs-suggestion-label">Verbesserungsvorschlag</div>
              <div id="sug-${r.reqId}-${i.type}">${esc(i.suggestion)}</div>
              <button class="btn-accept" onclick="acceptQSSuggestion('${r.reqId}', document.getElementById('sug-${r.reqId}-${i.type}').textContent)">✓ Übernehmen</button>
            </div>`:''}</div>
        </div>`).join('')}
        ${r.improvedTitle||r.improvedDescription?`
        <div class="qs-suggestion-box" style="margin-top:10px">
          <div class="qs-suggestion-label">✦ Verbesserte Anforderung</div>
          ${r.improvedTitle?`<strong style="font-size:13px">${esc(r.improvedTitle)}</strong><br/>`:''}
          ${r.improvedDescription?`<span style="font-size:12px;color:var(--t2)">${esc(r.improvedDescription)}</span><br/>`:''}
          <button class="btn-accept" onclick="acceptImprovedReq('${r.reqId}','${esc(r.improvedTitle||'').replace(/'/g,"\\'")}','${esc(r.improvedDescription||'').replace(/'/g,"\\'")}')">✓ Verbesserte Version übernehmen</button>
        </div>`:''}
      </div></div>`;
  }).join('');
}
async function acceptQSSuggestion(reqId,suggestion){
  const all=await window.api.getRequirements({});const req=all.find(r=>r.id===reqId);if(!req)return;
  await window.api.saveRequirement({...req,description:suggestion});toast('✅ Vorschlag übernommen');
}
async function acceptImprovedReq(reqId,title,desc){
  const all=await window.api.getRequirements({});const req=all.find(r=>r.id===reqId);if(!req)return;
  const upd={...req};if(title)upd.title=title;if(desc)upd.description=desc;
  await window.api.saveRequirement(upd);toast('✅ Verbesserte Version übernommen');
}

/* ══ BA: DOKUMENTENANALYSE ═══════════════════════════════════ */
async function loadBaDocAnalysis(){
  S.systems=await window.api.getSystems();
  const sel=$('da-sys-select');
  sel.innerHTML='<option value="">System wählen …</option>'+S.systems.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');
  sel.onchange=()=>{
    const sys=S.systems.find(s=>s.id===sel.value);const docs=sys?(sys.docs||[]):[];
    $('da-doc-list').innerHTML=docs.length
      ?docs.map(d=>`<div class="da-doc-item"><input type="checkbox" checked id="dadc-${d.id}"/><label for="dadc-${d.id}" style="cursor:pointer;flex:1">${esc(d.name)}<span style="font-size:10px;color:var(--t3);margin-left:5px">${(d.size/1024).toFixed(1)}KB</span></label></div>`).join('')
      :'<div style="padding:10px;font-size:12px;color:var(--t3)">Keine Dokumente im System.</div>';
  };
  $('btn-run-da').onclick=runDocAnalysis;
}
async function runDocAnalysis(){
  const sysId=$('da-sys-select').value;if(!sysId){toast('⚠ System auswählen');return;}
  const sys=S.systems.find(s=>s.id===sysId);if(!sys?.docs?.length){toast('ℹ Keine Dokumente');return;}
  const checked=Array.from(document.querySelectorAll('#da-doc-list input[type=checkbox]:checked')).map(c=>c.id.replace('dadc-',''));
  const docs=(sys.docs||[]).filter(d=>checked.includes(d.id));
  if(!docs.length){toast('⚠ Mindestens ein Dokument auswählen');return;}
  const btn=$('btn-run-da');btn.disabled=true;btn.innerHTML='<span class="spin"></span>';
  $('da-results').innerHTML='<div class="empty-state"><div class="spin"></div><p>Analysiere Dokumente …</p></div>';
  const content=docs.map(d=>`### ${d.name}\n${d.content.substring(0,8000)}`).join('\n\n---\n\n');
  const res=await callAPI([{role:'user',content:`Analysiere strukturiert. JSON ohne Backticks:
{"requirements":[{"id":"REQ-001","title":"...","description":"...","category":"Funktional","priority":"medium","confidence":"high"}],
"assumptions":[{"text":"...","impact":"hoch"}],
"risks":[{"text":"...","probability":"mittel","impact":"hoch"}],
"summary":"..."}

Dokumentation:\n${content}`}],langNote(),3500);
  btn.disabled=false;btn.innerHTML='🔍 Analysieren';
  if(!res.ok){toast('❌ '+res.text);$('da-results').innerHTML='';return;}
  try{
    const a=JSON.parse(res.text.replace(/```json|```/g,'').trim());
    renderDocAnalysis(a,sysId);
    toast(`✅ ${a.requirements?.length||0} Anforderungen, ${a.assumptions?.length||0} Annahmen, ${a.risks?.length||0} Risiken`);
  }catch(e){toast('❌ Parsing-Fehler');}
}
function renderDocAnalysis(a,sysId){
  const dr=$('da-results');dr.innerHTML='';
  if(a.summary){const s=document.createElement('div');s.style.cssText='font-size:13px;color:var(--t2);padding:12px 16px;background:var(--s2);border-radius:var(--r);margin-bottom:14px';s.textContent=a.summary;dr.appendChild(s);}
  const makeGroup=(emoji,label,items,buildItem)=>{
    if(!items?.length)return;
    const g=document.createElement('div');g.className='da-group';
    g.innerHTML=`<div class="da-group-head">${emoji} ${label} (${items.length})</div><div class="da-group-body">${items.map(buildItem).join('')}</div>`;
    dr.appendChild(g);
  };
  makeGroup('📋','Anforderungen',a.requirements,(r,i)=>`<div class="da-item">
    <div class="da-item-icon" style="background:var(--bluebg)">📝</div>
    <div class="da-item-body"><div style="font-weight:600;font-size:13px">${esc(r.title)}</div><div style="font-size:12px;color:var(--t2)">${esc(r.description)}</div>
    <div style="display:flex;gap:5px;margin-top:4px"><span class="sbadge p-${r.priority}" style="font-size:9px">${priLabel(r.priority)}</span><span class="rtag" style="font-size:9px">${esc(r.category)}</span><span class="rtag" style="font-size:9px;color:${r.confidence==='high'?'var(--grn)':r.confidence==='medium'?'var(--amb)':'var(--red)'}">Konfidenz: ${esc(r.confidence||'?')}</span></div></div>
    <div class="da-item-actions"><button class="btn-secondary" style="font-size:11px;padding:4px 9px" onclick="saveSingleDocReq(${JSON.stringify(r).replace(/</g,'\\u003c')},'${sysId}')">✓ Übernehmen</button></div>
  </div>`);
  // Add "Alle übernehmen" button
  if(a.requirements?.length){
    const btn=document.createElement('button');btn.className='btn-primary';btn.style='font-size:12px;margin:0 15px 10px;';
    btn.textContent=`Alle ${a.requirements.length} übernehmen`;
    btn.onclick=async()=>{for(const r of a.requirements)await saveSingleDocReq(r,sysId);toast(`✅ ${a.requirements.length} gespeichert`);};
    dr.querySelector('.da-group-body').before(btn);
  }
  makeGroup('💭','Annahmen',a.assumptions,x=>`<div class="da-item"><div class="da-item-icon" style="background:var(--ambbg)">💭</div><div class="da-item-body">${esc(x.text)}<span class="rtag" style="margin-left:6px;font-size:9px">Auswirkung: ${esc(x.impact)}</span></div></div>`);
  makeGroup('⚠','Risiken',a.risks,x=>`<div class="da-item"><div class="da-item-icon" style="background:var(--redbg)">⚠</div><div class="da-item-body">${esc(x.text)}<div style="display:flex;gap:5px;margin-top:3px"><span class="rtag" style="font-size:9px">W: ${esc(x.probability)}</span><span class="rtag" style="font-size:9px">A: ${esc(x.impact)}</span></div></div></div>`);
}
async function saveSingleDocReq(r,sysId){
  await window.api.saveRequirement({...r,id:'REQ-'+Date.now()+'-'+Math.floor(Math.random()*1000),systemId:sysId,createdBy:S.user.id,createdByName:S.user.name,status:'open'});
  toast('✅ Anforderung gespeichert');
}

/* ══ BA: DIAGRAMME ═══════════════════════════════════════════ */
async function loadBaDiagrams(){
  S.systems=await window.api.getSystems();S.diagrams=await window.api.getDiagrams('');
  const dss=$('diag-sys-sel');
  dss.innerHTML='<option value="">System (optional)</option>'+S.systems.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');
  renderDiagList();
  $('btn-new-diagram').onclick=()=>{S.activeDiagramId=null;$('diag-text-input').value='';$('diag-canvas').innerHTML='<div class="empty-state"><div class="es-icon">📊</div><h3>Text eingeben und generieren</h3></div>';};
  $('btn-gen-diagram').onclick=generateDiagram;
  $('btn-diag-save').onclick=saveDiagramDialog;
  $('btn-diag-export').onclick=exportDiagramSvg;
}
function renderDiagList(){
  const list=$('diag-list');list.innerHTML='';
  if(!S.diagrams.length){list.innerHTML='<div style="padding:14px;font-size:12px;color:var(--t3)">Keine Diagramme.</div>';return;}
  S.diagrams.forEach(d=>{
    const item=document.createElement('div');item.className='diag-list-item'+(S.activeDiagramId===d.id?' active':'');
    item.innerHTML=`<div><div class="diag-item-name">${esc(d.name)}</div><div class="diag-item-type">${d.type==='bpmn'?'BPMN':'Kontext'}</div></div><button class="diag-del-btn" onclick="event.stopPropagation();delDiagram('${d.id}')">✕</button>`;
    item.onclick=()=>{S.activeDiagramId=d.id;$('diag-text-input').value=d.description||'';$('diag-canvas').innerHTML=d.svg||'';renderDiagList();};
    list.appendChild(item);
  });
}
async function generateDiagram(){
  const type=$('diag-type-sel').value,text=$('diag-text-input').value.trim();
  if(!text){toast('⚠ Beschreibung eingeben');return;}
  const btn=$('btn-gen-diagram');btn.disabled=true;btn.innerHTML='<span class="spin"></span> Generiere …';
  $('diag-canvas').innerHTML='<div class="empty-state"><div class="spin"></div><p>Generiere Diagramm …</p></div>';
  const bpmnPrompt=`Erstelle ein professionelles BPMN 2.0 Prozessdiagramm als SVG (Breite 900px):
- Swimlanes: horizontale Bereiche mit Label links, hellgrauer Hintergrund
- Tasks: abgerundete Rechtecke rx=8, weiß mit #6366f1 Rahmen
- Start-Event: grüner Kreis; End-Event: roter Kreis mit dickem Rand
- Gateways: Rauten #f59e0b
- Sequenzflüsse: Pfeile mit Beschriftungen
- Schrift: 12px sans-serif #1e1b4b; Hintergrund: #f8f9fc

Prozess:\n${text}\n\nNur SVG-Code, beginnend mit <svg`;
  const ctxPrompt=`Erstelle ein Systemkontextdiagramm als SVG (800×600px):
- Zentrales System: Rechteck Mitte, violetter Hintergrund #6366f1, weiße Schrift
- Externe Akteure: Ovale, grau #f3f4f6 mit dunklem Rand, um das System herum
- Datenflüsse: beschriftete Pfeile
- Schrift: 13px sans-serif #1e1b4b; Hintergrund: #f8f9fc

System:\n${text}\n\nNur SVG-Code, beginnend mit <svg`;
  const res=await callAPI([{role:'user',content:type==='bpmn'?bpmnPrompt:ctxPrompt}],'Erstelle nur SVG, keine Erklärungen.',3000);
  btn.disabled=false;btn.innerHTML='⚡ Diagramm generieren';
  if(!res.ok){toast('❌ '+res.text);return;}
  const svg=res.text.includes('<svg')?res.text.substring(res.text.indexOf('<svg')):res.text;
  $('diag-canvas').innerHTML=svg;toast('✅ Diagramm generiert');
}
async function saveDiagramDialog(){
  const svg=$('diag-canvas').innerHTML;if(!svg.includes('<svg')){toast('⚠ Kein Diagramm');return;}
  const existing=S.diagrams.find(d=>d.id===S.activeDiagramId);
  openModal('Diagramm speichern',`
    <div class="frow"><label>Name</label><input type="text" id="dg-name" value="${esc(existing?.name||'')}" placeholder="z.B. Bestellprozess"/></div>
    <div style="display:flex;gap:8px;margin-top:6px"><button class="btn-primary" onclick="doSaveDiagram()">Speichern</button><button class="btn-secondary" onclick="closeModal()">Abbrechen</button></div>`);
  window._pendDiag={svg,desc:$('diag-text-input').value.trim(),type:$('diag-type-sel').value,systemId:$('diag-sys-sel').value||null};
}
async function doSaveDiagram(){
  const name=$('dg-name').value.trim();if(!name){toast('⚠ Name erforderlich');return;}
  const p=window._pendDiag;
  await window.api.saveDiagram({id:S.activeDiagramId||null,name,type:p.type,description:p.desc,svg:p.svg,systemId:p.systemId});
  S.diagrams=await window.api.getDiagrams('');renderDiagList();closeModal();toast('✅ Diagramm gespeichert');
}
async function delDiagram(id){if(!confirm('Löschen?'))return;await window.api.deleteDiagram(id);S.diagrams=await window.api.getDiagrams('');renderDiagList();toast('✅ Gelöscht');}
async function exportDiagramSvg(){const svg=$('diag-canvas').innerHTML;if(!svg.includes('<svg')){toast('⚠ Kein Diagramm');return;}await window.api.exportDiagramSvg({filename:'diagram.svg',svg});toast('✅ SVG exportiert');}

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
