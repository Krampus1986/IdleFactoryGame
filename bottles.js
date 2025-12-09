// bottles.js — Bottle size module for Coke Tycoon Idle
(function () {
  "use strict";

  // Ensure global extension namespace
  window.CokeExt = window.CokeExt || {};
  const Ext = window.CokeExt;

  // --- Small helpers (local, so we don't depend on game.js internals) ---

  function D(id) {
    return document.getElementById(id);
  }

  function formatMoney(v) {
    return "$" + v.toFixed(2);
  }

  function pushLogLocal(text, type) {
    const logBox = D("logBox");
    if (!logBox) return;
    const entry = document.createElement("div");
    entry.className =
      "log-entry" +
      (type === "good" ? " good" : type === "bad" ? " bad" : "");
    entry.textContent = text;
    logBox.prepend(entry);
    while (logBox.childElementCount > 60) {
      logBox.removeChild(logBox.lastElementChild);
    }
  }

  // --- Bottle size definitions ---

  const bottleSizeDefs = [
    {
      id: "size_033",
      name: "0.33 L",
      label: "0.33 L (mini)",
      basePrice: 1.60
    },
    {
      id: "size_050",
      name: "0.50 L",
      label: "0.50 L (standard)",
      basePrice: 2.00
    },
    {
      id: "size_150",
      name: "1.50 L",
      label: "1.50 L (family)",
      basePrice: 2.80
    }
  ];

  // --- State helpers ---

  function ensureBottleState(state) {
    if (!state.bottles) {
      const defaultId = "size_050";
      const sizes = {};
      bottleSizeDefs.forEach(def => {
        sizes[def.id] = {
          unlocked: true,
          basePrice: def.basePrice
        };
      });

      state.bottles = {
        activeSizeId: defaultId,
        sizes
      };

      // Set starting price from default bottle size
      const activeDef = bottleSizeDefs.find(b => b.id === defaultId);
      if (activeDef) {
        state.pricePerBottle = activeDef.basePrice;
        if (state.flavors && state.flavors[state.activeFlavorId]) {
          state.flavors[state.activeFlavorId].price = activeDef.basePrice;
        }
      }
    }
  }

  // Attach UI container once into Production card
  let bottleUIAttached = false;

  function attachBottleUIOnce() {
    if (bottleUIAttached) return;
    const productionCardBody = document.querySelector(
      'section[aria-labelledby="productionTitle"] .card-body'
    );
    if (!productionCardBody) return;

    const block = document.createElement("div");

    const heading = document.createElement("div");
    heading.className = "subheading";
    heading.textContent = "Bottle size";
    block.appendChild(heading);

    const row = document.createElement("div");
    row.className = "flavors-row";
    row.id = "bottleSizesRow";
    block.appendChild(row);

    // Insert before the last section in the production card (Automation)
    productionCardBody.insertBefore(
      block,
      productionCardBody.lastElementChild
    );

    bottleUIAttached = true;
  }

  // Render size pills
  function renderBottleSizes(state) {
    const row = D("bottleSizesRow");
    if (!row || !state.bottles) return;

    row.innerHTML = "";

    bottleSizeDefs.forEach(def => {
      const sizeState = state.bottles.sizes[def.id];
      const isActive = state.bottles.activeSizeId === def.id;

      const pill = document.createElement("button");
      pill.type = "button";
      pill.className = "flavor-pill";
      if (isActive) pill.className += " active";

      const dot = document.createElement("span");
      dot.className = "dot";
      pill.appendChild(dot);

      const label = document.createElement("span");
      const price =
        (sizeState && typeof sizeState.basePrice === "number")
          ? sizeState.basePrice
          : def.basePrice;
      label.textContent = def.label + " • " + formatMoney(price);
      pill.appendChild(label);

      pill.addEventListener("click", () => {
        const s = Ext.getState && Ext.getState();
        if (!s) return;

        ensureBottleState(s);

        s.bottles.activeSizeId = def.id;

        // Recommended price from size
        const newPrice = price;

        // Set active flavor price + global bottle price
        if (s.flavors && s.flavors[s.activeFlavorId]) {
          s.flavors[s.activeFlavorId].price = newPrice;
        }
        s.pricePerBottle = newPrice;

        // Update key price UI directly so it reacts immediately
        const priceEl = D("priceDisplay");
        if (priceEl) priceEl.textContent = formatMoney(newPrice);

        const slider = D("priceSlider");
        if (slider && slider !== document.activeElement) {
          slider.value = newPrice.toFixed(2);
        }

        renderBottleSizes(s);

        pushLogLocal(
          "Switched to " + def.name + " bottles. Recommended price set to " +
            formatMoney(newPrice) + ".",
          "good"
        );
      });

      row.appendChild(pill);
    });
  }

  // --- Hook into CokeExt lifecycle ---

  const prevOnInit = Ext.onInit;
  Ext.onInit = function (state) {
    if (typeof prevOnInit === "function") prevOnInit(state);
    ensureBottleState(state);
    attachBottleUIOnce();
  };

  const prevOnUpdateUI = Ext.onUpdateUI;
  Ext.onUpdateUI = function (state) {
    if (typeof prevOnUpdateUI === "function") prevOnUpdateUI(state);
    ensureBottleState(state);
    renderBottleSizes(state);
  };

  const prevOnBindEvents = Ext.onBindEvents;
  Ext.onBindEvents = function (state) {
    if (typeof prevOnBindEvents === "function") prevOnBindEvents(state);
    // no extra global events needed; pills handle their own clicks
  };

  // You can also hook onTick later if you want size-based demand/capacity
  // const prevOnTick = Ext.onTick;
  // Ext.onTick = function (state) {
  //   if (typeof prevOnTick === "function") prevOnTick(state);
  //   // e.g. adjust demand or cost based on active bottle size
  // };

})();
