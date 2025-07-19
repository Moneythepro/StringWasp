const CACHE_NAME = "stringwasp-v1.3"; // Bump version to force update
const urlsToCache = [
  "/",
  "/index.html",
  "/style.css",
  "/app.js",
  "/firebase.js",
  "/manifest.json",
  "/favicon.png",
  "/notif.mp3",
  "/verified.json", // Ensure badge data is cached
  "https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js",
  "https://www.gstatic.com/firebasejs/8.10.1/firebase-auth.js",
  "https://www.gstatic.com/firebasejs/8.10.1/firebase-firestore.js",
  "https://www.gstatic.com/firebasejs/8.10.1/firebase-storage.js"
];

// Install and cache essential files
self.addEventListener("install", (event) => {
  self.skipWaiting(); // Activate immediately
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache))
  );
});

// Fetch strategy: always fetch the latest verified.json
self.addEventListener("fetch", (event) => {
  const requestURL = new URL(event.request.url);

  // Always bypass cache for verified.json
  if (requestURL.pathname.endsWith("verified.json")) {
    event.respondWith(
      fetch(event.request, { cache: "no-store" }).catch(() => caches.match("/verified.json"))
    );
    return;
  }

  // Cache-first for all other requests
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});

// Activate and remove old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});
