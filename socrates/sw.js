/* ============================================================
   SOCRATES — SERVICE WORKER
   Push Notifications · Offline-Cache (minimal)
   ============================================================ */

const CACHE_NAME = 'socrates-v1';
const CACHE_URLS = [
  '/socrates/',
  '/socrates/index.html',
  '/socrates/app.html',
  '/socrates/css/base.css',
  '/socrates/css/components.css',
  '/socrates/css/orb.css',
  '/socrates/css/app.css',
];

/* ---- INSTALL ---- */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CACHE_URLS)).catch(() => {})
  );
  self.skipWaiting();
});

/* ---- ACTIVATE ---- */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* ---- FETCH (Network-first, Cache-Fallback) ---- */
self.addEventListener('fetch', (event) => {
  // Nur GET-Anfragen cachen
  if (event.request.method !== 'GET') return;
  // Netlify Functions nicht cachen
  if (event.request.url.includes('/.netlify/')) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

/* ---- PUSH NOTIFICATION ---- */
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data?.json() || {};
  } catch {
    data = { title: 'Socrates', body: event.data?.text() || 'Zeit zum Reflektieren.' };
  }

  const title   = data.title || 'Socrates';
  const options = {
    body:              data.body || 'Deine tägliche Reflexion wartet auf dich.',
    icon:              '/socrates/assets/icon-192.png',
    badge:             '/socrates/assets/icon-72.png',
    tag:               'socrates-reminder',
    renotify:          false,
    requireInteraction: false,
    data:              { url: data.url || '/socrates/app.html' },
    actions: [
      { action: 'open',    title: 'Jetzt reflektieren' },
      { action: 'dismiss', title: 'Später' },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

/* ---- NOTIFICATION CLICK ---- */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const targetUrl = event.notification.data?.url || '/socrates/app.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      // Bereits offenes Fenster fokussieren
      for (const client of windowClients) {
        if (client.url.includes('/socrates') && 'focus' in client) {
          return client.focus().then(c => c.navigate(targetUrl));
        }
      }
      // Neues Fenster öffnen
      return clients.openWindow(targetUrl);
    })
  );
});
