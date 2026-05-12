(() => {
  const originalInputDateToIso = window.inputDateToIso;
  const originalPut = window.put;

  window.inputDateToIso = function inputDateToIso(value) {
    if (!value) return new Date().toISOString();
    const [year, month, day] = value.split("-").map(Number);
    const now = new Date();
    return new Date(
      year,
      month - 1,
      day,
      now.getHours(),
      now.getMinutes(),
      now.getSeconds(),
      now.getMilliseconds()
    ).toISOString();
  };

  window.put = function put(storeName, value) {
    if (["sales", "purchases", "payments"].includes(storeName) && value && !value.createdAt) {
      value.createdAt = new Date().toISOString();
    }
    return originalPut ? originalPut(storeName, value) : Promise.reject(new Error("Base local no disponible"));
  };

  if (!originalInputDateToIso || !originalPut) {
    console.warn("Papas POS: ajuste de hora cargado antes de la app principal.");
  }
})();
