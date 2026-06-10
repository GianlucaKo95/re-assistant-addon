'use strict';
/**
 * features/service-worker.js
 * Service Worker Registration, Offline-Banner, Cache-from-SW Handling,
 * Background-Sync für ausstehende Änderungen.
 */

let _swRegistration = null;
let _isOffline      = false;
let _pendingQueue   = [];  // Ausstehende API-Writes wenn offline

// ── Registration ──────────────────────────────────────────────
async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  try {
    _swRegistration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    });

    _swRegistration.addEventListener('updatefound', () => {
      const newWorker = _swRegistration.installing;
      newWorker?.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          showUpdateBanner();
        }
      });
    });

    // Nachrichten vom SW empfangen
    navigator.serviceWorker.addEventListener('message', handleSWMessage);

    // Online/Offline Events
    window.addEventListener('online',  onOnline);
    window.addEventListener('offline', onOffline);

    // Session beim Schließen des Tabs beenden (Chrome behält sonst Session-Cookies)
    window.addEventListener('beforeunload', () => {
      navigator.sendBeacon('api/auth/logout');
    });

    // Initial-Status prüfen
    if (!navigator.onLine) onOffline();

    console.log('[SW] Service Worker registriert');
  } catch(e) {
    console.warn('[SW] Registrierung fehlgeschlagen:', e.message);
  }
}

// ── Online/Offline Handling ───────────────────────────────────
function onOffline() {
  if (_isOffline) return;
  _isOffline = true;
  showOfflineBanner();
}

function onOnline() {
  if (!_isOffline) return;
  _isOffline = false;
  hideOfflineBanner();
  // Ausstehende Writes synchronisieren
  syncPendingQueue();
  // SW Background Sync anfordern
  _swRegistration?.sync?.register('re-sync').catch(() => {});
  toast('✅ Verbindung wiederhergestellt — synchronisiere …');
}

function showOfflineBanner() {
  const existing = document.getElementById('offline-banner');
  if (existing) return;
  const banner = document.createElement('div');
  banner.id = 'offline-banner';
  banner.style.cssText = `
    position:fixed;top:0;left:0;right:0;z-index:999;
    background:linear-gradient(90deg,rgba(217,119,6,.95),rgba(251,191,36,.95));
    color:#1c1917;padding:8px 16px;font-size:12px;font-weight:600;
    display:flex;align-items:center;justify-content:space-between;
    backdrop-filter:blur(8px)`;
  banner.innerHTML = `
    <span>📡 Offline — Änderungen werden gespeichert und synchronisiert wenn die Verbindung zurückkehrt</span>
    <span id="offline-queue-count" style="font-size:11px;opacity:.8"></span>`;
  document.body.prepend(banner);
  // App nach unten verschieben
  document.getElementById('app-screen')?.style.setProperty('padding-top', '36px');
}

function hideOfflineBanner() {
  const banner = document.getElementById('offline-banner');
  if (banner) {
    banner.style.transition = 'opacity .3s';
    banner.style.opacity = '0';
    setTimeout(() => {
      banner.remove();
      document.getElementById('app-screen')?.style.removeProperty('padding-top');
    }, 300);
  }
}

function showUpdateBanner() {
  const banner = document.createElement('div');
  banner.id = 'update-banner';
  banner.style.cssText = `
    position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:999;
    background:rgba(168,85,247,.15);border:1px solid rgba(168,85,247,.4);
    border-radius:12px;padding:10px 16px;font-size:12px;color:var(--t1);
    display:flex;align-items:center;gap:10px;backdrop-filter:blur(8px);
    box-shadow:0 8px 32px rgba(0,0,0,.3)`;
  banner.innerHTML = `
    <span>✨ Update verfügbar</span>
    <button onclick="applyUpdate()" style="background:var(--aa);border:none;border-radius:7px;
      color:white;font-size:11px;padding:4px 10px;cursor:pointer;font-family:var(--font)">
      Jetzt aktualisieren
    </button>
    <button onclick="this.parentElement.remove()" style="background:none;border:none;
      color:var(--t3);cursor:pointer;font-size:14px">✕</button>`;
  document.body.appendChild(banner);
}

function applyUpdate() {
  _swRegistration?.waiting?.postMessage({ type: 'SKIP_WAITING' });
  window.location.reload();
}

// ── Nachrichten vom SW ────────────────────────────────────────
function handleSWMessage(e) {
  if (e.data?.type === 'sync-complete') {
    toast('✅ Offline-Änderungen synchronisiert');
    // Views neu laden falls nötig
    if (S.activeView) {
      const viewLoader = window._viewLoaders?.[S.activeView];
      if (viewLoader) viewLoader();
    }
  }
}

// ── Pending Queue: Offline Writes puffern ─────────────────────
function enqueuePendingWrite(url, method, body) {
  _pendingQueue.push({ url, method, body, ts: Date.now() });
  updateQueueBadge();
  // In localStorage persistieren für Seiten-Reload
  try {
    localStorage.setItem('re-pending-queue', JSON.stringify(_pendingQueue));
  } catch(e) {}
}

function loadPendingQueue() {
  try {
    _pendingQueue = JSON.parse(localStorage.getItem('re-pending-queue') || '[]');
  } catch(e) { _pendingQueue = []; }
}

async function syncPendingQueue() {
  loadPendingQueue();
  if (!_pendingQueue.length) return;

  const queue = [..._pendingQueue];
  _pendingQueue = [];
  localStorage.removeItem('re-pending-queue');

  let synced = 0;
  for (const item of queue) {
    try {
      await fetch(item.url, {
        method: item.method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.body),
      });
      synced++;
    } catch(e) {
      // Wieder einstellen wenn fehlgeschlagen
      _pendingQueue.push(item);
    }
  }

  if (_pendingQueue.length) {
    localStorage.setItem('re-pending-queue', JSON.stringify(_pendingQueue));
  }
  updateQueueBadge();

  if (synced > 0) toast(`✅ ${synced} offline gespeicherte Änderungen synchronisiert`);
}

function updateQueueBadge() {
  const el = document.getElementById('offline-queue-count');
  if (el && _pendingQueue.length) {
    el.textContent = `${_pendingQueue.length} ausstehend`;
  }
}

// ── Fetch-Interceptor: bei Offline-Fehler in Queue einreihen ──
const _origFetch = window.fetch.bind(window);
window.fetch = async function(url, opts = {}) {
  try {
    return await _origFetch(url, opts);
  } catch(err) {
    const method = (opts.method || 'GET').toUpperCase();
    // Schreibende Requests bei Offline puffern
    if (_isOffline && ['POST','PUT','PATCH','DELETE'].includes(method) && String(url).startsWith('/api/')) {
      try {
        const body = opts.body ? JSON.parse(opts.body) : null;
        enqueuePendingWrite(String(url), method, body);
      } catch(e) {}
      // Fake-200 zurückgeben damit UI nicht crasht
      return new Response(JSON.stringify({ ok: true, queued: true }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      });
    }
    throw err;
  }
};

// ── Init ──────────────────────────────────────────────────────
loadPendingQueue();
registerServiceWorker();

window.registerServiceWorker = registerServiceWorker;
window.applyUpdate           = applyUpdate;
window.syncPendingQueue      = syncPendingQueue;
