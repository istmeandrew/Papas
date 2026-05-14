(() => {
  let pendingPinAction = null;
  let editingSaleId = "";
  let editingPurchaseId = "";

  function isoToInputDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return todayInputValue();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  dateTime = function dateTime(value) {
    return new Intl.DateTimeFormat("es-CL", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(value));
  };

  function openDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.showModal === "function") return dialog.showModal();
    dialog.setAttribute("open", "");
  }

  function closeDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.close === "function") return dialog.close();
    dialog.removeAttribute("open");
  }

  function renderSaleVarietyButtons() {
    const holder = $("#saleVarietyButtons");
    if (!holder) return;
    const active = activeVarietyId("#saleVariety");
    holder.innerHTML = state.varieties.map((variety) => {
      const stats = varietyStats(variety.id);
      return `
        <button class="variety-chip ${variety.id === active ? "active" : ""}" type="button" data-sale-variety-id="${variety.id}">
          <span>${escapeHtml(variety.name)}</span>
          <small>${sacks(stats.stock)}</small>
        </button>
      `;
    }).join("");
  }

  function applySaleVarietySelection(varietyId) {
    if (state.varieties.some((variety) => variety.id === varietyId)) $("#saleVariety").value = varietyId;
    const stats = varietyStats(activeVarietyId("#saleVariety"));
    $("#salePrice").value = stats.suggestedPrice;
    $("#suggestedPriceLabel").textContent = `${money(stats.suggestedPrice)}/saco`;
    salePreview();
    renderSaleVarietyButtons();
  }

  renderVarietySelectors = function renderVarietySelectors() {
    const options = state.varieties.map((variety) => `<option value="${variety.id}">${escapeHtml(variety.name)}</option>`).join("");
    const saleValue = $("#saleVariety").value;
    const purchaseValue = $("#purchaseVariety").value;
    $("#saleVariety").innerHTML = options;
    $("#purchaseVariety").innerHTML = options;
    $("#saleVariety").value = state.varieties.some((row) => row.id === saleValue) ? saleValue : state.varieties[0]?.id;
    $("#purchaseVariety").value = state.varieties.some((row) => row.id === purchaseValue) ? purchaseValue : state.varieties[0]?.id;
    renderSaleVarietyButtons();
  };

  registerVariety = async function registerVariety(event) {
    event.preventDefault();
    const source = event.currentTarget?.id === "buyVarietyForm" ? "buy" : "inventory";
    const nameInput = source === "buy" ? $("#buyVarietyName") : $("#varietyName");
    const priceInput = source === "buy" ? $("#buyVarietyPrice") : $("#varietyPrice");
    const name = nameInput.value.trim();
    const defaultPrice = Number(priceInput.value) || state.settings.defaultPrice;
    if (!name) return showToast("Ingresa una variedad");
    const exists = state.varieties.some((variety) => variety.name.toLowerCase() === name.toLowerCase());
    if (exists) return showToast("Esa variedad ya existe");
    const variety = { id: uid("variety"), name, defaultPrice, active: true, createdAt: new Date().toISOString() };
    await put("varieties", variety);
    nameInput.value = "";
    priceInput.value = state.settings.defaultPrice;
    await refresh();
    $("#purchaseVariety").value = variety.id;
    showToast("Variedad guardada");
  };

  function requestPin(action, type, id) {
    pendingPinAction = { action, type, id };
    $("#pinInput").value = "";
    $("#confirmPinBtn").textContent = action === "delete" ? "Eliminar" : "Continuar";
    openDialog($("#pinDialog"));
    setTimeout(() => $("#pinInput").focus(), 80);
  }

  deleteRecord = async function deleteRecord(type, id) { requestPin("delete", type, id); };
  function editSale(id) { requestPin("edit-sale", "sales", id); }
  function editPurchase(id) { requestPin("edit-purchase", "purchases", id); }

  confirmDeleteWithPin = async function confirmDeleteWithPin(event) {
    event.preventDefault();
    if (!pendingPinAction) return;
    const pin = $("#pinInput").value.trim();
    if (pin !== ADMIN_PIN) {
      $("#pinInput").value = "";
      showToast("Clave incorrecta");
      return;
    }
    const { action, type, id } = pendingPinAction;
    pendingPinAction = null;
    closeDialog($("#pinDialog"));
    if (action === "edit-sale") return openSaleEditDialog(id);
    if (action === "edit-purchase") return openPurchaseEditDialog(id);
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
  };

  cancelDeleteWithPin = function cancelDeleteWithPin() {
    pendingPinAction = null;
    closeDialog($("#pinDialog"));
  };

  function saleEditPreview() {
    $("#editSalePreview").textContent = money((Number($("#editSaleKg").value) || 0) * (Number($("#editSalePrice").value) || 0));
  }

  function renderEditVarieties(selector, selectedId) {
    $(selector).innerHTML = state.varieties.map((variety) => `<option value="${variety.id}">${escapeHtml(variety.name)}</option>`).join("");
    $(selector).value = state.varieties.some((row) => row.id === selectedId) ? selectedId : state.varieties[0]?.id;
  }

  function openSaleEditDialog(id) {
    const sale = state.sales.find((row) => row.id === id);
    if (!sale) return showToast("Venta no encontrada");
    editingSaleId = id;
    renderEditVarieties("#editSaleVariety", sale.varietyId || DEFAULT_VARIETY_ID);
    $("#editSaleDate").value = isoToInputDate(sale.date);
    $("#editSaleKg").value = sale.kg;
    $("#editSalePrice").value = sale.pricePerKg;
    $("#editSaleNote").value = sale.note || "";
    saleEditPreview();
    openDialog($("#saleEditDialog"));
  }

  async function saveSaleEdit(event) {
    event.preventDefault();
    const original = state.sales.find((row) => row.id === editingSaleId);
    if (!original) return showToast("Venta no encontrada");
    const varietyId = activeVarietyId("#editSaleVariety");
    const kg = Number($("#editSaleKg").value) || 0;
    const pricePerKg = Number($("#editSalePrice").value) || 0;
    if (kg <= 0 || pricePerKg <= 0) return showToast("Completa sacos y precio");
    const current = varietyStats(varietyId);
    const originalSameVariety = (original.varietyId || DEFAULT_VARIETY_ID) === varietyId;
    const availableStock = current.stock + (originalSameVariety ? Number(original.kg) || 0 : 0);
    if (kg > availableStock) return showToast("No hay stock suficiente");
    await put("sales", { ...original, date: inputDateToIso($("#editSaleDate").value), varietyId, varietyName: varietyName(varietyId), kg, pricePerKg, note: $("#editSaleNote").value.trim(), costPerKg: current.avgCost, total: kg * pricePerKg, updatedAt: new Date().toISOString() });
    editingSaleId = "";
    closeDialog($("#saleEditDialog"));
    await refresh();
    showToast("Venta modificada");
  }

  function purchaseEditPreview() {
    $("#editPurchasePreview").textContent = money((Number($("#editPurchaseKg").value) || 0) * (Number($("#editPurchaseCost").value) || 0));
  }

  function renderPurchaseEditSuppliers(selectedName) {
    const exists = state.suppliers.some((supplier) => supplier.name === selectedName);
    const options = [...(exists || !selectedName ? [] : [{ name: selectedName }]), ...state.suppliers];
    $("#editPurchaseSupplier").innerHTML = options.map((supplier) => `<option value="${escapeHtml(supplier.name)}">${escapeHtml(supplier.name)}</option>`).join("");
    $("#editPurchaseSupplier").value = selectedName || DEFAULT_SUPPLIER;
  }

  function projectedStockAfterPurchaseEdit(original, varietyId, kg) {
    const purchasedByVariety = new Map();
    for (const purchase of state.purchases) {
      const rowVarietyId = purchase.varietyId || DEFAULT_VARIETY_ID;
      purchasedByVariety.set(rowVarietyId, (purchasedByVariety.get(rowVarietyId) || 0) + (Number(purchase.kg) || 0));
    }
    const originalVarietyId = original.varietyId || DEFAULT_VARIETY_ID;
    purchasedByVariety.set(originalVarietyId, (purchasedByVariety.get(originalVarietyId) || 0) - (Number(original.kg) || 0));
    purchasedByVariety.set(varietyId, (purchasedByVariety.get(varietyId) || 0) + kg);
    for (const affectedVarietyId of new Set([originalVarietyId, varietyId])) {
      const sold = state.sales.filter((sale) => (sale.varietyId || DEFAULT_VARIETY_ID) === affectedVarietyId).reduce((sum, sale) => sum + (Number(sale.kg) || 0), 0);
      if ((purchasedByVariety.get(affectedVarietyId) || 0) - sold < 0) return false;
    }
    return true;
  }

  function openPurchaseEditDialog(id) {
    const purchase = state.purchases.find((row) => row.id === id);
    if (!purchase) return showToast("Compra no encontrada");
    editingPurchaseId = id;
    renderEditVarieties("#editPurchaseVariety", purchase.varietyId || DEFAULT_VARIETY_ID);
    renderPurchaseEditSuppliers(purchase.supplier || DEFAULT_SUPPLIER);
    $("#editPurchaseDate").value = isoToInputDate(purchase.date);
    $("#editPurchaseKg").value = purchase.kg;
    $("#editPurchaseCost").value = purchase.costPerKg;
    $("#editPurchaseNote").value = purchase.note || "";
    purchaseEditPreview();
    openDialog($("#purchaseEditDialog"));
  }

  async function savePurchaseEdit(event) {
    event.preventDefault();
    const original = state.purchases.find((row) => row.id === editingPurchaseId);
    if (!original) return showToast("Compra no encontrada");
    const varietyId = activeVarietyId("#editPurchaseVariety");
    const kg = Number($("#editPurchaseKg").value) || 0;
    const costPerKg = Number($("#editPurchaseCost").value) || 0;
    const supplier = $("#editPurchaseSupplier").value || DEFAULT_SUPPLIER;
    if (kg <= 0 || costPerKg <= 0 || !supplier) return showToast("Completa la compra");
    if (!projectedStockAfterPurchaseEdit(original, varietyId, kg)) return showToast("No alcanza stock para ese cambio");
    const updatedPurchase = { ...original, date: inputDateToIso($("#editPurchaseDate").value), varietyId, varietyName: varietyName(varietyId), kg, costPerKg, supplier, note: $("#editPurchaseNote").value.trim(), total: kg * costPerKg, updatedAt: new Date().toISOString() };
    await put("purchases", updatedPurchase);
    for (const payment of state.payments.filter((row) => row.purchaseId === original.id)) await put("payments", { ...payment, supplier: updatedPurchase.supplier, varietyName: updatedPurchase.varietyName, updatedAt: new Date().toISOString() });
    editingPurchaseId = "";
    closeDialog($("#purchaseEditDialog"));
    await refresh();
    showToast("Compra modificada");
  }

  renderInventory = function renderInventory() {
    $("#inventoryList").innerHTML = state.varieties.length ? state.varieties.map((variety) => {
      const stats = varietyStats(variety.id);
      return `<div class="list-item"><div class="item-main"><strong>${escapeHtml(variety.name)}</strong><span class="item-meta">Comprados ${sacks(stats.purchased)} · Vendidos ${sacks(stats.sold)} · Costo prom. ${money(stats.avgCost)}/saco · Sugerido ${money(stats.suggestedPrice)}/saco</span></div><span class="amount ${stats.stock <= 0 ? "debt" : "positive"}">${sacks(stats.stock)}</span></div>`;
    }).join("") : `<div class="empty">Agrega tu primera variedad.</div>`;
  };

  renderHistory = function renderHistory() {
    const filter = $("#historyFilter").value;
    let rows = [];
    if (filter === "sales") rows = state.sales.map((sale) => ({ title: `${escapeHtml(sale.varietyName || varietyName(sale.varietyId || DEFAULT_VARIETY_ID))} · ${sacks(sale.kg)} vendidos`, meta: `${dateTime(sale.date)} · ${sackKg(sale.kg)} · ${money(sale.pricePerKg)}/saco${sale.note ? ` · ${sale.note}` : ""}`, amount: money(sale.total), cls: "positive", type: "sales", id: sale.id, editType: "sale" }));
    if (filter === "purchases") rows = state.purchases.map((purchase) => ({ title: `${escapeHtml(purchase.varietyName || varietyName(purchase.varietyId || DEFAULT_VARIETY_ID))} · ${sacks(purchase.kg)} comprados`, meta: `${dateTime(purchase.date)} · ${purchase.supplier} · ${sackKg(purchase.kg)} · ${money(purchase.costPerKg)}/saco`, amount: money(purchase.total), cls: "", type: "purchases", id: purchase.id, editType: "purchase" }));
    if (filter === "payments") rows = state.payments.map((payment) => ({ title: `Pago a ${payment.supplier || DEFAULT_SUPPLIER}`, meta: `${dateTime(payment.date)}${payment.note ? ` · ${payment.note}` : ""}`, amount: money(payment.amount), cls: "positive", type: "payments", id: payment.id }));
    $("#historyList").innerHTML = rows.length ? rows.map((row) => `<div class="list-item"><div class="item-main"><strong>${escapeHtml(row.title)}</strong><span class="item-meta">${escapeHtml(row.meta)}</span></div><div class="history-actions"><span class="amount ${row.cls}">${row.amount}</span>${row.editType === "sale" ? `<button class="edit-mini" type="button" data-edit-sale-id="${row.id}">Modificar</button>` : ""}${row.editType === "purchase" ? `<button class="edit-mini" type="button" data-edit-purchase-id="${row.id}">Modificar</button>` : ""}${row.type ? `<button class="delete-mini" type="button" data-delete-type="${row.type}" data-delete-id="${row.id}">Eliminar</button>` : ""}</div></div>`).join("") : `<div class="empty">Sin registros.</div>`;
  };

  bind = function bind() {
    $$(".tab").forEach((button) => button.addEventListener("click", () => setTab(button.dataset.tab)));
    $$('[data-tab-target]').forEach((button) => button.addEventListener("click", () => setTab(button.dataset.tabTarget)));
    $("#saleKg").addEventListener("input", salePreview);
    $("#salePrice").addEventListener("input", salePreview);
    $("#priceButtons").addEventListener("click", (event) => { const button = event.target.closest("[data-price-preset]"); if (button) setSalePrice(button.dataset.pricePreset); });
    $("#addPricePresetBtn").addEventListener("click", addPricePreset);
    $("#saleVariety").addEventListener("change", () => applySaleVarietySelection($("#saleVariety").value));
    $("#saleVarietyButtons")?.addEventListener("click", (event) => { const button = event.target.closest("[data-sale-variety-id]"); if (button) applySaleVarietySelection(button.dataset.saleVarietyId); });
    $("#purchaseVariety").addEventListener("change", purchasePreview);
    $("#purchaseKg").addEventListener("input", purchasePreview);
    $("#purchaseCost").addEventListener("input", purchasePreview);
    $("#costButtons").addEventListener("click", (event) => { const button = event.target.closest("[data-cost-preset]"); if (button) setPurchaseCost(button.dataset.costPreset); });
    $("#addCostPresetBtn").addEventListener("click", addCostPreset);
    $("#addSupplierBtn").addEventListener("click", addSupplier);
    $("#purchasePaid").addEventListener("input", purchasePreview);
    $("#saleForm").addEventListener("submit", registerSale);
    $("#purchaseForm").addEventListener("submit", registerPurchase);
    $("#paymentForm").addEventListener("submit", registerPayment);
    $("#buyVarietyForm")?.addEventListener("submit", registerVariety);
    $("#varietyForm").addEventListener("submit", registerVariety);
    $("#historyFilter").addEventListener("change", renderHistory);
    $("#dashboardMonthSelect").addEventListener("change", renderSelectedMonthDashboard);
    $("#historyList").addEventListener("click", (event) => { const editSaleButton = event.target.closest("[data-edit-sale-id]"); if (editSaleButton) return editSale(editSaleButton.dataset.editSaleId); const editPurchaseButton = event.target.closest("[data-edit-purchase-id]"); if (editPurchaseButton) return editPurchase(editPurchaseButton.dataset.editPurchaseId); const deleteButton = event.target.closest("[data-delete-type]"); if (deleteButton) deleteRecord(deleteButton.dataset.deleteType, deleteButton.dataset.deleteId); });
    $("#pinForm").addEventListener("submit", confirmDeleteWithPin);
    $("#cancelPinBtn").addEventListener("click", cancelDeleteWithPin);
    $("#saleEditForm")?.addEventListener("submit", saveSaleEdit);
    $("#cancelSaleEditBtn")?.addEventListener("click", () => closeDialog($("#saleEditDialog")));
    $("#editSaleKg")?.addEventListener("input", saleEditPreview);
    $("#editSalePrice")?.addEventListener("input", saleEditPreview);
    $("#purchaseEditForm")?.addEventListener("submit", savePurchaseEdit);
    $("#cancelPurchaseEditBtn")?.addEventListener("click", () => closeDialog($("#purchaseEditDialog")));
    $("#editPurchaseKg")?.addEventListener("input", purchaseEditPreview);
    $("#editPurchaseCost")?.addEventListener("input", purchaseEditPreview);
    $("#backupBtn").addEventListener("click", exportData);
    $("#exportBtn").addEventListener("click", exportData);
    $("#showBackupBtn").addEventListener("click", showBackupText);
    $("#importFile").addEventListener("change", async (event) => { try { await importData(event.target.files[0]); showToast("Respaldo importado"); } catch { showToast("No se pudo importar"); } });
    $("#importCsvFile").addEventListener("change", async (event) => { try { await importCsv(event.target.files[0]); } catch { showToast("No se pudo importar el CSV"); } });
    $("#resetBtn").addEventListener("click", resetData);
  };
})();
