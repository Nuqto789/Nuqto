const CACHE_NAME = 'nuqto-shell-v4';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // jangan cache API/data calls (Supabase, upload) — selalu ambil terbaru
  if (event.request.method !== 'GET' || url.pathname.startsWith('/api/') || url.hostname.includes('supabase.co')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

/* ===================== PUSH NOTIFICATION ===================== */
const NUQTO_ICON = 'https://pub-ba64decb48ad4940bbb5c68f90bd597e.r2.dev/Foto%20icon%20aplikasi/IMG_20260807_215745_363.jpg';

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch (e) { data = { title: 'Nuqto', body: event.data ? event.data.text() : '' }; }

  const title = data.title || '🚨 Ada yang dalam bahaya';
  const options = {
    body: data.body || 'Seseorang menandai dirinya dalam bahaya. Ketuk untuk lihat lokasi.',
    icon: data.icon || NUQTO_ICON,
    badge: NUQTO_ICON,
    vibrate: [200, 100, 200, 100, 300],
    requireInteraction: true,
    tag: data.tag || 'nuqto-emergency',
    renotify: true,
    data: { url: data.url || '/' }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Klik notifikasi darurat → buka/fokus app Nuqto lalu tampilkan popup di dalam app
  // (BUKAN membuka Google Maps).
  event.waitUntil((async () => {
    const clientList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientList) {
      if ('focus' in client) {
        try { client.postMessage({ type: 'show-emergency' }); } catch (e) { /* ignore */ }
        return client.focus();
      }
    }
    if (clients.openWindow) return clients.openWindow('/?emg=1');
  })());
});
