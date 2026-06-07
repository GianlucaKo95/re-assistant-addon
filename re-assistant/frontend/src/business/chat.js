'use strict';
const $ = window.$ || (id => document.getElementById(id));
/**
 * business/chat.js
 * Business Chat — KI-gestütztes Prozess- und Anforderungs-Gespräch.
 */

async function loadBizChat() {
  // System-Sidebar aufbauen
  const sl = $('bc-system-list');
  sl.innerHTML = '';
  S.systems.forEach(sys => {
    const btn = document.createElement('button');
    btn.className = 'sys-btn' + (S.activeSystemId === sys.id ? ' active' : '');
    btn.innerHTML = `<span class="sys-dot"></span>${esc(sys.name)}`;
    btn.onclick = () => { S.activeSystemId = sys.id; loadBizChat(); };
    sl.appendChild(btn);
  });
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
  const inp  = $('bc-input');
  const text = inp.value.trim();
  if (!text) return;
  inp.value = '';
  inp.style.height = 'auto';

  pushMsg('bc-chat-msgs', 'u', text);
  S.chatHistory.bc.push({ role:'user', content:text });

  const typing = addTyping('bc-chat-msgs');
  const sys    = S.systems.find(s => s.id === S.activeSystemId);
  // RAG: semantische Suche nach relevanten Dokumenten-Passagen
  const ragCtx = (typeof buildRAGContext === 'function')
    ? await buildRAGContext(S.activeSystemId, text)
    : '';
  const system = [
    `Du bist ein erfahrener Requirements Engineer und Business-Analyst. ${langNote()}`,
    sys ? `System: ${sys.name}\nBeschreibung: ${sys.description || ''}` : 'Kein System ausgewählt.',
    ragCtx || (sys ? getCtx(sys, 15000) : ''),
    'Hilf dem Business-Nutzer dabei, Anforderungen zu definieren und Prozesse zu dokumentieren.',
    'Wenn der Nutzer Prozesse oder Features beschreibt, extrahiere implizit mögliche Anforderungen.',
  ].filter(Boolean).join('\n\n');

  const res = await callAPI(S.chatHistory.bc, system, 1800);
  typing.remove();

  const reply = res.ok ? res.text : `❌ ${res.text}`;
  pushMsg('bc-chat-msgs', 'a', reply);

  if (res.ok) {
    S.chatHistory.bc.push({ role:'assistant', content:reply });
    if (S.chatHistory.bc.length > 40) S.chatHistory.bc = S.chatHistory.bc.slice(-40);
  }
}

window.loadBizChat  = loadBizChat;
window.sendBizChat  = sendBizChat;
