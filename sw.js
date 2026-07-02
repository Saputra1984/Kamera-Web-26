const CACHE_NAME = 'ai-picture-v1'; // Anda bisa naikkan ke v2, v3, dst.
const ASSETS = [
    './',
    './index.html',
    './brain.js',
    './database.js',
    './manifest.json'
];

// Saat diinstal: Simpan semua aset ke cache
self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});

// Saat ada permintaan: Cek cache dulu, baru internet
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then(response => {
            return response || fetch(event.request);
        })
    );
});
