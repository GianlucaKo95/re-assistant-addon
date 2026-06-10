'use strict';
/**
 * pm/chat.js
 * PM Chat — KI-gestützte Systemanalyse für Projektmanager.
 */

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
  $('pmc-mic')?.addEventListener('click', () => toggleChatMic('pmc-input', 'pmc-mic'));
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

window.loadPMChat=loadPMChat;
window.sendPMChat=sendPMChat;
