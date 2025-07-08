const CACHE_NAME = "stringwasp-cache-v1";
const urlsToCache = [
  "/",
  "/index.html",
  "/style.css",
  "/app.js",
  "/firebase.js",
  "/favicon.png",
  "/manifest.json",
  "/notif.mp3",
  "https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js",
  "https://www.gstatic.com/firebasejs/8.10.1/firebase-auth.js",
  "https://www.gstatic.com/firebasejs/8.10.1/firebase-firestore.js"
];

// Install SW and cache files
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

// Activate and clean old caches
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keyList =>
      Promise.all(
        keyList.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    )
  );
  self.clients.claim();
});

// Intercept fetch requests
self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      // Use cached response if available
      if (response) return response;
      // Else fetch from network
      return fetch(event.request).catch(() =>
        caches.match("/index.html")
      );
    })
  );
});
