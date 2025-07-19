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
  "https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js",
  "https://www.gstatic.com/firebasejs/8.10.1/firebase-auth.js",
  "https://www.gstatic.com/firebasejs/8.10.1/firebase-firestore.js",
  "https://www.gstatic.com/firebasejs/8.10.1/firebase-storage.js"
];

// Install and cache files
self.addEventListener("install", (event) => {
  self.skipWaiting(); // Activate new SW immediately
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache))
  );
});

// Fetch strategy: network-first for verified.json
self.addEventListener("fetch", (event) => {
  const requestURL = new URL(event.request.url);

  // Always fetch latest verified.json
  if (requestURL.pathname.endsWith("verified.json")) {
    event.respondWith(fetch(event.request, { cache: "no-store" }).catch(() => caches.match(event.request)));
    return;
  }

  // Cache-first fallback for other files
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
