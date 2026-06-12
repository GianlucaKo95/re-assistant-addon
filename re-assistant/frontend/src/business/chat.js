'use strict';
const $ = window.$ || (id => document.getElementById(id));
/**
 * business/chat.js
 * Business Chat — KI-gestütztes Prozess- und Anforderungs-Gespräch.
 */

async function loadBizChat() {
  // System-Sidebar aufbauen — hierarchisch mit Subdomains
  const sl = $('bc-system-list');
  sl.innerHTML = '';

  function renderSysBtn(sys, depth) {
    const btn = document.createElement('button');
    btn.className = 'sys-btn' + (S.activeSystemId === sys.id ? ' active' : '');
    btn.style.paddingLeft = (12 + depth * 14) + 'px';
    btn.innerHTML = `
      ${depth > 0 ? `<span style="color:var(--t3);margin-right:4px;font-size:11px">└</span>` : ''}
      <span class="sys-dot"></span>
      <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis">${esc(sys.name)}</span>
      ${depth > 0 ? `<span style="font-size:9px;color:var(--t3);flex-shrink:0;margin-left:4px">Sub</span>` : ''}`;
    btn.onclick = () => { S.activeSystemId = sys.id; loadBizChat(); };
    sl.appendChild(btn);
    // Subdomains
    S.systems.filter(s => s.parentId === sys.id)
      .sort((a,b) => (a.sortOrder||0)-(b.sortOrder||0))
      .forEach(child => renderSysBtn(child, depth + 1));
  }

  // Root-Systeme zuerst
  S.systems.filter(s => !s.parentId)
    .sort((a,b) => (a.sortOrder||0)-(b.sortOrder||0))
    .forEach(sys => renderSysBtn(sys, 0));

  if (!S.activeSystemId && S.systems.length) S.activeSystemId = S.systems[0].id;

  // Input-Bindings
  const inp = $('bc-input');
  $('bc-send').onclick = sendBizChat;
  inp.onkeydown = e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); sendBizChat(); } autoResize(inp); };
  inp.oninput   = () => autoResize(inp);
  $('bc-mic').onclick = () => toggleChatMic('bc-input', 'bc-mic');

  // Chips
  document.querySelectorAll('#bc-chips .chip').forEach(c =>
    c.onclick = () => { inp.value = c.dataset.p; sendBizChat(); }
  );

  // Req-Pane Buttons
  $('bc-btn-extract').onclick   = extractFromConversation;
  $('bc-btn-dedup').onclick     = dedupSystem;
  $('bc-btn-add-manual').onclick = openInlineAdd;
  $('bc-btn-export-reqs').onclick = exportPaneReqs;
  $('bc-dedup-apply').onclick   = applyDedup;
  $('bc-dedup-dismiss').onclick = hideDedup;

  // Filter-Events
  ['bc-req-search','bc-req-filter-cat','bc-req-filter-pri'].forEach(id => {
    const el = $(id);
    if (el) el.oninput = renderReqPane;
  });

  // Begrüßung beim ersten Laden
  if (!$('bc-chat-msgs').children.length) {
    const sys = S.systems.find(s => s.id === S.activeSystemId);
    const docs = (sys?.docs || []).length;
    pushMsg('bc-chat-msgs', 'a',
      sys
        ? `Willkommen! System: **${sys.name}** (${docs} Dokument${docs !== 1 ? 'e' : ''}). Wie kann ich helfen?`
        : 'Kein System ausgewählt. Bitte links ein System wählen.');
  }

  await refreshReqPane();
}

async function sendBizChat() {
  // Stopp-Button anzeigen
  const stopBtn = document.getElementById('bc-stop');
  if (stopBtn) stopBtn.style.display = 'flex';
  const sendBtn = document.getElementById('bc-send');
  if (sendBtn) sendBtn.style.display = 'none';
  const inp  = $('bc-input');
  const text = inp.value.trim();
  if (!text) return;
  inp.value = '';
  inp.style.height = 'auto';

  pushMsg('bc-chat-msgs', 'u', text);
  S.chatHistory.bc.push({ role:'user', content:text });

  const typing = addTyping('bc-chat-msgs');
  const sys    = S.systems.find(s => s.id === S.activeSystemId);

  // Eigener Abort-Controller für RAG + Chat (deckt die GESAMTE Anfrage ab)
  if (window._chatAbortController) window._chatAbortController.abort();
  window._chatAbortController = new AbortController();
  const chatSignal = window._chatAbortController.signal;

  // RAG: semantische Suche nach relevanten Dokumenten-Passagen
  let ragCtx = '';
  try {
    ragCtx = (typeof buildRAGContext === 'function')
      ? await buildRAGContext(S.activeSystemId, text, chatSignal)
      : '';
  } catch(e) {
    if (e.name === 'AbortError' || chatSignal.aborted) {
      typing.remove();
      document.getElementById('bc-stop')?.style.setProperty('display','none');
      document.getElementById('bc-send')?.style.setProperty('display','flex');
      return;
    }
    ragCtx = '';
  }

  // Falls währenddessen abgebrochen wurde
  if (chatSignal.aborted) {
    typing.remove();
    document.getElementById('bc-stop')?.style.setProperty('display','none');
    document.getElementById('bc-send')?.style.setProperty('display','flex');
    return;
  }
  const system = [
    `Du bist ein erfahrener Requirements Engineer und Business-Analyst. ${langNote()}`,
    sys ? `System: ${sys.name}\nBeschreibung: ${sys.description || ''}\nAnzahl Dokumente: ${(sys.docs||[]).length}` : 'Kein System ausgewählt.',
    ragCtx ? `${ragCtx}\n\nWICHTIG: Beziehe dich auf ALLE oben genannten Dokumente und Quellen. Erwähne konkrete Funktionen aus den Dokumenten.` : (sys ? getCtx(sys, 15000) : ''),
    'Hilf dem Business-Nutzer dabei, Anforderungen zu definieren und Prozesse zu dokumentieren.',
    'Wenn der Nutzer nach einem Überblick fragt, nenne alle Hauptfunktionen aus der Dokumentation vollständig.',
  ].filter(Boolean).join('\n\n');

  const res = await callAPI(S.chatHistory.bc, system, 1800);
  typing.remove();

  // Stopp-/Send-Button zurücksetzen
  document.getElementById('bc-stop')?.style.setProperty('display','none');
  document.getElementById('bc-send')?.style.setProperty('display','flex');

  if (res._aborted) {
    return; // Abgebrochen — keine leere Nachricht anzeigen
  }

  const reply = res.ok ? res.text : `❌ ${res.text}`;
  pushMsg('bc-chat-msgs', 'a', reply);

  if (res.ok) {
    S.chatHistory.bc.push({ role:'assistant', content:reply });
    if (S.chatHistory.bc.length > 40) S.chatHistory.bc = S.chatHistory.bc.slice(-40);
  }
}

window.loadBizChat  = loadBizChat;
window.sendBizChat  = sendBizChat;
