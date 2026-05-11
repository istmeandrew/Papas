const DB_NAME = "papas-pos-db";
const DB_VERSION = 3;
const EXCEL_SEED_TOKEN = "papas-pos-public-empty-v1";
const KG_PER_SACK = 25;
const STORE_NAMES = ["sales", "purchases", "payments", "settings", "varieties", "suppliers"];
const DEFAULT_VARIETY_ID = "variety-default";
const DEFAULT_SUPPLIER = "Proveedor principal";
const ADMIN_PIN = "4818";

let lastDefaultDate = "";
let pendingDelete = null;

let db;
let state = {
  varieties: [],
  suppliers: [],
  sales: [],
  purchases: [],
  payments: [],
  settings: {
    defaultPrice: 12000,
    marginPercent: 35,
    pricePresets: [7000, 8000, 9000, 10000, 12000],
    lastSalePrice: 12000,
    costPresets: [5000, 6000, 7000, 8000],
    lastPurchaseCost: 7000
  }
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const nextDb = request.result;
      for (const name of STORE_NAMES) {
        if (!nextDb.objectStoreNames.contains(name)) {
          nextDb.createObjectStore(name, { keyPath: "id" });
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx(storeName, mode = "readonly") {
  return db.transaction(storeName, mode).objectStore(storeName);
}

function getAll(storeName) {
  return new Promise((resolve, reject) => {
    const request = tx(storeName).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

function put(storeName, value) {
  return new Promise((resolve, reject) => {
    const request = tx(storeName, "readwrite").put(value);
    request.onsuccess = () => resolve(value);
    request.onerror = () => reject(request.error);
  });
}

function clearStore(storeName) {
  return new Promise((resolve, reject) => {
    const request = tx(storeName, "readwrite").clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function deleteById(storeName, id) {
  return new Promise((resolve, reject) => {
    const request = tx(storeName, "readwrite").delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function money(value) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0
  }).format(Math.round(Number(value) || 0));
}

function sacks(value) {
  const n = Number(value) || 0;
  return `${new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 }).format(n)} ${n === 1 ? "saco" : "sacos"}`;
}

function sackKg(value) {
  const n = (Number(value) || 0) * KG_PER_SACK;
  return `${new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 }).format(n)} kg`;
}

function dateTime(value) {
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

function todayInputValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function inputDateToIso(value) {
  if (!value) return new Date().toISOString();
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0).toISOString();
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek(date) {
  const d = startOfDay(date);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  return d;
}

function startOfMonth(date) {
  const d = startOfDay(date);
  d.setDate(1);
  return d;
}

function isAfter(date, start) {
  return new Date(date).getTime() >= start.getTime();
}

function isInPeriod(date, start, end) {
  const time = new Date(date).getTime();
  return time >= start.getTime() && time < end.getTime();
}

function nextMonth(date) {
  const d = startOfMonth(date);
  d.setMonth(d.getMonth() + 1);
  return d;
}

function monthKey(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function monthLabel(key) {
  const [year, month] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("es-CL", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
}

function monthRange(key) {
  const [year, month] = key.split("-").map(Number);
  const start = new Date(year, month - 1, 1);
  return { start, end: nextMonth(start) };
}

async function loadState() {
  const [varieties, suppliers, sales, purchases, payments, settingsRows] = await Promise.all([
    getAll("varieties"),
    getAll("suppliers"),
    getAll("sales"),
    getAll("purchases"),
    getAll("payments"),
    getAll("settings")
  ]);
  if (!varieties.length) {
    const defaultVariety = {
      id: DEFAULT_VARIETY_ID,
      name: "Papa",
      defaultPrice: state.settings.defaultPrice,
      active: true,
      createdAt: new Date().toISOString()
    };
    await put("varieties", defaultVariety);
    varieties.push(defaultVariety);
  }
  if (!suppliers.length) {
    const defaultSupplier = {
      id: "supplier-principal",
      name: DEFAULT_SUPPLIER,
      active: true,
      createdAt: new Date().toISOString()
    };
    await put("suppliers", defaultSupplier);
    suppliers.push(defaultSupplier);
  }
  state.varieties = varieties.filter((row) => row.active !== false).sort((a, b) => a.name.localeCompare(b.name));
  state.suppliers = suppliers.filter((row) => row.active !== false).sort((a, b) => a.name.localeCompare(b.name));
  state.sales = sales.sort((a, b) => new Date(b.date) - new Date(a.date));
  state.purchases = purchases.sort((a, b) => new Date(b.date) - new Date(a.date));
  state.payments = payments.sort((a, b) => new Date(b.date) - new Date(a.date));
  const savedSettings = settingsRows.find((row) => row.id === "main");
  state.settings = { ...state.settings, ...(savedSettings?.value || {}) };
  state.settings.pricePresets = [...new Set((state.settings.pricePresets || []).map(Number).filter((value) => value > 0))].sort((a, b) => a - b);
  state.settings.costPresets = [...new Set((state.settings.costPresets || []).map(Number).filter((value) => value > 0))].sort((a, b) => a - b);
}

function totals() {
  const purchasedKg = state.purchases.reduce((sum, row) => sum + row.kg, 0);
  const soldKg = state.sales.reduce((sum, row) => sum + row.kg, 0);
  const paid = state.payments.reduce((sum, row) => sum + row.amount, 0);
  const purchaseTotal = state.purchases.reduce((sum, row) => sum + row.total, 0);
  const stock = purchasedKg - soldKg;
  const debt = Math.max(purchaseTotal - paid, 0);
  const credit = Math.max(paid - purchaseTotal, 0);
  const avgCost = purchasedKg ? purchaseTotal / purchasedKg : 0;
  const suggestedPrice = avgCost ? Math.ceil((avgCost * (1 + state.settings.marginPercent / 100)) / 10) * 10 : state.settings.defaultPrice;
  return { purchasedKg, soldKg, paid, purchaseTotal, stock, debt, credit, avgCost, suggestedPrice };
}

function varietyName(varietyId) {
  return state.varieties.find((variety) => variety.id === varietyId)?.name || "Papa";
}

function activeVarietyId(selector) {
  return $(selector).value || state.varieties[0]?.id || DEFAULT_VARIETY_ID;
}

function varietyStats(varietyId) {
  const purchases = state.purchases.filter((row) => (row.varietyId || DEFAULT_VARIETY_ID) === varietyId);
  const sales = state.sales.filter((row) => (row.varietyId || DEFAULT_VARIETY_ID) === varietyId);
  const purchased = purchases.reduce((sum, row) => sum + row.kg, 0);
  const sold = sales.reduce((sum, row) => sum + row.kg, 0);
  const purchaseTotal = purchases.reduce((sum, row) => sum + row.total, 0);
  const stock = purchased - sold;
  const avgCost = purchased ? purchaseTotal / purchased : 0;
  const variety = state.varieties.find((row) => row.id === varietyId);
  const suggestedPrice = avgCost
    ? Math.ceil((avgCost * (1 + state.settings.marginPercent / 100)) / 10) * 10
    : (variety?.defaultPrice || state.settings.defaultPrice);
  return { purchased, sold, purchaseTotal, stock, avgCost, suggestedPrice };
}

function purchaseBalance(purchase) {
  return purchaseBalancesById().get(purchase.id) ?? Math.max(purchase.total, 0);
}

function purchaseBalancesById() {
  const paymentsBySupplier = new Map();
  for (const payment of state.payments) {
    const supplier = payment.supplier || DEFAULT_SUPPLIER;
    paymentsBySupplier.set(supplier, (paymentsBySupplier.get(supplier) || 0) + (Number(payment.amount) || 0));
  }

  const balances = new Map();
  const purchases = [...state.purchases].sort((a, b) => new Date(a.date) - new Date(b.date));
  for (const purchase of purchases) {
    const supplier = purchase.supplier || DEFAULT_SUPPLIER;
    const availablePayment = paymentsBySupplier.get(supplier) || 0;
    const paidToPurchase = Math.min(Number(purchase.total) || 0, availablePayment);
    balances.set(purchase.id, Math.max((Number(purchase.total) || 0) - paidToPurchase, 0));
    paymentsBySupplier.set(supplier, Math.max(availablePayment - paidToPurchase, 0));
  }
  return balances;
}

function supplierSummaries() {
  const rows = new Map();
  for (const supplier of state.suppliers) {
    rows.set(supplier.name, { supplier: supplier.name, purchases: 0, payments: 0, boughtSacks: 0, purchaseCount: 0 });
  }
  for (const purchase of state.purchases) {
    const supplier = purchase.supplier || DEFAULT_SUPPLIER;
    if (!rows.has(supplier)) rows.set(supplier, { supplier, purchases: 0, payments: 0, boughtSacks: 0, purchaseCount: 0 });
    const row = rows.get(supplier);
    row.purchases += Number(purchase.total) || 0;
    row.boughtSacks += Number(purchase.kg) || 0;
    row.purchaseCount++;
  }
  for (const payment of state.payments) {
    const supplier = payment.supplier || DEFAULT_SUPPLIER;
    if (!rows.has(supplier)) rows.set(supplier, { supplier, purchases: 0, payments: 0, boughtSacks: 0, purchaseCount: 0 });
    rows.get(supplier).payments += Number(payment.amount) || 0;
  }
  return [...rows.values()]
    .map((row) => ({
      ...row,
      debt: Math.max(row.purchases - row.payments, 0),
      credit: Math.max(row.payments - row.purchases, 0)
    }))
    .sort((a, b) => b.debt - a.debt || a.supplier.localeCompare(b.supplier));
}

function periodSales(start) {
  return periodSalesBetween(start, new Date(8640000000000000));
}

function periodSalesBetween(start, end) {
  const rows = state.sales.filter((sale) => isInPeriod(sale.date, start, end));
  return {
    total: rows.reduce((sum, sale) => sum + sale.total, 0),
    kg: rows.reduce((sum, sale) => sum + sale.kg, 0),
    cost: rows.reduce((sum, sale) => sum + (sale.costPerKg || 0) * sale.kg, 0),
    count: rows.length
  };
}

function periodPurchasesBetween(start, end) {
  const rows = state.purchases.filter((purchase) => isInPeriod(purchase.date, start, end));
  return {
    total: rows.reduce((sum, purchase) => sum + purchase.total, 0),
    kg: rows.reduce((sum, purchase) => sum + purchase.kg, 0),
    count: rows.length
  };
}

function periodPaymentsBetween(start, end) {
  const rows = state.payments.filter((payment) => isInPeriod(payment.date, start, end));
  return {
    total: rows.reduce((sum, payment) => sum + payment.amount, 0),
    count: rows.length
  };
}

function availableMonthKeys() {
  const keys = new Set([monthKey(new Date())]);
  for (const row of [...state.sales, ...state.purchases, ...state.payments]) keys.add(monthKey(row.date));
  return [...keys].sort((a, b) => b.localeCompare(a));
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2200);
}

function setTab(tab) {
  $$(".tab").forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
  $$(".view").forEach((view) => view.classList.remove("active"));
  $(`#${tab}View`).classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function salePreview() {
  const total = (Number($("#saleKg").value) || 0) * (Number($("#salePrice").value) || 0);
  $("#salePreview").textContent = money(total);
}

function purchasePreview() {
  const total = (Number($("#purchaseKg").value) || 0) * (Number($("#purchaseCost").value) || 0);
  const paid = Number($("#purchasePaid").value) || 0;
  $("#purchaseDebtPreview").textContent = money(Math.max(total - paid, 0));
}

async function saveSettings() {
  await put("settings", { id: "main", value: state.settings });
}

function setSalePrice(price) {
  const value = Number(price) || 0;
  if (value <= 0) return;
  $("#salePrice").value = value;
  state.settings.lastSalePrice = value;
  salePreview();
  renderPriceButtons();
  saveSettings();
}

async function addPricePreset() {
  const value = Number($("#newPricePreset").value) || 0;
  if (value <= 0) return showToast("Ingresa un precio válido");
  state.settings.pricePresets = [...new Set([...(state.settings.pricePresets || []), value])].sort((a, b) => a - b);
  state.settings.lastSalePrice = value;
  $("#newPricePreset").value = "";
  await saveSettings();
  setSalePrice(value);
  renderPriceButtons();
  showToast("Precio guardado");
}

function setPurchaseCost(cost) {
  const value = Number(cost) || 0;
  if (value <= 0) return;
  $("#purchaseCost").value = value;
  state.settings.lastPurchaseCost = value;
  purchasePreview();
  renderCostButtons();
  saveSettings();
}

async function addCostPreset() {
  const value = Number($("#newCostPreset").value) || 0;
  if (value <= 0) return showToast("Ingresa un costo válido");
  state.settings.costPresets = [...new Set([...(state.settings.costPresets || []), value])].sort((a, b) => a - b);
  state.settings.lastPurchaseCost = value;
  $("#newCostPreset").value = "";
  await saveSettings();
  setPurchaseCost(value);
  renderCostButtons();
  showToast("Costo guardado");
}

async function addSupplier() {
  const name = $("#newSupplierName").value.trim();
  if (!name) return showToast("Ingresa un proveedor");
  const exists = state.suppliers.some((supplier) => supplier.name.toLowerCase() === name.toLowerCase());
  if (exists) return showToast("Ese proveedor ya existe");
  await put("suppliers", {
    id: uid("supplier"),
    name,
    active: true,
    createdAt: new Date().toISOString()
  });
  $("#newSupplierName").value = "";
  await refresh();
  $("#purchaseSupplier").value = name;
  showToast("Proveedor creado");
}

async function registerSale(event) {
  event.preventDefault();
  const varietyId = activeVarietyId("#saleVariety");
  const current = varietyStats(varietyId);
  const sale = {
    id: uid("sale"),
    date: inputDateToIso($("#saleDate").value),
    varietyId,
    varietyName: varietyName(varietyId),
    kg: Number($("#saleKg").value) || 0,
    pricePerKg: Number($("#salePrice").value) || 0,
    note: $("#saleNote").value.trim(),
    costPerKg: current.avgCost
  };
  if (sale.kg <= 0 || sale.pricePerKg <= 0) return showToast("Completa sacos y precio");
  if (sale.kg > current.stock) return showToast("No hay stock suficiente");
  sale.total = sale.kg * sale.pricePerKg;
  await put("sales", sale);
  state.settings.lastSalePrice = sale.pricePerKg;
  if (!state.settings.pricePresets.includes(sale.pricePerKg)) {
    state.settings.pricePresets = [...state.settings.pricePresets, sale.pricePerKg].sort((a, b) => a - b);
  }
  await saveSettings();
  $("#saleKg").value = "";
  $("#saleNote").value = "";
  salePreview();
  await refresh();
  showToast("Venta guardada");
}

async function registerPurchase(event) {
  event.preventDefault();
  const varietyId = activeVarietyId("#purchaseVariety");
  const purchase = {
    id: uid("purchase"),
    date: inputDateToIso($("#purchaseDate").value),
    varietyId,
    varietyName: varietyName(varietyId),
    kg: Number($("#purchaseKg").value) || 0,
    costPerKg: Number($("#purchaseCost").value) || 0,
    supplier: $("#purchaseSupplier").value || DEFAULT_SUPPLIER,
    note: $("#purchaseNote").value.trim()
  };
  if (purchase.kg <= 0 || purchase.costPerKg <= 0 || !purchase.supplier) return showToast("Completa la compra");
  purchase.total = purchase.kg * purchase.costPerKg;
  await put("purchases", purchase);
  state.settings.lastPurchaseCost = purchase.costPerKg;
  if (!state.settings.costPresets.includes(purchase.costPerKg)) {
    state.settings.costPresets = [...state.settings.costPresets, purchase.costPerKg].sort((a, b) => a - b);
  }
  await saveSettings();
  const paid = Number($("#purchasePaid").value) || 0;
  if (paid > 0) {
    await put("payments", {
      id: uid("payment"),
      purchaseId: purchase.id,
      date: inputDateToIso($("#purchaseDate").value),
      supplier: purchase.supplier,
      varietyName: purchase.varietyName,
      amount: Math.min(paid, purchase.total),
      note: "Abono inicial"
    });
  }
  $("#purchaseKg").value = "";
  $("#purchaseCost").value = "";
  $("#purchasePaid").value = "0";
  $("#purchaseNote").value = "";
  purchasePreview();
  await refresh();
  showToast("Compra guardada");
}

async function registerPayment(event) {
  event.preventDefault();
  const supplier = $("#paymentPurchase").value || DEFAULT_SUPPLIER;
  const amount = Number($("#paymentAmount").value) || 0;
  if (amount <= 0) return showToast("Ingresa un monto");
  await put("payments", {
    id: uid("payment"),
    purchaseId: "",
    date: inputDateToIso($("#paymentDate").value),
    supplier,
    varietyName: varietyName(DEFAULT_VARIETY_ID),
    amount,
    note: $("#paymentNote").value.trim()
  });
  $("#paymentAmount").value = "";
  $("#paymentNote").value = "";
  await refresh();
  showToast("Pago registrado");
}

function render() {
  const current = totals();
  setDefaultDates();
  renderVarietySelectors();
  renderSupplierSelectors();
  const saleVarietyStats = varietyStats(activeVarietyId("#saleVariety"));
  $("#todayTotal").textContent = money(periodSales(startOfDay(new Date())).total);
  $("#stockNow").textContent = sacks(current.stock);
  $("#debtLabel").textContent = current.credit > 0 ? "Saldo a favor" : "Deuda";
  $("#debtNow").textContent = money(current.credit > 0 ? current.credit : current.debt);
  $("#debtNow").classList.toggle("positive", current.credit > 0);
  $("#salePrice").value ||= state.settings.lastSalePrice || saleVarietyStats.suggestedPrice;
  $("#suggestedPriceLabel").textContent = `${money(saleVarietyStats.suggestedPrice)}/saco`;
  $("#dailySales").textContent = money(periodSales(startOfDay(new Date())).total);
  $("#weeklySales").textContent = money(periodSales(startOfWeek(new Date())).total);
  const monthStart = startOfMonth(new Date());
  const monthEnd = nextMonth(monthStart);
  const month = periodSalesBetween(monthStart, monthEnd);
  const monthPurchases = periodPurchasesBetween(monthStart, monthEnd);
  $("#monthlySales").textContent = money(month.total);
  $("#monthlyKg").textContent = sacks(month.kg);
  $("#monthlyAvgTicket").textContent = money(month.count ? month.total / month.count : 0);
  $("#dashboardDebt").textContent = money(current.debt);
  $("#stockValue").textContent = money(current.stock * current.avgCost);
  $("#avgCost").textContent = `${money(current.avgCost)}/saco`;
  $("#suggestedPrice").textContent = `${money(current.suggestedPrice)}/saco`;
  $("#monthlyProfit").textContent = money(month.total - monthPurchases.total);
  $("#monthlyMargin").textContent = month.total ? `${Math.round(((month.total - monthPurchases.total) / month.total) * 100)}%` : "0%";
  $("#monthlyTicketCount").textContent = month.count;
  $("#supplierCredit").textContent = money(current.credit);
  renderPriceButtons();
  renderCostButtons();
  renderRecentSales();
  renderOpenPurchases();
  renderPaymentOptions();
  renderRecentPayments();
  renderInventory();
  renderDashboardInventory();
  renderMonthSelector();
  renderHistory();
  salePreview();
  purchasePreview();
}

function setDefaultDates() {
  const today = todayInputValue();
  for (const selector of ["#saleDate", "#purchaseDate", "#paymentDate"]) {
    const input = $(selector);
    if (!input.value || input.value === lastDefaultDate) input.value = today;
  }
  lastDefaultDate = today;
}

function renderPriceButtons() {
  const active = Number($("#salePrice").value) || state.settings.lastSalePrice;
  $("#priceButtons").innerHTML = (state.settings.pricePresets || []).map((price) => `
    <button class="price-chip ${Number(price) === Number(active) ? "active" : ""}" type="button" data-price-preset="${price}">
      ${money(price)}
    </button>
  `).join("");
}

function renderCostButtons() {
  const active = Number($("#purchaseCost").value) || state.settings.lastPurchaseCost;
  $("#costButtons").innerHTML = (state.settings.costPresets || []).map((cost) => `
    <button class="price-chip ${Number(cost) === Number(active) ? "active" : ""}" type="button" data-cost-preset="${cost}">
      ${money(cost)}
    </button>
  `).join("");
  $("#purchaseCost").value ||= state.settings.lastPurchaseCost || state.settings.costPresets?.[0] || "";
}

function renderVarietySelectors() {
  const options = state.varieties.map((variety) => `<option value="${variety.id}">${escapeHtml(variety.name)}</option>`).join("");
  const saleValue = $("#saleVariety").value;
  const purchaseValue = $("#purchaseVariety").value;
  $("#saleVariety").innerHTML = options;
  $("#purchaseVariety").innerHTML = options;
  $("#saleVariety").value = state.varieties.some((row) => row.id === saleValue) ? saleValue : state.varieties[0]?.id;
  $("#purchaseVariety").value = state.varieties.some((row) => row.id === purchaseValue) ? purchaseValue : state.varieties[0]?.id;
}

function renderSupplierSelectors() {
  const currentPurchase = $("#purchaseSupplier").value || DEFAULT_SUPPLIER;
  $("#purchaseSupplier").innerHTML = state.suppliers.map((supplier) => `
    <option value="${escapeHtml(supplier.name)}">${escapeHtml(supplier.name)}</option>
  `).join("");
  $("#purchaseSupplier").value = state.suppliers.some((supplier) => supplier.name === currentPurchase) ? currentPurchase : DEFAULT_SUPPLIER;
}

function renderRecentSales() {
  const rows = state.sales.slice(0, 5);
  $("#recentSales").innerHTML = rows.length ? rows.map((sale) => `
    <div class="list-item">
      <div class="item-main">
        <strong>${escapeHtml(sale.varietyName || varietyName(sale.varietyId || DEFAULT_VARIETY_ID))} · ${sacks(sale.kg)}</strong>
        <span class="item-meta">${dateTime(sale.date)} · ${sackKg(sale.kg)}${sale.note ? ` · ${escapeHtml(sale.note)}` : ""}</span>
      </div>
      <span class="amount positive">${money(sale.total)}</span>
    </div>
  `).join("") : `<div class="empty">Aún no hay ventas.</div>`;
}

function renderOpenPurchases() {
  const balances = purchaseBalancesById();
  const rows = state.purchases.filter((purchase) => (balances.get(purchase.id) || 0) > 0);
  $("#openPurchases").innerHTML = rows.length ? rows.map((purchase) => `
    <div class="list-item">
      <div class="item-main">
        <strong>${escapeHtml(purchase.supplier)} · ${escapeHtml(purchase.varietyName || varietyName(purchase.varietyId || DEFAULT_VARIETY_ID))}</strong>
        <span class="item-meta">${dateTime(purchase.date)} · ${sacks(purchase.kg)} · Total ${money(purchase.total)}</span>
      </div>
      <span class="amount debt">${money(balances.get(purchase.id) || 0)}</span>
    </div>
  `).join("") : `<div class="empty">No hay deuda pendiente.</div>`;
}

function renderPaymentOptions() {
  const currentValue = $("#paymentPurchase").value;
  const summaries = supplierSummaries();
  const debtRows = summaries.filter((row) => row.debt > 0);
  const rows = debtRows.length ? debtRows : summaries;
  $("#paymentPurchase").innerHTML = rows.length ? rows.map((row) => `
    <option value="${escapeHtml(row.supplier)}">${escapeHtml(row.supplier)} · ${row.debt > 0 ? `debe ${money(row.debt)}` : `saldo a favor ${money(row.credit)}`} · ${row.purchaseCount} compras</option>
  `).join("") : `<option value="${DEFAULT_SUPPLIER}">${DEFAULT_SUPPLIER} · sin deuda</option>`;
  if (rows.some((row) => row.supplier === currentValue)) $("#paymentPurchase").value = currentValue;
}

function renderRecentPayments() {
  const rows = state.payments.slice(0, 6);
  $("#recentPayments").innerHTML = rows.length ? rows.map((payment) => `
    <div class="list-item">
      <div class="item-main">
        <strong>${escapeHtml(payment.supplier || DEFAULT_SUPPLIER)}</strong>
        <span class="item-meta">${dateTime(payment.date)}${payment.note ? ` · ${escapeHtml(payment.note)}` : ""}</span>
      </div>
      <span class="amount positive">${money(payment.amount)}</span>
    </div>
  `).join("") : `<div class="empty">Aún no hay pagos.</div>`;
}

async function registerVariety(event) {
  event.preventDefault();
  const name = $("#varietyName").value.trim();
  const defaultPrice = Number($("#varietyPrice").value) || state.settings.defaultPrice;
  if (!name) return showToast("Ingresa una variedad");
  const exists = state.varieties.some((variety) => variety.name.toLowerCase() === name.toLowerCase());
  if (exists) return showToast("Esa variedad ya existe");
  await put("varieties", {
    id: uid("variety"),
    name,
    defaultPrice,
    active: true,
    createdAt: new Date().toISOString()
  });
  $("#varietyName").value = "";
  $("#varietyPrice").value = state.settings.defaultPrice;
  await refresh();
  showToast("Variedad guardada");
}

async function deleteRecord(type, id) {
  pendingDelete = { type, id };
  $("#pinInput").value = "";
  $("#pinDialog").showModal();
  setTimeout(() => $("#pinInput").focus(), 80);
}

async function confirmDeleteWithPin(event) {
  event.preventDefault();
  if (!pendingDelete) return;
  const pin = $("#pinInput").value.trim();
  if (pin !== ADMIN_PIN) {
    $("#pinInput").value = "";
    showToast("Clave incorrecta");
    return;
  }
  const { type, id } = pendingDelete;
  pendingDelete = null;
  $("#pinDialog").close();
  if (type === "sales") {
    await deleteById("sales", id);
    await refresh();
    return showToast("Venta eliminada");
  }
  if (type === "purchases") {
    const relatedPayments = state.payments.filter((payment) => payment.purchaseId === id);
    await deleteById("purchases", id);
    for (const payment of relatedPayments) await deleteById("payments", payment.id);
    await refresh();
    return showToast("Compra eliminada");
  }
  if (type === "payments") {
    await deleteById("payments", id);
    await refresh();
    return showToast("Pago eliminado");
  }
}

function cancelDeleteWithPin() {
  pendingDelete = null;
  $("#pinDialog").close();
}

function renderInventory() {
  $("#inventoryList").innerHTML = state.varieties.length ? state.varieties.map((variety) => {
    const stats = varietyStats(variety.id);
    return `
      <div class="list-item">
        <div class="item-main">
          <strong>${escapeHtml(variety.name)}</strong>
          <span class="item-meta">Costo prom. ${money(stats.avgCost)}/saco · Sugerido ${money(stats.suggestedPrice)}/saco</span>
        </div>
        <span class="amount ${stats.stock <= 0 ? "debt" : "positive"}">${sacks(stats.stock)}</span>
      </div>
    `;
  }).join("") : `<div class="empty">Agrega tu primera variedad.</div>`;
}

function renderDashboardInventory() {
  $("#dashboardInventory").innerHTML = state.varieties.length ? state.varieties.map((variety) => {
    const stats = varietyStats(variety.id);
    return `
      <div class="list-item">
        <div class="item-main">
          <strong>${escapeHtml(variety.name)}</strong>
          <span class="item-meta">${sackKg(stats.stock)} · valorizado ${money(stats.stock * stats.avgCost)}</span>
        </div>
        <span class="amount">${sacks(stats.stock)}</span>
      </div>
    `;
  }).join("") : `<div class="empty">Sin variedades.</div>`;
}

function renderMonthSelector() {
  const select = $("#dashboardMonthSelect");
  const currentValue = select.value;
  const keys = availableMonthKeys();
  select.innerHTML = keys.map((key) => `<option value="${key}">${monthLabel(key)}</option>`).join("");
  select.value = keys.includes(currentValue) ? currentValue : keys[0];
  renderSelectedMonthDashboard();
}

function renderSelectedMonthDashboard() {
  const key = $("#dashboardMonthSelect").value || monthKey(new Date());
  const { start, end } = monthRange(key);
  const sales = periodSalesBetween(start, end);
  const purchases = periodPurchasesBetween(start, end);
  const payments = periodPaymentsBetween(start, end);
  const profit = sales.total - purchases.total;
  $("#selectedMonthSales").textContent = money(sales.total);
  $("#selectedMonthProfit").textContent = money(profit);
  $("#selectedMonthProfit").classList.toggle("positive", profit >= 0);
  $("#selectedMonthProfit").classList.toggle("debt", profit < 0);
  $("#selectedMonthPurchases").textContent = money(purchases.total);
  $("#selectedMonthBoughtSacks").textContent = sacks(purchases.kg);
  $("#selectedMonthSoldSacks").textContent = sacks(sales.kg);
  $("#selectedMonthPayments").textContent = money(payments.total);
}

function renderHistory() {
  const filter = $("#historyFilter").value;
  let rows = [];
  if (filter === "sales") {
    rows = state.sales.map((sale) => ({
      title: `${escapeHtml(sale.varietyName || varietyName(sale.varietyId || DEFAULT_VARIETY_ID))} · ${sacks(sale.kg)} vendidos`,
      meta: `${dateTime(sale.date)} · ${sackKg(sale.kg)} · ${money(sale.pricePerKg)}/saco${sale.note ? ` · ${sale.note}` : ""}`,
      amount: money(sale.total),
      cls: "positive",
      type: "sales",
      id: sale.id
    }));
  }
  if (filter === "purchases") {
    rows = state.purchases.map((purchase) => ({
      title: `${escapeHtml(purchase.varietyName || varietyName(purchase.varietyId || DEFAULT_VARIETY_ID))} · ${sacks(purchase.kg)} comprados`,
      meta: `${dateTime(purchase.date)} · ${purchase.supplier} · ${sackKg(purchase.kg)} · ${money(purchase.costPerKg)}/saco`,
      amount: money(purchase.total),
      cls: "",
      type: "purchases",
      id: purchase.id
    }));
  }
  if (filter === "payments") {
    rows = state.payments.map((payment) => ({
      title: `Pago a ${payment.supplier || DEFAULT_SUPPLIER}`,
      meta: `${dateTime(payment.date)}${payment.note ? ` · ${payment.note}` : ""}`,
      amount: money(payment.amount),
      cls: "positive",
      type: "payments",
      id: payment.id
    }));
  }
  $("#historyList").innerHTML = rows.length ? rows.map((row) => `
    <div class="list-item">
      <div class="item-main">
        <strong>${escapeHtml(row.title)}</strong>
        <span class="item-meta">${escapeHtml(row.meta)}</span>
      </div>
      <div class="history-actions">
        <span class="amount ${row.cls}">${row.amount}</span>
        ${row.type ? `<button class="delete-mini" type="button" data-delete-type="${row.type}" data-delete-id="${row.id}">Eliminar</button>` : ""}
      </div>
    </div>
  `).join("") : `<div class="empty">Sin registros.</div>`;
}

function exportData() {
  const payload = buildBackupPayload();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `respaldo-papas-pos-${todayInputValue()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function buildBackupPayload() {
  return {
    exportedAt: new Date().toISOString(),
    app: "papas-pos",
    version: 1,
    data: state
  };
}

function showBackupText() {
  const text = JSON.stringify(buildBackupPayload(), null, 2);
  $("#backupText").value = text;
  $("#backupText").textContent = text;
  showToast("Respaldo generado en pantalla");
}

async function importData(file) {
  if (!file) return;
  const text = await file.text();
  const payload = JSON.parse(text);
  const imported = payload.data || payload;
  if (!Array.isArray(imported.sales) || !Array.isArray(imported.purchases) || !Array.isArray(imported.payments)) {
    throw new Error("Respaldo inválido");
  }
  await Promise.all(STORE_NAMES.map(clearStore));
  for (const variety of imported.varieties || []) await put("varieties", variety);
  for (const supplier of imported.suppliers || []) await put("suppliers", supplier);
  for (const sale of imported.sales) await put("sales", sale);
  for (const purchase of imported.purchases) await put("purchases", purchase);
  for (const payment of imported.payments) await put("payments", payment);
  await put("settings", { id: "main", value: imported.settings || state.settings });
  await refresh();
}

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

function parseMoney(value) {
  const raw = String(value || "").trim();
  if (!raw) return 0;
  const clean = raw.replace(/\$/g, "").replace(/\s/g, "");
  if (clean.includes(",") && clean.includes(".")) {
    return Number(clean.replace(/\./g, "").replace(",", ".")) || 0;
  }
  if (clean.includes(",")) {
    return Number(clean.replace(",", ".")) || 0;
  }
  return Number(clean.replace(/\./g, "")) || Number(clean) || 0;
}

function parseDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return new Date().toISOString();
  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) return direct.toISOString();
  const match = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (match) {
    const [, day, month, year, hour = "0", minute = "0"] = match;
    const fullYear = year.length === 2 ? `20${year}` : year;
    return new Date(Number(fullYear), Number(month) - 1, Number(day), Number(hour), Number(minute)).toISOString();
  }
  return new Date().toISOString();
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i++;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    const separator = char === "," || char === ";";
    if (separator && !quoted) {
      row.push(cell);
      cell = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i++;
      row.push(cell);
      if (row.some((value) => String(value).trim())) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }
  row.push(cell);
  if (row.some((value) => String(value).trim())) rows.push(row);
  return rows;
}

function rowValue(row, names) {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== "") return row[name];
  }
  return "";
}

async function ensureVariety(name, defaultPrice = state.settings.defaultPrice) {
  const cleanName = String(name || "Papa").trim() || "Papa";
  const existing = state.varieties.find((variety) => variety.name.toLowerCase() === cleanName.toLowerCase());
  if (existing) return existing;
  const variety = {
    id: uid("variety"),
    name: cleanName,
    defaultPrice,
    active: true,
    createdAt: new Date().toISOString()
  };
  await put("varieties", variety);
  state.varieties.push(variety);
  return variety;
}

async function importCsv(file) {
  if (!file) return;
  const text = await file.text();
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error("Archivo vacío");
  const headers = rows[0].map(normalizeHeader);
  let imported = { sales: 0, purchases: 0, payments: 0 };

  for (const rawRow of rows.slice(1)) {
    const row = {};
    headers.forEach((header, index) => {
      row[header] = String(rawRow[index] || "").trim();
    });
    const type = normalizeHeader(rowValue(row, ["tipo", "movimiento", "operacion", "registro"]));
    const varietyLabel = rowValue(row, ["variedad", "producto", "papa"]) || "Papa";
    const date = parseDate(rowValue(row, ["fecha", "dia", "date"]));

    if (["venta", "ventas", "sale"].includes(type)) {
      const sacksQty = parseMoney(rowValue(row, ["sacos", "cantidad", "qty"]));
      const price = parseMoney(rowValue(row, ["precio_saco", "precio", "precio_unitario"]));
      const total = parseMoney(rowValue(row, ["total", "monto"]));
      if (sacksQty <= 0) continue;
      const variety = await ensureVariety(varietyLabel, price || state.settings.defaultPrice);
      const stats = varietyStats(variety.id);
      await put("sales", {
        id: uid("sale"),
        date,
        varietyId: variety.id,
        varietyName: variety.name,
        kg: sacksQty,
        pricePerKg: price || (total ? total / sacksQty : variety.defaultPrice),
        total: total || sacksQty * (price || variety.defaultPrice),
        note: rowValue(row, ["nota", "cliente", "detalle"]),
        costPerKg: stats.avgCost
      });
      imported.sales++;
    }

    if (["compra", "compras", "purchase"].includes(type)) {
      const sacksQty = parseMoney(rowValue(row, ["sacos", "cantidad", "qty"]));
      const cost = parseMoney(rowValue(row, ["costo_saco", "costo", "precio_compra"]));
      const total = parseMoney(rowValue(row, ["total", "monto"]));
      const paid = parseMoney(rowValue(row, ["abono", "pagado", "pago"]));
      if (sacksQty <= 0) continue;
      const variety = await ensureVariety(varietyLabel);
      const purchase = {
        id: uid("purchase"),
        date,
        varietyId: variety.id,
        varietyName: variety.name,
        kg: sacksQty,
        costPerKg: cost || (total ? total / sacksQty : 0),
        supplier: rowValue(row, ["proveedor", "supplier"]) || DEFAULT_SUPPLIER,
        note: rowValue(row, ["nota", "detalle"])
      };
      purchase.total = total || purchase.kg * purchase.costPerKg;
      await put("purchases", purchase);
      if (paid > 0) {
        await put("payments", {
          id: uid("payment"),
          purchaseId: purchase.id,
          date,
          supplier: purchase.supplier,
          varietyName: purchase.varietyName,
          amount: Math.min(paid, purchase.total),
          note: "Abono importado"
        });
      }
      imported.purchases++;
    }

    if (["pago", "pagos", "payment"].includes(type)) {
      const amount = parseMoney(rowValue(row, ["monto", "pago", "pagado", "abono", "total"]));
      if (amount <= 0) continue;
      await put("payments", {
        id: uid("payment"),
        purchaseId: rowValue(row, ["id_compra", "compra_id"]) || "",
        date,
        supplier: rowValue(row, ["proveedor", "supplier"]) || DEFAULT_SUPPLIER,
        varietyName: varietyLabel,
        amount,
        note: rowValue(row, ["nota", "detalle"])
      });
      imported.payments++;
    }
  }

  await refresh();
  showToast(`Importado: ${imported.sales} ventas, ${imported.purchases} compras, ${imported.payments} pagos`);
}

async function resetData() {
  if (!confirm("¿Borrar ventas, compras y pagos de este iPhone?")) return;
  await Promise.all(STORE_NAMES.map(clearStore));
  await refresh();
  showToast("Datos borrados");
}

async function refresh() {
  await loadState();
  render();
}

async function seedExcelOnceIfNeeded() {
  if (localStorage.getItem("papas-pos-excel-seed-token") === EXCEL_SEED_TOKEN) return;
  const seed = window.PAPAS_EXCEL_SEED;
  if (!seed) return;
  const existingRows = await Promise.all([
    getAll("sales"),
    getAll("purchases"),
    getAll("payments")
  ]);
  if (existingRows.some((rows) => rows.length > 0)) {
    localStorage.setItem("papas-pos-excel-seed-token", EXCEL_SEED_TOKEN);
    return;
  }
  await Promise.all(STORE_NAMES.map(clearStore));
  for (const variety of seed.varieties || []) await put("varieties", variety);
  for (const supplier of seed.suppliers || [{ id: "supplier-principal", name: DEFAULT_SUPPLIER, active: true, createdAt: new Date().toISOString() }]) await put("suppliers", supplier);
  for (const sale of seed.sales || []) await put("sales", sale);
  for (const purchase of seed.purchases || []) await put("purchases", purchase);
  for (const payment of seed.payments || []) await put("payments", payment);
  await put("settings", { id: "main", value: seed.settings || state.settings });
  localStorage.setItem("papas-pos-excel-seed-token", EXCEL_SEED_TOKEN);
}

function bind() {
  $$(".tab").forEach((button) => button.addEventListener("click", () => setTab(button.dataset.tab)));
  $$('[data-tab-target]').forEach((button) => button.addEventListener("click", () => setTab(button.dataset.tabTarget)));
  $("#saleKg").addEventListener("input", salePreview);
  $("#salePrice").addEventListener("input", salePreview);
  $("#priceButtons").addEventListener("click", (event) => {
    const button = event.target.closest("[data-price-preset]");
    if (button) setSalePrice(button.dataset.pricePreset);
  });
  $("#addPricePresetBtn").addEventListener("click", addPricePreset);
  $("#saleVariety").addEventListener("change", () => {
    const stats = varietyStats(activeVarietyId("#saleVariety"));
    $("#salePrice").value = stats.suggestedPrice;
    $("#suggestedPriceLabel").textContent = `${money(stats.suggestedPrice)}/saco`;
    salePreview();
  });
  $("#purchaseVariety").addEventListener("change", purchasePreview);
  $("#purchaseKg").addEventListener("input", purchasePreview);
  $("#purchaseCost").addEventListener("input", purchasePreview);
  $("#costButtons").addEventListener("click", (event) => {
    const button = event.target.closest("[data-cost-preset]");
    if (button) setPurchaseCost(button.dataset.costPreset);
  });
  $("#addCostPresetBtn").addEventListener("click", addCostPreset);
  $("#addSupplierBtn").addEventListener("click", addSupplier);
  $("#purchasePaid").addEventListener("input", purchasePreview);
  $("#saleForm").addEventListener("submit", registerSale);
  $("#purchaseForm").addEventListener("submit", registerPurchase);
  $("#paymentForm").addEventListener("submit", registerPayment);
  $("#varietyForm").addEventListener("submit", registerVariety);
  $("#historyFilter").addEventListener("change", renderHistory);
  $("#dashboardMonthSelect").addEventListener("change", renderSelectedMonthDashboard);
  $("#historyList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-delete-type]");
    if (button) deleteRecord(button.dataset.deleteType, button.dataset.deleteId);
  });
  $("#pinForm").addEventListener("submit", confirmDeleteWithPin);
  $("#cancelPinBtn").addEventListener("click", cancelDeleteWithPin);
  $("#backupBtn").addEventListener("click", exportData);
  $("#exportBtn").addEventListener("click", exportData);
  $("#showBackupBtn").addEventListener("click", showBackupText);
  $("#importFile").addEventListener("change", async (event) => {
    try {
      await importData(event.target.files[0]);
      showToast("Respaldo importado");
    } catch {
      showToast("No se pudo importar");
    }
  });
  $("#importCsvFile").addEventListener("change", async (event) => {
    try {
      await importCsv(event.target.files[0]);
    } catch {
      showToast("No se pudo importar el CSV");
    }
  });
  $("#resetBtn").addEventListener("click", resetData);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

async function init() {
  db = await openDb();
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
  bind();
  await seedExcelOnceIfNeeded();
  await refresh();
}

init().catch(() => {
  document.body.innerHTML = "<main class='app'><section class='card'><h1>No se pudo iniciar</h1><p>Safari no permitió abrir la base local. Revisa que no estés en modo privado.</p></section></main>";
});
