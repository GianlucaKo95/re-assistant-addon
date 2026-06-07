'use strict';\nconst $ = window.$ || (id => document.getElementById(id));
/**
 * developer/voice.js
 * Developer Voice — Sprach-Bot mit TTS/STT.
 */

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

window.buildVoice=buildVoice;
window.toggleVoiceOrb=toggleVoiceOrb;
window.stopSpeaking=stopSpeaking;
window.populateVoices=populateVoices;
