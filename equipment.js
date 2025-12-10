(function () {
  'use strict';

  if (!window.CokeExt || typeof window.CokeExt.register !== "function") return;

  // --------- FACTORY / PRODUCTION EQUIPMENT ---------
  const productionEquipment = [
    {
      id: "neck_trimmer",
      name: "Neck Trimmer Station",
      desc: "Reduces reject rate from bad necks. +10% effective capacity.",
      cost: 6500,
      apply(state) {
        if (!state) return;
        if (typeof state.capacityPerHour !== "number") {
          state.capacityPerHour = Number(state.capacityPerHour || 0);
        }
        state.capacityPerHour = Math.round(state.capacityPerHour * 1.1);
      }
    },
    {
      id: "inline_inspection",
      name: "Inline Inspection Camera",
      desc: "Better quality control, less scrap. +5% capacity, -3% effective cost.",
      cost: 12000,
      apply(state) {
        if (!state) return;
        if (typeof state.capacityPerHour !== "number") {
          state.capacityPerHour = Number(state.capacityPerHour || 0);
        }
        if (typeof state.costModifier !== "number" || !isFinite(state.costModifier)) {
          state.costModifier = 1;
        }
        state.capacityPerHour = Math.round(state.capacityPerHour * 1.05);
        state.costModifier *= 0.97;
      }
    },
    {
      id: "energy_recovery",
      name: "Energy Recovery System",
      desc: "Uses oven waste heat. Cuts hourly fixed costs by 10%.",
      cost: 18000,
      apply(state) {
        if (!state) return;
        if (typeof state.fixedCostPerHour !== "number") {
          state.fixedCostPerHour = Number(state.fixedCostPerHour || 0);
        }
        state.fixedCostPerHour = Math.max(
          0,
          Math.round(state.fixedCostPerHour * 0.9)
        );
      }
    }
  ];

  // --------- FIELD / PROMO EQUIPMENT ---------
  const promoEquipment = [
    {
      id: "cooler_fridge",
      name: "Branded Cooler Fridges",
      desc: "+6% demand in small shops.",
      cost: 9000,
      apply(state) {
        if (!state) return;
        if (typeof state.demandModifier !== "number" || !isFinite(state.demandModifier)) {
          state.demandModifier = 1;
        }
        state.demandModifier *= 1.06;
      }
    },
    {
      id: "billboard_city",
      name: "City Billboard Pack",
      desc: "Large visibility boost. +8% demand, +$5/hour fixed cost.",
      cost: 16000,
      apply(state) {
        if (!state) return;
        if (typeof state.demandModifier !== "number" || !isFinite(state.demandModifier)) {
          state.demandModifier = 1;
        }
        if (typeof state.fixedCostPerHour !== "number") {
          state.fixedCostPerHour = Number(state.fixedCostPerHour || 0);
        }
        state.demandModifier *= 1.08;
        state.fixedCostPerHour += 5;
      }
    },
    {
      id: "music_truck",
      name: "Promo Music Truck",
      desc: "Drives around playing your jingle. +10% demand spikes during heatwaves.",
      cost: 22000,
      apply(state) {
        if (!state) return;
        if (!state.ext) state.ext = {};
        if (!state.ext.equipment) state.ext.equipment = {};
        state.ext.equipment.musicTruck = true;
      }
    }
  ];

  // --------- STATE HELPERS ---------
  function getEquipmentState(state) {
    if (!state.ext) state.ext = {};
    if (!state.ext.equipmentExt) {
      state.ext.equipmentExt = {
        owned: {},
        spent: 0
      };
    }
    if (!state.ext.equipmentExt.owned) {
      state.ext.equipmentExt.owned = {};
    }
    if (typeof state.ext.equipmentExt.spent !== "number") {
      state.ext.equipmentExt.spent = Number(state.ext.equipmentExt.spent || 0);
    }
    return state.ext.equipmentExt;
  }

  // --------- RENDERING ---------
  function renderList(api, listEl, items, ownedMap, group) {
    if (!api || !listEl) return;
    if (!api.getState || typeof api.getState !== "function") return;

    listEl.innerHTML = "";
    const state = api.getState() || {};

    items.forEach(def => {
      const owned = !!ownedMap[def.id];

      const card = document.createElement("div");
      card.className = "chip equipment-card" + (owned ? " owned" : "");

      const main = document.createElement("div");
      main.className = "chip-main";

      const title = document.createElement("span");
      title.textContent = def.name;

      const status = document.createElement("span");
      status.textContent = owned
        ? "Owned"
        : (api.formatMoney ? api.formatMoney(def.cost) : ("$" + def.cost.toFixed(0)));

      main.appendChild(title);
      main.appendChild(status);

      const sub = document.createElement("div");
      sub.className = "chip-sub";

      const desc = document.createElement("span");
      desc.textContent = def.desc;
      sub.appendChild(desc);

      const actions = document.createElement("div");
      if (!owned) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn ghost";

        const cash = Number(state.cash || 0);
        btn.textContent = cash >= def.cost ? "Buy" : "Need cash";
        btn.disabled = cash < def.cost;

        btn.setAttribute("data-equip-id", def.id);
        btn.setAttribute("data-equip-group", group);
        actions.appendChild(btn);
      } else {
        const tag = document.createElement("span");
        tag.className = "badge";
        tag.textContent = "Installed";
        actions.appendChild(tag);
      }
      sub.appendChild(actions);

      card.appendChild(main);
      card.appendChild(sub);
      listEl.appendChild(card);
    });
  }

  // --------- EXTENSION HANDLER ---------
  const handler = {
    onInit(api) {
      if (!api || !api.getState) return;
      const state = api.getState();
      if (!state) return;
      getEquipmentState(state); // ensure ext structure exists
    },

    onBindEvents(api) {
      if (!api || !api.D || !api.getState || !api.pushLog) return;

      const equipList = api.D("equipmentList");
      const promoList = api.D("promoList");
      if (!equipList && !promoList) return;

      const clickHandler = e => {
        const btn = e.target.closest("button[data-equip-id]");
        if (!btn) return;

        const id = btn.getAttribute("data-equip-id");
        const group = btn.getAttribute("data-equip-group");

        const state = api.getState();
        if (!state) return;

        const ext = getEquipmentState(state);

        const pool =
          group === "production" ? productionEquipment : promoEquipment;
        const def = pool.find(x => x.id === id);
        if (!def) return;
        if (ext.owned[def.id]) return;

        const cash = Number(state.cash || 0);
        if (cash < def.cost) {
          api.pushLog("Not enough cash for " + def.name + ".", "bad", "fin");
          return;
        }

        // Defensive: ensure stats & monthly containers exist
        if (!state.stats) state.stats = { income: 0, expenses: 0, profit: 0 };
        if (!state.monthly) state.monthly = { income: 0, expenses: 0 };

        if (typeof state.stats.expenses !== "number") {
          state.stats.expenses = Number(state.stats.expenses || 0);
        }
        if (typeof state.monthly.expenses !== "number") {
          state.monthly.expenses = Number(state.monthly.expenses || 0);
        }

        state.cash = cash - def.cost;
        state.stats.expenses += def.cost;
        state.monthly.expenses += def.cost;
        ext.owned[def.id] = true;
        ext.spent += def.cost;

        def.apply(state);
        api.pushLog("Installed equipment: " + def.name + ".", "good", "ops");
      };

      if (equipList) {
        equipList.addEventListener("click", clickHandler);
      }
      if (promoList) {
        promoList.addEventListener("click", clickHandler);
      }
    },

    onUpdateUI(api) {
      if (!api || !api.D || !api.getState) return;

      const state = api.getState();
      if (!state) return;

      const ext = getEquipmentState(state);

      const equipList = api.D("equipmentList");
      const promoList = api.D("promoList");
      const summaryEl = api.D("equipmentSummary");

      if (equipList) {
        renderList(api, equipList, productionEquipment, ext.owned, "production");
      }
      if (promoList) {
        renderList(api, promoList, promoEquipment, ext.owned, "promo");
      }

      if (summaryEl) {
        const ownedCount = Object.keys(ext.owned).length;
        summaryEl.textContent =
          ownedCount === 0
            ? "No special equipment installed yet."
            : ownedCount +
              " upgrade(s) installed • Total invested: " +
              (api.formatMoney ? api.formatMoney(ext.spent) : ("$" + ext.spent.toFixed(0)));
      }
    }
  };

  window.CokeExt.register(handler);
})();