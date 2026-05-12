const CACHE_NAME = "papas-pos-v11";
const FILES = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./excel-seed.js",
  "./manifest.webmanifest",
  "./icon.svg"
];

const TIME_FIX = `
(() => {
  const originalPut = window.put;
  window.inputDateToIso = function inputDateToIso(value) {
    if (!value) return new Date().toISOString();
    const [year, month, day] = value.split("-").map(Number);
    const now = new Date();
    return new Date(year, month - 1, day, now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds()).toISOString();
  };
  window.put = function put(storeName, value) {
    if (["sales", "purchases", "payments"].includes(storeName) && value && !value.createdAt) {
      value.createdAt = new Date().toISOString();
    }
    return originalPut(storeName, value);
  };
})();
`;

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(FILES)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.pathname.endsWith("/app.js")) {
    event.respondWith(
      caches.match(event.request)
        .then((cached) => cached || fetch(event.request))
        .then((response) => response.text())
        .then((text) => new Response(`${text}\n${TIME_FIX}`, {
          headers: { "Content-Type": "application/javascript; charset=utf-8" }
        }))
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
