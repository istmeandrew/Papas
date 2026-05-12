(() => {
  async function updateInstalledApp() {
    if (!("serviceWorker" in navigator)) return;
    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });
    const registration = await navigator.serviceWorker.register("./sw.js");
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
    await registration.update();
    activateWaiting();
  }

  updateInstalledApp().catch(() => {});
})();
