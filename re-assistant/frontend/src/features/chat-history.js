'use strict';
/**
 * chat-history.js
 * Gespeicherte Chat-Unterhaltungen — Speichern, Laden, Löschen, Umbenennen.
 * Ähnlich wie ChatGPT/Claude — Seitenleiste mit Unterhaltungsliste.
 */

// Aktuelle Unterhaltungs-ID (null = neue Unterhaltung)
window._currentConvId   = null;
window._convAutoSaveTimer = null;

// ── Auto-Save ──────────────────────────────────────────────────
// Wird nach jeder KI-Antwort aufgerufen
function scheduleConvAutoSave(chatType) {
  clearTimeout(window._convAutoSaveTimer);
  window._convAutoSaveTimer = setTimeout(() => saveCurrentConv(chatType), 2000);
}

async function saveCurrentConv(chatType = 'bc') {
  const messages = chatType === 'bc'  ? S.chatHistory.bc
                 : chatType === 'pmc' ? S.chatHistory.pmc
                 : S.chatHistory.ws || [];

  if (!messages.length) return;

  try {
    const res = await fetch('api/conversations', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id:       window._currentConvId || undefined,
        systemId: S.activeSystemId,
        chatType,
        messages,
      }),
    });
    const data = await res.json();
    if (data.ok) {
      window._currentConvId = data.id;
      // Sidebar aktualisieren
      if (document.getElementById('conv-list')) {
        loadConvList(chatType);
      }
    }
  } catch(e) {}
}

// ── Unterhaltungsliste laden ───────────────────────────────────
async function loadConvList(chatType = 'bc') {
  const el = document.getElementById('conv-list');
  if (!el) return;

  try {
    const params = new URLSearchParams({ chatType, limit: 40 });
    if (S.activeSystemId) params.set('systemId', S.activeSystemId);
    const convs = await fetch('api/conversations?' + params, { credentials: 'include' }).then(r => r.json());

    if (!convs.length) {
      el.innerHTML = '<div style="padding:12px 14px;font-size:11px;color:var(--t3)">Noch keine gespeicherten Unterhaltungen</div>';
      return;
    }

    el.innerHTML = convs.map(c => {
      const date = new Date(c.updated_at);
      const dateStr = isToday(date) ? date.toLocaleTimeString('de-DE', {hour:'2-digit', minute:'2-digit'})
        : isThisWeek(date) ? date.toLocaleDateString('de-DE', {weekday:'short', hour:'2-digit', minute:'2-digit'})
        : date.toLocaleDateString('de-DE', {day:'2-digit', month:'2-digit'});

      const isActive = c.id === window._currentConvId;
      return `<div class="conv-item ${isActive ? 'active' : ''}" data-id="${c.id}">
        <div class="conv-item-content" onclick="loadConversation('${c.id}', '${chatType}')">
          <div class="conv-title">${esc(c.title)}</div>
          <div class="conv-meta">${c.message_count} Nachrichten · ${dateStr}</div>
        </div>
        <div class="conv-actions">
          <button onclick="event.stopPropagation();renameConv('${c.id}', ${JSON.stringify(c.title).replace(/"/g,'&quot;')})"
            title="Umbenennen" class="conv-action-btn">✏</button>
          <button onclick="event.stopPropagation();deleteConv('${c.id}', '${chatType}')"
            title="Löschen" class="conv-action-btn conv-del">✕</button>
        </div>
      </div>`;
    }).join('');
  } catch(e) {
    el.innerHTML = '<div style="padding:12px;font-size:11px;color:var(--red)">Fehler beim Laden</div>';
  }
}

// ── Unterhaltung laden ─────────────────────────────────────────
async function loadConversation(convId, chatType = 'bc') {
  try {
    const conv = await fetch(`api/conversations/${convId}`, { credentials: 'include' }).then(r => r.json());
    if (!conv.messages) return;

    // Chat-History setzen
    if (chatType === 'bc') {
      S.chatHistory.bc = conv.messages;
    } else if (chatType === 'pmc') {
      S.chatHistory.pmc = conv.messages;
    }

    window._currentConvId = convId;
    if (conv.system_id && conv.system_id !== S.activeSystemId) {
      S.activeSystemId = conv.system_id;
    }

    // Chat-Nachrichten neu rendern
    const container = chatType === 'bc' ? 'bc-chat-msgs' : 'pm-chat-msgs';
    const msgs = document.getElementById(container);
    if (msgs) {
      msgs.innerHTML = '';
      for (const msg of conv.messages) {
        pushMsg(container, msg.role === 'user' ? 'u' : 'a', msg.content);
      }
      msgs.scrollTop = msgs.scrollHeight;
    }

    // Sidebar aktualisieren
    loadConvList(chatType);

    // Panel schließen auf Mobile
    closeConvPanel();

    toast(`✅ "${conv.title.substring(0, 40)}" geladen`);
  } catch(e) {
    toast('❌ Fehler beim Laden: ' + e.message);
  }
}

// ── Neue Unterhaltung starten ──────────────────────────────────
function newConversation(chatType = 'bc') {
  window._currentConvId = null;

  if (chatType === 'bc') {
    S.chatHistory.bc = [];
    const msgs = document.getElementById('bc-chat-msgs');
    if (msgs) msgs.innerHTML = '';
    // Begrüßungsnachricht
    const sys = S.systems?.find(s => s.id === S.activeSystemId);
    if (sys) {
      pushMsg('bc-chat-msgs', 'a',
        `Willkommen! System: **${sys.name}** (${(sys.docs||[]).length} Dokumente). Wie kann ich helfen?`);
    }
  } else if (chatType === 'pmc') {
    S.chatHistory.pmc = [];
    const msgs = document.getElementById('pmc-chat-msgs');
    if (msgs) msgs.innerHTML = '';
  }

  closeConvPanel();
  loadConvList(chatType);
}

// ── Umbenennen ─────────────────────────────────────────────────
async function renameConv(convId, currentTitle) {
  const newTitle = prompt('Unterhaltung umbenennen:', currentTitle);
  if (!newTitle || newTitle === currentTitle) return;

  await fetch(`api/conversations/${convId}`, {
    method: 'PATCH', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: newTitle }),
  });
  loadConvList();
}

// ── Löschen ────────────────────────────────────────────────────
async function deleteConv(convId, chatType = 'bc') {
  if (!confirm('Unterhaltung löschen?')) return;

  await fetch(`api/conversations/${convId}`, { method: 'DELETE', credentials: 'include' });

  // Falls aktive Unterhaltung gelöscht → neue starten
  if (convId === window._currentConvId) {
    newConversation(chatType);
  } else {
    loadConvList(chatType);
  }
  toast('✅ Unterhaltung gelöscht');
}

// ── Panel öffnen/schließen ─────────────────────────────────────
function toggleConvPanel(chatType = 'bc') {
  const panel = document.getElementById('conv-panel');
  if (!panel) return;
  const isOpen = panel.classList.contains('open');
  if (isOpen) {
    closeConvPanel();
  } else {
    window._convPanelType = chatType;
    panel.classList.add('open');
    loadConvList(chatType);
  }
}

function closeConvPanel() {
  document.getElementById('conv-panel')?.classList.remove('open');
}

// ── Datum-Helpers ──────────────────────────────────────────────
function isToday(date) {
  const today = new Date();
  return date.getDate() === today.getDate()
    && date.getMonth() === today.getMonth()
    && date.getFullYear() === today.getFullYear();
}

function isThisWeek(date) {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return date > weekAgo;
}

// Exports
window.scheduleConvAutoSave = scheduleConvAutoSave;
window.saveCurrentConv      = saveCurrentConv;
window.loadConvList         = loadConvList;
window.loadConversation     = loadConversation;
window.newConversation      = newConversation;
window.renameConv           = renameConv;
window.deleteConv           = deleteConv;
window.toggleConvPanel      = toggleConvPanel;
window.closeConvPanel       = closeConvPanel;
