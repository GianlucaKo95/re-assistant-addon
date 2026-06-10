'use strict';
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
    const c = d.content.substring(0, 12000);
    total += c.length;
    if (total > max) break;
    parts.push(`### ${d.relativePath || d.name}\n\n${c}`);
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

async function callAPI(messages, system = '', maxTokens = 2000, feature = null) {
  const feat   = feature || _currentFeature || 'other';
  const sysId  = _currentSystemId || S.activeSystemId || null;
  try {
    const res = await fetch('/api/ai/chat', {
      method: 'POST', credentials: 'include',
      headers: {
        'Content-Type':  'application/json',
        'X-RE-Feature':  feat,
        'X-RE-System':   sysId || '',
      },
      body: JSON.stringify({
        model:      S.settings?.model || 'claude-sonnet-4-6',
        max_tokens: maxTokens,
        system:     system || undefined,
        messages,
        _feature:   feat,
        _systemId:  sysId,
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
    return { ok: false, text: `Netzwerkfehler: ${e.message}` };
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
window.callAPI       = callAPI;
window.setAPIContext = setAPIContext;
window.toggleChatMic = toggleChatMic;
