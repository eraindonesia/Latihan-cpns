const CACHE_NAME = 'cpns-cat-pwa-v12';
const ASSETS = [
  './',
  './index.html',
  './manifest.json?v=12',
  './css/style.css?v=12',
  './js/config.js?v=12',
  './js/app.js?v=12'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).catch(() => {})
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  // Hanya tangani GET dari origin yang sama (abaikan CDN eksternal & API GAS agar tidak memicu ERR_FAILED)
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) return;

  event.respondWith(
    fetch(req)
      .then(res => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone)).catch(() => {});
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(req, { ignoreSearch: true });
        if (cached) return cached;
        if (req.mode === 'navigate') {
          const navFallback = (await caches.match('./index.html', { ignoreSearch: true })) || (await caches.match('./', { ignoreSearch: true }));
          if (navFallback) return navFallback;
        }
        return new Response('Koneksi terputus. Periksa jaringan internet atau matikan pemblokir DNS.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
      })
  );
});