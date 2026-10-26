/* Novelis service worker: membuat aplikasi bisa dibuka offline.
   Naik-kan VERSION setiap kali file aplikasi berubah agar cache lama dibuang. */
const VERSION = 'novelis-v7';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png'];
// Library pihak ketiga yang aman di-cache (hanya GET; API AI TIDAK pernah lewat sini).
const CDN_HOSTS = ['cdn.tailwindcss.com', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => Promise.allSettled(SHELL.map((u) => cache.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function staleWhileRevalidate(request) {
  return caches.open(VERSION).then((cache) =>
    cache.match(request).then((hit) => {
      const net = fetch(request)
        .then((res) => {
          if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone());
          return res;
        })
        .catch(() => hit);
      return hit || net;
    })
  );
}

// Halaman utama: ambil versi terbaru dari jaringan; bila lambat/offline pakai salinan tersimpan.
function networkFirstPage(request) {
  return caches.open(VERSION).then((cache) => {
    const net = fetch(request).then((res) => {
      if (res && res.ok) { cache.put(request, res.clone()); cache.put('./index.html', res.clone()); }
      return res;
    });
    const fallback = () => cache.match(request).then((h) => h || cache.match('./index.html') || cache.match('./'));
    return cache.match('./index.html').then((cached) => {
      if (!cached) return net.catch(fallback);
      const timeout = new Promise((resolve) => setTimeout(() => resolve(cached), 3500));
      return Promise.race([net.catch(() => cached), timeout]);
    });
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate') { event.respondWith(networkFirstPage(req)); return; }
    event.respondWith(staleWhileRevalidate(req));
    return;
  }
  if (CDN_HOSTS.includes(url.hostname)) { event.respondWith(staleWhileRevalidate(req)); return; }
  // Selain itu (mis. API Gemini/DeepSeek): biarkan browser menangani, jangan di-cache.
});
