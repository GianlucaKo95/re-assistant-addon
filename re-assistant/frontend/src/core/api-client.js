'use strict';
const $ = window.$ || (id => document.getElementById(id));
/**
 * core/api-client.js
 * Wrapper für den Anthropic-API-Proxy im Backend.
 * Alle KI-Calls laufen über diese Datei.
 */

function langNote() {
  return S.settings.language === 'de' ? 'Antworte auf Deutsch.' : 'Respond in English.';
}

function getCtx(sys, max = 50000) {
  if (!sys?.docs?.length) return '';
  let total = 0;
  const parts = [];
  for (const d of sys.docs) {
    // docs[] enthält i.d.R. nur Metadaten (id, name, size) — Inhalte liegen
    // in den Embeddings/Chunks und werden separat über RAG geladen.
    if (!d.content) continue;
    const c = d.content.substring(0, 12000);
    total += c.length;
    if (total > max) break;
    parts.push(`### ${d.relativePath || d.name}\n\n${c}`);
  }
  if (!parts.length && sys.docs.length) {
    // Kein Volltext lokal verfügbar — zumindest Dateiliste als Minimal-Kontext
    return `Dokumente im System (${sys.docs.length}):\n` +
      sys.docs.slice(0, 50).map(d => `- ${d.relativePath || d.name}`).join('\n');
  }
  return parts.join('\n\n---\n\n');
}

// Feature-Kontext für Token-Tracking (wird von Modulen gesetzt)
let _currentFeature  = 'other';
let _currentSystemId = null;
function setAPIContext(feature, systemId) {
  _currentFeature  = feature  || 'other';
  _currentSystemId = systemId || S.activeSystemId || null;
}

// ── Abort-Controller ─────────────────────────────────────────
let _activeAbortController = null;

function abortCurrentRequest() {
  if (_activeAbortController) {
    _activeAbortController.abort();
    _activeAbortController = null;
    return true;
  }
  return false;
}

async function callAPI(messages, system = '', maxTokens = 2000, feature = null) {
  if (_activeAbortController) _activeAbortController.abort();
  _activeAbortController = new AbortController();
  const signal = _activeAbortController.signal;
  const feat   = feature || _currentFeature || 'other';
  const sysId  = _currentSystemId || S.activeSystemId || null;
  try {
    const res = await fetch('api/ai/chat', {
      method: 'POST', credentials: 'include',
      signal,
      headers: {
        'Content-Type':  'application/json',
        'X-RE-Feature':  feat,
        'X-RE-System':   sysId || '',
      },
      body: JSON.stringify({
        model:        S.settings?.model || undefined,
        max_tokens:   maxTokens,
        system:       system || undefined,
        messages,
        _feature:     feat,
        _systemId:    sysId,
        // Anhänge (Bilder/Dateien) aus dem Chat
        _attachments: window._pendingAttachments || undefined,
      }),
    });

    // Budget-Warnung anzeigen
    const budgetWarning = res.headers.get('X-Budget-Warning');
    if (budgetWarning && typeof addNotif === 'function') {
      addNotif('⚠', 'Token-Budget', budgetWarning, () => switchView('token-dashboard'));
    }

    const data = await res.json();

    if (res.status === 402 && data.blocked) {
      // Budget erschöpft
      if (typeof addNotif === 'function')
        addNotif('🚫', 'Feature gesperrt', data.error, () => switchView('token-dashboard'));
      return { ok: false, text: `Budget erschöpft: ${data.error}` };
    }

    if (!res.ok) {
      const msg = data?.error?.message || data?.error || `HTTP ${res.status}`;
      return { ok: false, text: `API-Fehler: ${msg}` };
    }

    const text = data.content?.find(c => c.type === 'text')?.text || '';
    return { ok: true, text };
  } catch(e) {
    if (e.name === 'AbortError') {
      return { ok: true, text: '', _aborted: true };
    }
    return { ok: false, text: `Netzwerkfehler: ${e.message}` };
  } finally {
    _activeAbortController = null;
  }
}

// Chat-Mic (geteilt von Business-Chat, PM-Chat, Workshop)
let _activeChatMic = null;
function toggleChatMic(inputId, btnId) {
  if (_activeChatMic) {
    try { _activeChatMic.stop(); } catch(e) {}
    _activeChatMic = null;
    document.querySelectorAll('.mic-btn').forEach(b => b.classList.remove('mic-on'));
    return;
  }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { toast('Spracherkennung nicht verfügbar (Chrome/Edge empfohlen)'); return; }
  _activeChatMic = new SR();
  _activeChatMic.continuous    = false;
  _activeChatMic.interimResults = true;
  _activeChatMic.lang = S.settings.language === 'de' ? 'de-DE' : 'en-US';
  $(btnId)?.classList.add('mic-on');
  _activeChatMic.onresult = e => {
    let t = '';
    for (const r of e.results) t += r[0].transcript;
    $(inputId).value = t;
    autoResize($(inputId));
  };
  _activeChatMic.onend = () => {
    _activeChatMic = null;
    $(btnId)?.classList.remove('mic-on');
  };
  _activeChatMic.onerror = () => {
    _activeChatMic = null;
    $(btnId)?.classList.remove('mic-on');
  };
  _activeChatMic.start();
}

window.langNote      = langNote;
window.getCtx        = getCtx;
window.callAPI             = callAPI;
window.abortCurrentRequest = abortCurrentRequest;
window.abortCurrentRequest = abortCurrentRequest;
window.setAPIContext = setAPIContext;
window.toggleChatMic = toggleChatMic;

// ── Context-History-Komprimierung ────────────────────────────
// Fasst ältere Nachrichten zusammen statt sie zu löschen
async function compressHistory(chatType = 'bc') {
  const hist = S.chatHistory[chatType] || [];
  if (hist.length < 30) return;

  // Behalte die letzten 20 Nachrichten unverändert
  const recent  = hist.slice(-20);
  const older   = hist.slice(0, -20);
  if (!older.length) return;

  const summary = await callAPIDirect(
    [{
      role: 'user',
      content: 'Fasse diesen Gesprächsverlauf kompakt zusammen (max 300 Wörter). '
        + 'Behalte alle wichtigen Entscheidungen, Anforderungen und Erkenntnisse.\n\n'
        + older.map(m => (m.role === 'user' ? 'Nutzer' : 'KI') + ': ' + (m.content||'').substring(0, 300)).join('\n')
    }],
    'Komprimiere den Gesprächsverlauf.',
    500, '', null
  );

  if (summary.ok && summary.text) {
    S.chatHistory[chatType] = [
      { role: 'user',      content: '[Zusammenfassung früherer Gesprächsverlauf]' },
      { role: 'assistant', content: summary.text },
      ...recent,
    ];
  } else {
    // Fallback: einfach abschneiden
    S.chatHistory[chatType] = recent;
  }
}

window.compressHistory = compressHistory;
