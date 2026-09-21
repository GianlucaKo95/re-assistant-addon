'use strict';
const $ = window.$ || (id => document.getElementById(id));
/**
 * pm/assign.js
 * PM Assign — Anforderungen Entwicklern zuweisen, Source-Code-Analyse.
 */

/* ══ PM: ASSIGN ══════════════════════════════════════════════ */
async function loadPMAssign(){
  // Immer frisch laden statt auf S.systems aus dem Login-Init zu vertrauen —
  // anders als die meisten anderen Ansichten holte "Zuweisen" S.systems
  // bisher nie selbst nach. War der eine Request beim Login transient
  // fehlgeschlagen (S.systems dann dauerhaft []), blieb die System-Auswahl
  // hier für die ganze Session leer — "kein System auswählbar", obwohl
  // Systeme existieren.
  S.systems = await window.api.getSystems().catch(() => S.systems || []);
  S.requirements=await window.api.getRequirements({});
  // .catch() statt ungefangenem Reject — GET /api/users lieferte für PMs
  // bis vor kurzem ein 403 (admin-only-Endpoint), was hier ungefangen den
  // gesamten Funktionsaufruf abbrach, BEVOR die Systemauswahl unten befüllt
  // wurde. Serverseitig jetzt für PM erlaubt; dieser Fallback verhindert,
  // dass ein künftiger/transienter Fehler hier dieselbe Ursachenkette wieder
  // auslöst ("Dropdown leer, obwohl Systeme existieren").
  S.users=await window.api.getUsers().catch(() => S.users || []);
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
async function assignReq(reqId){
  const devId=$(`adev-${reqId}`)?.value;
  if(!devId){toast('⚠ Entwickler auswählen');return;}
  const req = S.requirements.find(r=>r.id===reqId);
  await window.api.assignRequirement({reqId,userId:devId,subcategory:$(`asub-${reqId}`)?.value});
  toast('✅ Zugewiesen');
  // Automatische Source-Analyse starten
  if(typeof analyzeSourceOnAssign==='function' && req?.systemId){
    toast('🔍 Analysiere Source-Code für Entwickler …');
    const analysis = await analyzeSourceOnAssign(reqId, req.systemId);
    if(analysis) toast(`✅ Source-Analyse: ${(analysis.affectedFiles||[]).length} Dateien betroffen`);
  }
  await loadPMAssign();
}
async function analyzeSource(reqId){
  const req=S.requirements.find(r=>r.id===reqId);if(!req)return;
  const sys=S.systems.find(s=>s.id===req.systemId);if(!sys?.docs?.length){toast('⚠ Keine Dokumentation');return;}
  toast('🔍 Analysiere Source …');
  // Code-Kontext per RAG statt sys.docs[].content — Letzteres ist auf
  // sys.docs-Einträgen immer undefined (Originaltext wird seit dem
  // Chunking-Umbau nirgends gespeichert, nur Embeddings/Chunks), ein
  // direkter Zugriff hätte hier mit "Cannot read properties of undefined
  // (reading 'substring')" gecrasht. Gleiches Muster wie devAnalyzeSource.
  const code = typeof buildRAGContext === 'function'
    ? await buildRAGContext(sys.id, `${req.title} ${req.description || ''} implementieren Code`)
    : '';
  const res=await callAPI([{role:'user',content:`Analysiere. JSON ohne Backticks:\n{"affectedFiles":[{"file":"...","reason":"..."}],"summary":"...","suggestion":"+ //neu\\n- //alt"}\n\nAnforderung: ${req.title} — ${req.description}\n\nCode:\n${code || '(kein Code-Kontext gefunden)'}`}],'',3000);
  if(!res.ok){toast('❌ Analyse fehlgeschlagen');return;}
  let a;
  try{ a=JSON.parse(cleanJsonText(res.text)); }
  catch(e){
    const affectedFiles = extractJsonObjects(res.text, 'affectedFiles');
    if(!affectedFiles.length){toast('❌ Parsing-Fehler' + (res.truncated ? ' (Antwort wegen Längenbegrenzung abgeschnitten)' : ''));return;}
    a = { affectedFiles, summary: 'Antwort unvollständig (Token-Limit)', suggestion: '' };
  }
  await window.api.saveRequirement({...req,sourceAnalysis:a,sourceSuggestion:a.suggestion});S.requirements=await window.api.getRequirements({});toast('✅ Source-Analyse gespeichert');await loadPMAssign();
}

window.loadPMAssign=loadPMAssign;
window.assignReq=assignReq;
window.updSubOpts=updSubOpts;
window.analyzeSource=analyzeSource;
