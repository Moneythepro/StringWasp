self.addEventListener("install", e => {
  e.waitUntil(
    caches.open("stringwasp-cache").then(cache =>
      cache.addAll([
        "/",
        "/index.html",
        "/style.css",
        "/app.js",
        "/firebase.js",
        "/notif.mp3",
        "/favicon.png",
        "/manifest.json"
      ])
    )
  );
});

self.addEventListener("fetch", e => {
  e.respondWith(
    caches.match(e.request).then(response => response || fetch(e.request))
  );
});
