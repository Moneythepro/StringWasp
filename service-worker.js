self.addEventListener('install', e => {
  self.skipWaiting();
  console.log('Service Worker installed');
});

self.addEventListener('activate', e => {
  console.log('Service Worker activated');
});

self.addEventListener('fetch', e => {
  // Optional: offline support here
});
