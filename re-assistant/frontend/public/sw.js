// Service Worker — selbst-deregistrierend
// Löscht alle alten Caches und deregistriert sich
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', async () => {
  const keys = await caches.keys();
  await Promise.all(keys.map(k => caches.delete(k)));
  await self.clients.claim();
  // Alle Clients neu laden
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach(client => client.navigate(client.url));
});
self.addEventListener('fetch', event => {
  // Kein Caching — direkt ans Netzwerk
  event.respondWith(fetch(event.request));
});
