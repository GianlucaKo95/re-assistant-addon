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

// autoContinue: bei true UND abgeschnittener Antwort (max_tokens) wird die
// KI automatisch gebeten weiterzuschreiben, statt dem Aufrufer nur ein
// "truncated"-Flag für einen Hinweistext zu geben — für Freitext-Chats
// (business/chat.js, pm/chat.js), wo der Nutzer die VOLLSTÄNDIGE Antwort
// will, nicht nur die Information dass sie unvollständig war.
async function callAPI(messages, system = '', maxTokens = 2000, feature = null, _reserved = null, streamCb = null, autoContinue = false) {
  if (_activeAbortController) _activeAbortController.abort();
  _activeAbortController = new AbortController();
  const signal = _activeAbortController.signal;
  const feat   = feature || _currentFeature || 'other';
  const sysId  = _currentSystemId || S.activeSystemId || null;

  // Rate-Limit-Wartezeiten (z.B. Groqs 60s-Fenster) werden HIER client-seitig
  // zwischen mehreren kurzen Fetches abgewartet statt EINEN Request über
  // Minuten offen zu halten: ein gesperrtes Handy-Display killt eine so
  // lange offene Verbindung (iOS/Safari meldet dann "Load failed"), ein
  // client-seitiger Timer dagegen holt die Wartezeit beim Wieder-Aufwecken
  // einfach nach. Der Server (server.js /api/ai/chat) antwortet bei 429
  // deshalb sofort mit Retry-After statt selbst zu warten.
  const maxAttempts = 6;
  const maxTotalWaitMs = 300000;

  const fetchOnce = async (msgs) => {
    let totalWaitMs = 0;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
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
          messages:     msgs,
          _feature:     feat,
          _systemId:    sysId,
          // Anhänge (Bilder/Dateien) aus dem Chat
          _attachments: window._pendingAttachments || undefined,
        }),
      });

      if (res.status === 429 && attempt < maxAttempts - 1) {
        const retryAfterSec = parseFloat(res.headers.get('retry-after'));
        const waitMs = Number.isFinite(retryAfterSec) ? retryAfterSec * 1000 : 62000;
        if (totalWaitMs + waitMs <= maxTotalWaitMs) {
          totalWaitMs += waitMs;
          await new Promise(r => setTimeout(r, waitMs));
          continue;
        }
      }

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
        // status/noKeyConfigured/provider durchreichen: nur wenn der Server
        // wirklich "kein Key konfiguriert" meldet (debugProvider gesetzt) ist
        // es tatsächlich das — jeder andere 401/403 kommt vom Provider selbst
        // zurück (falscher/abgelaufener Key, falsches Modell, Rate-Limit) und
        // darf NICHT als "kein Key" missverstanden werden.
        return {
          ok: false, text: `API-Fehler: ${msg}`, status: res.status,
          noKeyConfigured: !!data?.debugProvider, provider: data?.debugProvider,
        };
      }

      const text = data.content?.find(c => c.type === 'text')?.text || '';
      // truncated: max_tokens hat die Antwort abgeschnitten, bevor die KI
      // fertig war.
      return { ok: true, text, truncated: data.stop_reason === 'max_tokens' };
    }
    return { ok: false, text: 'API-Fehler: Rate-Limit — maximale Wartezeit überschritten', status: 429 };
  };

  try {
    // Bis zu MAX_CONTINUATIONS weitere Anfragen, wenn die Antwort wegen
    // max_tokens abbricht: die abgeschnittene Antwort wird als eigener
    // Assistant-Turn angehängt und die KI gebeten, exakt dort fortzufahren.
    // So kommt bei "erkläre im Detail"-Anfragen die vollständige Antwort
    // an, statt nur ein Hinweis dass sie unvollständig war.
    const MAX_CONTINUATIONS = autoContinue ? 5 : 0;
    let msgs = messages;
    let combined = '';
    let result;
    for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
      result = await fetchOnce(msgs);
      if (!result.ok) {
        // Bei Fehler mitten in einer Fortsetzung: das bereits Empfangene
        // trotzdem zurückgeben (als unvollständig markiert), statt alles
        // zu verwerfen.
        return combined ? { ok: true, text: combined, truncated: true } : result;
      }
      combined += result.text;
      if (typeof streamCb === 'function') streamCb(result.text, combined);
      if (!autoContinue || !result.truncated || i === MAX_CONTINUATIONS) break;
      msgs = [...msgs,
        { role: 'assistant', content: result.text },
        { role: 'user', content: 'Fahre exakt dort fort, wo du aufgehört hast — keine Wiederholung, keine neue Einleitung, keine Zusammenfassung.' }];
    }
    return { ok: true, text: combined, truncated: !!result.truncated };
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
