const CACHE_NAME = "stringwasp-v1";
const urlsToCache = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "firebase.js",
  "manifest.json",
  "notif.mp3",
  "icon-192.png",
  "icon-512.png"
];

// Install SW
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

// Fetch from cache/network
self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(resp => {
      return resp || fetch(event.request);
    })
  );
});
