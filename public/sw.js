// Service Worker — cachuje shell aplikace pro offline provoz
const CACHE = 'kavarna-v1';
const SHELL = ['/', '/index.html', '/dashboard.html', '/admin.html', '/style.css', '/app.js', '/dashboard.js', '/admin.js', '/localdb.js'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // API volání nikdy necachujeme — jdou přímo na síť (nebo selžou)
  if (url.pathname.startsWith('/api/')) return;

  // Shell soubory: cache-first
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      const clone = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, clone));
      return res;
    }))
  );
});
