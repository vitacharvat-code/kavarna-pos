// Service Worker — network-first strategie
// Vždy zkusí stáhnout aktuální verzi, cache slouží jen jako offline záloha

const CACHE = 'kavarna-v2';
const SHELL = ['/', '/index.html', '/dashboard.html', '/admin.html', '/style.css', '/app.js', '/dashboard.js', '/admin.js', '/localdb.js', '/pin.js'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  // Smaže všechny starší verze cache (kavarna-v1 apod.)
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // API volání — vždy přímo na síť, nikdy necachovat
  if (url.pathname.startsWith('/api/')) return;

  // Ostatní (HTML, JS, CSS) — network-first
  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Uložit čerstvou verzi do cache
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request)) // Offline fallback
  );
});
