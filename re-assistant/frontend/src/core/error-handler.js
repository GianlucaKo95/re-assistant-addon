'use strict';
/**
 * core/error-handler.js
 * 🔴 FIX 2: Zentrales Fehlerhandling, Verbindungsstatus, API-Key-Prüfung.
 */

// ── Verbindungs-Banner ────────────────────────────────────────
let _offlineBannerShown = false;

function showOfflineBanner(msg) {
  if (_offlineBannerShown) return;
  _offlineBannerShown = true;
  const banner = document.createElement('div');
  banner.id = 'offline-banner';
  banner.style.cssText = `
    position:fixed;top:44px;left:0;right:0;z-index:180;
    background:var(--redbg);border-bottom:1px solid rgba(248,113,113,.3);
    padding:8px 20px;font-size:12px;color:var(--red);
    display:flex;align-items:center;justify-content:space-between;
  `;
  banner.innerHTML = `
    <span>⚠ ${esc(msg)}</span>
    <button onclick="retryConnection()" style="background:var(--redbg);border:1px solid rgba(248,113,113,.4);
      border-radius:6px;color:var(--red);font-size:11px;padding:3px 10px;cursor:pointer;">
      Erneut versuchen
    </button>`;
  document.body.appendChild(banner);
}

function hideOfflineBanner() {
  _offlineBannerShown = false;
  document.getElementById('offline-banner')?.remove();
}

async function retryConnection() {
  hideOfflineBanner();
  try {
    await window.api.getAppVersion();
    toast('✅ Verbindung wiederhergestellt');
    S.systems = await window.api.getSystems();
  } catch(e) {
    showOfflineBanner('Server nicht erreichbar. Bitte prüfen Sie ob das Add-on läuft.');
  }
}

// ── API-Key Prüfung ───────────────────────────────────────────
function showApiKeyWarning() {
  const existing = document.getElementById('apikey-warning');
  if (existing) return;
  const warn = document.createElement('div');
  warn.id = 'apikey-warning';
  warn.style.cssText = `
    position:fixed;top:44px;left:0;right:0;z-index:180;
    background:var(--ambbg);border-bottom:1px solid rgba(251,191,36,.3);
    padding:8px 20px;font-size:12px;color:var(--amb);
    display:flex;align-items:center;justify-content:space-between;
  `;
  warn.innerHTML = `
    <span>⚠ Kein Anthropic API-Key konfiguriert — KI-Funktionen sind deaktiviert.</span>
    <div style="display:flex;gap:6px;align-items:center">
      <button onclick="switchView('settings');document.getElementById('apikey-warning').remove();"
        style="background:var(--ambbg);border:1px solid rgba(251,191,36,.4);
        border-radius:6px;color:var(--amb);font-size:11px;padding:3px 10px;cursor:pointer;">
        Einstellungen öffnen
      </button>
      <button onclick="document.getElementById('apikey-warning').remove();"
        title="Schließen"
        style="background:transparent;border:none;color:var(--amb);font-size:16px;
        line-height:1;padding:2px 6px;cursor:pointer;">
        ✕
      </button>
    </div>`;
  document.body.appendChild(warn);
}

// ── Fehler-Overlay für kritische Fehler ───────────────────────
function showCriticalError(title, message, retryFn) {
  openModal(title, `
    <div style="text-align:center;padding:10px 0">
      <div style="font-size:36px;margin-bottom:12px">⚠</div>
      <p style="font-size:14px;color:var(--t2);line-height:1.6;margin-bottom:16px">${esc(message)}</p>
      <div style="display:flex;gap:8px;justify-content:center">
        ${retryFn ? `<button class="btn-primary" onclick="(${retryFn.toString()})();closeModal()">Erneut versuchen</button>` : ''}
        <button class="btn-secondary" onclick="closeModal()">Schließen</button>
      </div>
    </div>`);
}

// ── Überschreibe callAPI mit Fehlerbehandlung ─────────────────
const _originalCallAPI = window.callAPI;
window.callAPI = async function(messages, system, maxTokens) {
  try {
    const res = await _originalCallAPI(messages, system, maxTokens);
    if (!res.ok) {
      // API-Key fehlt oder ungültig
      if (res.text?.includes('API-Fehler') || res.text?.includes('401') || res.text?.includes('403')) {
        showApiKeyWarning();
      }
      // Rate Limit
      if (res.text?.includes('529') || res.text?.includes('rate') || res.text?.includes('overloaded')) {
        toast('⏳ API überlastet — bitte kurz warten und erneut versuchen.', 5000);
      }
    }
    return res;
  } catch(e) {
    showOfflineBanner('Verbindung zum Backend unterbrochen.');
    return { ok: false, text: 'Verbindungsfehler: ' + e.message };
  }
};

// ── Globaler fetch-Error-Handler ──────────────────────────────
const _originalFetch = window.fetch;
window.fetch = async function(...args) {
  try {
    const res = await _originalFetch(...args);
    // Automatisch ausloggen bei 401
    if (res.status === 401 && args[0]?.toString().startsWith('/api/') && !args[0]?.toString().includes('/auth/')) {
      toast('⚠ Session abgelaufen — bitte neu anmelden.');
      setTimeout(async () => {
        if (typeof doLogout === 'function') await doLogout();
      }, 1500);
    }
    return res;
  } catch(e) {
    // Netzwerkfehler
    if (!document.getElementById('offline-banner')) {
      showOfflineBanner('Backend nicht erreichbar. Prüfen Sie ob das Add-on läuft.');
    }
    throw e;
  }
};

// ── Version-Check beim Start ──────────────────────────────────
async function checkApiKeyOnStart() {
  // Nur prüfen wenn Version geladen werden konnte (Backend läuft)
  try {
    const ver = await _originalFetch('/api/version').then(r => r.json());
    if (ver.apiKeyMissing) showApiKeyWarning();
  } catch(e) { /* Backend nicht erreichbar — wird durch fetch-Override gehandelt */ }
}

window.showOfflineBanner  = showOfflineBanner;
window.hideOfflineBanner  = hideOfflineBanner;
window.retryConnection    = retryConnection;
window.showApiKeyWarning  = showApiKeyWarning;
window.showCriticalError  = showCriticalError;
window.checkApiKeyOnStart = checkApiKeyOnStart;
