const CACHE_NAME = "papas-pos-v22";
const FILES = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./app-update.js",
  "./excel-seed.js",
  "./manifest.webmanifest",
  "./icon.svg"
];

const APP_FIX = `
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

  if ("serviceWorker" in navigator) {
    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });
    navigator.serviceWorker.getRegistration().then((registration) => {
      if (!registration) return;
      const activateWaiting = () => {
        if (registration.waiting) registration.waiting.postMessage({ type: "SKIP_WAITING" });
      };
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) activateWaiting();
        });
      });
      registration.update().then(activateWaiting).catch(() => {});
    });
  }
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

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.pathname.endsWith("/app.js")) {
    event.respondWith(
      caches.match(event.request)
        .then((cached) => cached || fetch(event.request))
        .then((response) => response.text())
        .then((text) => new Response(`${text}\n${APP_FIX}`, {
          headers: { "Content-Type": "application/javascript; charset=utf-8" }
        }))
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
