/**
 * Service Worker — RE-Assistent v3.5
 * Strategie:
 * - App-Shell (HTML/CSS/JS): Cache-First → sofortiger Start offline
 * - API-Calls: Network-First → frische Daten wenn online, Cache als Fallback
 */

const CACHE_VERSION = 'v1';
const SHELL_CACHE   = `re-shell-${CACHE_VERSION}`;
const API_CACHE     = `re-api-${CACHE_VERSION}`;

const SHELL_ASSETS = ['/', '/index.html', '/offline.html'];

const CACHEABLE_API = [
  '/api/systems',
  '/api/requirements',
  '/api/auth/me',
  '/api/version',
];

// ── Install ───────────────────────────────────────────────────
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL_ASSETS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: Alte Caches löschen ────────────────────────────
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== SHELL_CACHE && k !== API_CACHE)
            .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────────
self.addEventListener('fetch', (e) => {
  const { request } = e;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (url.protocol === 'ws:' || url.protocol === 'wss:') return;
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(networkFirst(request));
    return;
  }
  e.respondWith(cacheFirst(request));
});

// ── Cache-First (App-Shell) ───────────────────────────────────
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch(err) {
    if (request.mode === 'navigate') {
      const offline = await caches.match('/offline.html');
      if (offline) return offline;
    }
    return new Response('Offline', { status: 503 });
  }
}

// ── Network-First (API) ───────────────────────────────────────
async function networkFirst(request) {
  try {
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 8000);
    const response   = await fetch(request, { signal: controller.signal });
    clearTimeout(timeout);

    if (response.ok) {
      const url = new URL(request.url);
      if (CACHEABLE_API.some(r => url.pathname.startsWith(r))) {
        const cache = await caches.open(API_CACHE);
        cache.put(request, response.clone());
      }
    }
    return response;
  } catch(err) {
    const cached = await caches.match(request);
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set('X-From-Cache', 'true');
      return new Response(cached.body, { status: cached.status, headers });
    }
    return new Response(
      JSON.stringify({ error: 'Offline', offline: true }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// ── Background Sync ───────────────────────────────────────────
self.addEventListener('sync', (e) => {
  if (e.tag === 're-sync') {
    e.waitUntil(
      self.clients.matchAll().then(clients =>
        clients.forEach(c => c.postMessage({ type: 'sync-complete' }))
      )
    );
  }
});

// ── Push Notifications ────────────────────────────────────────
self.addEventListener('push', (e) => {
  if (!e.data) return;
  try {
    const data = e.data.json();
    e.waitUntil(self.registration.showNotification(
      data.title || 'RE-Assistent',
      { body: data.body || '', icon: '/icon-192.png', tag: data.tag || 're', renotify: true }
    ));
  } catch(err) {}
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(wins => {
      if (wins.length) { wins[0].focus(); return; }
      clients.openWindow('/');
    })
  );
});
