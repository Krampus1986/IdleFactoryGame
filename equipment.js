(function () {
  if (!window.CokeExt || typeof window.CokeExt.register !== "function") return;

  const productionEquipment = [
    {
      id: "neck_trimmer",
      name: "Neck Trimmer Station",
      desc: "Reduces reject rate from bad necks. +10% effective capacity.",
      cost: 6500,
      apply(state) {
        state.capacityPerHour = Math.round(state.capacityPerHour * 1.1);
      }
    },
    {
      id: "inline_inspection",
      name: "Inline Inspection Camera",
      desc: "Better quality control, less scrap. +5% capacity, -3% effective cost.",
      cost: 12000,
      apply(state) {
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
        state.fixedCostPerHour = Math.max(
          0,
          Math.round(state.fixedCostPerHour * 0.9)
        );
      }
    }
  ];

  const promoEquipment = [
    {
      id: "cooler_fridge",
      name: "Branded Cooler Fridges",
      desc: "+6% demand in small shops.",
      cost: 9000,
      apply(state) {
        state.demandModifier *= 1.06;
      }
    },
    {
      id: "billboard_city",
      name: "City Billboard Pack",
      desc: "Large visibility boost. +8% demand, +$5/hour fixed cost.",
      cost: 16000,
      apply(state) {
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
        if (!state.ext) state.ext = {};
        if (!state.ext.equipment) state.ext.equipment = {};
        state.ext.equipment.musicTruck = true;
      }
    }
  ];

  function getEquipmentState(state) {
    if (!state.ext) state.ext = {};
    if (!state.ext.equipmentExt) {
      state.ext.equipmentExt = {
        owned: {},
        spent: 0
      };
    }
    return state.ext.equipmentExt;
  }

  function renderList(api, listEl, items, ownedMap, group) {
    listEl.innerHTML = "";
    const state = api.getState();

    items.forEach(def => {
      const owned = !!ownedMap[def.id];

      const card = document.createElement("div");
      card.className = "chip equipment-card" + (owned ? " owned" : "");

      const main = document.createElement("div");
      main.className = "chip-main";
      const title = document.createElement("span");
      title.textContent = def.name;
      const status = document.createElement("span");
      status.textContent = owned ? "Owned" : api.formatMoney(def.cost);
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
        btn.textContent = state.cash >= def.cost ? "Buy" : "Need cash";
        btn.disabled = state.cash < def.cost;
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

  const handler = {
    onInit(api) {
      const state = api.getState();
      getEquipmentState(state); // just ensure ext structure
    },

    onBindEvents(api) {
      const equipList = api.D("equipmentList");
      const promoList = api.D("promoList");
      if (!equipList && !promoList) return;

      const clickHandler = e => {
        const btn = e.target.closest("button[data-equip-id]");
        if (!btn) return;
        const id = btn.getAttribute("data-equip-id");
        const group = btn.getAttribute("data-equip-group");
        const state = api.getState();
        const ext = getEquipmentState(state);

        const pool =
          group === "production" ? productionEquipment : promoEquipment;
        const def = pool.find(x => x.id === id);
        if (!def) return;
        if (ext.owned[def.id]) return;

        if (state.cash < def.cost) {
          api.pushLog("Not enough cash for " + def.name + ".", "bad");
          return;
        }

        state.cash -= def.cost;
        state.stats.expenses += def.cost;
        state.monthly.expenses += def.cost;
        ext.owned[def.id] = true;
        ext.spent += def.cost;

        def.apply(state);
        api.pushLog("Installed equipment: " + def.name + ".", "good");
      };

      if (equipList) {
        equipList.addEventListener("click", clickHandler);
      }
      if (promoList) {
        promoList.addEventListener("click", clickHandler);
      }
    },

    onUpdateUI(api) {
      const state = api.getState();
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
              api.formatMoney(ext.spent);
      }
    }
  };

  window.CokeExt.register(handler);
})();