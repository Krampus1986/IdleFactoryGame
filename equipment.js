(function () {
  if (!window.CokeExt || typeof window.CokeExt.register !== "function") return;

  // --------- FACTORY / PRODUCTION EQUIPMENT ---------
  // NOTE: Equipment IDs must be unique across ALL equipment types (production, promo, and mission)
  // to prevent conflicts in the unified ownership tracking system.
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

  // --------- FIELD / PROMO EQUIPMENT ---------
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

  // --------- MISSION-EXCLUSIVE EQUIPMENT ---------
  const missionEquipment = [
    {
      id: "lucky_bottle",
      name: "Lucky Golden Bottle",
      desc: "A rare commemorative bottle. +5% to all production and sales.",
      rarity: "common",
      dropRate: 0.40,
      source: "Any mission",
      apply(state) {
        state.capacityPerHour = Math.round(state.capacityPerHour * 1.05);
        state.demandModifier *= 1.05;
      }
    },
    {
      id: "vintage_sign",
      name: "Vintage Neon Sign",
      desc: "An authentic 1950s cola sign. +12% demand, improves brand recognition.",
      rarity: "uncommon",
      dropRate: 0.25,
      source: "Any mission",
      apply(state) {
        state.demandModifier *= 1.12;
      }
    },
    {
      id: "secret_recipe",
      name: "Secret Recipe Fragment",
      desc: "A piece of the legendary formula. +15% capacity, -5% costs.",
      rarity: "rare",
      dropRate: 0.15,
      source: "Music Festival or Campus Takeover",
      apply(state) {
        state.capacityPerHour = Math.round(state.capacityPerHour * 1.15);
        state.costModifier = (state.costModifier || 1.0) * 0.95;
      }
    },
    {
      id: "celebrity_endorsement",
      name: "Celebrity Endorsement Contract",
      desc: "A-list celebrity promotes your brand. +25% demand boost.",
      rarity: "rare",
      dropRate: 0.10,
      source: "Stadium Promotion or Night Run",
      apply(state) {
        state.demandModifier *= 1.25;
      }
    },
    {
      id: "master_blender_kit",
      name: "Master Blender's Kit",
      desc: "Tools of a legendary cola master. +30% capacity, +10% demand.",
      rarity: "epic",
      dropRate: 0.05,
      source: "Any mission",
      apply(state) {
        state.capacityPerHour = Math.round(state.capacityPerHour * 1.30);
        state.demandModifier *= 1.10;
      }
    },
    {
      id: "time_capsule",
      name: "1886 Time Capsule",
      desc: "Original memorabilia from the first bottling plant. Massive brand boost. +40% demand, +20% capacity.",
      rarity: "legendary",
      dropRate: 0.02,
      source: "Any mission",
      apply(state) {
        state.demandModifier *= 1.40;
        state.capacityPerHour = Math.round(state.capacityPerHour * 1.20);
      }
    }
  ];

  // --------- STATE HELPERS ---------
  function getEquipmentState(state) {
    if (!state.ext) state.ext = {};
    if (!state.ext.equipmentExt) {
      state.ext.equipmentExt = {
        owned: {},
        spent: 0,
        missionEquipment: {} // Tracks mission-exclusive equipment
      };
    }
    return state.ext.equipmentExt;
  }

  // --------- MISSION EQUIPMENT HELPERS ---------
  function rollForEquipmentDrop(state) {
    const ext = getEquipmentState(state);
    const drops = [];
    
    // Only roll for equipment that hasn't been obtained yet
    missionEquipment.forEach(equip => {
      if (!ext.owned[equip.id]) {
        const roll = Math.random();
        if (roll <= equip.dropRate) {
          drops.push(equip);
        }
      }
    });
    return drops;
  }

  function grantMissionEquipment(state, equipmentId) {
    const ext = getEquipmentState(state);
    const equip = missionEquipment.find(e => e.id === equipmentId);
    
    // Check if equipment exists and is not already owned
    if (!equip || ext.owned[equipmentId]) {
      return false;
    }

    ext.missionEquipment[equipmentId] = true;
    ext.owned[equipmentId] = true;
    
    // Apply equipment effects
    if (equip.apply) {
      equip.apply(state);
    }
    
    return true;
  }

  function getRarityColor(rarity) {
    const colors = {
      common: "#888",
      uncommon: "#4a9eff",
      rare: "#a335ee",
      epic: "#ff8000",
      legendary: "#ffd700"
    };
    return colors[rarity] || "#888";
  }

  // --------- RENDERING ---------
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

  function renderMissionEquipment(api, listEl, items, ownedMap) {
    listEl.innerHTML = "";
    const state = api.getState();

    items.forEach(def => {
      const owned = !!ownedMap[def.id];

      const card = document.createElement("div");
      card.className = "chip equipment-card mission-equipment" + (owned ? " owned" : " locked");
      card.style.borderLeftColor = getRarityColor(def.rarity);

      const main = document.createElement("div");
      main.className = "chip-main";
      const title = document.createElement("span");
      title.textContent = def.name;
      const rarityBadge = document.createElement("span");
      rarityBadge.className = "badge";
      rarityBadge.textContent = def.rarity.charAt(0).toUpperCase() + def.rarity.slice(1);
      rarityBadge.style.backgroundColor = getRarityColor(def.rarity);
      rarityBadge.style.color = "#fff";
      main.appendChild(title);
      main.appendChild(rarityBadge);

      const sub = document.createElement("div");
      sub.className = "chip-sub";
      const desc = document.createElement("span");
      desc.textContent = def.desc;
      sub.appendChild(desc);

      const sourceInfo = document.createElement("div");
      sourceInfo.style.marginTop = "8px";
      sourceInfo.style.fontSize = "0.85em";
      sourceInfo.style.opacity = "0.7";
      if (owned) {
        const tag = document.createElement("span");
        tag.className = "badge";
        tag.textContent = "✓ Obtained";
        tag.style.backgroundColor = "#2ecc71";
        sourceInfo.appendChild(tag);
      } else {
        sourceInfo.innerHTML = 
          "<strong>Source:</strong> " + def.source + 
          " &nbsp;•&nbsp; <strong>Drop Rate:</strong> " + (def.dropRate * 100).toFixed(0) + "%";
      }
      sub.appendChild(sourceInfo);

      card.appendChild(main);
      card.appendChild(sub);
      listEl.appendChild(card);
    });
  }

  // --------- EXTENSION HANDLER ---------
  const handler = {
    onInit(api) {
      const state = api.getState();
      getEquipmentState(state); // ensure ext structure exists
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
          api.pushLog("Not enough cash for " + def.name + ".", "bad", "fin");
          return;
        }

        // Defensive: ensure stats & monthly containers exist
        if (!state.stats) state.stats = { income: 0, expenses: 0, profit: 0 };
        if (!state.monthly) state.monthly = { income: 0, expenses: 0 };

        state.cash -= def.cost;
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
      const state = api.getState();
      const ext = getEquipmentState(state);

      const equipList = api.D("equipmentList");
      const promoList = api.D("promoList");
      const missionList = api.D("missionEquipmentList");
      const summaryEl = api.D("equipmentSummary");

      if (equipList) {
        renderList(api, equipList, productionEquipment, ext.owned, "production");
      }
      if (promoList) {
        renderList(api, promoList, promoEquipment, ext.owned, "promo");
      }
      if (missionList) {
        renderMissionEquipment(api, missionList, missionEquipment, ext.owned);
      }

      if (summaryEl) {
        const ownedCount = Object.keys(ext.owned).length;
        const missionCount = Object.keys(ext.missionEquipment || {}).length;
        summaryEl.textContent =
          ownedCount === 0
            ? "No special equipment installed yet."
            : ownedCount +
              " upgrade(s) installed • Total invested: " +
              api.formatMoney(ext.spent) +
              (missionCount > 0 ? " • Mission equipment: " + missionCount : "");
      }
    }
  };

  window.CokeExt.register(handler);

  // Export equipment helpers for other modules to use
  window.CokeGame = window.CokeGame || {};
  window.CokeGame.Equipment = {
    rollForEquipmentDrop,
    grantMissionEquipment,
    missionEquipment
  };
})();