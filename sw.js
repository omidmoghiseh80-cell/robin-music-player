// Arad Music Playlists v4
// Service Worker intentionally disabled to prevent stale GitHub Pages UI.
// This file remains only for compatibility with older deployments.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(
  caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
    .then(() => self.clients.claim())
));
self.addEventListener("fetch", () => {});
