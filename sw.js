const CACHE_NAME = 'habit-v3';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './styles.css',
  './manifest.json',
  '../icons/habit.svg',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Don't cache non-OK or opaque responses for safety
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      }).catch(() => cached);
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes('habit-tracker') && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(self.registration.scope);
    })
  );
});

// Handle Periodic Background Sync for reliable Android reminders
self.addEventListener('periodicsync', event => {
  if (event.tag === 'habit-reminder') {
    event.waitUntil(sendScheduledNotification());
  }
});

async function sendScheduledNotification() {
  // Check if we already sent a notification today
  const cache = await caches.open(CACHE_NAME);
  const metaResponse = await cache.match('/__notif-meta__');
  const today = new Date().toISOString().slice(0, 10);

  if (metaResponse) {
    const meta = await metaResponse.json();
    if (meta.lastNotifDate === today) return;
  }

  await self.registration.showNotification('Habit Tracker', {
    body: "Don't forget to log your habits for today!",
    icon: '../icons/habit-192.png',
    badge: '../icons/habit-192.png',
    tag: 'habit-reminder',
    renotify: true,
  });

  // Record that we sent today's notification
  await cache.put(
    '__notif-meta__',
    new Response(JSON.stringify({ lastNotifDate: today }), {
      headers: { 'Content-Type': 'application/json' },
    })
  );
}
