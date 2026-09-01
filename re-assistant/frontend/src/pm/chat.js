'use strict';
const $ = window.$ || (id => document.getElementById(id));
/**
 * pm/chat.js
 * PM Chat — KI-gestützte Systemanalyse für Projektmanager.
 */

/* ══ PM: CHAT ════════════════════════════════════════════════ */
async function loadPMChat(){
  const my=S.systems.filter(s=>(S.user.systems||[]).includes(s.id));
  $('pmc-system-list').innerHTML='';
  my.forEach(sys=>{const btn=document.createElement('button');btn.className='sys-btn'+(S.activeSystemId===sys.id?' active':'');btn.innerHTML=`<span class="sys-dot"></span>${esc(sys.name)}`;btn.onclick=()=>{
  if(S.activeSystemId!==sys.id){
    S.chatHistory.pmc=[];
    window._pmcAttachments=[];
  }
  S.activeSystemId=sys.id;loadPMChat();};$('pmc-system-list').appendChild(btn);});
  if(!S.activeSystemId&&my.length)S.activeSystemId=my[0].id;
  const inp=$('pmc-input');
  $('pmc-send').onclick=sendPMChat;
  inp.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendPMChat();}autoResize(inp);};
  inp.oninput=()=>autoResize(inp);
  document.querySelectorAll('#pmc-chips .chip').forEach(c=>c.onclick=()=>{inp.value=c.dataset.p;sendPMChat();});
  $('pmc-mic')?.addEventListener('click', () => toggleChatMic('pmc-input', 'pmc-mic'));
  if(!$('pm-chat-msgs').children.length){const sys=S.systems.find(s=>s.id===S.activeSystemId);pushMsg('pm-chat-msgs','a',sys?`PM-Modus: **${sys.name}**.`:'Kein System.');}
}
async function sendPMChat(){
  const inp=$('pmc-input');const text=inp.value.trim();if(!text)return;
  document.getElementById('pmc-stop')?.style.setProperty('display','flex');
  document.getElementById('pmc-send')?.style.setProperty('display','none');
  if (window._chatAbortController) window._chatAbortController.abort();
  window._chatAbortController = new AbortController();
  inp.value='';inp.style.height='auto';
  pushMsg('pm-chat-msgs','u',text);S.chatHistory.pmc.push({role:'user',content:text});
  const typing=addTyping('pm-chat-msgs');
  const sys=S.systems.find(s=>s.id===S.activeSystemId);
  const sr=S.requirements.filter(r=>r.systemId===S.activeSystemId).map(r=>`- ${r.id}: ${r.title} [${r.status}][Prio:${r.priority||'?'}]${r.quality_score!=null?' Score:'+r.quality_score:''}${r.risk_level?' Risiko:'+r.risk_level:''}`).join('\n');

  // RAG-Kontext für PM-Chat: tiefere Dokumenten-Einsicht
  let pmRagCtx = '';
  try {
    if (S.activeSystemId && typeof getRAGContextForQuery === 'function') {
      pmRagCtx = await getRAGContextForQuery(S.activeSystemId, text, { signal: window._chatAbortController?.signal });
    }
  } catch(e) {}
  const pmSystem = [
    `Du bist ein erfahrener Projektmanager und Scrum Master mit tiefem technischen Verständnis. ${langNote()}`,
    sys ? `## System: ${sys.name}\n${sys.description || ''}` : 'Kein System ausgewählt.',
    sr ? `## Anforderungen (${S.requirements.filter(r=>r.systemId===S.activeSystemId).length} gesamt):\n${sr}` : '',
    pmRagCtx ? `## Systemdokumentation:\n${pmRagCtx}` : getCtx(sys, 8000),
    `## Deine Aufgaben
- Backlog-Management: Priorisiere und gruppiere Anforderungen nach Wert und Aufwand
- Statusberichte: Zeige Fortschritt, offene Punkte und Risiken klar und strukturiert
- Sprint-Planung: Schlage realistische Sprint-Ziele vor basierend auf den vorhandenen Anforderungen
- Risiko-Analyse: Identifiziere technische und fachliche Risiken mit Mitigationsstrategien
- Entscheidungsunterstützung: Liefere datenbasierte Empfehlungen mit klarer Begründung
Antworte immer strukturiert mit konkreten Handlungsempfehlungen.`,
  ].filter(Boolean).join('\n\n');

  const pmMsgs = $('pm-chat-msgs');
  const pmBubble = document.createElement('div');
  pmBubble.className = 'msg assistant';
  pmBubble.innerHTML = '<div class="bubble"><span class="stream-cursor">▋</span></div>';
  pmMsgs?.appendChild(pmBubble);
  if (pmMsgs) pmMsgs.scrollTop = pmMsgs.scrollHeight;
  let pmStreamedText = '';
  const pmBub = pmBubble.querySelector('.bubble');

  const res=await callAPI(S.chatHistory.pmc, pmSystem, 3500, 'pmc', null, (token, full) => {
    pmStreamedText = full;
    if (pmBub) pmBub.innerHTML = renderMD(full) + '<span class="stream-cursor">▋</span>';
    if (pmMsgs) pmMsgs.scrollTop = pmMsgs.scrollHeight;
  });

  if (pmBub) pmBub.innerHTML = renderMD(res.ok ? res.text : pmStreamedText || '');
  if (!res.ok && pmBubble) pmBubble.remove();
  typing.remove();
  document.getElementById('pmc-stop')?.style.setProperty('display','none');
  document.getElementById('pmc-send')?.style.setProperty('display','flex');
  if(res._aborted) return;
  pushMsg('pm-chat-msgs','a',res.ok?res.text:`❌ ${res.text}`);
  if(res.ok){S.chatHistory.pmc.push({role:'assistant',content:res.text});if(S.chatHistory.pmc.length>40){compressHistory('pmc').catch(()=>{S.chatHistory.pmc=S.chatHistory.pmc.slice(-40);});}if(typeof scheduleConvAutoSave==='function')scheduleConvAutoSave('pmc');}
}

window.loadPMChat=loadPMChat;
window.sendPMChat=sendPMChat;
