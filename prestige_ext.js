(function () {
  'use strict';

  if (!window.CokeExt || typeof window.CokeExt.register !== "function") return;

  const prestigeNodes = [
    {
      id: "legacy_auto_buy",
      name: "Legacy Procurement",
      cost: 1,
      desc: "Auto-buy is always available, even in fresh runs.",
      apply(state) {
        if (!state) return;
        if (!state.flags) state.flags = {};
        state.flags.autoBuy = true;

        if (!state.purchasedUpgrades) state.purchasedUpgrades = {};
        state.purchasedUpgrades["auto_buy"] = true;
      }
    },
    {
      id: "legacy_storage",
      name: "Legacy Warehousing",
      cost: 2,
      desc: "+300 base storage capacity every new run.",
      apply(state) {
        if (!state) return;
        if (typeof state.storageCapacity !== "number") {
          state.storageCapacity = Number(state.storageCapacity || 0);
        }
        state.storageCapacity += 300;
      }
    },
    {
      id: "legacy_demand",
      name: "Legacy Branding",
      cost: 2,
      desc: "Permanent +5% demand modifier.",
      apply(state) {
        if (!state) return;
        if (typeof state.demandModifier !== "number" || !isFinite(state.demandModifier)) {
          state.demandModifier = 1;
        }
        state.demandModifier *= 1.05;
      }
    },
    {
      id: "legacy_capacity",
      name: "Legacy Line Tuning",
      cost: 3,
      desc: "Permanent +15 bottles/hour capacity.",
      apply(state) {
        if (!state) return;
        if (typeof state.capacityPerHour !== "number") {
          state.capacityPerHour = Number(state.capacityPerHour || 0);
        }
        state.capacityPerHour += 15;
      }
    }
  ];

  function ensurePrestigeExt(state) {
    if (!state.ext) state.ext = {};
    if (!state.ext.prestigeExt) {
      state.ext.prestigeExt = {
        unlocked: {},
        spent: 0
      };
    }
    if (!state.ext.prestigeExt.unlocked) {
      state.ext.prestigeExt.unlocked = {};
    }
    if (typeof state.ext.prestigeExt.spent !== "number") {
      state.ext.prestigeExt.spent = Number(state.ext.prestigeExt.spent || 0);
    }
    return state.ext.prestigeExt;
  }

  function getAvailablePoints(state, ext) {
    if (!state) return 0;
    ext = ext || (state.ext && state.ext.prestigeExt) || { spent: 0 };
    const total = Math.floor(Number(state.brandLegacy || 0));
    return Math.max(0, total - Number(ext.spent || 0));
  }

  const handler = {
    onInit(api) {
      if (!api || !api.getState) return;
      const state = api.getState();
      if (!state) return;
      ensurePrestigeExt(state);
    },

    onBindEvents(api) {
      if (!api || !api.D || !api.getState || !api.pushLog) return;

      const listEl = api.D("prestigeUpgradesList");
      if (!listEl) return;

      listEl.addEventListener("click", e => {
        const btn = e.target.closest("button[data-prestige-id]");
        if (!btn) return;

        const id = btn.getAttribute("data-prestige-id");
        const state = api.getState();
        if (!state) return;

        const ext = ensurePrestigeExt(state);
        const node = prestigeNodes.find(n => n.id === id);
        if (!node) return;
        if (ext.unlocked[node.id]) return;

        const points = getAvailablePoints(state, ext);
        if (points < node.cost) {
          api.pushLog(
            "Not enough prestige points for " + node.name + ".",
            "bad"
          );
          return;
        }

        ext.unlocked[node.id] = true;
        ext.spent += node.cost;
        node.apply(state);
        api.pushLog("Prestige upgrade unlocked: " + node.name + ".", "good");
      });
    },

    onUpdateUI(api) {
      if (!api || !api.D || !api.getState) return;

      const state = api.getState();
      if (!state) return;

      const ext = ensurePrestigeExt(state);
      const listEl = api.D("prestigeUpgradesList");
      const infoEl = api.D("prestigePointsInfo");
      const summaryEl = api.D("prestigePointsSummary");

      if (!listEl) return;

      const points = getAvailablePoints(state, ext);
      const legacyRaw = Number(state.brandLegacy || 0);
      const legacyMultiplier = 1 + legacyRaw * 0.2;

      if (infoEl) {
        infoEl.textContent =
          "Prestige points: " +
          points +
          " • Legacy level: x" +
          legacyMultiplier.toFixed(1);
      }

      // Header summary: "X available"
      if (summaryEl) {
        summaryEl.textContent = points + " available";
      }

      listEl.innerHTML = "";
      prestigeNodes.forEach(node => {
        const owned = !!ext.unlocked[node.id];

        const row = document.createElement("div");
        row.className = "chip prestige-card" + (owned ? " owned" : "");

        const main = document.createElement("div");
        main.className = "chip-main";

        const title = document.createElement("span");
        title.textContent = node.name;

        const cost = document.createElement("span");
        cost.textContent = owned
          ? "Unlocked"
          : node.cost + " pt" + (node.cost > 1 ? "s" : "");
        main.appendChild(title);
        main.appendChild(cost);

        const sub = document.createElement("div");
        sub.className = "chip-sub";

        const desc = document.createElement("span");
        desc.textContent = node.desc;

        const actions = document.createElement("div");
        if (!owned) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "btn ghost";
          btn.textContent = points >= node.cost ? "Unlock" : "Locked";
          btn.disabled = points < node.cost;
          btn.setAttribute("data-prestige-id", node.id);
          actions.appendChild(btn);
        } else {
          const tag = document.createElement("span");
          tag.className = "badge";
          tag.textContent = "Permanent bonus";
          actions.appendChild(tag);
        }

        sub.appendChild(desc);
        sub.appendChild(actions);
        row.appendChild(main);
        row.appendChild(sub);
        listEl.appendChild(row);
      });
    }
  };

  window.CokeExt.register(handler);
})();