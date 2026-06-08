self.addEventListener('install', (e) => {
    self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
    // Membiarkan aplikasi membaca aset dari cache lokal HP
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
