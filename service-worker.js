const CACHE_NAME = "stringwasp-v1.3"; // Increment version to force updates
const urlsToCache = [
  "/",
  "/index.html",
  "/style.css",
  "/app.js",
  "/firebase.js",
  "/manifest.json",
  "/favicon.png",
  "/notif.mp3",
  "/verified.json", // Badge data
  "https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js",
  "https://www.gstatic.com/firebasejs/8.10.1/firebase-auth.js",
  "https://www.gstatic.com/firebasejs/8.10.1/firebase-firestore.js",
  "https://www.gstatic.com/firebasejs/8.10.1/firebase-storage.js"
];

// Install: Cache essential files
self.addEventListener("install", (event) => {
  console.log("[SW] Install event triggered");
  self.skipWaiting(); // Activate immediately
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log("[SW] Caching essential files:", urlsToCache);
        return cache.addAll(urlsToCache);
      })
      .then(() => console.log("[SW] All files cached successfully"))
      .catch((err) => console.error("[SW] Caching failed:", err))
  );
});

// Fetch: Cache-first strategy except for verified.json
self.addEventListener("fetch", (event) => {
  const requestURL = new URL(event.request.url);

  // Always bypass cache for verified.json
  if (requestURL.pathname.endsWith("verified.json")) {
    event.respondWith(
      fetch(event.request, { cache: "no-store" })
        .then((response) => {
          console.log("[SW] Fetched latest verified.json");
          return response;
        })
        .catch(() => {
          console.warn("[SW] Network failed for verified.json, using cache");
          return caches.match("/verified.json");
        })
    );
    return;
  }

  // Cache-first for all other requests
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        console.log("[SW] Serving from cache:", event.request.url);
        return cachedResponse;
      }
      console.log("[SW] Fetching from network:", event.request.url);
      return fetch(event.request);
    })
  );
});

// Activate: Remove old caches
self.addEventListener("activate", (event) => {
  console.log("[SW] Activate event triggered, cleaning old caches...");
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME)
          .map((key) => {
            console.log(`[SW] Deleting old cache: ${key}`);
            return caches.delete(key);
          })
      )
    ).then(() => console.log("[SW] Cleanup complete"))
  );
  self.clients.claim();
});
