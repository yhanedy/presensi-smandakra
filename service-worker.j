// Service worker minimal untuk syarat PWA
self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  // Biarkan request lewat (tidak ada cache offline)
});
