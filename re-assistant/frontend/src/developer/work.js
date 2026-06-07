'use strict';\nconst $ = window.$ || (id => document.getElementById(id));
/**
 * developer/work.js
 * Developer Work — Eigene Aufgaben, Source-Block, Kommentare, Status.
 */

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
  // Nutze vollständigen Source-Analysis-Block wenn verfügbar
  if(typeof renderSourceAnalysisBlock==='function') return renderSourceAnalysisBlock(r, true);
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

window.loadDevWork=loadDevWork;
window.renderDevReqs=renderDevReqs;
window.toggleDevReq=toggleDevReq;
window.updateDevStatus=updateDevStatus;
window.renderSourceBlock=renderSourceBlock;
window.renderCommentThread=renderCommentThread;
window.toggleCommentInput=toggleCommentInput;
window.submitComment=submitComment;
window.devAnalyzeSource=devAnalyzeSource;
