const CACHE_NAME = "feedback-pulse-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // Pass-through to network so SSR stays highly responsive
  event.respondWith(fetch(event.request));
});
